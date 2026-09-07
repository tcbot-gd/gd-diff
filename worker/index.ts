import { spawn, execSync } from 'node:child_process';
import {
	mkdirSync,
	writeFileSync,
	readFileSync,
	existsSync,
	readdirSync,
	copyFileSync,
	cpSync,
	rmSync
} from 'node:fs';
import path from 'node:path';
import { getDb } from '../src/lib/server/db';
import { env } from '../src/lib/server/env';
import { config } from '../src/lib/server/config';
import { ingestDecompilation } from '../src/lib/server/ingest';
import { checkWorker, report } from '../src/lib/server/sanity';

const SCRIPT_PATH = path.resolve(import.meta.dir, 'export.py');

const HEXRAYS_OVERRIDE = `// gd-diff override: raise limits so large Geometry Dash functions still decompile
MAX_FUNCSIZE = 1000000000
MAX_FUNC_ARGS = 10000
`;

interface PendingDecomp {
	id: number;
	mode: 'raw' | 'broma';
	binaryId: number;
	versionId: string;
	platformId: string;
	fileName: string;
}

function claimPending(): PendingDecomp | null {
	const db = getDb();
	const row = db
		.prepare(
			`SELECT
				d.id,
				d.mode,
				d.binary_id AS binaryId,
				b.version_id AS versionId,
				b.platform_id AS platformId,
				b.file_name AS fileName
			FROM decompilations d
			JOIN binaries b ON b.id = d.binary_id
			WHERE d.status = 'pending'
				AND (
					d.mode != 'broma'
					OR EXISTS (
						SELECT 1 FROM decompilations r
						WHERE r.binary_id = d.binary_id AND r.mode = 'raw' AND r.status = 'done'
					)
				)
			ORDER BY d.id
			LIMIT 1`
		)
		.get() as unknown as PendingDecomp | undefined;

	if (!row) return null;

	db.prepare(
		"UPDATE decompilations SET status = 'running', error = NULL, progress = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?"
	).run(
		JSON.stringify({
			phase: 'analyzing',
			functions_done: 0,
			functions_total: null,
			current_function: null,
			log_tail: [],
			updated_at: new Date().toISOString()
		}),
		row.id
	);
	return row;
}

function idaUserDir(): string {
	return env.idaUsr || path.join(config.dataDir, 'ida-user');
}

function ensureIdaUserDir(): string {
	const dir = idaUserDir();
	mkdirSync(path.join(dir, 'cfg'), { recursive: true });
	writeFileSync(path.join(dir, 'cfg', 'hexrays.cfg'), HEXRAYS_OVERRIDE);
	return dir;
}

function copyDatabaseForBroma(decomp: PendingDecomp, outDir: string): string {
	// Copy the analyzed binary + its IDA database files (.i64/.id0/.id1/.nam/.til)
	// from uploads into the broma output dir, so IDA reuses the raw analysis
	// instead of re-analyzing from scratch.
	const srcDir = path.join(config.uploadsDir, decomp.versionId, decomp.platformId);
	const prefix = decomp.fileName;
	for (const file of readdirSync(srcDir)) {
		if (file === prefix || file.startsWith(prefix + '.')) {
			copyFileSync(path.join(srcDir, file), path.join(outDir, file));
		}
	}
	return path.join(outDir, decomp.fileName);
}

function runIda(decomp: PendingDecomp, binaryPath: string, fresh: boolean): Promise<void> {
	const outDir = path.join(config.exportsDir, String(decomp.id));
	mkdirSync(outDir, { recursive: true });
	const logPath = path.join(outDir, 'ida.log');
	const progressPath = path.join(outDir, 'progress.json');
	const idaUserDir = ensureIdaUserDir();

	return new Promise((resolve, reject) => {
		const args = ['-A'];
		if (fresh) args.push('-c');
		args.push(`-L${logPath}`, `-S${SCRIPT_PATH}`, binaryPath);
		const child = spawn(env.idaPath, args, {
			env: {
				...process.env,
				IDAUSR: idaUserDir,
				IDA_EXPORT_OUT: outDir,
				IDA_EXPORT_MODE: decomp.mode,
				IDA_EXPORT_PLATFORM: decomp.platformId,
				IDA_EXPORT_VERSION: decomp.versionId,
				BROMA_PLUGIN_DIR: env.bromaPluginDir,
				BROMA_BINDINGS_DIR: config.bindingsDir
			},
			stdio: 'ignore'
		});

		// Mirror IDA's progress.json + log tail into the DB so the UI shows live progress.
		const mirrorProgress = () => {
			try {
				const logTail = readLogTail(logPath, 20);
				let parsed: Record<string, unknown> = {
					phase: 'analyzing',
					functions_done: 0,
					functions_total: null,
					current_function: null,
					updated_at: new Date().toISOString()
				};
				if (existsSync(progressPath)) {
					try {
						parsed = JSON.parse(readFileSync(progressPath, 'utf-8'));
					} catch {
						// malformed/partial progress.json; keep the fallback
					}
				}
				parsed.log_tail = logTail;
				getDb().prepare('UPDATE decompilations SET progress = ? WHERE id = ?').run(JSON.stringify(parsed), decomp.id);
			} catch {
				// ignore transient read errors
			}
		};
		mirrorProgress();
		const poll = setInterval(mirrorProgress, 2000);

		let settled = false;
		const done = (error?: Error) => {
			if (settled) return;
			settled = true;
			clearInterval(poll);
			if (error) reject(error);
			else resolve();
		};
		child.on('error', (error) => done(error));
		child.on('exit', (code) =>
			done(code === 0 ? undefined : new Error(`IDA exited with code ${code}`))
		);
	});
}

function readImageBase(metaPath: string): number | null {
	try {
		if (!existsSync(metaPath)) return null;
		const meta = JSON.parse(readFileSync(metaPath, 'utf-8'));
		return typeof meta.image_base === 'number' ? meta.image_base : null;
	} catch {
		return null;
	}
}

function readLogTail(logPath: string, lines = 20): string[] {
	try {
		if (!existsSync(logPath)) return [];
		return readFileSync(logPath, 'utf-8')
			.split(/\r?\n/)
			.map((line) => line.trim())
			.filter(Boolean)
			.slice(-lines);
	} catch {
		return [];
	}
}

function readErrorDetail(outDir: string, fallback: string): string {
	const parts: string[] = [];
	try {
		const errPath = path.join(outDir, 'error.json');
		if (existsSync(errPath)) {
			const parsed = JSON.parse(readFileSync(errPath, 'utf-8')) as { error?: string };
			if (parsed.error) parts.push(parsed.error.trim());
		}
	} catch {
		// ignore
	}
	try {
		const logPath = path.join(outDir, 'ida.log');
		if (existsSync(logPath)) {
			const tail = readFileSync(logPath, 'utf-8').trim().split(/\r?\n/).slice(-40).join('\n');
			if (tail) parts.push(`--- ida.log (last 40 lines) ---\n${tail}`);
		}
	} catch {
		// ignore
	}
	return parts.length > 0 ? parts.join('\n\n') : fallback;
}

async function processNext(): Promise<boolean> {
	const decomp = claimPending();
	if (!decomp) return false;

	console.log(
		`[worker] decompiling #${decomp.id} (${decomp.versionId}/${decomp.platformId}/${decomp.fileName}, ${decomp.mode})`
	);
	try {
		const outDir = path.join(config.exportsDir, String(decomp.id));
		mkdirSync(outDir, { recursive: true });
		let binaryPath: string;
		let fresh = true;
		if (decomp.mode === 'broma') {
			// Reuse the raw decompilation's analyzed database instead of re-analyzing.
			binaryPath = copyDatabaseForBroma(decomp, outDir);
			fresh = false;
		} else {
			binaryPath = path.join(config.uploadsDir, decomp.versionId, decomp.platformId, decomp.fileName);
		}
		await runIda(decomp, binaryPath, fresh);
		const ndjson = path.join(outDir, 'functions.ndjson');
		const imageBase = readImageBase(path.join(outDir, 'meta.json'));
		const count = await withIngestLock(() => ingestDecompilation(decomp.id, ndjson, imageBase));
		console.log(`[worker] done #${decomp.id}: ${count} functions`);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		const outDir = path.join(config.exportsDir, String(decomp.id));
		const detail = readErrorDetail(outDir, message);
		getDb()
			.prepare(
				"UPDATE decompilations SET status = 'failed', error = ?, progress = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?"
			)
			.run(detail, JSON.stringify({ phase: 'failed' }), decomp.id);
		console.error(`[worker] failed #${decomp.id}:`, message);
	}
	return true;
}

function sh(cmd: string): void {
	execSync(cmd, { stdio: 'inherit' });
}

function ensureBindings(): void {
	if (!env.bindingsRepoUrl || !config.bindingsDir) return;
	if (existsSync(path.join(config.bindingsDir, 'bindings'))) return;
	mkdirSync(config.bindingsDir, { recursive: true });
	console.log(`[worker] cloning bindings: ${env.bindingsRepoUrl}`);
	sh(`git clone --depth 1 ${env.bindingsRepoUrl} ${config.bindingsDir}`);
	if (env.bindingsCommit) sh(`git -C ${config.bindingsDir} checkout ${env.bindingsCommit}`);
}

function ensureBromaIda(): void {
	if (!env.bromaRepoUrl || !env.bromaPluginDir) return;
	if (existsSync(path.join(env.bromaPluginDir, 'BromaIDA.py'))) return;
	mkdirSync(env.bromaPluginDir, { recursive: true });
	const tmp = path.join(config.dataDir, '.bromaida-tmp');
	rmSync(tmp, { recursive: true, force: true });
	console.log(`[worker] installing BromaIDA: ${env.bromaRepoUrl}`);
	sh(`git clone --depth 1 ${env.bromaRepoUrl} ${tmp}`);
	sh(`python3 -m pip install --break-system-packages --no-cache-dir -r ${path.join(tmp, 'requirements.txt')}`);
	cpSync(path.join(tmp, 'BromaIDA.py'), path.join(env.bromaPluginDir, 'BromaIDA.py'));
	cpSync(path.join(tmp, 'broma_ida'), path.join(env.bromaPluginDir, 'broma_ida'), { recursive: true });
	rmSync(tmp, { recursive: true, force: true });
}

function ensureIdaInstall(): void {
	if (!env.idaHostDir || !env.idaDir) return;
	mkdirSync(env.idaDir, { recursive: true });
	console.log(`[worker] syncing IDA ${env.idaHostDir} -> ${env.idaDir}`);
	try {
		// Incremental; keeps the writable copy in sync with the (read-only) host
		// mount so an updated IDA install is picked up on the next boot.
		sh(`rsync -a "${env.idaHostDir}/" "${env.idaDir}/"`);
	} catch {
		console.warn('[worker] rsync unavailable, falling back to recursive copy');
		cpSync(env.idaHostDir, env.idaDir, { recursive: true });
	}
}

function acceptIdaEula(): void {
	const dir = idaUserDir();
	mkdirSync(dir, { recursive: true });
	const marker = path.join(dir, '.idapro_eula');
	if (!existsSync(marker)) writeFileSync(marker, 'accepted\n');
}

function configureIdaPython(): void {
	// Use idapyswitch (IDA's supported way to bind IDAPython to a Python install).
	// A prior version wrote Python3TargetDLL into ida.cfg directly — that's invalid
	// config and IDA rejects it — so remove it if present and switch properly.
	const dir = idaUserDir();
	const idaRoot = env.idaDir || (env.idaPath ? path.dirname(env.idaPath) : '');
	const idapyswitch = env.idaDir
		? path.join(env.idaDir, 'idapyswitch')
		: path.join(idaRoot, 'idapyswitch');

	// Clean up the invalid Python3TargetDLL line from a previous run.
	const cfgPath = path.join(dir, 'cfg', 'ida.cfg');
	if (existsSync(cfgPath)) {
		const lines = readFileSync(cfgPath, 'utf-8').split(/\r?\n/);
		const cleaned = lines.filter((l) => !l.trim().startsWith('Python3TargetDLL'));
		if (cleaned.length !== lines.length) {
			writeFileSync(cfgPath, cleaned.join('\n'));
			console.log('[worker] removed legacy Python3TargetDLL from ida.cfg');
		}
	}

	if (!existsSync(idapyswitch)) {
		console.warn('[worker] idapyswitch not found — skipping IDA Python configuration');
		return;
	}

	let pythonCmd = '';
	for (const candidate of ['python3', 'python']) {
		try {
			execSync(`${candidate} --version`, { stdio: 'ignore' });
			pythonCmd = candidate;
			break;
		} catch {
			// try next
		}
	}
	if (!pythonCmd) {
		console.warn('[worker] no python3/python on PATH — cannot configure IDAPython');
		return;
	}

	// "--auto" selects / works out the Python contributed with IDA itself if the
	// requested path isn't provided. Passing the resolved executable makes the
	// choice deterministic (works for our user-installed python3 too).
	try {
		execSync(`"${idapyswitch}" --auto "${pythonCmd}"`, { stdio: 'ignore' });
		console.log(`[worker] idapyswitch: bound IDAPython to ${pythonCmd}`);
	} catch (error) {
		console.warn(`[worker] idapyswitch failed: ${error instanceof Error ? error.message : String(error)}`);
	}
}

function setup(): void {
	try {
		ensureBindings();
		ensureBromaIda();
		ensureIdaInstall();
		acceptIdaEula();
		configureIdaPython();
	} catch (error) {
		console.error('[worker] setup error (continuing):', error);
	}
}

const CONCURRENCY = Math.max(1, Number.isFinite(env.workerConcurrency) ? Math.floor(env.workerConcurrency) : 2);

// `ingestDecompilation` opens a multi-statement transaction; serialize it so
// concurrent workers don't collide on the single SQLite writer.
let ingestLock: Promise<void> = Promise.resolve();
async function withIngestLock<T>(fn: () => Promise<T>): Promise<T> {
	const prev = ingestLock;
	let release!: () => void;
	ingestLock = new Promise((resolve) => (release = resolve));
	await prev;
	try {
		return await fn();
	} finally {
		release();
	}
}

async function workerLoop(id: number): Promise<void> {
	for (;;) {
		try {
			const worked = await processNext();
			if (!worked) await new Promise((resolve) => setTimeout(resolve, 10_000));
		} catch (error) {
			console.error(`[worker#${id}] error:`, error);
			await new Promise((resolve) => setTimeout(resolve, 10_000));
		}
	}
}

async function loop(): Promise<void> {
	setup();
	if (report('worker', checkWorker())) process.exit(1);
	console.log(`[worker] starting (concurrency ${CONCURRENCY})`);
	await Promise.all(Array.from({ length: CONCURRENCY }, (_, i) => workerLoop(i)));
}

loop();


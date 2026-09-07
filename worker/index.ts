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

function copyDatabaseForBroma(decomp: PendingDecomp): string {
	// Copy the analyzed binary + its IDA database files (.i64/.id0/.id1/.nam/.til)
	// from uploads into a stable per-binary `databases/.../broma` dir so the raw
	// analysis is reused, and the broma-annotated IDB persists there for sharing.
	const bromaDir = path.join(config.databasesDir, decomp.versionId, decomp.platformId, decomp.fileName, 'broma');
	mkdirSync(bromaDir, { recursive: true });
	const srcDir = path.join(config.uploadsDir, decomp.versionId, decomp.platformId);
	const prefix = decomp.fileName;
	for (const file of readdirSync(srcDir)) {
		if (file === prefix || file.startsWith(prefix + '.')) {
			copyFileSync(path.join(srcDir, file), path.join(bromaDir, file));
		}
	}
	return path.join(bromaDir, decomp.fileName);
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
			mirrorProgress();
			clearInterval(poll);
			if (error) reject(error);
			else resolve();
		};
		child.on('error', (error) => done(error));
		child.on('exit', (code, signal) => {
			if (code === 0) {
				done();
				return;
			}
			// IDA occasionally exits non-zero (or is killed) *after* the export
			// script has finished writing everything — e.g. a plugin crashing
			// during shutdown. If the export completed, don't fail the job.
			if (existsSync(path.join(outDir, 'meta.json'))) {
				console.warn(
					`[worker] #${decomp.id} IDA exited ${code ?? 'null'}${signal ? ` (signal ${signal})` : ''} but the export completed; treating as success`
				);
				done();
				return;
			}
			const reason = signal
				? `IDA was killed by signal ${signal}`
				: `IDA exited with code ${code ?? 'null'}`;
			done(new Error(reason));
		});
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
			binaryPath = copyDatabaseForBroma(decomp);
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
	mkdirSync(env.bromaPluginDir, { recursive: true });
	const pluginFile = path.join(env.bromaPluginDir, 'BromaIDA.py');

	// Always clone fresh (cheap, depth 1) and pip-install straight from that
	// checkout, so a stale plugin left over from an older deploy (which is
	// exactly what left `platformdirs` uninstalled) never causes the
	// dependency install to be skipped. requirements.txt is only ever read
	// from the clone — it's not something the plugin dir needs to contain.
	console.log(`[worker] fetching BromaIDA: ${env.bromaRepoUrl}`);
	const tmp = path.join(config.dataDir, '.bromaida-tmp');
	rmSync(tmp, { recursive: true, force: true });
	sh(`git clone --depth 1 ${env.bromaRepoUrl} ${tmp}`);
	try {
		const reqFile = path.join(tmp, 'requirements.txt');
		if (!existsSync(reqFile)) {
			throw new Error(`requirements.txt not found in ${env.bromaRepoUrl} checkout`);
		}
		sh(`python3 -m pip install --break-system-packages --no-cache-dir -r "${reqFile}"`);
		cpSync(path.join(tmp, 'BromaIDA.py'), pluginFile);
		cpSync(path.join(tmp, 'broma_ida'), path.join(env.bromaPluginDir, 'broma_ida'), { recursive: true });
	} finally {
		rmSync(tmp, { recursive: true, force: true });
	}
}

// Verify the Python IDA will use (idapyswitch binds it to the same libpython)
// can import BromaIDA's actual runtime dependencies. `pygments` was removed from
// this check: it is not a BromaIDA dependency, and importing it made a healthy
// install look broken. Returns true on success.
function bromaImportsOk(): boolean {
	try {
		execSync(`python3 -c "import pybroma; import platformdirs"`, { stdio: 'ignore' });
		return true;
	} catch {
		return false;
	}
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

function idaInstallDir(): string {
	return env.idaDir || (env.idaPath ? path.dirname(env.idaPath) : '');
}

function acceptIdaEula(): void {
	const idaDir = idaInstallDir();
	if (!idaDir) {
		console.warn('[worker] cannot accept IDA EULA: no IDA_DIR/IDA_PATH configured');
		return;
	}
	const dir = idaUserDir();
	mkdirSync(dir, { recursive: true });
	const script = path.resolve(import.meta.dir, 'accept_eula.py');
	try {
		execSync(`python3 "${script}" "${idaDir}"`, {
			stdio: 'inherit',
			env: { ...process.env, IDAUSR: dir }
		});
	} catch (error) {
		console.error(
			'[worker] failed to accept IDA EULA:',
			error instanceof Error ? error.message : String(error)
		);
	}
}

function configureIdaPython(): void {
	// IDAPython's Python binding lives in <usrdir>/cfg/python.cfg. idapyswitch is
	// the supported tool to set it, but it may write to a different user dir
	// (e.g. ~/.idapro) than our IDAUSR. So after running it we self-heal
	// python.cfg inside IDAUSR to make the config deterministic.
	const dir = idaUserDir();
	mkdirSync(path.join(dir, 'cfg'), { recursive: true });

	// Clean up the invalid Python3TargetDLL line from a previous run (it belongs in
	// python.cfg, not ida.cfg).
	const cfgPath = path.join(dir, 'cfg', 'ida.cfg');
	if (existsSync(cfgPath)) {
		const lines = readFileSync(cfgPath, 'utf-8').split(/\r?\n/);
		const cleaned = lines.filter((l) => !l.trim().startsWith('Python3TargetDLL'));
		if (cleaned.length !== lines.length) {
			writeFileSync(cfgPath, cleaned.join('\n'));
			console.log('[worker] removed legacy Python3TargetDLL from ida.cfg');
		}
	}

	// Resolve the path to the actual libpython library.
	let libpython = '';
	try {
		const result = execSync(
			`python3 -c "import sysconfig; print(sysconfig.get_config_var('LIBDIR') + '/' + sysconfig.get_config_var('LDLIBRARY'))"`,
			{ encoding: 'utf-8' }
		).trim();
		if (result && !result.includes('None') && result.includes('libpython')) libpython = result;
	} catch {
		// python3 missing
	}
	if (!libpython) {
		console.warn('[worker] could not resolve libpython — IDAPython may not load');
		return;
	}

	// 1) Preferred: let idapyswitch bind IDA to libpython.
	const idaRoot = env.idaDir || (env.idaPath ? path.dirname(env.idaPath) : '');
	const idapyswitch = env.idaDir ? path.join(env.idaDir, 'idapyswitch') : path.join(idaRoot, 'idapyswitch');
	if (existsSync(idapyswitch)) {
		try {
			execSync(`"${idapyswitch}" --force-path "${libpython}"`, {
				env: { ...process.env, IDAUSR: dir },
				stdio: 'ignore'
			});
			console.log(`[worker] idapyswitch bound IDA Python to ${libpython}`);
		} catch (error) {
			console.warn(
				`[worker] idapyswitch failed:`,
				error instanceof Error ? error.message : String(error)
			);
		}
	} else {
		console.warn('[worker] idapyswitch not found — writing python.cfg directly');
	}

	// 2) Deterministic: ensure the binding is present in our IDAUSR's python.cfg so
	// IDA definitely loads it even if idapyswitch wrote elsewhere.
	const pyCfgPath = path.join(dir, 'cfg', 'python.cfg');
	try {
		const existing = existsSync(pyCfgPath) ? readFileSync(pyCfgPath, 'utf-8') : '';
		const cleaned = existing
			.split(/\r?\n/)
			.filter((l) => {
				const t = l.trim();
				return !t.startsWith('Python3TargetDLL') && !/^\/\/\s*Python3TargetDLL/.test(t) && !/\/\*[\s\S]*?\*\//.test(t);
			})
			.join('\n');
		writeFileSync(pyCfgPath, `${cleaned.replace(/\s+$/, '')}\n\nPython3TargetDLL = "${libpython}";\n`);
		console.log(`[worker] configured ${pyCfgPath}`);
	} catch (error) {
		console.warn(`[worker] could not write python.cfg:`, error instanceof Error ? error.message : String(error));
	}
}

function setup(): void {
	const steps: [string, () => void][] = [
		['bindings', ensureBindings],
		['BromaIDA', ensureBromaIda],
		['IDA install', ensureIdaInstall],
		['EULA', acceptIdaEula],
		['IDA Python', configureIdaPython]
	];
	for (const [label, fn] of steps) {
		try {
			fn();
		} catch (error) {
			console.error(`[worker] setup step '${label}' failed:`, error instanceof Error ? error.message : String(error));
		}
	}

	if (!bromaImportsOk()) {
		console.warn(
			'[worker] BromaIDA Python dependencies are missing in the IDA interpreter — broma decompilations will fail until this is resolved'
		);
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


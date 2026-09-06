import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { getDb } from '../src/lib/server/db';
import { env } from '../src/lib/server/env';
import { config } from '../src/lib/server/config';
import { ingestDecompilation } from '../src/lib/server/ingest';

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
			ORDER BY d.id
			LIMIT 1`
		)
		.get() as unknown as PendingDecomp | undefined;

	if (!row) return null;

	db.prepare(
		"UPDATE decompilations SET status = 'running', error = NULL, progress = NULL, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?"
	).run(row.id);
	return row;
}

function ensureIdaUserDir(): string {
	const dir = path.join(config.dataDir, 'ida-user');
	mkdirSync(path.join(dir, 'cfg'), { recursive: true });
	writeFileSync(path.join(dir, 'cfg', 'hexrays.cfg'), HEXRAYS_OVERRIDE);
	return dir;
}

function runIda(decomp: PendingDecomp): Promise<void> {
	const binaryPath = path.join(config.uploadsDir, decomp.versionId, decomp.platformId, decomp.fileName);
	const outDir = path.join(config.exportsDir, String(decomp.id));
	mkdirSync(outDir, { recursive: true });
	const logPath = path.join(outDir, 'ida.log');
	const progressPath = path.join(outDir, 'progress.json');
	const idaUserDir = ensureIdaUserDir();

	return new Promise((resolve, reject) => {
		const child = spawn(env.idaPath, ['-A', '-c', `-L${logPath}`, `-S${SCRIPT_PATH}`, binaryPath], {
			env: {
				...process.env,
				IDAUSR: idaUserDir,
				IDA_EXPORT_OUT: outDir,
				IDA_EXPORT_MODE: decomp.mode,
				BROMA_PLUGIN_DIR: env.bromaPluginDir
			},
			stdio: 'ignore'
		});

		// Mirror IDA's progress.json into the DB so the UI can show live progress.
		const mirrorProgress = () => {
			try {
				if (existsSync(progressPath)) {
					const raw = readFileSync(progressPath, 'utf-8');
					getDb().prepare('UPDATE decompilations SET progress = ? WHERE id = ?').run(raw, decomp.id);
				}
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
		await runIda(decomp);
		const outDir = path.join(config.exportsDir, String(decomp.id));
		const ndjson = path.join(outDir, 'functions.ndjson');
		const imageBase = readImageBase(path.join(outDir, 'meta.json'));
		const count = await ingestDecompilation(decomp.id, ndjson, imageBase);
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

async function loop(): Promise<void> {
	console.log('[worker] starting');
	for (;;) {
		try {
			const worked = await processNext();
			if (!worked) await new Promise((resolve) => setTimeout(resolve, 10_000));
		} catch (error) {
			console.error('[worker] error:', error);
			await new Promise((resolve) => setTimeout(resolve, 10_000));
		}
	}
}

loop();


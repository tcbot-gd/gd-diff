import { getDb } from '../src/lib/server/db';

function tick(): void {
	const db = getDb();
	const pending = db
		.prepare("SELECT id, mode FROM decompilations WHERE status = 'pending' ORDER BY id LIMIT 10")
		.all() as unknown as { id: number; mode: string }[];

	if (pending.length === 0) {
		console.log('[worker] idle — no pending decompilations');
		return;
	}

	console.log('[worker] pending decompilations:', pending);
	// TODO(phase-1): spawn IDA headless per pending decompilation, then ingest its export.
}

console.log('[worker] starting');
tick();
setInterval(tick, 15_000);

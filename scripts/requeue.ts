// Re-queue a decompilation: delete its ingested functions and reset it to `pending`.
// Usage: bun scripts/requeue.ts <decompilationId>
import { getDb } from '../src/lib/server/db';

const id = Number(process.argv[2]);
if (!Number.isInteger(id)) {
	console.error('usage: bun scripts/requeue.ts <decompilationId>');
	process.exit(1);
}

const db = getDb();
db.exec('PRAGMA foreign_keys = ON');
// Delete children explicitly by decompilation_id (indexed) first; the FK cascade
// from `functions` would otherwise use `caller_id`/`function_id` which have no
// dedicated index and cause a slow full scan per deleted function.
db.prepare('DELETE FROM function_calls WHERE decompilation_id = ?').run(id);
db.prepare('DELETE FROM member_uses WHERE decompilation_id = ?').run(id);
const del = db.prepare('DELETE FROM functions WHERE decompilation_id = ?').run(id);
db.prepare(
	"UPDATE decompilations SET status = 'pending', progress = NULL, error = NULL WHERE id = ?"
).run(id);
console.log(`requeued decompilation #${id} (deleted ${del.changes} functions)`);

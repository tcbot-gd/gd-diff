import { createInterface } from 'node:readline';
import { createReadStream, existsSync } from 'node:fs';
import { getDb } from './db';
import type { FunctionContent } from '../shared/types';

interface ExportRecord {
	name: string;
	demangled: string | null;
	address: number;
	size: number;
	signature: string | null;
	asm: FunctionContent['asm'];
	pseudocode: FunctionContent['pseudocode'];
	hex: FunctionContent['hex'];
	calls: FunctionContent['calls'];
	members: FunctionContent['members'];
}

export async function ingestDecompilation(
	decompilationId: number,
	ndjsonPath: string
): Promise<number> {
	if (!existsSync(ndjsonPath)) {
		throw new Error(`export file not found: ${ndjsonPath}`);
	}

	const db = getDb();
	const insertFunction = db.prepare(
		'INSERT INTO functions (decompilation_id, name, demangled_name, address, size, type_signature) VALUES (?, ?, ?, ?, ?, ?)'
	);
	const insertContent = db.prepare('INSERT INTO function_content (function_id, content) VALUES (?, ?)');
	const insertCall = db.prepare(
		'INSERT OR IGNORE INTO function_calls (decompilation_id, caller_id, callee_address, callee_name) VALUES (?, ?, ?, ?)'
	);
	const insertMember = db.prepare(
		'INSERT OR IGNORE INTO member_uses (decompilation_id, function_id, owner_type, member_name, member_kind) VALUES (?, ?, ?, ?, ?)'
	);
	const markDone = db.prepare(
		"UPDATE decompilations SET status = 'done', error = NULL, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?"
	);

	db.exec('BEGIN');
	let count = 0;
	try {
		const lines = createInterface({ input: createReadStream(ndjsonPath, { encoding: 'utf-8' }), crlfDelay: Infinity });
		for await (const line of lines) {
			const trimmed = line.trim();
			if (!trimmed) continue;

			const record = JSON.parse(trimmed) as ExportRecord;
			const content: FunctionContent = {
				asm: record.asm ?? [],
				pseudocode: record.pseudocode ?? [],
				hex: record.hex ?? [],
				calls: record.calls ?? [],
				members: record.members ?? []
			};

			const info = insertFunction.run(
				decompilationId,
				record.name,
				record.demangled,
				record.address,
				record.size,
				record.signature
			);
			const functionId = Number(info.lastInsertRowid);
			insertContent.run(functionId, JSON.stringify(content));

			for (const call of record.calls ?? []) {
				insertCall.run(decompilationId, functionId, call.target, call.name);
			}
			for (const member of record.members ?? []) {
				insertMember.run(decompilationId, functionId, member.owner, member.name, member.kind);
			}
			count++;
		}
		markDone.run(decompilationId);
		db.exec('COMMIT');
	} catch (error) {
		db.exec('ROLLBACK');
		throw error;
	}
	return count;
}

import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { isAdmin } from '$lib/server/auth';
import { config } from '$lib/server/config';
import { getDb } from '$lib/server/db';
import { getVersion } from '$lib/server/repo';
import { isPlatformId } from '$lib/shared/platforms';
import { DECOMP_MODES } from '$lib/shared/modes';

export const POST: RequestHandler = async ({ request }) => {
	if (!isAdmin(request.headers.get('authorization'))) throw error(401, 'Unauthorized');

	const form = await request.formData();
	const versionId = String(form.get('version') ?? '').trim();
	const platformId = String(form.get('platform') ?? '').trim();
	const fileName = String(form.get('fileName') ?? '').trim();
	const role = String(form.get('role') ?? '').trim();
	const file = form.get('file');

	if (!versionId) throw error(400, 'version is required');
	if (!isPlatformId(platformId)) throw error(404, 'Unknown platform');
	if (!fileName) throw error(400, 'fileName is required');
	if (!role) throw error(400, 'role is required');
	if (!(file instanceof File)) throw error(400, 'file is required');

	const db = getDb();

	let version = getVersion(versionId);
	if (!version) {
		const { m } = db
			.prepare('SELECT COALESCE(MAX(ord), -1) AS m FROM versions')
			.get() as unknown as { m: number };
		db.prepare('INSERT INTO versions (id, label, ord) VALUES (?, ?, ?)').run(versionId, versionId, m + 1);
	}

	const buffer = Buffer.from(await file.arrayBuffer());
	const sha256 = createHash('sha256').update(buffer).digest('hex');

	const dir = path.join(config.uploadsDir, versionId, platformId);
	mkdirSync(dir, { recursive: true });
	writeFileSync(path.join(dir, fileName), buffer);

	const result = db
		.prepare(
			`INSERT INTO binaries (version_id, platform_id, file_name, role, sha256)
			 VALUES (?, ?, ?, ?, ?)
			 ON CONFLICT(version_id, platform_id, file_name)
			 DO UPDATE SET sha256 = excluded.sha256, role = excluded.role`
		)
		.run(versionId, platformId, fileName, role, sha256);
	const binaryId = Number(result.lastInsertRowid);

	const insertDecomp = db.prepare('INSERT OR IGNORE INTO decompilations (binary_id, mode) VALUES (?, ?)');
	for (const mode of DECOMP_MODES) {
		insertDecomp.run(binaryId, mode.id);
	}

	return json(
		{ binary: { id: binaryId, versionId, platformId, fileName, role, sha256 } },
		{ status: 201 }
	);
};

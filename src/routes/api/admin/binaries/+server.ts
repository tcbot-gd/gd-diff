import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isAdmin } from '$lib/server/auth';
import { listBinariesAdmin, deleteBinary } from '$lib/server/repo';
import { config } from '$lib/server/config';
import { readdirSync, rmSync } from 'node:fs';
import path from 'node:path';

export const GET: RequestHandler = ({ request }) => {
	if (!isAdmin(request.headers.get('authorization'))) throw error(401, 'Unauthorized');
	return json({ binaries: listBinariesAdmin() });
};

export const DELETE: RequestHandler = ({ request, url }) => {
	if (!isAdmin(request.headers.get('authorization'))) throw error(401, 'Unauthorized');

	const id = Number(url.searchParams.get('id'));
	if (!Number.isInteger(id)) throw error(400, 'Invalid binary id');

	const info = deleteBinary(id);
	if (!info) throw error(404, 'Binary not found');

	const uploadsDir = path.join(config.uploadsDir, info.versionId, info.platformId);
	try {
		for (const file of readdirSync(uploadsDir)) {
			if (file === info.fileName || file.startsWith(info.fileName + '.')) {
				rmSync(path.join(uploadsDir, file), { force: true });
			}
		}
	} catch {
		// uploads dir may not exist
	}
	for (const did of info.decompilationIds) {
		rmSync(path.join(config.exportsDir, String(did)), { recursive: true, force: true });
	}

	return json({ ok: true });
};

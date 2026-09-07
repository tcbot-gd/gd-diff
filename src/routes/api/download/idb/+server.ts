import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createReadStream, statSync } from 'node:fs';
import { Readable } from 'node:stream';
import path from 'node:path';
import { isDownloader } from '$lib/server/auth';
import { isPlatformId } from '$lib/shared/platforms';
import { resolveIdbPath } from '$lib/server/download';

export const GET: RequestHandler = ({ request, url }) => {
	if (!isDownloader(request.headers.get('authorization'), request.headers.get('cookie'))) {
		throw error(401, 'Unauthorized');
	}

	const versionId = url.searchParams.get('version') ?? '';
	const platformId = url.searchParams.get('platform') ?? '';
	const fileName = url.searchParams.get('fileName') ?? '';
	const mode = url.searchParams.get('mode') ?? '';
	if (!versionId || !isPlatformId(platformId) || !fileName) {
		throw error(400, 'version, platform and fileName are required');
	}
	if (mode !== 'raw' && mode !== 'broma') throw error(400, 'mode must be "raw" or "broma"');

	const filePath = resolveIdbPath(versionId, platformId, fileName, mode);
	if (!filePath) throw error(404, 'IDB not found');

	const size = statSync(filePath).size;
	const body = Readable.toWeb(createReadStream(filePath)) as ReadableStream;
	return new Response(body, {
		headers: {
			'Content-Type': 'application/octet-stream',
			'Content-Disposition': `attachment; filename="${path.basename(filePath)}"`,
			'Content-Length': String(size)
		}
	});
};

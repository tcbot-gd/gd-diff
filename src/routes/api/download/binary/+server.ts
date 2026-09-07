import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createReadStream, statSync } from 'node:fs';
import { Readable } from 'node:stream';
import path from 'node:path';
import { isDownloader } from '$lib/server/auth';
import { isPlatformId } from '$lib/shared/platforms';
import { resolveBinaryPath } from '$lib/server/download';

export const GET: RequestHandler = ({ request, url }) => {
	if (!isDownloader(request.headers.get('authorization'))) throw error(401, 'Unauthorized');

	const versionId = url.searchParams.get('version') ?? '';
	const platformId = url.searchParams.get('platform') ?? '';
	const fileName = url.searchParams.get('fileName') ?? '';
	if (!versionId || !isPlatformId(platformId) || !fileName) {
		throw error(400, 'version, platform and fileName are required');
	}

	const filePath = resolveBinaryPath(versionId, platformId, fileName);
	if (!filePath) throw error(404, 'Binary not found');

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

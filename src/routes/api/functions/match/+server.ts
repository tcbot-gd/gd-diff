import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { findFunctionsByName } from '$lib/server/repo';
import { isPlatformId } from '$lib/shared/platforms';
import { isDecompMode } from '$lib/shared/modes';

export const GET: RequestHandler = ({ url }) => {
	const name = (url.searchParams.get('name') ?? '').trim();
	const demangledName = url.searchParams.get('demangledName')?.trim() || null;
	const version = url.searchParams.get('version') ?? '';
	const platform = url.searchParams.get('platform') ?? '';
	const fileName = url.searchParams.get('fileName') ?? '';
	const mode = url.searchParams.get('mode') ?? '';

	if (!name) throw error(400, 'name is required');
	if (!isPlatformId(platform)) throw error(404, 'Unknown platform');
	if (!isDecompMode(mode)) throw error(400, 'Unknown decompilation mode');
	if (!fileName) throw error(400, 'fileName is required');

	return json({
		functions: findFunctionsByName(name, version, platform, fileName, mode, demangledName)
	});
};

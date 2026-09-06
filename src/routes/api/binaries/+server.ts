import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isPlatformId } from '$lib/shared/platforms';
import { getVersion, listBinaries } from '$lib/server/repo';

export const GET: RequestHandler = ({ url }) => {
	const version = url.searchParams.get('version') ?? '';
	const platform = url.searchParams.get('platform') ?? '';

	if (!getVersion(version)) throw error(404, 'Unknown version');
	if (!isPlatformId(platform)) throw error(404, 'Unknown platform');

	return json({ binaries: listBinaries(version, platform) });
};

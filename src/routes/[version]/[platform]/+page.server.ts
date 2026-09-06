import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getPlatform, getVersion, listBinaries, listDecompilations } from '$lib/server/repo';

export const load: PageServerLoad = ({ params }) => {
	const version = getVersion(params.version);
	if (!version) throw error(404, 'Unknown version');

	const platform = getPlatform(params.platform);
	if (!platform) throw error(404, 'Unknown platform');

	const binaries = listBinaries(version.id, platform.id).map((binary) => ({
		...binary,
		decompilations: listDecompilations(binary.id)
	}));

	return { version, platform, binaries };
};

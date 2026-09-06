import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import {
	getBinaryByRef,
	getPlatform,
	getVersion,
	listDecompilations,
	listFunctions
} from '$lib/server/repo';
import { isDecompMode } from '$lib/shared/modes';

export const load: PageServerLoad = ({ params }) => {
	const version = getVersion(params.version);
	if (!version) throw error(404, 'Unknown version');

	const platform = getPlatform(params.platform);
	if (!platform) throw error(404, 'Unknown platform');

	if (!isDecompMode(params.mode)) throw error(400, 'Unknown decompilation mode');

	const binary = getBinaryByRef(version.id, platform.id, params.binary);
	if (!binary) throw error(404, 'Binary not found');

	const decompilation = listDecompilations(binary.id).find((d) => d.mode === params.mode) ?? null;
	const functions = decompilation ? listFunctions(decompilation.id, { limit: 500, offset: 0 }) : [];

	return { version, platform, binary, decompilation, functions };
};

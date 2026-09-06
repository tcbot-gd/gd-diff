import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import {
	findCallers,
	findMemberUses,
	getBinaryByRef,
	getPlatform,
	getVersion,
	listDecompilations,
	listFunctions
} from '$lib/server/repo';
import { isDecompMode } from '$lib/shared/modes';

export const load: PageServerLoad = ({ params, url }) => {
	const version = getVersion(params.version);
	if (!version) throw error(404, 'Unknown version');

	const platform = getPlatform(params.platform);
	if (!platform) throw error(404, 'Unknown platform');

	if (!isDecompMode(params.mode)) throw error(400, 'Unknown decompilation mode');

	const binary = getBinaryByRef(version.id, platform.id, params.binary);
	if (!binary) throw error(404, 'Binary not found');

	const decompilation = listDecompilations(binary.id).find((d) => d.mode === params.mode) ?? null;

	const q = (url.searchParams.get('q') ?? '').trim();

	const functions = decompilation
		? q
			? listFunctions(decompilation.id, { query: q, limit: 200, offset: 0 })
			: listFunctions(decompilation.id, { limit: 500, offset: 0 })
		: [];
	const memberUses = q && decompilation ? findMemberUses(decompilation.id, q) : [];
	const callers = q && decompilation ? findCallers(decompilation.id, q) : [];

	return { version, platform, binary, decompilation, functions, memberUses, callers, q };
};

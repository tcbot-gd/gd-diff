import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import {
	findCallers,
	findMemberUses,
	getBinaryByRef,
	getPlatform,
	getVersion,
	listDecompilations,
	listFunctions,
	countFunctions
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
	const pageParam = Number(url.searchParams.get('page') ?? '1');
	const page = Number.isInteger(pageParam) && pageParam > 0 ? pageParam : 1;
	const pageSize = 100;

	let functions: ReturnType<typeof listFunctions> = [];
	let totalFunctions = 0;
	if (decompilation) {
		if (q) {
			functions = listFunctions(decompilation.id, { query: q, limit: 200, offset: 0 });
			totalFunctions = functions.length;
		} else {
			totalFunctions = countFunctions(decompilation.id);
			functions = listFunctions(decompilation.id, { limit: pageSize, offset: (page - 1) * pageSize });
		}
	}
	const totalPages = Math.max(1, Math.ceil(totalFunctions / pageSize));
	const memberUses = q && decompilation ? findMemberUses(decompilation.id, q) : [];
	const callers = q && decompilation ? findCallers(decompilation.id, q) : [];

	return { version, platform, binary, decompilation, functions, memberUses, callers, q, page, pageSize, totalFunctions, totalPages };
};

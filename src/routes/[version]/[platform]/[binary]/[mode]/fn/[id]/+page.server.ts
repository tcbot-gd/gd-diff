import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getFunctionContextByRef } from '$lib/server/repo';
import { isDecompMode } from '$lib/shared/modes';

export const load: PageServerLoad = ({ params, url }) => {
	if (!isDecompMode(params.mode)) throw error(400, 'Unknown decompilation mode');

	const fn = getFunctionContextByRef(params.version, params.platform, params.binary, params.mode, params.id);
	if (!fn) throw error(404, 'Function not found');

	const addrParam = url.searchParams.get('addr');
	const addr = addrParam ? parseInt(addrParam, 16) : null;

	const title = fn.demangledName ?? fn.name;

	return {
		function: fn,
		initialAddr: addr != null && !Number.isNaN(addr) ? addr : null,
		seo: {
			title,
			description: `${title} — ${fn.versionId}/${fn.platformId}/${fn.fileName} (${fn.mode})`
		}
	};
};

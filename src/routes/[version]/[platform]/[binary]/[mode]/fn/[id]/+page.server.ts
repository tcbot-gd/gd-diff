import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getFunctionContext } from '$lib/server/repo';

export const load: PageServerLoad = ({ params, url }) => {
	const id = Number(params.id);
	if (!Number.isInteger(id)) throw error(400, 'Invalid function id');

	const fn = getFunctionContext(id);
	if (!fn) throw error(404, 'Function not found');

	if (
		fn.versionId !== params.version ||
		fn.platformId !== params.platform ||
		fn.fileName !== params.binary ||
		fn.mode !== params.mode
	) {
		throw error(404, 'Function not found at this URL');
	}

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

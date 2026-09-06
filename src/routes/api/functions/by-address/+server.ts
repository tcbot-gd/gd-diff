import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { findFunctionByAddress, getDecompilation } from '$lib/server/repo';

export const GET: RequestHandler = ({ url }) => {
	const rawId = url.searchParams.get('decompilation');
	const decompilationId = rawId ? Number(rawId) : NaN;
	const addrParam = (url.searchParams.get('addr') ?? '').trim();
	const rva = url.searchParams.get('rva') === '1';

	if (!Number.isInteger(decompilationId)) throw error(400, 'Invalid decompilation id');

	const value = addrParam.toLowerCase().replace(/^0x/, '');
	if (!value) throw error(400, 'addr is required');
	const parsed = parseInt(value, 16);
	if (Number.isNaN(parsed)) throw error(400, 'Invalid address');

	let address = parsed;
	if (rva) {
		const decomp = getDecompilation(decompilationId);
		if (!decomp) throw error(404, 'Decompilation not found');
		if (decomp.imageBase == null) throw error(400, 'Image base unavailable for RVA lookup');
		address = decomp.imageBase + parsed;
	}

	const fn = findFunctionByAddress(decompilationId, address);
	if (!fn) throw error(404, 'No function at this address');

	return json({ function: fn, address });
};

import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { listDecompilations } from '$lib/server/repo';

export const GET: RequestHandler = ({ url }) => {
	const raw = url.searchParams.get('binary');
	const binaryId = raw ? Number(raw) : NaN;
	if (!Number.isInteger(binaryId)) throw error(400, 'Invalid binary id');

	return json({ decompilations: listDecompilations(binaryId) });
};

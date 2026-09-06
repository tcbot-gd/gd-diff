import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { listFunctions } from '$lib/server/repo';

export const GET: RequestHandler = ({ url }) => {
	const raw = url.searchParams.get('decompilation');
	const decompilationId = raw ? Number(raw) : NaN;
	if (!Number.isInteger(decompilationId)) throw error(400, 'Invalid decompilation id');

	const query = url.searchParams.get('q') ?? undefined;
	const limit = Math.min(Number(url.searchParams.get('limit') ?? '100'), 1000);
	const offset = Math.max(Number(url.searchParams.get('offset') ?? '0'), 0);

	return json({ functions: listFunctions(decompilationId, { query, limit, offset }) });
};

import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getFunctionContext } from '$lib/server/repo';

export const load: PageServerLoad = ({ params }) => {
	const aId = Number(params.a);
	const bId = Number(params.b);
	if (!Number.isInteger(aId) || !Number.isInteger(bId)) throw error(400, 'Invalid function id');

	const a = getFunctionContext(aId);
	const b = getFunctionContext(bId);
	if (!a || !b) throw error(404, 'Function not found');

	return { a, b };
};

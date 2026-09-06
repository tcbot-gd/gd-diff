import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getFunction } from '$lib/server/repo';

export const GET: RequestHandler = ({ params }) => {
	const id = Number(params.id);
	if (!Number.isInteger(id)) throw error(400, 'Invalid function id');

	const fn = getFunction(id);
	if (!fn) throw error(404, 'Function not found');

	return json({ function: fn });
};

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isAdmin } from '$lib/server/auth';
import { requeueDecompilation } from '$lib/server/repo';

export const POST: RequestHandler = ({ request, params }) => {
	if (!isAdmin(request.headers.get('authorization'))) throw error(401, 'Unauthorized');

	const id = Number(params.id);
	if (!Number.isInteger(id)) throw error(400, 'Invalid decompilation id');
	if (!requeueDecompilation(id)) throw error(404, 'Decompilation not found');

	return json({ ok: true });
};

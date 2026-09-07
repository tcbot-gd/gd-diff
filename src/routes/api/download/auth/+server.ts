import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$lib/server/env';
import { downloadCookieValue } from '$lib/server/auth';

export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json().catch(() => null);
	const password = typeof body?.password === 'string' ? body.password : '';
	if (!env.downloadPassword || password !== env.downloadPassword) {
		throw error(401, 'Wrong password');
	}
	return json(
		{ ok: true },
		{
			headers: {
				'Set-Cookie': `dl_auth=${downloadCookieValue()}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000`
			}
		}
	);
};

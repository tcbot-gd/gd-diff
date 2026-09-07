import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isDownloader } from '$lib/server/auth';

export const GET: RequestHandler = ({ request }) => {
	const unlocked = isDownloader(request.headers.get('authorization'), request.headers.get('cookie'));
	return json({ unlocked });
};

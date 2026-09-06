import { json } from '@sveltejs/kit';
import { PLATFORMS } from '$lib/shared/platforms';

export function GET() {
	return json({ platforms: PLATFORMS });
}

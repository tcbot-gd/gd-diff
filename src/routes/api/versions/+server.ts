import { json } from '@sveltejs/kit';
import { listVersions } from '$lib/server/repo';

export function GET() {
	return json({ versions: listVersions() });
}

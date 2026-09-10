import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getFunctionContext, getVersion } from '$lib/server/repo';

export const load: PageServerLoad = ({ params }) => {
	const aId = Number(params.a);
	const bId = Number(params.b);
	if (!Number.isInteger(aId) || !Number.isInteger(bId)) throw error(400, 'Invalid function id');

	let a = getFunctionContext(aId);
	let b = getFunctionContext(bId);
	if (!a || !b) throw error(404, 'Function not found');

	// Prioritize the higher version to A (newer side).  The diff is then read
	// as "B (older) → A (newer)": items only in A are what the newer version
	// added, items only in B are what the newer version removed.
	const aOrd = getVersion(a.versionId)?.ord ?? 0;
	const bOrd = getVersion(b.versionId)?.ord ?? 0;
	if (aOrd < bOrd) {
		[a, b] = [b, a];
	}

	return { a, b };
};

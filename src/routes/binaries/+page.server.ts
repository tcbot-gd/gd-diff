import type { PageServerLoad } from './$types';
import { listBinariesForExplorer } from '$lib/server/repo';

export const load: PageServerLoad = () => {
	return { binaries: listBinariesForExplorer() };
};

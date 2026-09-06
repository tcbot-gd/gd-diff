import type { PageServerLoad } from './$types';
import { listPlatforms, listVersions, versionPlatformMatrix } from '$lib/server/repo';

export const load: PageServerLoad = () => {
	return {
		platforms: listPlatforms(),
		versions: listVersions(),
		matrix: versionPlatformMatrix()
	};
};

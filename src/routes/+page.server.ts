import type { PageServerLoad } from './$types';
import { listPlatforms, listVersions, versionPlatformMatrix } from '$lib/server/repo';

export const load: PageServerLoad = () => {
	const platforms = listPlatforms();
	const matrix = versionPlatformMatrix();
	const versions = listVersions().filter(
		(version) => Object.keys(matrix[version.id] ?? {}).length > 0
	);
	return {
		platforms,
		versions,
		matrix
	};
};

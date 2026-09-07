import { existsSync } from 'node:fs';
import path from 'node:path';
import { config } from './config';
import type { PlatformId } from '../shared/platforms';

// macOS is the only platform that ships a merged (universal) binary. When we
// split it on upload we keep the original so it can be re-downloaded whole.
const MAC_PLATFORMS: PlatformId[] = ['imac', 'm1'];

export function resolveBinaryPath(versionId: string, platformId: PlatformId, fileName: string): string | null {
	if (MAC_PLATFORMS.includes(platformId)) {
		const merged = path.join(config.originalsDir, versionId, fileName);
		if (existsSync(merged)) return merged;
	}
	const thin = path.join(config.uploadsDir, versionId, platformId, fileName);
	return existsSync(thin) ? thin : null;
}

function findIdb(dir: string, prefix: string): string | null {
	for (const ext of ['.i64', '.idb']) {
		const p = path.join(dir, prefix + ext);
		if (existsSync(p)) return p;
	}
	return null;
}

// IDBs are never merged: imac and m1 keep their own per-arch databases.
export function resolveIdbPath(
	versionId: string,
	platformId: PlatformId,
	fileName: string,
	mode: 'raw' | 'broma'
): string | null {
	const dir =
		mode === 'raw'
			? path.join(config.uploadsDir, versionId, platformId)
			: path.join(config.databasesDir, versionId, platformId, fileName, 'broma');
	return findIdb(dir, fileName);
}

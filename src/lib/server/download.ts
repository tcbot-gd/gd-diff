import { existsSync } from 'node:fs';
import path from 'node:path';
import { config } from './config';
import type { PlatformId } from '../shared/platforms';

// macOS is the only platform that ships a merged (universal) binary. When we
// split it on upload we keep the original so it can be re-downloaded whole.
const MAC_PLATFORMS: PlatformId[] = ['imac', 'm1'];

/** Resolve a path and verify it stays inside `baseDir`. Prevents path traversal. */
function safePath(baseDir: string, ...parts: string[]): string | null {
	const resolved = path.resolve(baseDir, ...parts);
	if (!resolved.startsWith(baseDir + path.sep) && resolved !== baseDir) return null;
	return resolved;
}

export function resolveBinaryPath(versionId: string, platformId: PlatformId, fileName: string): string | null {
	if (MAC_PLATFORMS.includes(platformId)) {
		const merged = safePath(config.originalsDir, versionId, fileName);
		if (merged && existsSync(merged)) return merged;
	}
	const thin = safePath(config.uploadsDir, versionId, platformId, fileName);
	return thin && existsSync(thin) ? thin : null;
}

function findIdb(dir: string, prefix: string): string | null {
	for (const ext of ['.i64', '.idb']) {
		const p = path.resolve(dir, prefix + ext);
		if (p.startsWith(dir + path.sep) && existsSync(p)) return p;
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
			? safePath(config.uploadsDir, versionId, platformId)
			: safePath(config.databasesDir, versionId, platformId, fileName, 'broma');
	return dir ? findIdb(dir, fileName) : null;
}

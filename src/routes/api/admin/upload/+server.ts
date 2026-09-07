import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { isAdmin } from '$lib/server/auth';
import { config } from '$lib/server/config';
import { getDb } from '$lib/server/db';
import { getVersion } from '$lib/server/repo';
import { isPlatformId, type PlatformId } from '$lib/shared/platforms';
import { DECOMP_MODES } from '$lib/shared/modes';
import { isFatMachO, splitFatMachO, CPU_TYPE_X86_64, CPU_TYPE_ARM64 } from '$lib/server/macho';

interface StoredBinary {
	id: number;
	versionId: string;
	platformId: PlatformId;
	fileName: string;
	role: string;
	sha256: string;
}

function storeBinary(
	versionId: string,
	platformId: PlatformId,
	fileName: string,
	role: string,
	buffer: Buffer
): StoredBinary {
	const db = getDb();
	const sha256 = createHash('sha256').update(buffer).digest('hex');
	const dir = path.join(config.uploadsDir, versionId, platformId);
	mkdirSync(dir, { recursive: true });
	writeFileSync(path.join(dir, fileName), buffer);

	db.prepare(
		`INSERT INTO binaries (version_id, platform_id, file_name, role, sha256)
		 VALUES (?, ?, ?, ?, ?)
		 ON CONFLICT(version_id, platform_id, file_name)
		 DO UPDATE SET sha256 = excluded.sha256, role = excluded.role`
	).run(versionId, platformId, fileName, role, sha256);

	const row = db
		.prepare('SELECT id FROM binaries WHERE version_id = ? AND platform_id = ? AND file_name = ?')
		.get(versionId, platformId, fileName) as unknown as { id: number };
	const binaryId = Number(row.id);

	const insertDecomp = db.prepare('INSERT OR IGNORE INTO decompilations (binary_id, mode) VALUES (?, ?)');
	for (const mode of DECOMP_MODES) insertDecomp.run(binaryId, mode.id);

	console.log(`[upload] ${versionId}/${platformId}/${fileName} (${role}) ${buffer.length} bytes -> binary #${binaryId}`);
	return { id: binaryId, versionId, platformId, fileName, role, sha256 };
}

function cpuTypeToPlatform(cputype: number): PlatformId | null {
	if (cputype === CPU_TYPE_X86_64) return 'imac';
	if (cputype === CPU_TYPE_ARM64) return 'm1';
	return null;
}

export const POST: RequestHandler = async ({ request }) => {
	if (!isAdmin(request.headers.get('authorization'))) throw error(401, 'Unauthorized');

	const form = await request.formData();
	const versionId = String(form.get('version') ?? '').trim();
	const platformId = String(form.get('platform') ?? '').trim();
	const fileName = String(form.get('fileName') ?? '').trim();
	const role = String(form.get('role') ?? '').trim();
	const file = form.get('file');

	if (!versionId) throw error(400, 'version is required');
	if (!isPlatformId(platformId)) throw error(404, 'Unknown platform');
	if (!fileName) throw error(400, 'fileName is required');
	if (!role) throw error(400, 'role is required');
	if (!file || typeof file === 'string') throw error(400, 'file is required');

	try {
		const buffer = Buffer.from(await file.arrayBuffer());

		if (!getVersion(versionId)) {
			const db = getDb();
			const { m } = db
				.prepare('SELECT COALESCE(MAX(ord), -1) AS m FROM versions')
				.get() as unknown as { m: number };
			db.prepare('INSERT INTO versions (id, label, ord) VALUES (?, ?, ?)').run(versionId, versionId, m + 1);
		}

		// macOS ships a universal binary containing both x86_64 and arm64 slices.
		// Split it into thin binaries (imac + m1) and keep the merged original so
		// it can be shared later.
		if ((platformId === 'imac' || platformId === 'm1') && isFatMachO(buffer)) {
			const { slices, extract } = splitFatMachO(buffer);
			const origDir = path.join(config.originalsDir, versionId);
			mkdirSync(origDir, { recursive: true });
			writeFileSync(path.join(origDir, fileName), buffer);

			const created: StoredBinary[] = [];
			for (const slice of slices) {
				const target = cpuTypeToPlatform(slice.cputype);
				if (!target) continue;
				created.push(storeBinary(versionId, target, fileName, role, Buffer.from(extract(slice))));
			}
			if (created.length === 0) throw error(400, 'Fat Mach-O contained no x86_64 or arm64 slice');
			console.log(`[upload] ${versionId}/mac merged (${buffer.length} bytes) -> ${created.map((b) => b.platformId).join(', ')}`);
			return json({ binary: created[0], binaries: created, merged: true }, { status: 201 });
		}

		const stored = storeBinary(versionId, platformId, fileName, role, buffer);
		return json({ binary: stored }, { status: 201 });
	} catch (err) {
		console.error('[upload] failed:', err);
		throw error(500, 'Upload failed');
	}
};

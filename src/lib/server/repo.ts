import { getDb } from './db';
import type {
	BinaryRow,
	BinaryWithStatus,
	DecompilationRow,
	FunctionContent,
	FunctionRow,
	FunctionWithContent,
	PlatformRow,
	VersionRow,
	VersionPlatformMatrix
} from '../shared/types';
import type { BinaryRole } from '../shared/platforms';
import type { DecompMode } from '../shared/modes';

export function listPlatforms(): PlatformRow[] {
	return getDb().prepare('SELECT id, label, arch, ord FROM platforms ORDER BY ord').all() as unknown as PlatformRow[];
}

export function getPlatform(id: string): PlatformRow | null {
	return (
		(getDb()
			.prepare('SELECT id, label, arch, ord FROM platforms WHERE id = ?')
			.get(id) as unknown as PlatformRow | undefined) ?? null
	);
}

export function listVersions(): VersionRow[] {
	return getDb().prepare('SELECT id, label, ord, note FROM versions ORDER BY ord').all() as unknown as VersionRow[];
}

export function getVersion(id: string): VersionRow | null {
	return (
		(getDb()
			.prepare('SELECT id, label, ord, note FROM versions WHERE id = ?')
			.get(id) as unknown as VersionRow | undefined) ?? null
	);
}

export function listBinaries(versionId: string, platformId: string): BinaryWithStatus[] {
	return getDb()
		.prepare(
			`SELECT
				b.id,
				b.version_id AS versionId,
				b.platform_id AS platformId,
				b.file_name AS fileName,
				b.role,
				b.sha256,
				(SELECT COUNT(*) FROM decompilations d WHERE d.binary_id = b.id) AS decompCount,
				(SELECT COUNT(*) FROM decompilations d WHERE d.binary_id = b.id AND d.status = 'done') AS doneCount
			FROM binaries b
			WHERE b.version_id = ? AND b.platform_id = ?
			ORDER BY b.file_name`
		)
		.all(versionId, platformId) as unknown as BinaryWithStatus[];
}

export function listDecompilations(binaryId: number): DecompilationRow[] {
	return getDb()
		.prepare(
			`SELECT
				id,
				binary_id AS binaryId,
				mode,
				bindings_commit AS bindingsCommit,
				image_base AS imageBase,
				status,
				error,
				created_at AS createdAt,
				updated_at AS updatedAt
			FROM decompilations
			WHERE binary_id = ?
			ORDER BY mode`
		)
		.all(binaryId) as unknown as DecompilationRow[];
}

export function getDecompilation(id: number): DecompilationRow | null {
	return (
		(getDb()
			.prepare(
				`SELECT
					id,
					binary_id AS binaryId,
					mode,
					bindings_commit AS bindingsCommit,
					image_base AS imageBase,
					status,
					error,
					created_at AS createdAt,
					updated_at AS updatedAt
				FROM decompilations
				WHERE id = ?`
			)
			.get(id) as unknown as DecompilationRow | undefined) ?? null
	);
}

export interface FunctionListOptions {
	query?: string;
	limit: number;
	offset: number;
}

export function listFunctions(
	decompilationId: number,
	options: FunctionListOptions = { limit: 100, offset: 0 }
): FunctionRow[] {
	const { query, limit, offset } = options;
	if (query) {
		const pattern = `%${query}%`;
		return getDb()
			.prepare(
				`SELECT
					id,
					decompilation_id AS decompilationId,
					name,
					demangled_name AS demangledName,
					address,
					size,
					type_signature AS typeSignature
				FROM functions
				WHERE decompilation_id = ? AND (name LIKE ? OR demangled_name LIKE ?)
				ORDER BY name
				LIMIT ? OFFSET ?`
			)
			.all(decompilationId, pattern, pattern, limit, offset) as unknown as FunctionRow[];
	}
	return getDb()
		.prepare(
			`SELECT
				id,
				decompilation_id AS decompilationId,
				name,
				demangled_name AS demangledName,
				address,
				size,
				type_signature AS typeSignature
			FROM functions
			WHERE decompilation_id = ?
			ORDER BY name
			LIMIT ? OFFSET ?`
		)
		.all(decompilationId, limit, offset) as unknown as FunctionRow[];
}

export function getFunction(id: number): FunctionWithContent | null {
	const row = getDb()
		.prepare(
			`SELECT
				f.id,
				f.decompilation_id AS decompilationId,
				f.name,
				f.demangled_name AS demangledName,
				f.address,
				f.size,
				f.type_signature AS typeSignature,
				c.content
			FROM functions f
			LEFT JOIN function_content c ON c.function_id = f.id
			WHERE f.id = ?`
		)
		.get(id) as unknown as (FunctionRow & { content: string | null }) | undefined;

	if (!row) return null;

	const { content, ...fn } = row;
	return {
		...fn,
		content: content ? JSON.parse(content) : null
	};
}

export function versionPlatformMatrix(): VersionPlatformMatrix {
	const rows = getDb()
		.prepare(
			`SELECT
				b.version_id AS versionId,
				b.platform_id AS platformId,
				COUNT(DISTINCT b.id) AS binaryCount,
				SUM(CASE WHEN d.status = 'done' THEN 1 ELSE 0 END) AS doneCount
			FROM binaries b
			LEFT JOIN decompilations d ON d.binary_id = b.id
			GROUP BY b.version_id, b.platform_id`
		)
		.all() as unknown as { versionId: string; platformId: string; binaryCount: number; doneCount: number | null }[];

	const matrix: VersionPlatformMatrix = {};
	for (const row of rows) {
		(matrix[row.versionId] ??= {})[row.platformId] = {
			binaryCount: row.binaryCount,
			doneCount: row.doneCount ?? 0
		};
	}
	return matrix;
}

export function getBinaryByRef(
	versionId: string,
	platformId: string,
	fileName: string
): BinaryRow | null {
	return (
		(getDb()
			.prepare(
				`SELECT
					id,
					version_id AS versionId,
					platform_id AS platformId,
					file_name AS fileName,
					role,
					sha256
				FROM binaries
				WHERE version_id = ? AND platform_id = ? AND file_name = ?`
			)
			.get(versionId, platformId, fileName) as unknown as BinaryRow | undefined) ?? null
	);
}

export interface FunctionContext extends FunctionWithContent {
	mode: DecompMode;
	imageBase: number | null;
	binaryId: number;
	versionId: string;
	platformId: string;
	fileName: string;
	role: BinaryRole;
}

export function getFunctionContext(functionId: number): FunctionContext | null {
	const row = getDb()
		.prepare(
			`SELECT
				f.id,
				f.decompilation_id AS decompilationId,
				f.name,
				f.demangled_name AS demangledName,
				f.address,
				f.size,
				f.type_signature AS typeSignature,
				c.content,
				d.mode,
				d.image_base AS imageBase,
				d.binary_id AS binaryId,
				b.version_id AS versionId,
				b.platform_id AS platformId,
				b.file_name AS fileName,
				b.role
			FROM functions f
			JOIN decompilations d ON d.id = f.decompilation_id
			JOIN binaries b ON b.id = d.binary_id
			LEFT JOIN function_content c ON c.function_id = f.id
			WHERE f.id = ?`
		)
		.get(functionId) as unknown as
		| (FunctionRow & {
				content: string | null;
				mode: DecompMode;
				imageBase: number | null;
				binaryId: number;
				versionId: string;
				platformId: string;
				fileName: string;
				role: BinaryRole;
		  })
		| undefined;

	if (!row) return null;

	const { content, ...fn } = row;
	return {
		...fn,
		content: content ? (JSON.parse(content) as FunctionContent) : null
	};
}

export function findFunctionsByName(
	name: string,
	versionId: string,
	platformId: string,
	fileName: string,
	mode: DecompMode
): FunctionRow[] {
	const binary = getBinaryByRef(versionId, platformId, fileName);
	if (!binary) return [];
	const decomp = listDecompilations(binary.id).find((d) => d.mode === mode);
	if (!decomp) return [];

	return getDb()
		.prepare(
			`SELECT
				id,
				decompilation_id AS decompilationId,
				name,
				demangled_name AS demangledName,
				address,
				size,
				type_signature AS typeSignature
			FROM functions
			WHERE decompilation_id = ? AND (name = ? OR demangled_name = ?)
			ORDER BY address
			LIMIT 50`
		)
		.all(decomp.id, name, name) as unknown as FunctionRow[];
}

export function findFunctionByAddress(decompilationId: number, address: number): FunctionRow | null {
	return (
		(getDb()
			.prepare(
				`SELECT
					id,
					decompilation_id AS decompilationId,
					name,
					demangled_name AS demangledName,
					address,
					size,
					type_signature AS typeSignature
				FROM functions
				WHERE decompilation_id = ? AND address <= ? AND ? < address + size
				ORDER BY address DESC
				LIMIT 1`
			)
			.get(decompilationId, address, address) as unknown as FunctionRow | undefined) ?? null
	);
}

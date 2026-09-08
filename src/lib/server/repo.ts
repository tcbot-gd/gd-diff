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
import type { DecompMode, DecompilationProgress } from '../shared/modes';

interface DecompilationRowRaw {
	id: number;
	binaryId: number;
	mode: DecompMode;
	bindingsCommit: string | null;
	imageBase: number | null;
	status: DecompilationRow['status'];
	error: string | null;
	progress: string | null;
	createdAt: string;
	updatedAt: string;
}

function parseProgress(raw: string | null | undefined): DecompilationProgress | null {
	if (!raw) return null;
	try {
		const p = JSON.parse(raw) as {
			phase?: DecompilationProgress['phase'];
			functions_done?: number;
			functions_total?: number | null;
			current_function?: string | null;
			current_function_size?: number;
			log_tail?: unknown;
			updated_at?: string;
		};
		const logTail = Array.isArray(p.log_tail)
			? p.log_tail.filter((x): x is string => typeof x === 'string')
			: [];
		return {
			phase: p.phase ?? 'analyzing',
			functionsDone: p.functions_done ?? 0,
			functionsTotal: p.functions_total ?? null,
			currentFunction: p.current_function ?? null,
			currentFunctionSize: typeof p.current_function_size === 'number' ? p.current_function_size : null,
			logTail,
			updatedAt: p.updated_at ?? ''
		};
	} catch {
		return null;
	}
}

function mapDecompilation(raw: DecompilationRowRaw): DecompilationRow {
	const { progress, ...rest } = raw;
	return { ...rest, progress: parseProgress(progress) };
}

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
	const rows = getDb()
		.prepare(
			`SELECT
				id,
				binary_id AS binaryId,
				mode,
				bindings_commit AS bindingsCommit,
				image_base AS imageBase,
				status,
				error,
				progress,
				created_at AS createdAt,
				updated_at AS updatedAt
			FROM decompilations
			WHERE binary_id = ?
			ORDER BY mode`
		)
		.all(binaryId) as unknown as DecompilationRowRaw[];
	return rows.map(mapDecompilation);
}

export function getDecompilation(id: number): DecompilationRow | null {
	const raw = getDb()
		.prepare(
			`SELECT
				id,
				binary_id AS binaryId,
				mode,
				bindings_commit AS bindingsCommit,
				image_base AS imageBase,
				status,
				error,
				progress,
				created_at AS createdAt,
				updated_at AS updatedAt
			FROM decompilations
			WHERE id = ?`
		)
		.get(id) as unknown as DecompilationRowRaw | undefined;
	return raw ? mapDecompilation(raw) : null;
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
	const columns = `id, decompilation_id AS decompilationId, name, demangled_name AS demangledName,
		address, size, type_signature AS typeSignature`;
	if (query) {
		const pattern = `%${query}%`;
		return getDb()
			.prepare(
				`SELECT ${columns} FROM functions
				WHERE decompilation_id = ? AND (name LIKE ? OR demangled_name LIKE ?)
				ORDER BY CASE WHEN substr(name, 1, 1) LIKE '[A-Za-z_]' THEN 0 ELSE 1 END, name
				LIMIT ? OFFSET ?`
			)
			.all(decompilationId, pattern, pattern, limit, offset) as unknown as FunctionRow[];
	}
	return getDb()
		.prepare(
			`SELECT ${columns} FROM functions
			WHERE decompilation_id = ?
			ORDER BY CASE WHEN substr(name, 1, 1) LIKE '[A-Za-z_]' THEN 0 ELSE 1 END, name
			LIMIT ? OFFSET ?`
		)
		.all(decompilationId, limit, offset) as unknown as FunctionRow[];
}

export function countFunctions(decompilationId: number): number {
	const row = getDb()
		.prepare('SELECT COUNT(*) AS n FROM functions WHERE decompilation_id = ?')
		.get(decompilationId) as unknown as { n: number };
	return row.n;
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

export function getFunctionContextByRef(
	versionId: string,
	platformId: string,
	fileName: string,
	mode: DecompMode,
	ref: string
): FunctionContext | null {
	if (/^\d+$/.test(ref)) return getFunctionContext(Number(ref));
	const matches = findFunctionsByName(ref, versionId, platformId, fileName, mode);
	return matches.length > 0 ? getFunctionContext(matches[0].id) : null;
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

export interface MemberUseRow {
	functionId: number;
	functionName: string;
	ownerType: string;
	memberName: string;
	memberKind: string;
}

export function findMemberUses(decompilationId: number, query: string): MemberUseRow[] {
	const pattern = `%${query}%`;
	return getDb()
		.prepare(
			`SELECT
				mu.function_id AS functionId,
				f.name AS functionName,
				mu.owner_type AS ownerType,
				mu.member_name AS memberName,
				mu.member_kind AS memberKind
			FROM member_uses mu
			JOIN functions f ON f.id = mu.function_id
			WHERE mu.decompilation_id = ? AND (mu.member_name LIKE ? OR mu.owner_type LIKE ?)
			ORDER BY mu.member_name, mu.owner_type, f.name
			LIMIT 200`
		)
		.all(decompilationId, pattern, pattern) as unknown as MemberUseRow[];
}

export interface CallerRow {
	callerId: number;
	callerName: string;
	calleeName: string;
	calleeAddress: number | null;
}

export function findCallers(decompilationId: number, query: string): CallerRow[] {
	const pattern = `%${query}%`;
	return getDb()
		.prepare(
			`SELECT
				fc.caller_id AS callerId,
				f.name AS callerName,
				fc.callee_name AS calleeName,
				fc.callee_address AS calleeAddress
			FROM function_calls fc
			JOIN functions f ON f.id = fc.caller_id
			WHERE fc.decompilation_id = ? AND fc.callee_name LIKE ?
			ORDER BY fc.callee_name, f.name
			LIMIT 200`
		)
		.all(decompilationId, pattern) as unknown as CallerRow[];
}

export interface AdminBinary {
	id: number;
	versionId: string;
	platformId: string;
	fileName: string;
	role: string;
	decompilations: { id: number; mode: string; status: string }[];
}

export function listBinariesAdmin(): AdminBinary[] {
	const db = getDb();
	const binaries = db
		.prepare(
			'SELECT id, version_id AS versionId, platform_id AS platformId, file_name AS fileName, role FROM binaries ORDER BY version_id, platform_id, file_name'
		)
		.all() as unknown as { id: number; versionId: string; platformId: string; fileName: string; role: string }[];
	return binaries.map((b) => ({
		...b,
		decompilations: db
			.prepare('SELECT id, mode, status FROM decompilations WHERE binary_id = ? ORDER BY mode')
			.all(b.id) as unknown as { id: number; mode: string; status: string }[]
	}));
}

export interface ExplorerBinary {
	versionId: string;
	platformId: string;
	fileName: string;
	role: string;
	hasRaw: boolean;
	hasBroma: boolean;
}

export function listBinariesForExplorer(): ExplorerBinary[] {
	const rows = getDb()
		.prepare(
			`SELECT
				b.version_id AS versionId,
				b.platform_id AS platformId,
				b.file_name AS fileName,
				b.role,
				MAX(CASE WHEN d.mode = 'raw' AND d.status = 'done' THEN 1 ELSE 0 END) AS hasRaw,
				MAX(CASE WHEN d.mode = 'broma' AND d.status = 'done' THEN 1 ELSE 0 END) AS hasBroma
			FROM binaries b
			LEFT JOIN decompilations d ON d.binary_id = b.id
			LEFT JOIN versions v ON v.id = b.version_id
			GROUP BY b.id
			ORDER BY v.ord DESC, b.platform_id, b.file_name`
		)
		.all() as unknown as (Omit<ExplorerBinary, 'hasRaw' | 'hasBroma'> & { hasRaw: number; hasBroma: number })[];
	return rows.map((r) => ({ ...r, hasRaw: !!r.hasRaw, hasBroma: !!r.hasBroma }));
}

export function requeueDecompilation(id: number): boolean {
	const db = getDb();
	if (!db.prepare('SELECT 1 FROM decompilations WHERE id = ?').get(id)) return false;
	db.exec('PRAGMA foreign_keys = ON');
	db.exec('BEGIN');
	try {
		db.prepare('DELETE FROM function_calls WHERE decompilation_id = ?').run(id);
		db.prepare('DELETE FROM member_uses WHERE decompilation_id = ?').run(id);
		db.prepare('DELETE FROM functions WHERE decompilation_id = ?').run(id);
		db.prepare("UPDATE decompilations SET status = 'pending', progress = NULL, error = NULL WHERE id = ?").run(id);
		db.exec('COMMIT');
	} catch (error) {
		db.exec('ROLLBACK');
		throw error;
	}
	return true;
}

export interface BinaryDeletion {
	versionId: string;
	platformId: string;
	fileName: string;
	decompilationIds: number[];
}

export function deleteBinary(binaryId: number): BinaryDeletion | null {
	const db = getDb();
	const bin = db
		.prepare('SELECT version_id AS versionId, platform_id AS platformId, file_name AS fileName FROM binaries WHERE id = ?')
		.get(binaryId) as unknown as { versionId: string; platformId: string; fileName: string } | undefined;
	if (!bin) return null;
	const decompilationIds = (
		db.prepare('SELECT id FROM decompilations WHERE binary_id = ?').all(binaryId) as unknown as { id: number }[]
	).map((r) => r.id);
	db.exec('PRAGMA foreign_keys = ON');
	db.prepare('DELETE FROM binaries WHERE id = ?').run(binaryId);
	return { ...bin, decompilationIds };
}

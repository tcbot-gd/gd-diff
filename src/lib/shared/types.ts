import type { Arch, PlatformId, BinaryRole } from './platforms';
import type { DecompMode, DecompStatus } from './modes';

export interface PlatformRow {
	id: PlatformId;
	label: string;
	arch: Arch;
	ord: number;
}

export interface VersionRow {
	id: string;
	label: string;
	ord: number;
	note: string | null;
}

export interface BinaryRow {
	id: number;
	versionId: string;
	platformId: PlatformId;
	fileName: string;
	role: BinaryRole;
	sha256: string | null;
}

export interface BinaryWithStatus extends BinaryRow {
	decompCount: number;
	doneCount: number;
}

export interface DecompilationRow {
	id: number;
	binaryId: number;
	mode: DecompMode;
	bindingsCommit: string | null;
	imageBase: number | null;
	status: DecompStatus;
	error: string | null;
	createdAt: string;
	updatedAt: string;
}

export interface FunctionRow {
	id: number;
	decompilationId: number;
	name: string;
	demangledName: string | null;
	address: number;
	size: number;
	typeSignature: string | null;
}

export interface AsmInstruction {
	addr: number;
	bytes: string;
	mnemonic: string;
	operands: string;
}

export interface PseudocodeLine {
	line: number;
	text: string;
	addrs: number[];
}

export interface HexRow {
	addr: number;
	bytes: string;
	ascii: string;
}

export interface CallRef {
	addr: number;
	target: number;
	name: string;
}

export interface MemberUse {
	owner: string;
	name: string;
	kind: 'this' | 'external';
	addrs: number[];
}

export interface FunctionContent {
	asm: AsmInstruction[];
	pseudocode: PseudocodeLine[];
	hex: HexRow[];
	calls: CallRef[];
	members: MemberUse[];
}

export interface FunctionWithContent extends FunctionRow {
	content: FunctionContent | null;
}

export interface PlatformStatus {
	binaryCount: number;
	doneCount: number;
}

export type VersionPlatformMatrix = Record<string, Record<string, PlatformStatus>>;

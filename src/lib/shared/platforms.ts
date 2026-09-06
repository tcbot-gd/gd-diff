export const ARCH = {
	x64: { id: 'x64', label: 'x86-64' },
	arm32: { id: 'arm32', label: 'ARMv7' },
	arm64: { id: 'arm64', label: 'ARMv8' }
} as const;

export type Arch = keyof typeof ARCH;

export type PlatformId = 'win' | 'android32' | 'android64' | 'imac' | 'm1' | 'ios';

export type BinaryRole = 'game' | 'engine' | 'extensions' | 'audio' | 'monolith';

export interface BinaryDef {
	fileName: string;
	role: BinaryRole;
	label: string;
}

export interface PlatformDef {
	id: PlatformId;
	label: string;
	short: string;
	arch: Arch;
	binaries: BinaryDef[];
}

export const PLATFORMS: PlatformDef[] = [
	{
		id: 'win',
		label: 'Windows',
		short: 'Win',
		arch: 'x64',
		binaries: [
			{ fileName: 'GeometryDash.exe', role: 'game', label: 'Game' },
			{ fileName: 'libcocos2d.dll', role: 'engine', label: 'cocos2d engine' },
			{ fileName: 'libExtensions.dll', role: 'extensions', label: 'Engine extensions' },
			{ fileName: 'fmod.dll', role: 'audio', label: 'FMOD audio' }
		]
	},
	{
		id: 'android32',
		label: 'Android (ARMv7)',
		short: 'A32',
		arch: 'arm32',
		binaries: [
			{ fileName: 'libcocos2dcpp.so', role: 'monolith', label: 'Game + engine' },
			{ fileName: 'libfmod.so', role: 'audio', label: 'FMOD audio' }
		]
	},
	{
		id: 'android64',
		label: 'Android (ARMv8)',
		short: 'A64',
		arch: 'arm64',
		binaries: [
			{ fileName: 'libcocos2dcpp.so', role: 'monolith', label: 'Game + engine' },
			{ fileName: 'libfmod.so', role: 'audio', label: 'FMOD audio' }
		]
	},
	{
		id: 'imac',
		label: 'macOS (Intel)',
		short: 'iMac',
		arch: 'x64',
		binaries: [{ fileName: 'Geometry Dash', role: 'monolith', label: 'Game + engine' }]
	},
	{
		id: 'm1',
		label: 'macOS (Apple Silicon)',
		short: 'M1',
		arch: 'arm64',
		binaries: [{ fileName: 'Geometry Dash', role: 'monolith', label: 'Game + engine' }]
	},
	{
		id: 'ios',
		label: 'iOS',
		short: 'iOS',
		arch: 'arm64',
		binaries: [{ fileName: 'Geometry Jump', role: 'monolith', label: 'Game + engine' }]
	}
];

export const PLATFORM_BY_ID = new Map<PlatformId, PlatformDef>(PLATFORMS.map((p) => [p.id, p]));

export function isPlatformId(value: string): value is PlatformId {
	return PLATFORM_BY_ID.has(value as PlatformId);
}

export function sameArch(a: PlatformId, b: PlatformId): boolean {
	return PLATFORM_BY_ID.get(a)!.arch === PLATFORM_BY_ID.get(b)!.arch;
}

export function samePlatform(a: PlatformId, b: PlatformId): boolean {
	return a === b;
}

export const DECOMP_MODES = [
	{ id: 'raw', label: 'Raw', description: 'Pure IDA decompilation, no bindings' },
	{ id: 'broma', label: 'Broma', description: 'Decompilation with geode-sdk bindings applied' }
] as const;

export type DecompMode = (typeof DECOMP_MODES)[number]['id'];

export type DecompStatus = 'pending' | 'running' | 'done' | 'failed';

export const DECOMP_MODE_BY_ID = new Map<DecompMode, (typeof DECOMP_MODES)[number]>(
	DECOMP_MODES.map((m) => [m.id, m])
);

export function isDecompMode(value: string): value is DecompMode {
	return DECOMP_MODE_BY_ID.has(value as DecompMode);
}

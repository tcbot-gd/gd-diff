// Mach-O universal ("fat") binary parsing + slice extraction. Pure, no deps, so
// it runs identically in the app (upload) and worker (Bun).

const FAT_MAGIC = 0xcafebabe;
const FAT_CIGAM = 0xbebafeca;
const FAT_MAGIC_64 = 0xcafebabf;
const FAT_CIGAM_64 = 0xbfbafeca;

export const CPU_TYPE_X86_64 = 0x01000007;
export const CPU_TYPE_ARM64 = 0x0100000c;

export interface MachoSlice {
	cputype: number;
	cpusubtype: number;
	offset: number;
	size: number;
}

export function isFatMachO(buf: Uint8Array): boolean {
	if (buf.length < 8) return false;
	const magic = new DataView(buf.buffer, buf.byteOffset, 4).getUint32(0, false);
	return (
		magic === FAT_MAGIC ||
		magic === FAT_CIGAM ||
		magic === FAT_MAGIC_64 ||
		magic === FAT_CIGAM_64
	);
}

export function splitFatMachO(buf: Uint8Array): {
	slices: MachoSlice[];
	extract: (slice: MachoSlice) => Uint8Array;
} {
	const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
	const magic = view.getUint32(0, false);
	const is64 = magic === FAT_MAGIC_64 || magic === FAT_CIGAM_64;
	const littleEndian = magic === FAT_CIGAM || magic === FAT_CIGAM_64;
	const nfat = view.getUint32(4, littleEndian);

	const slices: MachoSlice[] = [];
	let off = 8;
	for (let i = 0; i < nfat; i++) {
		const cputype = view.getInt32(off, littleEndian);
		const cpusubtype = view.getInt32(off + 4, littleEndian);
		if (is64) {
			const offset = Number(view.getBigUint64(off + 8, littleEndian));
			const size = Number(view.getBigUint64(off + 16, littleEndian));
			slices.push({ cputype, cpusubtype, offset, size });
			off += 32;
		} else {
			const offset = view.getUint32(off + 8, littleEndian);
			const size = view.getUint32(off + 12, littleEndian);
			slices.push({ cputype, cpusubtype, offset, size });
			off += 20;
		}
	}

	return {
		slices,
		extract: (slice) => buf.subarray(slice.offset, slice.offset + slice.size)
	};
}

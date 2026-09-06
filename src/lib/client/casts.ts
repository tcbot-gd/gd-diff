// Best-effort client-side "hide casts", mirroring Hex-Rays' hide-casts view option.
// Strips C-style casts like `(int)`, `(char *)`, `(_QWORD *)`, `(PlayerObject *)`,
// including in `*(Type *)(expr)` deref patterns. Function-pointer casts with nested
// parentheses are intentionally left alone. Line count and address mapping are
// unaffected, so view sync still works.
const CAST_RE =
	/\(\s*(?:const\s+|volatile\s+|unsigned\s+|signed\s+|long\s+|short\s+)*(?:[A-Za-z_][A-Za-z0-9_:]*)\s*(?:\*\s*)*\)(?=[A-Za-z0-9_*(&{])/g;

export function stripCasts(text: string): string {
	return text.replace(CAST_RE, '');
}

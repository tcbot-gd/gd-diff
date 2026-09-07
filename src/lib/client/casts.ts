// Best-effort client-side "hide casts", mirroring Hex-Rays' hide-casts view option.
// Strips C-style casts like `(int)`, `(char *)`, `(_QWORD *)`, `(PlayerObject *)`,
// including in `*(Type *)(expr)` deref patterns. Function-pointer casts with nested
// parentheses are intentionally left alone. Line count and address mapping are
// unaffected, so view sync still works.
const QUALIFIERS = '(?:const|volatile|unsigned|signed|long|short|struct|class)';
const TYPE_NAME = '[A-Za-z_][A-Za-z0-9_:]*';
// A cast group: `(qualifiers* TypeName qualifiers* (pointer markers)*)`
const CAST_RE = new RegExp(
	'\\(' +
		'(?:' + QUALIFIERS + '\\s+)*' + // leading qualifiers
		TYPE_NAME +
		'(?:\\s+' + QUALIFIERS + ')*' + // trailing qualifiers (e.g. "long long")
		'(?:\\s*[\\*&]+)*' + // pointer/reference markers
		'\\)' +
		'(?=[A-Za-z0-9_*(&\\[{(])', // followed by an operand (not a call/paren group)
	'g'
);

export function stripCasts(text: string): string {
	return text.replace(CAST_RE, (match) => (match === '()' ? match : ''));
}


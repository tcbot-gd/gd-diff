// Best-effort client-side "hide casts", mirroring Hex-Rays' hide-casts view option.
// Strips C-style casts like `(int)`, `(char *)`, `(_QWORD *)`, `(PlayerObject *)`,
// including in `*(Type *)(expr)` deref patterns. Function-pointer casts like
// `(__int64 (__fastcall *)(_QWORD **, __int64))` are left alone because stripping
// only the inner `(__fastcall *)` fragment would leave broken pseudocode.
// Line count and address mapping are unaffected, so view sync still works.
const QUALIFIERS = '(?:const|volatile|unsigned|signed|long|short|struct|class)';
const TYPE_NAME = '[A-Za-z_][A-Za-z0-9_:]*';
const CALLING_CONV =
	'__fastcall|__thiscall|__cdecl|__clrcall|__stdcall|__usercall|__userpurge';
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
	return text.replace(CAST_RE, (match) => {
		if (match === '()') return match;
		// Leave function-pointer cast fragments alone — the regex may match
		// just the `(__fastcall *)` part of a larger `(__int64 (__fastcall *)(...))`
		// type; stripping it would leave broken syntax.
		if (new RegExp(CALLING_CONV).test(match)) return match;
		return '';
	});
}


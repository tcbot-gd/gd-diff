// Best-effort client-side "hide local declarations".
// IDA declares all local variables at the top of each function (and sometimes
// mid-function).  These declarations clutter the pseudocode, especially in
// large functions.
//
// A line is treated as a local declaration when it matches the pattern:
//   TYPE [*...] VARNAME [array dims] [= expr]; // optional IDA comment
// where TYPE is a known C / IDA type keyword or a user-defined type name.
//
// False-positive guard: the line must NOT contain parentheses *before* the
// optional "=" sign, which rules out most expression statements.
//
// NOTE: every regex below is written with String.raw, so backslashes are taken
// literally: `\s` in the source IS the regex escape \s (whitespace). There is
// no double-backslash escaping to untangle.

const QUALIFIERS = String.raw`(?:(?:un)?signed\s+|const\s+|volatile\s+|struct\s+|union\s+|enum\s+)*`;
const PTR = String.raw`\s*(?:\*\s*)*`;
const ARRAY_DIM = String.raw`(?:\s*\[[^\]]*\]\s*)*`;
const INIT = String.raw`(?:\s*=\s*[^;]+)?`;

// Known built-in types used by IDA hex-rays
const BUILTIN =
	'__int(?:128|64|32|16|8)|_OWORD|_QWORD|_DWORD|_WORD|_BYTE|_BYTE16|int(?:8|16|32|64)?_t|size_t|ptrdiff_t|long long|int|char|short|long|float|double|bool|void|auto';

// User-defined type names typically start with an uppercase letter. The
// namespace pattern (e.g. cocos2d::CCObject, cocos2d::extension::CCHttpRequest)
// allows lower-case namespace segments.
const USER_TYPE = String.raw`(?:[A-Za-z_]\w*(?:::[A-Za-z_]\w*)*)`;

const LOCAL_DECL_RE = new RegExp(
	String.raw`^\s*` +
		QUALIFIERS +
		'(?:' +
		BUILTIN +
		'|' +
		USER_TYPE +
		')' +
		PTR +
		String.raw`\b\w+\b` +
		ARRAY_DIM +
		INIT +
		String.raw`;.*$`
);

export function isLocalDecl(text: string): boolean {
	// Quick reject: lines that start with control-flow or statement keywords
	if (/^\s*(?:if|else|for|while|do|switch|case|return|break|continue|goto|throw|try|catch)\b/.test(text))
		return false;
	// Quick reject: lines containing "(" before any "=" — likely a function call / expression
	const eqIdx = text.indexOf('=');
	const parenIdx = text.indexOf('(');
	if (parenIdx !== -1 && (eqIdx === -1 || parenIdx < eqIdx)) return false;
	return LOCAL_DECL_RE.test(text);
}

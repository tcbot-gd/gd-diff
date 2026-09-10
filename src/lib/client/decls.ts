// Best-effort client-side "hide local declarations".
// IDA declares all local variables at the top of each function (and sometimes
// mid-function).  These declarations clutter the pseudocode, especially in
// large functions.
//
// A line is treated as a local declaration when it matches the pattern:
//   TYPE [*...] VARNAME [array dims] [= expr];
// where TYPE is a known C / IDA type keyword or a user-defined type name.
//
// False-positive guard: the line must NOT contain parentheses *before* the
// optional `=` sign, which rules out most expression statements.

const QUALIFIERS = '(?:(?:un)?signed\\s+|const\\s+|volatile\\s+)*';
const PTR = '\\s*(?:\\*\\s*)*';
const ARRAY_DIM = '(?:\\s*\\[[^\\]]*\\])*';
const INIT = '(?:\\s*=\\s*[^;]+)?';

// Known built-in types used by IDA hex-rays
const BUILTIN =
	'__int(?:128|64|32|16|8)|_OWORD|_QWORD|_DWORD|_WORD|_BYTE|_BYTE16|int(?:8|16|32|64)?_t|size_t|ptrdiff_t|long long|int|char|short|long|float|double|bool|void|auto';

// User-defined type names typically start with an uppercase letter.
const USER_TYPE = '[A-Z]\\w*';

const LOCAL_DECL_RE = new RegExp(
	'^\\s*' +
		QUALIFIERS +
		'(?:' +
		BUILTIN +
		'|' +
		USER_TYPE +
		')' +
		PTR +
		'\\b\\w+\\b' +
		ARRAY_DIM +
		INIT +
		';\\s*$'
);

export function isLocalDecl(text: string): boolean {
	// Quick reject: lines that start with control-flow or statement keywords
	if (/^\s*(?:if|else|for|while|do|switch|case|return|break|continue|goto|throw|try|catch)\b/.test(text))
		return false;
	// Quick reject: lines containing `(` before any `=` — likely a function call / expression
	const eqIdx = text.indexOf('=');
	const parenIdx = text.indexOf('(');
	if (parenIdx !== -1 && (eqIdx === -1 || parenIdx < eqIdx)) return false;
	return LOCAL_DECL_RE.test(text);
}

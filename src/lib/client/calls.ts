// Filter out IDA placeholder names (loc_XXXXXXXX) from call lists.
// These are local labels IDA generates for branch targets and are not real
// function names.  The export script now skips them, but this client-side
// filter handles databases that were exported before the fix.

export function isRealCallName(name: string): boolean {
	return !/^loc_[0-9A-Fa-f]+$/.test(name);
}

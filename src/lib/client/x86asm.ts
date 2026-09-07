// Minimal x86-64 assembly syntax for CodeMirror's StreamLanguage (highlighting only).
import type { StreamParser } from '@codemirror/language';

const MNEMONICS = new Set(
	'mov movabs movzx movsx movsxd lea add sub imul mul div idiv inc dec neg not and or xor shl shr sal sar rol ror push pop call callq ret retq retn jmp je jne jz jnz ja jae jb jbe jl jle jg jge js jns jc jnc jo jno jp jnp loop cmp test nop nopl nopw nopd enter leave sete setne seta setb setl setg setae setbe setle setge cbw cwd cwde cdqe cqo movsb movsw movsd movsq stosb stosd stosq lodsb lodsd lodsq scasb scasd scasq cmpsb cmpsd cmpsq xchg xadd cmpxchg bswap pause lock rep repe repne repz repnz cld std clc stc cmc bt btc btr bts setcc'.split(
		/\s+/
	)
);

interface AsmState {
	atLineStart: boolean;
}

export const x86Assembly: StreamParser<AsmState> = {
	name: 'x86asm',
	startState: () => ({ atLineStart: true }),
	token(stream, state) {
		if (stream.eatSpace()) return null;
		if (stream.eat(';') || stream.eat('#')) {
			stream.skipToEnd();
			return 'comment';
		}
		// Directives / labels
		if (state.atLineStart && stream.match(/^[A-Za-z_$.][A-Za-z0-9_$.]*:/)) {
			state.atLineStart = false;
			return 'labelName';
		}
		state.atLineStart = false;
		// Numbers
		if (stream.match(/^0[xX][0-9a-fA-F]+/) || stream.match(/^\d+/)) return 'number';
		if (stream.match(/^[01]+[bB]/)) return 'number';
		// String
		if (stream.eat('"') || stream.eat("'")) {
			stream.skipToEnd();
			return 'string';
		}
		// Registers / punctuation
		if (stream.match(/^%[a-z0-9]+/)) return 'variableName';
		// Identifier: mnemonic, register, label, symbol
		const ident = stream.match(/^[A-Za-z_.$][A-Za-z0-9_.$`]*/) as RegExpMatchArray | null;
		if (ident) {
			const w = ident[0].toLowerCase();
			if (MNEMONICS.has(w)) return 'keyword';
			if (/^[er]?[abcds][xip]$|^[er]?[sb][ip]$|^r(1[0-5]|[0-9])[bwd]?$/.test(w))
				return 'variableName';
			return 'name';
		}
		stream.next();
		return null;
	}
};

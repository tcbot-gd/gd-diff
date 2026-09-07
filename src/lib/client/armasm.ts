// Minimal ARM (AArch32/AArch64) assembly syntax for CodeMirror's StreamLanguage.
import type { StreamParser } from '@codemirror/language';

const MNEMONICS = new Set(
	'mov movs movw movt movk add adds sub subs rsb mul mla mls smull umull sdiv udiv and ands orr orrs eor eors bic bics tst cmp cmn teq mvn ldr ldrb ldrh ldrsb ldrsh ldrd ldrexb ldm ldmia ldmfd stm stmia stmfd push pop str strb strh strd stp ldp bl blx bx blr b cbz cbnz tbz tbnz beq bne bcs bcc bhs blo bmi bpl bvs bvc bhi bls bge blt bgt ble bal svc swi bkpt nop dmb dsb isb mrs msr cpsie cpsid sxth sxtb uxth uxtb ubfx bfi bfc clz rbit rev rev16 revsh vadd vsub vmul vldr vstr vpush vpop vmov'.split(
		/\s+/
	)
);

interface AsmState {
	atLineStart: boolean;
}

export const armAssembly: StreamParser<AsmState> = {
	name: 'armasm',
	startState: () => ({ atLineStart: true }),
	token(stream, state) {
		if (stream.eatSpace()) return null;
		if (stream.eat(';') || stream.eat('@') || stream.eat('#') || stream.eat('/')) {
			if (stream.eat('/')) {
				// C-style // comment
				stream.skipToEnd();
				return 'comment';
			}
			stream.skipToEnd();
			return 'comment';
		}
		if (state.atLineStart && stream.match(/^[A-Za-z_$.][A-Za-z0-9_$.]*:/)) {
			state.atLineStart = false;
			return 'labelName';
		}
		state.atLineStart = false;
		if (stream.match(/^0[xX][0-9a-fA-F]+/) || stream.match(/^#?\d+/)) return 'number';
		if (stream.eat('"') || stream.eat("'")) {
			stream.skipToEnd();
			return 'string';
		}
		const ident = stream.match(/^[A-Za-z_.$][A-Za-z0-9_.$`]*/) as RegExpMatchArray | null;
		if (ident) {
			const w = ident[0].toLowerCase();
			if (MNEMONICS.has(w)) return 'keyword';
			if (/^([rqsd](1[0-5]|3[01]|[0-9]))|^(sp|lr|pc|fp|sl|ip|w(3[01]|[12]?[0-9]))$/.test(w))
				return 'variableName';
			return 'name';
		}
		stream.next();
		return null;
	}
};

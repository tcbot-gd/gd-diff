import { HighlightStyle } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';

// One Dark-inspired palette, tuned for the dark gd-diff background.
export const codeHighlightStyle = HighlightStyle.define([
	{ tag: [t.comment, t.lineComment, t.blockComment], color: '#5c6370', fontStyle: 'italic' },
	{ tag: [t.keyword, t.operatorKeyword, t.modifier, t.controlKeyword, t.definitionKeyword, t.moduleKeyword], color: '#c678dd' },
	{ tag: [t.name, t.variableName, t.definition(t.name)], color: '#abb2bf' },
	{ tag: [t.function(t.variableName), t.function(t.propertyName)], color: '#61afef' },
	{ tag: [t.className, t.typeName], color: '#e5c07b' },
	{ tag: [t.number, t.bool, t.null, t.atom, t.unit], color: '#d19a66' },
	{ tag: [t.string, t.special(t.string), t.escape, t.regexp], color: '#98c379' },
	{ tag: [t.propertyName, t.attributeName], color: '#e06c75' },
	{ tag: t.labelName, color: '#61afef' },
	{ tag: [t.operator, t.punctuation, t.separator], color: '#56b6c2' },
	{ tag: [t.constant(t.name), t.standard(t.name)], color: '#d19a66' },
	{ tag: [t.meta, t.processingInstruction, t.documentMeta], color: '#abb2bf' },
	{ tag: t.invalid, color: '#f44747' },
	{ tag: [t.brace, t.bracket, t.paren], color: '#abb2bf' },
	{ tag: t.link, color: '#61afef', textDecoration: 'underline' },
	{ tag: t.heading, color: '#e5c07b', fontWeight: 'bold' },
	{ tag: t.strong, fontWeight: 'bold' },
	{ tag: t.emphasis, fontStyle: 'italic' }
]);

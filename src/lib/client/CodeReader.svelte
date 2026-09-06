<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import {
		EditorView,
		lineNumbers,
		gutter,
		GutterMarker,
		Decoration,
		type DecorationSet
	} from '@codemirror/view';
	import {
		EditorState,
		StateEffect,
		StateField,
		RangeSetBuilder,
		type Extension
	} from '@codemirror/state';
	import { cpp } from '@codemirror/lang-cpp';

	interface ReaderLine {
		text: string;
		addrs: number[];
	}

	interface Props {
		lines: ReaderLine[];
		highlight: Set<number>;
		onselect?: (addr: number | null) => void;
		language?: 'cpp' | 'asm' | 'text';
	}

	let { lines, highlight, onselect, language = 'text' }: Props = $props();

	let container: HTMLDivElement;
	let view: EditorView | undefined;

	const lineAddrs = new Map<number, number[]>();
	untrack(() => {
		lines.forEach((line, i) => lineAddrs.set(i + 1, line.addrs));
	});

	class AddrMarker extends GutterMarker {
		label: string;
		constructor(label: string) {
			super();
			this.label = label;
		}
		toDOM() {
			const span = document.createElement('span');
			span.className = 'cm-addr';
			span.textContent = this.label;
			return span;
		}
	}

	const addressGutter = gutter({
		class: 'cm-addr-gutter',
		lineMarker(view, line) {
			const number = view.state.doc.lineAt(line.from).number;
			const addrs = lineAddrs.get(number);
			if (!addrs || addrs.length === 0) return null;
			return new AddrMarker('0x' + addrs[0].toString(16));
		},
		initialSpacer: () => new AddrMarker('')
	});

	const setHighlights = StateEffect.define<DecorationSet>();
	const highlightField = StateField.define<DecorationSet>({
		create: () => Decoration.none,
		update: (deco, tr) => {
			deco = deco.map(tr.changes);
			for (const effect of tr.effects) {
				if (effect.is(setHighlights)) deco = effect.value;
			}
			return deco;
		},
		provide: (field) => EditorView.decorations.from(field)
	});

	function computeDecorations(set: Set<number>): DecorationSet {
		const builder = new RangeSetBuilder<Decoration>();
		for (const line of set) {
			builder.add(line, line, Decoration.line({ class: 'cm-highlight-line' }));
		}
		return builder.finish();
	}

	const darkTheme = EditorView.theme({
		'&': { backgroundColor: 'transparent', color: '#dbe1ea' },
		'.cm-content': { caretColor: '#4c8dff' },
		'.cm-cursor': { borderLeftColor: '#4c8dff' },
		'.cm-gutters': {
			backgroundColor: 'transparent',
			color: '#8a93a6',
			borderRight: '1px solid #262d3a'
		},
		'.cm-activeLine': { backgroundColor: 'rgba(255,255,255,0.03)' }
	});

	onMount(() => {
		const extensions: Extension[] = [
			lineNumbers(),
			addressGutter,
			highlightField,
			EditorState.readOnly.of(true),
			EditorView.editable.of(false),
			EditorView.lineWrapping,
			darkTheme,
			EditorView.updateListener.of((update) => {
				if (update.selectionSet) {
					const line = update.state.doc.lineAt(update.state.selection.main.head).number;
					const addrs = lineAddrs.get(line);
					onselect?.(addrs && addrs.length ? addrs[0] : null);
				}
			})
		];
		if (language === 'cpp') extensions.push(cpp());

		const state = EditorState.create({
			doc: lines.map((l) => l.text).join('\n'),
			extensions
		});

		view = new EditorView({ state, parent: container });
		view.dispatch({ effects: setHighlights.of(computeDecorations(highlight)) });
	});

	$effect(() => {
		if (view) view.dispatch({ effects: setHighlights.of(computeDecorations(highlight)) });
	});
</script>

<div bind:this={container} class="codereader"></div>

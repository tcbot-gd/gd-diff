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
		baseAddr?: number;
		imageBase?: number | null;
	}

	let { lines, highlight, onselect, language = 'text', baseAddr, imageBase }: Props = $props();

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
			return new AddrMarker(addrLabel(addrs[0]));
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

	function addrLabel(addr: number): string {
		if (baseAddr != null) {
			const off = addr - baseAddr;
			return (off >= 0 ? '+' : '-') + '0x' + Math.abs(off).toString(16);
		}
		return '0x' + addr.toString(16);
	}

	let menu = $state<{ x: number; y: number; addr: number } | null>(null);
	let copied = $state<string | null>(null);

	function onContextMenu(event: MouseEvent, cmView: EditorView): boolean {
		const pos = cmView.posAtCoords({ x: event.clientX, y: event.clientY });
		if (pos == null) return false;
		const line = cmView.state.doc.lineAt(pos).number;
		const addrs = lineAddrs.get(line);
		if (!addrs || addrs.length === 0) return false;
		event.preventDefault();
		menu = { x: event.clientX, y: event.clientY, addr: addrs[0] };
		return true;
	}

	async function copyLine(kind: 'addr' | 'rva') {
		if (!menu) return;
		let text = '0x' + menu.addr.toString(16);
		if (kind === 'rva' && imageBase != null) text = '0x' + (menu.addr - imageBase).toString(16);
		try {
			await navigator.clipboard.writeText(text);
			copied = text;
			setTimeout(() => (copied = null), 1200);
		} catch {
			// clipboard unavailable
		}
		menu = null;
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
			EditorView.domEventHandlers({
				contextmenu(event, cmView) {
					return onContextMenu(event, cmView);
				}
			}),
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

<svelte:window onclick={() => (menu = null)} />

<div bind:this={container} class="codereader"></div>

{#if menu}
	<div
		class="fixed z-50 min-w-[180px] overflow-hidden rounded-sm border border-border bg-surface-2 py-1 shadow-lg"
		style="left: {menu.x}px; top: {menu.y}px"
	>
		<button
			onclick={() => copyLine('rva')}
			class="block w-full px-3 py-1.5 text-left font-mono text-xs text-fg hover:bg-surface"
		>
			Copy RVA {#if imageBase != null}0x{(menu.addr - imageBase).toString(16)}{/if}
		</button>
		<button
			onclick={() => copyLine('addr')}
			class="block w-full px-3 py-1.5 text-left font-mono text-xs text-fg hover:bg-surface"
		>
			Copy address 0x{menu.addr.toString(16)}
		</button>
	</div>
{/if}
{#if copied}
	<div
		class="fixed bottom-4 right-4 z-50 rounded-sm border border-border bg-surface-2 px-3 py-1.5 font-mono text-xs text-ok"
	>
		{copied} copied
	</div>
{/if}

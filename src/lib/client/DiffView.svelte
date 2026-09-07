<script lang="ts">
	import { untrack } from 'svelte';
	import { EditorView } from '@codemirror/view';
	import { EditorState, type Extension } from '@codemirror/state';
	import { MergeView } from '@codemirror/merge';
	import { cpp } from '@codemirror/lang-cpp';
	import { syntaxHighlighting } from '@codemirror/language';
	import { codeHighlightStyle } from './codeTheme';
	import CodeReader from './CodeReader.svelte';
	import { stripCasts } from './casts';
	import type { FunctionContent, FunctionRow } from '$lib/shared/types';

	interface FnRef extends FunctionRow {
		content: FunctionContent | null;
		versionId?: string;
		platformId?: string;
		fileName?: string;
		mode?: string;
	}

	interface Props {
		a: FnRef;
		b: FnRef;
	}

	let { a, b }: Props = $props();

	let what = $state<'pseudocode' | 'asm' | 'members' | 'calls'>('pseudocode');
	let mode = $state<'diff' | 'side'>('diff');
	let hideCasts = $state(false);

	let container = $state.raw<HTMLDivElement | undefined>(undefined);
	let merge = $state.raw<MergeView | undefined>(undefined);

	const darkTheme = EditorView.theme({
		'&': { backgroundColor: 'transparent', color: '#dbe1ea' },
		'.cm-content': { caretColor: '#4c8dff' },
		'.cm-cursor': { borderLeftColor: '#4c8dff' },
		'.cm-gutters': {
			backgroundColor: 'transparent',
			color: '#8a93a6',
			borderRight: '1px solid #262d3a'
		},
		'.cm-scroller': { fontFamily: 'var(--font-mono)', fontSize: '12px' }
	});

	function readOnlyExtensions(): Extension[] {
		return [
			EditorState.readOnly.of(true),
			EditorView.editable.of(false),
			EditorView.lineWrapping,
			darkTheme,
			syntaxHighlighting(codeHighlightStyle),
			cpp()
		];
	}

	function text(kind: 'pseudocode' | 'asm', fn: FnRef): string {
		if (!fn.content) return '// no content';
		if (kind === 'pseudocode') {
			const lines = fn.content.pseudocode.map((p) => (hideCasts ? stripCasts(p.text) : p.text));
			return lines.length ? lines.join('\n') : '// no pseudocode';
		}
		const lines = fn.content.asm.map((i) => `${i.mnemonic} ${i.operands}`.trim());
		return lines.length ? lines.join('\n') : '// no assembly';
	}

	$effect(() => {
		const kind = what;
		const m = mode;
		const el = untrack(() => container);
		merge?.destroy();
		merge = undefined;
		if (el && (kind === 'pseudocode' || kind === 'asm') && m === 'diff') {
			merge = new MergeView({
				a: { doc: text(kind, a), extensions: readOnlyExtensions() },
				b: { doc: text(kind, b), extensions: readOnlyExtensions() },
				parent: el
			});
		}
	});

	const aName = $derived(a.demangledName ?? a.name);
	const bName = $derived(b.demangledName ?? b.name);

	function fnUrl(fn: FnRef): string {
		if (fn.versionId && fn.platformId && fn.fileName && fn.mode) {
			return `/${fn.versionId}/${fn.platformId}/${encodeURIComponent(fn.fileName)}/${fn.mode}/fn/${encodeURIComponent(fn.demangledName ?? fn.name)}`;
		}
		return '';
	}

	const memberKey = (m: { owner: string; name: string; kind: string }) =>
		`${m.owner}::${m.name} [${m.kind}]`;

	const membersA = $derived(a.content?.members ?? []);
	const membersB = $derived(b.content?.members ?? []);
	const membersOnlyA = $derived(membersA.filter((m) => !membersB.some((x) => memberKey(x) === memberKey(m))));
	const membersOnlyB = $derived(membersB.filter((m) => !membersA.some((x) => memberKey(x) === memberKey(m))));

	const callsA = $derived(a.content?.calls ?? []);
	const callsB = $derived(b.content?.calls ?? []);
	const callsOnlyA = $derived(callsA.filter((c) => !callsB.some((x) => x.name === c.name)));
	const callsOnlyB = $derived(callsB.filter((c) => !callsA.some((x) => x.name === c.name)));

	function showListDiff(): boolean {
		return what === 'members' || what === 'calls';
	}
</script>
<div class="space-y-4">
	<header class="space-y-2">
		<a href="/" class="text-xs text-muted hover:text-fg">← Explorer</a>
		<div class="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
			<a href={fnUrl(a)} class="font-mono text-accent hover:underline">{aName}</a>
			<span class="text-muted">vs</span>
			<a href={fnUrl(b)} class="font-mono text-accent hover:underline">{bName}</a>
		</div>
	</header>

	<div class="flex flex-wrap items-center gap-4 text-sm text-muted">
		<label class="flex items-center gap-1.5">
			<select
				bind:value={what}
				class="rounded border border-border bg-surface px-2 py-1 text-fg"
			>
				<option value="pseudocode">Pseudocode</option>
				<option value="asm">Assembly</option>
				<option value="members">Used members</option>
				<option value="calls">Called functions</option>
			</select>
		</label>
		{#if !showListDiff()}
			<label class="flex items-center gap-1.5">
				<input type="radio" bind:group={mode} value="diff" /> Diff
			</label>
			<label class="flex items-center gap-1.5">
				<input type="radio" bind:group={mode} value="side" /> Side by side
			</label>
			{#if what === 'pseudocode'}
				<label class="flex items-center gap-1.5">
					<input type="checkbox" bind:checked={hideCasts} /> Hide casts
				</label>
			{/if}
		{/if}
	</div>

	{#if what === 'members' || what === 'calls'}
		<div class="grid gap-3 md:grid-cols-2">
			<section class="rounded-sm border border-border bg-surface p-3">
				<h3 class="text-xs font-medium uppercase tracking-wider text-muted">A — {aName}</h3>
				<ul class="mt-2 space-y-1">
					{#if what === 'members'}
						{#each membersOnlyA as m}
							<li class="font-mono text-xs text-err">{m.owner}::{m.name}</li>
						{/each}
					{:else}
						{#each callsOnlyA as c}
							<li class="font-mono text-xs text-err">{c.name}</li>
						{/each}
					{/if}
				</ul>
				{#if (what === 'members' ? membersOnlyA : callsOnlyA).length === 0}
					<p class="mt-1 text-xs text-muted">no unique items</p>
				{/if}
			</section>
			<section class="rounded-sm border border-border bg-surface p-3">
				<h3 class="text-xs font-medium uppercase tracking-wider text-muted">B — {bName}</h3>
				<ul class="mt-2 space-y-1">
					{#if what === 'members'}
						{#each membersOnlyB as m}
							<li class="font-mono text-xs text-ok">{m.owner}::{m.name}</li>
						{/each}
					{:else}
						{#each callsOnlyB as c}
							<li class="font-mono text-xs text-ok">{c.name}</li>
						{/each}
					{/if}
				</ul>
				{#if (what === 'members' ? membersOnlyB : callsOnlyB).length === 0}
					<p class="mt-1 text-xs text-muted">no unique items</p>
				{/if}
			</section>
		</div>
	{:else if mode === 'diff'}
		<div class="overflow-hidden rounded-sm border border-border bg-surface p-2">
			<div bind:this={container} class="max-h-[75vh] overflow-auto"></div>
		</div>
	{:else}
		<div class="grid gap-3 md:grid-cols-2">
			<section class="overflow-hidden rounded-sm border border-border bg-surface">
				<div class="border-b border-border px-3 py-1.5 text-xs font-medium text-muted">
					A — {aName}
				</div>
				<div class="h-[70vh] p-2">
					<CodeReader
						lines={what === 'asm'
							? (a.content?.asm ?? []).map((i) => ({ text: `${i.mnemonic} ${i.operands}`.trim(), addrs: [i.addr] }))
							: (a.content?.pseudocode ?? []).map((p) => ({ text: p.text, addrs: p.addrs }))}
						highlight={new Set()}
						language={what === 'asm' ? 'text' : 'cpp'}
					/>
				</div>
			</section>
			<section class="overflow-hidden rounded-sm border border-border bg-surface">
				<div class="border-b border-border px-3 py-1.5 text-xs font-medium text-muted">
					B — {bName}
				</div>
				<div class="h-[70vh] p-2">
					<CodeReader
						lines={what === 'asm'
							? (b.content?.asm ?? []).map((i) => ({ text: `${i.mnemonic} ${i.operands}`.trim(), addrs: [i.addr] }))
							: (b.content?.pseudocode ?? []).map((p) => ({ text: p.text, addrs: p.addrs }))}
						highlight={new Set()}
						language={what === 'asm' ? 'text' : 'cpp'}
					/>
				</div>
			</section>
		</div>
	{/if}
</div>


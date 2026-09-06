<script lang="ts">
	import { untrack } from 'svelte';
	import CodeReader from './CodeReader.svelte';
	import { PLATFORMS } from '$lib/shared/platforms';
	import type { FunctionContent } from '$lib/shared/types';

	interface Props {
		fn: {
			id: number;
			name: string;
			demangledName: string | null;
			address: number;
			size: number;
			typeSignature: string | null;
			content: FunctionContent | null;
			imageBase: number | null;
			versionId: string;
			platformId: string;
			fileName: string;
			mode: string;
		};
		initialAddr: number | null;
	}

	let { fn, initialAddr }: Props = $props();

	let showPseudocode = $state(true);
	let showAsm = $state(true);
	let showHex = $state(false);
	let selectedAddr = $state<number | null>(untrack(() => initialAddr));

	const content = $derived(fn.content);

	const asmLines = $derived(
		(content?.asm ?? []).map((i) => ({ text: `${i.mnemonic} ${i.operands}`.trim(), addrs: [i.addr] }))
	);
	const pseudoLines = $derived(
		(content?.pseudocode ?? []).map((p) => ({ text: p.text, addrs: p.addrs }))
	);
	const hexLines = $derived(
		(content?.hex ?? []).map((h) => ({ text: `${h.bytes}  ${h.ascii}`, addrs: [h.addr] }))
	);

	const asmHighlight = $derived(computeAsmHighlight(selectedAddr));
	const pseudoHighlight = $derived(computePseudoHighlight(selectedAddr));
	const hexHighlight = $derived(computeHexHighlight(selectedAddr));

	function computeAsmHighlight(addr: number | null): Set<number> {
		const set = new Set<number>();
		if (addr == null) return set;
		(content?.asm ?? []).forEach((i, idx) => {
			if (i.addr === addr) set.add(idx + 1);
		});
		return set;
	}

	function computePseudoHighlight(addr: number | null): Set<number> {
		const set = new Set<number>();
		if (addr == null) return set;
		let best = -1;
		for (const p of content?.pseudocode ?? []) {
			if (p.addrs.length && p.addrs[0] <= addr) best = p.line;
		}
		if (best > 0) set.add(best);
		return set;
	}

	function computeHexHighlight(addr: number | null): Set<number> {
		const set = new Set<number>();
		if (addr == null) return set;
		(content?.hex ?? []).forEach((h, idx) => {
			if (h.addr <= addr && addr < h.addr + 16) set.add(idx + 1);
		});
		return set;
	}

	function onSelect(addr: number | null) {
		selectedAddr = addr;
		const url = new URL(window.location.href);
		if (addr == null) url.searchParams.delete('addr');
		else url.searchParams.set('addr', '0x' + addr.toString(16));
		history.replaceState(null, '', url.toString());
	}

	let targetVersion = $state('');
	let targetPlatform = $state('android64');
	let matches = $state<{ id: number; name: string; demangledName: string | null }[]>([]);
	let compareError = $state<string | null>(null);

	async function onCompare(event: SubmitEvent) {
		event.preventDefault();
		matches = [];
		compareError = null;
		const params = new URLSearchParams({
			name: fn.name,
			version: targetVersion,
			platform: targetPlatform,
			fileName: fn.fileName,
			mode: fn.mode
		});
		const res = await fetch(`/api/functions/match?${params}`);
		if (!res.ok) {
			compareError = 'No matches found';
			return;
		}
		const data = (await res.json()) as {
			functions: { id: number; name: string; demangledName: string | null }[];
		};
		matches = data.functions;
	}

	const displayName = $derived(fn.demangledName ?? fn.name);
	const paneCount = $derived((showPseudocode ? 1 : 0) + (showAsm ? 1 : 0) + (showHex ? 1 : 0));
	const gridStyle = $derived(`grid-template-columns: repeat(${paneCount}, minmax(0, 1fr))`);

	const rva = $derived(fn.imageBase != null ? fn.address - fn.imageBase : null);
	let copied = $state<string | null>(null);

	async function copyAddress(kind: 'rva' | 'addr') {
		let text: string;
		if (kind === 'rva' && rva != null) text = '0x' + rva.toString(16);
		else text = '0x' + fn.address.toString(16);
		try {
			await navigator.clipboard.writeText(text);
			copied = (kind === 'rva' ? 'RVA ' : '') + text;
			setTimeout(() => (copied = null), 1500);
		} catch {
			// clipboard unavailable
		}
	}
</script>

<div class="space-y-4">
	<header class="space-y-2">
		<a
			href="/{fn.versionId}/{fn.platformId}/{encodeURIComponent(fn.fileName)}/{fn.mode}"
			class="text-xs text-muted hover:text-fg"
		>
			← {fn.versionId}/{fn.platformId}/{fn.fileName} · {fn.mode}
		</a>
		<div class="flex flex-wrap items-center gap-x-3 gap-y-1">
			<h1 class="font-mono text-lg font-semibold tracking-tight text-fg">{displayName}</h1>
			<span class="text-xs text-muted">{fn.size} B</span>
			<button
				onclick={() => copyAddress('rva')}
				disabled={rva == null}
				class="rounded border border-border bg-surface-2 px-2 py-0.5 font-mono text-xs text-fg hover:border-accent disabled:opacity-40"
				title="Copy RVA"
			>
				{#if rva != null}RVA 0x{rva.toString(16)}{:else}—{/if}
			</button>
			<button
				onclick={() => copyAddress('addr')}
				class="rounded border border-border bg-surface-2 px-2 py-0.5 font-mono text-xs text-muted hover:border-accent"
				title="Copy address"
			>
				0x{fn.address.toString(16)}
			</button>
			{#if copied}<span class="text-xs text-ok">{copied} copied</span>{/if}
		</div>
		{#if fn.demangledName && fn.demangledName !== fn.name}
			<p class="font-mono text-xs text-muted">{fn.name}</p>
		{/if}
	</header>

	<div class="flex flex-wrap items-center gap-4 text-sm text-muted">
		<label class="flex items-center gap-1.5">
			<input type="checkbox" bind:checked={showPseudocode} /> Pseudocode
		</label>
		<label class="flex items-center gap-1.5">
			<input type="checkbox" bind:checked={showAsm} /> Assembly
		</label>
		<label class="flex items-center gap-1.5">
			<input type="checkbox" bind:checked={showHex} /> Hex
		</label>
	</div>

	<div class="grid gap-3" style={gridStyle}>
		{#if showPseudocode}
			<section class="overflow-hidden rounded-sm border border-border bg-surface">
				<div class="border-b border-border px-3 py-1.5 text-xs font-medium text-muted">
					Pseudocode
				</div>
				<div class="h-[70vh] p-2">
					<CodeReader
						lines={pseudoLines}
						highlight={pseudoHighlight}
						onselect={onSelect}
						language="cpp"
					/>
				</div>
			</section>
		{/if}
		{#if showAsm}
			<section class="overflow-hidden rounded-sm border border-border bg-surface">
				<div class="border-b border-border px-3 py-1.5 text-xs font-medium text-muted">
					Assembly
				</div>
				<div class="h-[70vh] p-2">
					<CodeReader lines={asmLines} highlight={asmHighlight} onselect={onSelect} />
				</div>
			</section>
		{/if}
		{#if showHex}
			<section class="overflow-hidden rounded-sm border border-border bg-surface">
				<div class="border-b border-border px-3 py-1.5 text-xs font-medium text-muted">Hex</div>
				<div class="h-[70vh] p-2">
					<CodeReader lines={hexLines} highlight={hexHighlight} onselect={onSelect} />
				</div>
			</section>
		{/if}
	</div>

	<details class="rounded-sm border border-border bg-surface p-3">
		<summary class="cursor-pointer text-sm text-muted">Compare against another version</summary>
		<form class="mt-3 flex flex-wrap items-center gap-2" onsubmit={onCompare}>
			<input
				bind:value={targetVersion}
				placeholder="version (e.g. 2.207)"
				class="rounded border border-border bg-surface-2 px-2 py-1 font-mono text-sm text-fg"
			/>
			<select
				bind:value={targetPlatform}
				class="rounded border border-border bg-surface-2 px-2 py-1 text-sm text-fg"
			>
				{#each PLATFORMS as platform}
					<option value={platform.id}>{platform.label}</option>
				{/each}
			</select>
			<button
				type="submit"
				class="rounded-sm border border-border bg-surface-2 px-3 py-1 text-sm text-fg hover:border-accent"
			>
				Find matches
			</button>
		</form>
		{#if compareError}
			<p class="mt-2 text-xs text-warn">{compareError}</p>
		{/if}
		{#if matches.length > 0}
			<ul class="mt-2 space-y-1">
				{#each matches as match}
					<li>
						<a href="/diff/{fn.id}/{match.id}" class="font-mono text-xs text-accent hover:underline">
							{match.demangledName ?? match.name}
						</a>
					</li>
				{/each}
			</ul>
		{/if}
	</details>

	{#if content && (content.calls.length > 0 || content.members.length > 0)}
		<section class="grid gap-3 md:grid-cols-2">
			{#if content.calls.length > 0}
				<div class="rounded-sm border border-border bg-surface p-3">
					<h3 class="text-xs font-medium uppercase tracking-wider text-muted">
						Called functions
					</h3>
					<ul class="mt-2 space-y-1">
						{#each content.calls as call}
							<li class="font-mono text-xs text-fg">{call.name}</li>
						{/each}
					</ul>
				</div>
			{/if}
			{#if content.members.length > 0}
				<div class="rounded-sm border border-border bg-surface p-3">
					<h3 class="text-xs font-medium uppercase tracking-wider text-muted">
						Used members
					</h3>
					<ul class="mt-2 space-y-1">
						{#each content.members as member}
							<li class="font-mono text-xs text-fg">
								<span class="text-muted">{member.kind === 'this' ? 'this' : member.owner}::</span
								>{member.name}
							</li>
						{/each}
					</ul>
				</div>
			{/if}
		</section>
	{/if}
</div>

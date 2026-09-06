<script lang="ts">
	import { untrack, onMount, onDestroy } from 'svelte';
	import { goto, invalidateAll } from '$app/navigation';
	import type { PageData } from './$types';
	import type { DecompilationProgress } from '$lib/shared/modes';

	let { data }: { data: PageData } = $props();

	let liveStatus = $state<string | null>(untrack(() => data.decompilation?.status ?? null));
	let liveError = $state<string | null>(untrack(() => data.decompilation?.error ?? null));
	let liveProgress = $state<DecompilationProgress | null>(untrack(() => data.decompilation?.progress ?? null));
	let livePct = $derived(
		liveProgress?.functionsTotal
			? Math.round((liveProgress.functionsDone / liveProgress.functionsTotal) * 100)
			: null
	);
	let pollTimer: ReturnType<typeof setInterval> | undefined;

	onMount(() => {
		const decomp = data.decompilation;
		if (!decomp || (decomp.status !== 'pending' && decomp.status !== 'running')) return;
		pollTimer = setInterval(async () => {
			try {
				const res = await fetch(`/api/decompilations?binary=${decomp.binaryId}`);
				if (!res.ok) return;
				const body = (await res.json()) as {
					decompilations: {
						mode: string;
						status: string;
						error: string | null;
						progress: DecompilationProgress | null;
					}[];
				};
				const d = body.decompilations.find((x) => x.mode === decomp.mode);
				if (!d) return;
				liveStatus = d.status;
				liveError = d.error;
				liveProgress = d.progress;
				if (d.status === 'done' || d.status === 'failed') {
					if (pollTimer) clearInterval(pollTimer);
					if (d.status === 'done') await invalidateAll();
				}
			} catch {
				// ignore transient errors; the next tick retries
			}
		}, 2000);
	});

	onDestroy(() => {
		if (pollTimer) clearInterval(pollTimer);
	});

	let goAddr = $state('');
	let goRva = $state(false);
	let goError = $state<string | null>(null);

	async function onGo(event: SubmitEvent) {
		event.preventDefault();
		goError = null;
		if (!data.decompilation) return;
		const params = new URLSearchParams({
			decompilation: String(data.decompilation.id),
			addr: goAddr,
			rva: goRva ? '1' : '0'
		});
		const res = await fetch(`/api/functions/by-address?${params}`);
		if (!res.ok) {
			goError = 'No function at this address';
			return;
		}
		const body = (await res.json()) as { function: { id: number }; address: number };
		await goto(
			`/${data.version.id}/${data.platform.id}/${encodeURIComponent(data.binary.fileName)}/${data.decompilation.mode}/fn/${body.function.id}?addr=0x${body.address.toString(16)}`
		);
	}

	let search = $state(untrack(() => data.q ?? ''));

	const base = $derived(
		`/${data.version.id}/${data.platform.id}/${encodeURIComponent(data.binary.fileName)}/${data.decompilation?.mode ?? ''}`
	);

	function fnUrl(id: number) {
		return `${base}/fn/${id}`;
	}

	async function onSearch(event: SubmitEvent) {
		event.preventDefault();
		const q = search.trim();
		await goto(q ? `${base}?q=${encodeURIComponent(q)}` : base);
	}
</script>

<div class="space-y-6">
	<header class="space-y-2">
		<a href="/{data.version.id}/{data.platform.id}" class="text-xs text-muted hover:text-fg"
			>← {data.platform.id} binaries</a
		>
		<h1 class="flex flex-wrap items-baseline gap-x-2 text-xl font-semibold tracking-tight">
			<span class="font-mono text-accent">{data.version.id}</span>
			<span class="text-muted">/</span>
			<span class="font-mono text-accent">{data.platform.id}</span>
			<span class="text-muted">/</span>
			<span class="font-mono text-fg">{data.binary.fileName}</span>
		</h1>
		{#if data.decompilation}
			<p class="text-sm text-muted">
				{data.decompilation.mode} · {liveStatus}
				{#if data.decompilation.bindingsCommit}
					<span class="ml-2 font-mono text-xs">{data.decompilation.bindingsCommit}</span>
				{/if}
			</p>
		{/if}
		{#if data.decompilation?.status === 'done'}
			<form class="flex flex-wrap items-center gap-2" onsubmit={onSearch}>
				<input
					bind:value={search}
					placeholder="Search functions, members, callers"
					class="w-72 rounded-sm border border-border bg-surface-2 px-2 py-1 font-mono text-sm text-fg"
				/>
				<button
					type="submit"
					class="rounded-sm border border-border bg-surface-2 px-3 py-1 text-sm text-fg hover:border-accent"
				>
					Search
				</button>
			</form>
			<form class="flex flex-wrap items-center gap-2" onsubmit={onGo}>
				<input
					bind:value={goAddr}
					placeholder="Go to address (hex)"
					class="rounded border border-border bg-surface-2 px-2 py-1 font-mono text-sm text-fg"
				/>
				<label class="flex items-center gap-1.5 text-sm text-muted">
					<input type="checkbox" bind:checked={goRva} /> RVA
				</label>
				<button
					type="submit"
					class="rounded-sm border border-border bg-surface-2 px-3 py-1 text-sm text-fg hover:border-accent"
				>
					Go
				</button>
				{#if goError}<span class="text-xs text-warn">{goError}</span>{/if}
			</form>
		{/if}
	</header>

	{#if !data.decompilation}
		<p class="text-sm text-muted">This binary has not been uploaded / decompiled yet.</p>
	{:else if liveStatus === 'failed'}
		<div class="space-y-2 rounded-sm border border-warn/40 bg-surface p-4">
			<h2 class="text-sm font-semibold text-warn">Decompilation failed</h2>
			{#if liveError}
				<pre
					class="max-h-72 overflow-auto whitespace-pre-wrap rounded-sm bg-surface-2 p-3 font-mono text-[11px] leading-relaxed text-fg">{liveError}</pre
				>
			{/if}
		</div>
	{:else if liveStatus !== 'done'}
		<div class="space-y-3 rounded-sm border border-border bg-surface p-4">
			<div class="flex items-center justify-between text-sm">
				<span class="text-warn">Decompiling…</span>
				<span class="font-mono text-xs text-muted">{liveStatus}</span>
			</div>
			{#if liveProgress}
				<div class="space-y-1.5">
					<div class="flex items-baseline justify-between text-xs text-muted">
						<span class="capitalize">{liveProgress.phase}</span>
						{#if livePct !== null}
							<span class="font-mono"
								>{liveProgress.functionsDone.toLocaleString()} /
								{liveProgress.functionsTotal?.toLocaleString()} functions · {livePct}%</span
							>
						{:else if liveProgress.functionsDone > 0}
							<span class="font-mono">{liveProgress.functionsDone.toLocaleString()} functions</span>
						{/if}
					</div>
					<div class="h-1.5 overflow-hidden rounded-full bg-surface-2">
						{#if livePct !== null}
							<div
								class="h-full rounded-full bg-accent transition-all duration-500"
								style="width: {livePct}%"
							></div>
						{:else}
							<div class="h-full w-1/4 animate-pulse rounded-full bg-accent/60"></div>
						{/if}
					</div>
					{#if liveProgress.currentFunction}
						<div class="truncate font-mono text-[11px] text-muted">
							now: {liveProgress.currentFunction}
							{#if liveProgress.currentFunctionSize !== null}
								<span class="text-muted/60">
									({liveProgress.currentFunctionSize.toLocaleString()} B)</span
								>
							{/if}
						</div>
					{/if}
					{#if liveProgress.phase === 'analyzing'}
						<p class="text-[11px] text-muted">
							IDA is loading and auto-analyzing the binary — this can take a while on a large file.
						</p>
					{/if}
				</div>
				{#if liveProgress.logTail.length > 0}
					<pre
						class="max-h-48 overflow-auto whitespace-pre-wrap rounded-sm bg-surface-2 p-2 font-mono text-[11px] leading-relaxed text-muted">{liveProgress.logTail.join('\n')}</pre
					>
				{/if}
			{:else}
				<p class="text-xs text-muted">
					Queued — waiting for the worker to pick this up. Make sure the worker is running.
				</p>
			{/if}
		</div>
	{:else if data.q}
		<div class="space-y-6">
			{#if data.functions.length > 0}
				<section>
					<h2 class="text-sm font-medium uppercase tracking-wider text-muted">
						Functions ({data.functions.length})
					</h2>
					<ul class="mt-2 divide-y divide-border overflow-hidden rounded-sm border border-border bg-surface">
						{#each data.functions as fn}
							<li>
								<a href={fnUrl(fn.id)} class="flex items-baseline gap-3 px-3 py-2 text-sm hover:bg-surface-2">
									<span class="w-24 shrink-0 text-right font-mono text-[11px] text-muted">
										0x{fn.address.toString(16)}
									</span>
									<span class="truncate font-mono text-fg">{fn.name}</span>
								</a>
							</li>
						{/each}
					</ul>
				</section>
			{/if}
			{#if data.memberUses.length > 0}
				<section>
					<h2 class="text-sm font-medium uppercase tracking-wider text-muted">
						Member uses ({data.memberUses.length})
					</h2>
					<ul class="mt-2 divide-y divide-border overflow-hidden rounded-sm border border-border bg-surface">
						{#each data.memberUses as use}
							<li>
								<a href={fnUrl(use.functionId)} class="flex items-baseline gap-3 px-3 py-2 text-sm hover:bg-surface-2">
									<span class="font-mono text-xs text-muted">{use.ownerType}::{use.memberName}</span>
									<span class="truncate font-mono text-fg">{use.functionName}</span>
								</a>
							</li>
						{/each}
					</ul>
				</section>
			{/if}
			{#if data.callers.length > 0}
				<section>
					<h2 class="text-sm font-medium uppercase tracking-wider text-muted">
						Callers ({data.callers.length})
					</h2>
					<ul class="mt-2 divide-y divide-border overflow-hidden rounded-sm border border-border bg-surface">
						{#each data.callers as caller}
							<li>
								<a href={fnUrl(caller.callerId)} class="flex items-baseline gap-3 px-3 py-2 text-sm hover:bg-surface-2">
									<span class="font-mono text-xs text-muted">{caller.calleeName}</span>
									<span class="truncate font-mono text-fg">{caller.callerName}</span>
								</a>
							</li>
						{/each}
					</ul>
				</section>
			{/if}
			{#if data.functions.length === 0 && data.memberUses.length === 0 && data.callers.length === 0}
				<p class="text-sm text-muted">No results for “{data.q}”.</p>
			{/if}
		</div>
	{:else if data.functions.length === 0}
		<p class="text-sm text-muted">Decompiled, but no functions were indexed.</p>
	{:else}
		<ul class="divide-y divide-border overflow-hidden rounded-sm border border-border bg-surface">
			{#each data.functions as fn}
				<li>
					<a
						href="/{data.version.id}/{data.platform.id}/{encodeURIComponent(data.binary.fileName)}/{data.decompilation.mode}/fn/{fn.id}"
						class="flex items-baseline gap-3 px-3 py-2 text-sm hover:bg-surface-2"
					>
						<span class="w-24 shrink-0 text-right font-mono text-[11px] text-muted">
							0x{fn.address.toString(16)}
						</span>
						<span class="truncate font-mono text-fg">{fn.name}</span>
						<span class="ml-auto shrink-0 text-[11px] text-muted">{fn.size} B</span>
					</a>
				</li>
			{/each}
		</ul>
	{/if}
</div>

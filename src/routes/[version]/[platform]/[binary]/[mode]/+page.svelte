<script lang="ts">
	import { goto } from '$app/navigation';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

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
				{data.decompilation.mode} · {data.decompilation.status}
				{#if data.decompilation.bindingsCommit}
					<span class="ml-2 font-mono text-xs">{data.decompilation.bindingsCommit}</span>
				{/if}
			</p>
		{/if}
		{#if data.decompilation?.status === 'done'}
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
	{:else if data.decompilation.status !== 'done'}
		<p class="text-sm text-warn">Decompilation in progress (status: {data.decompilation.status}).</p>
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

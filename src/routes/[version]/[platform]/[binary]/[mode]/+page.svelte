<script lang="ts">
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<div class="space-y-6">
	<header class="space-y-1">
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
	</header>

	{#if !data.decompilation}
		<p class="text-sm text-muted">This binary has not been uploaded / decompiled yet.</p>
	{:else if data.decompilation.status !== 'done'}
		<p class="text-sm text-warn">Decompilation in progress (status: {data.decompilation.status}).</p>
	{:else if data.functions.length === 0}
		<p class="text-sm text-muted">Decompiled, but no functions were indexed.</p>
	{:else}
		<ul class="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface">
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

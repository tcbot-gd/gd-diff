<script lang="ts">
	import type { PageData } from './$types';
	import { PLATFORM_BY_ID } from '$lib/shared/platforms';
	import { DECOMP_MODES } from '$lib/shared/modes';

	let { data }: { data: PageData } = $props();

	const defs = $derived(PLATFORM_BY_ID.get(data.platform.id)?.binaries ?? []);
	const byFile = $derived(new Map(data.binaries.map((b) => [b.fileName, b])));
</script>

<div class="space-y-6">
	<header class="space-y-1">
		<a href="/" class="text-xs text-muted hover:text-fg">← Explorer</a>
		<h1 class="text-xl font-semibold tracking-tight">
			<span class="font-mono text-accent">{data.version.id}</span>
			<span class="mx-2 text-muted">/</span>
			<span class="font-mono text-accent">{data.platform.id}</span>
		</h1>
		<p class="text-sm text-muted">{data.platform.label} · {data.platform.arch}</p>
	</header>

	<section class="space-y-3">
		<h2 class="text-sm font-medium uppercase tracking-wider text-muted">Binaries</h2>
		<div class="grid gap-3 lg:grid-cols-2">
			{#each defs as def}
				{@const bin = byFile.get(def.fileName)}
				<div class="rounded-lg border border-border bg-surface p-4">
					<div class="flex items-start justify-between gap-3">
						<div class="min-w-0">
							<div class="truncate font-mono text-sm">{def.fileName}</div>
							<div class="mt-0.5 text-xs text-muted">{def.label}</div>
						</div>
						<span class="rounded bg-surface-2 px-2 py-0.5 text-[11px] text-muted">{def.role}</span>
					</div>
					<div class="mt-3 flex flex-wrap gap-1.5">
						{#each DECOMP_MODES as mode}
							{@const d = bin?.decompilations.find((x) => x.mode === mode.id)}
							{#if d?.status === 'done'}
								<a
									href="/{data.version.id}/{data.platform.id}/{encodeURIComponent(def.fileName)}/{mode.id}"
									class="rounded-md border border-border bg-surface-2 px-2.5 py-1 font-mono text-[11px] text-ok hover:border-accent"
								>
									{mode.id} ✓
								</a>
							{:else if d}
								<span class="rounded-md border border-border px-2.5 py-1 font-mono text-[11px] text-muted">
									{mode.id} · {d.status}
								</span>
							{:else}
								<span
									class="rounded-md border border-dashed border-border px-2.5 py-1 font-mono text-[11px] text-muted/50"
								>
									{mode.id} — not uploaded
								</span>
							{/if}
						{/each}
					</div>
				</div>
			{/each}
		</div>
	</section>
</div>

<script lang="ts">
	import type { PageData } from './$types';
	import DownloadUnlock from '$lib/client/DownloadUnlock.svelte';

	let { data }: { data: PageData } = $props();
	let unlocked = $state(false);

	interface Bin {
		versionId: string;
		platformId: string;
		fileName: string;
		role: string;
		hasRaw: boolean;
		hasBroma: boolean;
	}

	const grouped = $derived.by(() => {
		const map = new Map<string, Bin[]>();
		for (const b of data.binaries) {
			const list = map.get(b.versionId) ?? [];
			list.push(b);
			map.set(b.versionId, list);
		}
		return [...map.entries()].map(([versionId, binaries]) => ({ versionId, binaries }));
	});

	function href(b: Bin, kind: 'binary' | 'raw' | 'broma'): string {
		const params = new URLSearchParams({
			version: b.versionId,
			platform: b.platformId,
			fileName: b.fileName
		});
		if (kind !== 'binary') params.set('mode', kind);
		return kind === 'binary' ? `/api/download/binary?${params}` : `/api/download/idb?${params}`;
	}

	const linkClass = $derived(
		unlocked
			? 'rounded-sm border border-border bg-surface-2 px-2.5 py-1 font-mono text-xs text-fg hover:border-accent'
			: 'pointer-events-none rounded-sm border border-border/50 bg-surface-2 px-2.5 py-1 font-mono text-xs text-muted/50'
	);
</script>

<div class="space-y-6">
	<header class="space-y-2">
		<h1 class="text-xl font-semibold tracking-tight">Binaries</h1>
		<p class="text-sm text-muted">
			Download original binaries and ready-to-use IDA databases (raw and bindings-applied).
		</p>
		<DownloadUnlock bind:unlocked />
	</header>

	{#each grouped as group (group.versionId)}
		<section class="space-y-2">
			<h2 class="font-mono text-sm font-semibold text-accent">{group.versionId}</h2>
			<ul class="divide-y divide-border overflow-hidden rounded-sm border border-border bg-surface">
				{#each group.binaries as b (b.platformId + b.fileName)}
					<li class="flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2">
						<span class="w-24 shrink-0 font-mono text-xs text-muted">{b.platformId}</span>
						<span class="truncate font-mono text-sm text-fg" title={b.fileName}>{b.fileName}</span>
						<span class="ml-auto flex shrink-0 items-center gap-1.5">
							<a href={href(b, 'binary')} class={linkClass}>Binary</a>
							{#if b.hasRaw}<a href={href(b, 'raw')} class={linkClass}>Raw IDB</a>{/if}
							{#if b.hasBroma}<a href={href(b, 'broma')} class={linkClass}>Broma IDB</a>{/if}
							{#if !b.hasRaw && !b.hasBroma}
								<span class="text-[11px] text-muted/60">not decompiled</span>
							{/if}
						</span>
					</li>
				{/each}
			</ul>
		</section>
	{/each}

	{#if grouped.length === 0}
		<p class="text-sm text-muted">No binaries uploaded yet.</p>
	{/if}
</div>

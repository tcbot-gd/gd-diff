<script lang="ts">
	import type { PageData } from './$types';
	import { PLATFORM_BY_ID } from '$lib/shared/platforms';

	let { data }: { data: PageData } = $props();

	const versionsNewestFirst = $derived([...data.versions].sort((a, b) => b.ord - a.ord));
</script>

<div class="space-y-8">
	<section class="space-y-3">
		<h1 class="text-2xl font-semibold tracking-tight">Geometry Dash decompilation explorer</h1>
		<p class="max-w-2xl text-sm text-muted">
			Browse disassembly, pseudocode and byte-level views of every Geometry Dash binary, and diff
			them across versions. Data appears as admins upload and decompile binaries.
		</p>
	</section>

	<section class="space-y-3">
		<h2 class="text-sm font-medium uppercase tracking-wider text-muted">Platforms</h2>
		<div class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
			{#each data.platforms as platform}
				<div class="rounded-sm border border-border bg-surface p-3">
					<div class="flex items-center justify-between gap-2">
						<span class="font-mono text-xs font-semibold text-accent">{platform.id}</span>
						<span class="text-[11px] text-muted">{platform.arch}</span>
					</div>
					<div class="mt-1 text-sm text-fg">{platform.label}</div>
					<div class="mt-2 space-y-0.5">
						{#each PLATFORM_BY_ID.get(platform.id)?.binaries ?? [] as binary}
							<div class="truncate font-mono text-[11px] text-muted" title={binary.fileName}>
								{binary.fileName}
							</div>
						{/each}
					</div>
				</div>
			{/each}
		</div>
	</section>

	<section class="space-y-3">
		<h2 class="text-sm font-medium uppercase tracking-wider text-muted">Versions</h2>
		<div class="overflow-x-auto rounded-sm border border-border">
			<table class="w-full border-collapse text-sm">
				<thead>
					<tr class="border-b border-border bg-surface text-left">
						<th class="px-3 py-2 font-medium text-muted">Version</th>
						{#each data.platforms as platform}
							<th
								class="px-2 py-2 text-center font-mono text-[11px] font-medium text-muted"
								title="{platform.label} · {platform.arch}"
							>
								{PLATFORM_BY_ID.get(platform.id)?.short ?? platform.id}
							</th>
						{/each}
					</tr>
				</thead>
				<tbody>
					{#each versionsNewestFirst as version}
						<tr class="border-b border-border last:border-0 hover:bg-surface/60">
							<td class="px-3 py-2">
								<div class="font-mono">{version.id}</div>
								{#if version.note}<div class="text-[11px] text-muted">{version.note}</div>{/if}
							</td>
							{#each data.platforms as platform}
								{@const status = data.matrix[version.id]?.[platform.id]}
								<td class="px-2 py-2 text-center">
									{#if status?.binaryCount}
										<a
											href="/{version.id}/{platform.id}"
											class="inline-block rounded px-2 py-0.5 font-mono text-[11px] text-ok hover:bg-surface-2"
										>
											{status.binaryCount} · {status.doneCount}✓
										</a>
									{:else}
										<span class="text-muted/40">—</span>
									{/if}
								</td>
							{/each}
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</section>
</div>

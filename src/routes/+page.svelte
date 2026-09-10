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
							</td>
							{#each data.platforms as platform}
								{@const status = data.matrix[version.id]?.[platform.id]}
								<td class="px-2 py-2 text-center">
									{#if status?.binaryCount}
										<a
											href="/{version.id}/{platform.id}"
											class="inline-flex items-center gap-1.5 rounded border border-ok/30 bg-ok/10 px-2.5 py-1 font-mono text-xs text-ok transition-colors hover:bg-ok/20"
										>
											{status.doneCount}/{status.binaryCount}
											{#if status.doneCount === status.binaryCount}
												<svg class="h-3 w-3" viewBox="0 0 20 20" fill="currentColor"
													><path
														fill-rule="evenodd"
														d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
														clip-rule="evenodd"
													/></svg
												>
											{/if}
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

<script lang="ts">
	import { PLATFORMS, PLATFORM_BY_ID } from '$lib/shared/platforms';
	import type { PlatformId } from '$lib/shared/platforms';

	let password = $state('');
	let version = $state('');
	let platform = $state<PlatformId>('win');
	let binaryIndex = $state(0);
	let customFile = $state('');
	let customRole = $state('');
	let file = $state<File | null>(null);
	let status = $state<string | null>(null);
	let errorMsg = $state<string | null>(null);
	let uploading = $state(false);

	const binaries = $derived(PLATFORM_BY_ID.get(platform)?.binaries ?? []);
	const useCustom = $derived(binaryIndex === binaries.length);

	function reset() {
		version = '';
		binaryIndex = 0;
		customFile = '';
		customRole = '';
		file = null;
	}

	async function onSubmit(event: SubmitEvent) {
		event.preventDefault();
		status = null;
		errorMsg = null;
		if (!file) {
			errorMsg = 'Choose a file';
			return;
		}
		const fileName = useCustom ? customFile.trim() : (binaries[binaryIndex]?.fileName ?? '');
		const role = useCustom ? customRole.trim() : (binaries[binaryIndex]?.role ?? '');
		if (!version.trim() || !fileName || !role) {
			errorMsg = 'Version, file name and role are required';
			return;
		}

		const form = new FormData();
		form.set('version', version.trim());
		form.set('platform', platform);
		form.set('fileName', fileName);
		form.set('role', role);
		form.set('file', file);

		uploading = true;
		try {
			const res = await fetch('/api/admin/upload', {
				method: 'POST',
				headers: { Authorization: `Basic ${btoa(`admin:${password}`)}` },
				body: form
			});
			if (res.ok) {
				const data = await res.json();
				status = `Uploaded ${fileName} (binary #${data.binary.id}) — decompilation queued`;
				reset();
			} else {
				const body = await res.text().catch(() => '');
				try {
					const parsed = JSON.parse(body);
					errorMsg = parsed.message || `Upload failed (${res.status})`;
				} catch {
					errorMsg = body || `Upload failed (${res.status})`;
				}
			}
		} catch {
			errorMsg = 'Upload failed';
		} finally {
			uploading = false;
		}
	}

	interface AdminBinary {
		id: number;
		versionId: string;
		platformId: string;
		fileName: string;
		role: string;
		decompilations: { id: number; mode: string; status: string }[];
	}

	let adminBinaries = $state<AdminBinary[]>([]);
	let manageError = $state<string | null>(null);
	let manageStatus = $state<string | null>(null);
	let loading = $state(false);

	async function loadBinaries() {
		manageError = null;
		loading = true;
		try {
			const res = await fetch('/api/admin/binaries', {
				headers: { Authorization: `Basic ${btoa(`admin:${password}`)}` }
			});
			if (!res.ok) {
				manageError = 'Failed to load — check password';
				return;
			}
			const data = await res.json();
			adminBinaries = data.binaries;
		} finally {
			loading = false;
		}
	}

	async function requeue(id: number, label: string) {
		manageError = null;
		manageStatus = null;
		const res = await fetch(`/api/admin/decompilations/${id}/requeue`, {
			method: 'POST',
			headers: { Authorization: `Basic ${btoa(`admin:${password}`)}` }
		});
		if (res.ok) {
			manageStatus = `Requeued ${label}`;
			await loadBinaries();
		} else {
			manageError = `Failed to requeue ${label}`;
		}
	}

	async function removeBinary(id: number, fileName: string) {
		if (!confirm(`Delete ${fileName} and all its decompilations?`)) return;
		manageError = null;
		manageStatus = null;
		const res = await fetch(`/api/admin/binaries?id=${id}`, {
			method: 'DELETE',
			headers: { Authorization: `Basic ${btoa(`admin:${password}`)}` }
		});
		if (res.ok) {
			manageStatus = `Deleted ${fileName}`;
			await loadBinaries();
		} else {
			manageError = `Failed to delete ${fileName}`;
		}
	}
</script>

<div class="mx-auto max-w-5xl space-y-8">
	<header>
		<a href="/" class="text-xs text-muted hover:text-fg">← Explorer</a>
		<h1 class="mt-1 text-xl font-semibold tracking-tight">Admin — upload binary</h1>
		<p class="text-sm text-muted">
			Upload a Geometry Dash binary to start decompilation. Raw + Broma decompilations are queued
			for the worker.
		</p>
	</header>

	<form class="space-y-4" onsubmit={onSubmit}>
		<label class="block">
			<span class="text-sm text-muted">Admin password</span>
			<input
				type="password"
				bind:value={password}
				class="mt-1 w-full rounded-sm border border-border bg-surface-2 px-2 py-1.5 font-mono text-sm text-fg"
			/>
		</label>
		<label class="block">
			<span class="text-sm text-muted">Version</span>
			<input
				bind:value={version}
				placeholder="e.g. 2.207"
				class="mt-1 w-full rounded-sm border border-border bg-surface-2 px-2 py-1.5 font-mono text-sm text-fg"
			/>
		</label>
		<label class="block">
			<span class="text-sm text-muted">Platform</span>
			<select
				bind:value={platform}
				class="mt-1 w-full rounded-sm border border-border bg-surface-2 px-2 py-1.5 text-sm text-fg"
			>
				{#each PLATFORMS as p}
					<option value={p.id}>{p.label}</option>
				{/each}
			</select>
		</label>
		<label class="block">
			<span class="text-sm text-muted">Binary</span>
			<select
				bind:value={binaryIndex}
				class="mt-1 w-full rounded-sm border border-border bg-surface-2 px-2 py-1.5 font-mono text-sm text-fg"
			>
				{#each binaries as b, i}
					<option value={i}>{b.fileName} ({b.role})</option>
				{/each}
				<option value={binaries.length}>Custom…</option>
			</select>
		</label>
		{#if useCustom}
			<div class="grid gap-4 sm:grid-cols-2">
				<label class="block">
					<span class="text-sm text-muted">File name</span>
					<input
						bind:value={customFile}
						class="mt-1 w-full rounded-sm border border-border bg-surface-2 px-2 py-1.5 font-mono text-sm text-fg"
					/>
				</label>
				<label class="block">
					<span class="text-sm text-muted">Role</span>
					<input
						bind:value={customRole}
						placeholder="game/engine/audio/monolith"
						class="mt-1 w-full rounded-sm border border-border bg-surface-2 px-2 py-1.5 font-mono text-sm text-fg"
					/>
				</label>
			</div>
		{/if}
		<label class="block">
			<span class="text-sm text-muted">File</span>
			<input
				type="file"
				onchange={(e) => (file = (e.currentTarget as HTMLInputElement).files?.[0] ?? null)}
				class="mt-1 w-full text-sm text-muted file:mr-3 file:rounded-sm file:border file:border-border file:bg-surface-2 file:px-3 file:py-1.5 file:text-sm file:text-fg"
			/>
		</label>
		<button
			type="submit"
			disabled={uploading}
			class="rounded-sm border border-border bg-surface-2 px-4 py-1.5 text-sm text-fg hover:border-accent disabled:opacity-50"
		>
			{uploading ? 'Uploading…' : 'Upload'}
		</button>
		{#if status}<p class="text-sm text-ok">{status}</p>{/if}
		{#if errorMsg}<p class="text-sm text-err">{errorMsg}</p>{/if}
	</form>

	<section class="space-y-4">
		<div class="flex items-center justify-between">
			<h2 class="text-sm font-medium uppercase tracking-wider text-muted">Manage binaries</h2>
			<button
				onclick={loadBinaries}
				disabled={loading}
				class="rounded-sm border border-border bg-surface-2 px-3 py-1 text-sm text-fg hover:border-accent disabled:opacity-50"
			>
				{loading ? 'Loading…' : 'Load binaries'}
			</button>
		</div>
		{#if manageError}<p class="text-sm text-err">{manageError}</p>{/if}
		{#if manageStatus}<p class="text-sm text-ok">{manageStatus}</p>{/if}
		{#if adminBinaries.length > 0}
			<div class="overflow-x-auto rounded-sm border border-border">
				<table class="w-full border-collapse text-sm">
					<thead>
						<tr class="border-b border-border bg-surface text-left">
							<th class="px-3 py-2 font-medium text-muted">Binary</th>
							<th class="px-3 py-2 font-medium text-muted">Modes</th>
							<th class="px-3 py-2 text-right font-medium text-muted">Actions</th>
						</tr>
					</thead>
					<tbody>
						{#each adminBinaries as bin}
							<tr class="border-b border-border last:border-0">
								<td class="px-3 py-2">
									<div class="font-mono text-xs">{bin.fileName}</div>
									<div class="text-[11px] text-muted">{bin.versionId}/{bin.platformId} · {bin.role}</div>
								</td>
								<td class="px-3 py-2">
									<div class="flex flex-wrap gap-1.5">
										{#each bin.decompilations as d}
											<span
												class="rounded-sm border border-border px-2 py-0.5 font-mono text-[11px] {d.status === 'done'
													? 'text-ok'
													: d.status === 'failed'
														? 'text-err'
														: 'text-muted'}"
											>
												{d.mode} · {d.status}
											</span>
										{/each}
									</div>
								</td>
								<td class="px-3 py-2">
									<div class="flex flex-wrap justify-end gap-1.5">
										{#each bin.decompilations as d}
											<button
												onclick={() => requeue(d.id, `${bin.fileName} (${d.mode})`)}
												class="rounded-sm border border-border px-2 py-0.5 text-[11px] text-fg hover:border-accent"
											>
												rerun {d.mode}
											</button>
										{/each}
										<button
											onclick={() => removeBinary(bin.id, bin.fileName)}
											class="rounded-sm border border-err/40 px-2 py-0.5 text-[11px] text-err hover:bg-err/10"
										>
											delete
										</button>
									</div>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</section>
</div>

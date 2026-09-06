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
</script>

<div class="mx-auto max-w-xl space-y-6">
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
</div>

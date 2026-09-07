<script lang="ts">
	import { onMount } from 'svelte';

	interface Props {
		unlocked?: boolean;
	}

	let { unlocked = $bindable(false) }: Props = $props();

	let password = $state('');
	let error = $state<string | null>(null);
	let busy = $state(false);

	onMount(async () => {
		try {
			const res = await fetch('/api/download/status');
			if (res.ok) {
				const data = (await res.json()) as { unlocked: boolean };
				unlocked = !!data.unlocked;
			}
		} catch {
			// network error — leave locked
		}
	});

	async function unlock() {
		error = null;
		busy = true;
		try {
			const res = await fetch('/api/download/auth', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ password })
			});
			if (res.ok) {
				unlocked = true;
				password = '';
			} else {
				error = 'Wrong password';
			}
		} catch {
			error = 'Failed to unlock';
		} finally {
			busy = false;
		}
	}
</script>

{#if unlocked}
	<span class="inline-flex items-center gap-1.5 text-xs text-ok">
		<span aria-hidden="true">✓</span> unlocked
	</span>
{:else}
	<div class="flex flex-wrap items-center gap-2">
		<input
			type="password"
			bind:value={password}
			onkeydown={(e) => e.key === 'Enter' && unlock()}
			placeholder="Download password"
			class="w-64 rounded-sm border border-border bg-surface-2 px-2 py-1 font-mono text-sm text-fg"
		/>
		<button
			onclick={unlock}
			disabled={busy || !password}
			class="rounded-sm border border-border bg-surface-2 px-3 py-1 text-sm text-fg hover:border-accent disabled:opacity-40"
		>
			Unlock
		</button>
		{#if error}<span class="text-xs text-warn">{error}</span>{/if}
	</div>
{/if}

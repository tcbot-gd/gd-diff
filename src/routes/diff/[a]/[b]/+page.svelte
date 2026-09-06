<script lang="ts">
	import type { PageData } from './$types';
	import DiffView from '$lib/client/DiffView.svelte';

	let { data }: { data: PageData } = $props();

	const aName = $derived(data.a.demangledName ?? data.a.name);
	const bName = $derived(data.b.demangledName ?? data.b.name);
</script>

<svelte:head>
	<title>Diff {aName} · gd-diff</title>
</svelte:head>

<DiffView a={data.a} b={data.b} />

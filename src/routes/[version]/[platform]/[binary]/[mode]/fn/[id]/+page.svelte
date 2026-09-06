<script lang="ts">
	import type { PageData } from './$types';
	import FunctionView from '$lib/client/FunctionView.svelte';

	let { data }: { data: PageData } = $props();

	const title = $derived(data.function.demangledName ?? data.function.name);
</script>

<svelte:head>
	<title>{title} · {data.function.versionId}/{data.function.platformId} · gd-diff</title>
</svelte:head>

<FunctionView fn={data.function} initialAddr={data.initialAddr} />

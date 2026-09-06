<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import { page } from '$app/state';

	let { children } = $props();

	const title = $derived(
		page.data.seo?.title ? `${page.data.seo.title} · gd-diff` : 'gd-diff — Geometry Dash decompilation explorer'
	);
	const description = $derived(
		page.data.seo?.description ??
			'Browse, search and diff Geometry Dash disassembly and pseudocode across platforms and versions.'
	);
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>{title}</title>
	<meta name="description" content={description} />
	<meta property="og:title" content={title} />
	<meta property="og:description" content={description} />
	<meta property="og:type" content="website" />
	<meta name="twitter:card" content="summary" />
</svelte:head>

<div class="flex min-h-dvh flex-col">
	<header class="sticky top-0 z-40 border-b border-border bg-bg/85 backdrop-blur">
		<nav class="mx-auto flex h-14 w-full max-w-7xl items-center gap-4 px-4">
			<a href="/" class="font-mono text-sm font-semibold tracking-tight text-fg">
				gd<span class="text-accent">·diff</span>
			</a>
			<div class="ml-auto flex items-center gap-1 text-sm text-muted">
				<a href="/" class="rounded px-3 py-1.5 transition-colors hover:bg-surface-2 hover:text-fg"
					>Explorer</a
				>
				<a href="/admin" class="rounded px-3 py-1.5 transition-colors hover:bg-surface-2 hover:text-fg"
					>Admin</a
				>
			</div>
		</nav>
	</header>

	<main class="mx-auto w-full max-w-7xl flex-1 px-4 py-6">
		{@render children()}
	</main>

	<footer class="border-t border-border py-5 text-xs text-muted">
		<div class="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-4">
			<span>gd-diff — Geometry Dash decompilation viewer</span>
			<span>not affiliated with RobTop Games</span>
		</div>
	</footer>
</div>

import tailwindcss from '@tailwindcss/vite';
import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [
		tailwindcss(),
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) => filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			adapter: adapter(),
			csrf: {
				// The upload API uses Basic auth (no cookies), so CSRF is not a
				// meaningful vector, and the Origin check breaks behind reverse
				// proxies (https vs http origin mismatch). Trust all origins.
				trustedOrigins: ['*']
			}
		})
	],
	server: {
		watch: {
			// `data/` holds the SQLite db, uploads, and IDA's working files
			// (`.id0`/`.id1`/`.nam`/`.til`), which IDA locks while decompiling.
			// Watching them crashes the dev server with EBUSY on Windows.
			ignored: ['**/data/**']
		}
	}
});

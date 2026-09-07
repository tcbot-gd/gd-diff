import { existsSync } from 'node:fs';
import path from 'node:path';

// Load `.env` into `process.env`. The SvelteKit server (dev + build) runs under
// Node, which does NOT auto-load `.env` — only the standalone Bun worker does.
// We can't use SvelteKit's `$env/dynamic/private` here because this module is
// also imported by the worker (`worker/index.ts`), which runs outside SvelteKit.
const envFile = path.join(process.cwd(), '.env');
if (existsSync(envFile) && typeof process.loadEnvFile === 'function') {
	try {
		process.loadEnvFile(envFile);
	} catch {
		// Ignore malformed `.env`; fall back to real environment variables.
	}
}

function readString(key: string, fallback: string): string {
	const value = process.env[key];
	return value === undefined || value === '' ? fallback : value;
}

export const env = {
	publicUrl: readString('PUBLIC_URL', 'http://localhost:3000'),
	dataDir: readString('DATA_DIR', './data'),
	host: readString('HOST', '0.0.0.0'),
	port: Number(readString('PORT', '3000')),
	adminPassword: readString('ADMIN_PASSWORD', ''),
	idaPath: readString('IDA_PATH', 'idat.exe'),
	bromaPluginDir: readString('BROMA_PLUGIN_DIR', '/opt/ida/plugins'),
	bindingsDir: readString('BINDINGS_DIR', ''),
	bindingsRepoUrl: readString('BINDINGS_REPO_URL', 'https://github.com/geode-sdk/bindings'),
	bindingsCommit: readString('BINDINGS_COMMIT', '')
};

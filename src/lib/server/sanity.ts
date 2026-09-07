import { execSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { env } from './env';
import { config } from './config';
import { getDb } from './db';

export interface SanityReport {
	fatal: string[];
	warnings: string[];
}

function hasCommand(command: string): boolean {
	try {
		execSync(`${command} --version`, { stdio: 'ignore' });
		return true;
	} catch {
		return false;
	}
}

export function checkWorker(): SanityReport {
	const fatal: string[] = [];
	const warnings: string[] = [];

	// IDA binary
	if (!env.idaPath) {
		fatal.push('IDA_PATH is not set — point it at your headless IDA binary (e.g. /opt/ida/idat).');
	} else if (!existsSync(env.idaPath)) {
		const hint =
			env.idaHostDir && env.idaDir
				? ` — the worker syncs it to IDA_DIR (${env.idaDir}) from IDA_HOST_DIR (${env.idaHostDir}); make sure that mount is populated and IDA_DIR is writable`
				: '';
		fatal.push(`IDA_PATH points to a missing file: ${env.idaPath}${hint}`);
	}

	// data directory
	try {
		mkdirSync(config.dataDir, { recursive: true });
	} catch {
		fatal.push(`DATA_DIR is not writable: ${config.dataDir}`);
	}

	// database
	try {
		getDb();
	} catch (error) {
		fatal.push(
			`Could not open the database at ${config.dbPath}: ${error instanceof Error ? error.message : String(error)}`
		);
	}

	// Broma plugin
	if (!env.bromaPluginDir && !env.bromaRepoUrl) {
		warnings.push(
			'Broma mode is not configured — set BROMA_PLUGIN_DIR (existing install) or BROMA_REPO_URL (auto-install).'
		);
	}

	// Bindings
	if (!env.bindingsDir && !env.bindingsRepoUrl) {
		warnings.push(
			'Broma bindings are not configured — set BINDINGS_DIR (local checkout) or BINDINGS_REPO_URL (auto-clone).'
		);
	}

	// Auto-install tooling (only relevant when the worker will clone/install at startup)
	const bromaNeedsInstall = !env.bromaPluginDir || !existsSync(path.join(env.bromaPluginDir, 'BromaIDA.py'));
	const bindingsNeedClone = !env.bindingsDir || !existsSync(path.join(env.bindingsDir, 'bindings'));
	if ((bromaNeedsInstall && env.bromaRepoUrl) || (bindingsNeedClone && env.bindingsRepoUrl)) {
		if (!hasCommand('git')) warnings.push('git is not installed — required to clone BromaIDA/bindings.');
	}
	if (bromaNeedsInstall && env.bromaRepoUrl && !hasCommand('python3') && !hasCommand('python')) {
		warnings.push('python3 is not installed — required to install BromaIDA dependencies.');
	}

	return { fatal, warnings };
}

export function checkApp(): SanityReport {
	const fatal: string[] = [];
	const warnings: string[] = [];

	if (!env.adminPassword) {
		warnings.push('ADMIN_PASSWORD is not set — binary uploads will be rejected. Set it in the environment or .env.');
	}

	try {
		mkdirSync(config.dataDir, { recursive: true });
	} catch {
		fatal.push(`DATA_DIR is not writable: ${config.dataDir}`);
	}

	try {
		getDb();
	} catch (error) {
		fatal.push(
			`Could not open the database at ${config.dbPath}: ${error instanceof Error ? error.message : String(error)}`
		);
	}

	return { fatal, warnings };
}

export function report(name: string, report: SanityReport): boolean {
	if (report.fatal.length > 0) {
		console.error(`\n[${name}] configuration errors:`);
		for (const line of report.fatal) console.error(`  ✗ ${line}`);
		console.error('  Fix the errors above and restart.\n');
	}
	if (report.warnings.length > 0) {
		console.warn(`[${name}] warnings:`);
		for (const line of report.warnings) console.warn(`  ⚠ ${line}`);
		console.warn('');
	}
	return report.fatal.length > 0;
}

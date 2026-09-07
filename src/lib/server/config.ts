import path from 'node:path';
import { env } from './env';

export const config = {
	dataDir: env.dataDir,
	dbPath: path.join(env.dataDir, 'gd-diff.sqlite'),
	uploadsDir: path.join(env.dataDir, 'uploads'),
	exportsDir: path.join(env.dataDir, 'exports'),
	originalsDir: path.join(env.dataDir, 'originals'),
	databasesDir: path.join(env.dataDir, 'databases'),
	bindingsDir: env.bindingsDir || path.join(env.dataDir, 'bindings')
};

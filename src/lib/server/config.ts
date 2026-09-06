import path from 'node:path';
import { env } from './env';

export const config = {
	dataDir: env.dataDir,
	dbPath: path.join(env.dataDir, 'gd-diff.sqlite'),
	uploadsDir: path.join(env.dataDir, 'uploads'),
	exportsDir: path.join(env.dataDir, 'exports'),
	bindingsDir: path.join(env.dataDir, 'bindings')
};

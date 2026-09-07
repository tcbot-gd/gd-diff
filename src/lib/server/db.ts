import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { config } from './config';
import { PLATFORMS } from '../shared/platforms';

const VERSIONS_SEED: { id: string; note: string | null }[] = [
	{ id: '2.200', note: null },
	{ id: '2.201', note: 'Windows only' },
	{ id: '2.202', note: 'Windows only' },
	{ id: '2.203', note: 'Windows only' },
	{ id: '2.204', note: 'Windows only' },
	{ id: '2.205', note: 'Android only' },
	{ id: '2.206', note: null },
	{ id: '2.207', note: null },
	{ id: '2.2071', note: 'PC only' },
	{ id: '2.2072', note: 'PC only' },
	{ id: '2.2073', note: 'PC only' },
	{ id: '2.2074', note: null },
	{ id: '2.208', note: null },
	{ id: '2.2081', note: 'PC only' },
	{ id: '2.2082', note: 'Mobile only' },
	{ id: '2.209', note: 'Unreleased' }
];

const SCHEMA = `
CREATE TABLE IF NOT EXISTS platforms (
	id TEXT PRIMARY KEY,
	label TEXT NOT NULL,
	arch TEXT NOT NULL,
	ord INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS versions (
	id TEXT PRIMARY KEY,
	label TEXT NOT NULL,
	ord INTEGER NOT NULL DEFAULT 0,
	note TEXT
);

CREATE TABLE IF NOT EXISTS binaries (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	version_id TEXT NOT NULL REFERENCES versions(id) ON DELETE CASCADE,
	platform_id TEXT NOT NULL REFERENCES platforms(id) ON DELETE CASCADE,
	file_name TEXT NOT NULL,
	role TEXT NOT NULL,
	sha256 TEXT,
	created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
	UNIQUE (version_id, platform_id, file_name)
);
CREATE INDEX IF NOT EXISTS idx_binaries_version_platform ON binaries (version_id, platform_id);

CREATE TABLE IF NOT EXISTS decompilations (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	binary_id INTEGER NOT NULL REFERENCES binaries(id) ON DELETE CASCADE,
	mode TEXT NOT NULL,
	bindings_commit TEXT,
	image_base INTEGER,
	status TEXT NOT NULL DEFAULT 'pending',
	error TEXT,
	created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
	updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
	UNIQUE (binary_id, mode)
);

CREATE TABLE IF NOT EXISTS functions (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	decompilation_id INTEGER NOT NULL REFERENCES decompilations(id) ON DELETE CASCADE,
	name TEXT NOT NULL,
	demangled_name TEXT,
	address INTEGER NOT NULL,
	size INTEGER NOT NULL,
	type_signature TEXT,
	UNIQUE (decompilation_id, address)
);
CREATE INDEX IF NOT EXISTS idx_functions_decomp ON functions (decompilation_id);
CREATE INDEX IF NOT EXISTS idx_functions_name ON functions (name);

CREATE TABLE IF NOT EXISTS function_calls (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	decompilation_id INTEGER NOT NULL REFERENCES decompilations(id) ON DELETE CASCADE,
	caller_id INTEGER NOT NULL REFERENCES functions(id) ON DELETE CASCADE,
	callee_address INTEGER,
	callee_name TEXT,
	UNIQUE (decompilation_id, caller_id, callee_address)
);
CREATE INDEX IF NOT EXISTS idx_calls_callee ON function_calls (decompilation_id, callee_name);

CREATE TABLE IF NOT EXISTS member_uses (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	decompilation_id INTEGER NOT NULL REFERENCES decompilations(id) ON DELETE CASCADE,
	function_id INTEGER NOT NULL REFERENCES functions(id) ON DELETE CASCADE,
	owner_type TEXT NOT NULL,
	member_name TEXT NOT NULL,
	member_kind TEXT NOT NULL,
	UNIQUE (decompilation_id, function_id, owner_type, member_name)
);
CREATE INDEX IF NOT EXISTS idx_members_lookup ON member_uses (decompilation_id, owner_type, member_name);

CREATE TABLE IF NOT EXISTS function_content (
	function_id INTEGER PRIMARY KEY REFERENCES functions(id) ON DELETE CASCADE,
	content TEXT NOT NULL
);
`;

let db: DatabaseSync | null = null;

export function getDb(): DatabaseSync {
	if (!db) db = initDb();
	return db;
}

export function initDb(): DatabaseSync {
	mkdirSync(config.dataDir, { recursive: true });
	const database = new DatabaseSync(config.dbPath);
	database.exec('PRAGMA journal_mode = WAL;');
	database.exec('PRAGMA foreign_keys = ON;');
	database.exec('PRAGMA busy_timeout = 10000;');
	database.exec(SCHEMA);
	migrate(database);
	seed(database);
	db = database;
	return database;
}

function migrate(database: DatabaseSync): void {
	const columns = database.prepare('PRAGMA table_info(decompilations)').all() as { name: string }[];
	if (!columns.some((c) => c.name === 'image_base')) {
		database.exec('ALTER TABLE decompilations ADD COLUMN image_base INTEGER');
	}
	if (!columns.some((c) => c.name === 'progress')) {
		database.exec('ALTER TABLE decompilations ADD COLUMN progress TEXT');
	}
}

function seed(database: DatabaseSync): void {
	const insertPlatform = database.prepare(
		'INSERT OR IGNORE INTO platforms (id, label, arch, ord) VALUES (?, ?, ?, ?)'
	);
	const insertVersion = database.prepare(
		'INSERT OR IGNORE INTO versions (id, label, ord, note) VALUES (?, ?, ?, ?)'
	);

	database.exec('BEGIN');
	try {
		PLATFORMS.forEach((platform, index) => {
			insertPlatform.run(platform.id, platform.label, platform.arch, index);
		});
		VERSIONS_SEED.forEach((version, index) => {
			insertVersion.run(version.id, version.id, index, version.note);
		});
		database.exec('COMMIT');
	} catch (error) {
		database.exec('ROLLBACK');
		throw error;
	}
}

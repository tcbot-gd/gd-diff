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
	bindingsRepoUrl: readString('BINDINGS_REPO_URL', 'https://github.com/geode-sdk/bindings'),
	bindingsCommit: readString('BINDINGS_COMMIT', '')
};

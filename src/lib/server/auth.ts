import { env } from './env';

function checkBasicAuth(authorization: string | null, username: string, password: string): boolean {
	if (!password) return false;
	if (!authorization) return false;
	const expected = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
	return authorization === expected;
}

export function isAdmin(authorization: string | null): boolean {
	return checkBasicAuth(authorization, 'admin', env.adminPassword);
}

export function isDownloader(authorization: string | null): boolean {
	return checkBasicAuth(authorization, 'download', env.downloadPassword);
}

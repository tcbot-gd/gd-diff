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

function parseCookies(header: string | null): Record<string, string> {
	const out: Record<string, string> = {};
	if (!header) return out;
	for (const part of header.split(';')) {
		const eq = part.indexOf('=');
		if (eq === -1) continue;
		out[part.slice(0, eq).trim()] = part.slice(eq + 1).trim();
	}
	return out;
}

function encodePassword(password: string): string {
	return Buffer.from(password).toString('base64');
}

export function downloadCookieValue(): string {
	return encodePassword(env.downloadPassword);
}

// Download auth accepts either HTTP Basic auth (curl/programmatic) or the
// `dl_auth` cookie set by the UI, so modders only type the password once.
export function isDownloader(authorization: string | null, cookieHeader: string | null): boolean {
	if (checkBasicAuth(authorization, 'download', env.downloadPassword)) return true;
	if (!env.downloadPassword) return false;
	return parseCookies(cookieHeader)['dl_auth'] === downloadCookieValue();
}

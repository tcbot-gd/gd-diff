import { env } from './env';

export function isAdmin(authorization: string | null): boolean {
	if (!env.adminPassword) return false;
	if (!authorization) return false;
	const expected = `Basic ${Buffer.from(`admin:${env.adminPassword}`).toString('base64')}`;
	return authorization === expected;
}

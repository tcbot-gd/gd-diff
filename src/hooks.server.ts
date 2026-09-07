import { building } from '$app/environment';
import { checkApp, report } from '$lib/server/sanity';

if (!building) {
	report('app', checkApp());
}

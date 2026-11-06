import catalogue from '../../catalogue.json' with { type: 'json' };
import publicConfig from '../../public-config.json' with { type: 'json' };
import { createStreamHandler } from '../../stream-api.mjs';

// The Cloudflare API token is read at runtime only. It never enters the browser
// bundle, Supabase, public config, or GitHub source.
const readEnv = name => (/** @type {any} */ (globalThis)).Netlify?.env?.get(name) || '';
export default createStreamHandler({ catalogue, publicConfig, env: readEnv });
export const config = { path: '/api/stream/:action' };

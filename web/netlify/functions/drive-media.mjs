import catalogue from '../../catalogue.json' with { type: 'json' };
import publicConfig from '../../public-config.json' with { type: 'json' };
import { createMediaHandler } from '../../drive-stream.mjs';
import { asOptimizedFile, parseOptimizedManifest } from '../../optimized-delivery.mjs';

async function loadPublishedFile(id) {
  if (!publicConfig.supabaseUrl || !publicConfig.supabasePublishableKey) return null;
  const key = encodeURIComponent(`drive:drive:${id}`);
  const response = await fetch(`${publicConfig.supabaseUrl}/rest/v1/bailacue_web_content?key=eq.${key}&select=payload`, {
    headers: { apikey: publicConfig.supabasePublishableKey },
    signal: AbortSignal.timeout(6000),
    cache: 'no-store',
  });
  if (!response.ok) return null;
  const data = await response.json();
  return Array.isArray(data) ? data[0]?.payload || null : null;
}

let manifestCache = null;
let manifestExpiresAt = 0;

async function loadOptimizedFile(id) {
  if (!publicConfig.supabaseUrl || !publicConfig.supabasePublishableKey) return null;
  if (Date.now() > manifestExpiresAt) {
    // A short server-side cache limits Supabase requests when Chrome seeks many
    // adjacent byte ranges. A failed refresh never grants new media access.
    manifestCache = null;
    manifestExpiresAt = Date.now() + 15000;
    const key = encodeURIComponent('optimized:manifest');
    try {
      const response = await fetch(`${publicConfig.supabaseUrl}/rest/v1/bailacue_web_content?key=eq.${key}&select=payload`, {
        headers: { apikey: publicConfig.supabasePublishableKey },
        signal: AbortSignal.timeout(6000), cache: 'no-store',
      });
      if (response.ok) {
        const data = await response.json();
        manifestCache = parseOptimizedManifest(data?.[0]?.payload);
        manifestExpiresAt = Date.now() + 45000;
      }
    } catch { /* Fail closed until the next refresh attempt. */ }
  }
  const item = manifestCache?.entries.find(entry => entry.driveId === id);
  return asOptimizedFile(item);
}

export default createMediaHandler(catalogue, fetch, loadPublishedFile, loadOptimizedFile);
export const config = { path: '/api/drive-video/:fileId' };

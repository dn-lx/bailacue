import catalogue from '../../catalogue.json' with { type: 'json' };
import publicConfig from '../../public-config.json' with { type: 'json' };
import { createMediaHandler } from '../../drive-stream.mjs';

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

export default createMediaHandler(catalogue, fetch, loadPublishedFile);
export const config = { path: '/api/drive-video/:fileId' };

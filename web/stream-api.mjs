import { DRIVE_ID, STREAM_UID, streamFromApi } from './stream-delivery.mjs';

const ROOT = '1elTpDpgefwwlnrSEFc8vyREt3HUpDS8P';
const FOLDERS = Object.freeze({ Salsa: '1lVR5Pc-6SupJOfLIhcRE-oo69FUDM5Sm', Bachata: '17CFKIazhQJTGXvlHP5sa1mqlvu9p-2i1' });
const LIMIT = 2 * 1024 * 1024 * 1024; // Explicit pilot cap: 2 GiB.
const VIDEO_TYPES = /\.(?:mp4|mov|m4v|webm|mkv|avi)$/i;
const B64 = value => btoa(Array.from(new TextEncoder().encode(String(value)), char => String.fromCharCode(char)).join(''));
const json = (value, status = 200) => Response.json(value, { status, headers: { 'Cache-Control': 'no-store' } });
const error = (status, message) => json({ error: message }, status);

export function isStreamEnabled(env) {
  return env('BAILACUE_STREAM_ENABLED') === 'true' &&
    /^[0-9a-f]{32}$/i.test(env('BAILACUE_CLOUDFLARE_ACCOUNT_ID') || '') &&
    !!env('BAILACUE_CLOUDFLARE_API_TOKEN');
}

export function validUpload(file, video) {
  const size = Number(file?.size), durationSeconds = Number(file?.durationSeconds);
  if (!Number.isSafeInteger(size) || size < 1024 || size > LIMIT ||
      !VIDEO_TYPES.test(file?.name || '') || String(file.name).length > 180 ||
      !Number.isFinite(durationSeconds) || durationSeconds < 1 || durationSeconds > 28800) return false;
  return !video?.size || size === video.size;
}

export function createStreamHandler({ catalogue, publicConfig, fetcher = fetch, env }) {
  if (!catalogue?.videos?.length || catalogue.rootFolderId !== ROOT) throw new Error('Invalid fixed catalogue.');
  if (typeof env !== 'function') throw new Error('Secret environment accessor required.');
  const supabase = publicConfig.supabaseUrl, key = publicConfig.supabasePublishableKey;
  const headers = bearer => ({ apikey: key, ...(bearer ? { Authorization: bearer } : {}) });
  async function knownSource(videoId) {
    if (!DRIVE_ID.test(videoId)) return null;
    const local = catalogue.videos.find(v => v.id === videoId);
    let video = local;
    if (!video) {
      const query = encodeURIComponent('drive:' + videoId);
      const response = await fetcher(`${supabase}/rest/v1/bailacue_web_content?select=payload&key=eq.${query}`, { headers: headers(), cache: 'no-store' });
      if (response.ok) video = (await response.json())?.[0]?.payload;
    }
    if (!video || video.provider !== 'drive' || video.id !== videoId || videoId !== 'drive:' + video.providerId ||
        FOLDERS[video.dance] === undefined || (video.folderId && video.folderId !== FOLDERS[video.dance])) return null;
    return video;
  }
  async function owner(req) {
    const bearer = req.headers.get('Authorization') || '';
    if (!/^Bearer [A-Za-z0-9._~-]+$/.test(bearer)) return null;
    const u = await fetcher(`${supabase}/auth/v1/user`, { headers: headers(bearer), cache: 'no-store' });
    if (!u.ok) return null;
    const user = await u.json();
    if (!/^[0-9a-f-]{36}$/i.test(user?.id || '')) return null;
    const r = await fetcher(`${supabase}/rest/v1/bailacue_web_admins?select=user_id&user_id=eq.${encodeURIComponent(user.id)}`, { headers: headers(bearer), cache: 'no-store' });
    if (!r.ok) return null;
    const adminRows = await r.json();
    return adminRows.some(row => row.user_id === user.id) ? bearer : null;
  }
  async function cf(url, init) {
    const r = await fetcher(url, { ...init, headers: {
      ...init?.headers, Authorization: `Bearer ${env('BAILACUE_CLOUDFLARE_API_TOKEN')}`,
    }, cache: 'no-store', signal: AbortSignal.timeout(15000) });
    return r;
  }

  return async request => {
    const url = new URL(request.url);
    const action = /^\/api\/stream\/(config|prepare|status)$/.exec(url.pathname)?.[1];
    if (!action) return error(404, 'Unknown video delivery action.');
    if (action === 'config' && request.method === 'GET') return json({ enabled: isStreamEnabled(env), provider: 'cloudflare-stream' });
    if (!['POST'].includes(request.method)) return error(405, 'Method not allowed.');
    if (!isStreamEnabled(env)) return error(503, 'Adaptive video uploads are not activated. Original Drive playback is unchanged.');
    const origin = request.headers.get('Origin');
    if (origin && origin !== url.origin) return error(403, 'Cross-site administration is not permitted.');
    if (request.headers.get('Content-Type')?.split(';')[0] !== 'application/json') return error(415, 'Expected JSON request.');
    const length = Number(request.headers.get('Content-Length'));
    if (length > 4096) return error(413, 'Request is too large.');
    let body;
    try { const input = await request.text(); if (input.length > 4096) return error(413, 'Request is too large.'); body = JSON.parse(input); } catch { return error(400, 'Invalid request.'); }
    let bearer;
    try { bearer = await owner(request); } catch { return error(503, 'Administrator verification is unavailable.'); }
    if (!bearer) return error(403, 'An authorized BailaCue administrator is required.');
    const videoId = body?.videoId;
    let video;
    try { video = await knownSource(videoId); } catch { return error(503, 'Unable to confirm the original video.'); }
    if (!video) return error(404, 'Select an existing BailaCue Drive video.');

    const account = env('BAILACUE_CLOUDFLARE_ACCOUNT_ID');
    const base = `https://api.cloudflare.com/client/v4/accounts/${account}/stream`;
    if (action === 'prepare') {
      if (videoId.length > 64) return error(400, 'The video identifier is too long to associate with the provider.');
      if (!validUpload(body.file, video)) return error(400, 'Select the matching original video file, including its exact original file size and estimated duration.');
      const maximum = Math.ceil(Number(body.file.durationSeconds) * 1.2 + 20);
      const cap = Math.max(60, Number(env('BAILACUE_STREAM_MAX_DURATION_SECONDS')) || 900);
      if (maximum > cap) return error(400, `This upload would reserve ${maximum} video seconds; configured limit is ${cap} seconds.`);
      const metadata = [
        ['name', body.file.name],
        ['maxDurationSeconds', String(maximum)],
        ['expiry', new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString()],
      ].map(([key, value]) => `${key} ${B64(value)}`).join(',');
      let result;
      try {
        result = await cf(base + '?direct_user=true', { method: 'POST', headers: {
          'Tus-Resumable': '1.0.0',
          'Upload-Length': String(body.file.size),
          'Upload-Metadata': metadata,
          'Upload-Creator': videoId,
        } });
      } catch { return error(502, 'Video service is unavailable. No upload started.'); }
      if (!result.ok) return error(502, 'Video service rejected the upload reservation. Check available video storage capacity.');
      const endpoint = result.headers.get('Location'), uid = result.headers.get('stream-media-id');
      let location;
      try { location = new URL(endpoint); } catch { return error(502, 'Video service did not return a valid upload URL.'); }
      if (!['upload.videodelivery.net', 'api.cloudflare.com'].includes(location.hostname) &&
          !/^(?:customer-[a-z0-9]+)\.cloudflarestream\.com$/i.test(location.hostname)) return error(502, 'Unexpected video upload destination.');
      if (location.protocol !== 'https:' || location.username || location.password || !STREAM_UID.test(uid || '')) return error(502, 'Invalid video service upload response.');
      return json({ uploadUrl: location.toString(), uid, chunkSize: 10 * 1024 * 1024, expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString() }, 201);
    }

    if (action === 'status') {
      if (!STREAM_UID.test(body?.uid || '')) return error(400, 'Invalid video service identifier.');
      let result, details;
      try { result = await cf(base + '/' + body.uid, { method: 'GET' }); details = await result.json(); }
      catch { return error(502, 'Could not inspect video processing status.'); }
      if (!result.ok || !details.success || details.result?.uid !== body.uid) return error(404, 'Video service has no matching video.');
      const v = details.result;
      if (v.creator !== videoId) return error(403, 'This processed video is not associated with the selected original.');
      if (!v.readyToStream || v.status?.state !== 'ready') return json({ status: v.status?.state || 'processing', percent: Number(v.status?.pctComplete) || 0 });
      const delivery = streamFromApi(v);
      if (!delivery) return error(409, 'Video is encoded but has no validated public streaming URL.');
      try {
        const published = await fetcher(`${supabase}/rest/v1/bailacue_web_content?on_conflict=key`, {
          method: 'POST',
          headers: { ...headers(bearer), 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
          body: JSON.stringify([{ key: 'stream:' + videoId, payload: delivery }]),
        });
        if (!published.ok) return error(502, 'Video is ready but could not be published to the BailaCue library.');
      } catch { return error(502, 'Unable to publish the ready video. Retry status.'); }
      return json({ status: 'ready', delivery });
    }
    return error(404, 'Unknown video delivery action.');
  };
}

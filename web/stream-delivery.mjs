// Validated Cloudflare Stream playback data. URLs are constructed only from
// Stream-issued IDs and known Stream domains, never from untrusted link strings.
export const STREAM_UID = /^[a-f0-9]{32}$/i;
export const STREAM_HOST = /^(?:customer-[a-z0-9]+\.cloudflarestream\.com|videodelivery\.net)$/i;
export const DRIVE_ID = /^drive:[A-Za-z0-9_-]{10,100}$/;

export function parseStreamDelivery(data) {
  if (!data || data.provider !== 'cloudflare-stream' || data.status !== 'ready') return null;
  if (!STREAM_UID.test(data.uid || '') || !STREAM_HOST.test(data.host || '')) return null;
  if (data.signed === true) return null;
  return { provider: 'cloudflare-stream', status: 'ready', uid: data.uid, host: data.host };
}

export function streamEmbedUrl(data) {
  const stream = parseStreamDelivery(data);
  if (!stream) return null;
  return `https://${stream.host}/${stream.uid}/iframe?preload=auto`;
}

export function streamThumbnailUrl(data) {
  const stream = parseStreamDelivery(data);
  if (!stream) return null;
  return `https://${stream.host}/${stream.uid}/thumbnails/thumbnail.jpg?time=1s&height=360`;
}

export function streamFromApi(videoDetails) {
  const uid = videoDetails?.uid;
  const hls = videoDetails?.playback?.hls;
  if (!STREAM_UID.test(uid || '') || typeof hls !== 'string') return null;
  try {
    const url = new URL(hls);
    if (url.protocol !== 'https:' || !STREAM_HOST.test(url.hostname) ||
        url.pathname !== `/${uid}/manifest/video.m3u8` || url.search || url.hash) return null;
    if (videoDetails.requireSignedURLs === true) return null;
    return { provider: 'cloudflare-stream', status: 'ready', uid, host: url.hostname, signed: false };
  } catch { return null; }
}

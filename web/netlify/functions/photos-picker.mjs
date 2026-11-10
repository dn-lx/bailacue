// Proxy Google Photos Picker API through BailaCue's origin to avoid browser CORS.
// OAuth access tokens are supplied per request and are never stored.
export default async function handler(request) {
  const path = new URL(request.url).pathname;
  const auth = request.headers.get('authorization') || '';
  if (!/^Bearer [A-Za-z0-9._~+/-]+={0,2}$/.test(auth)) return new Response('Missing authorization', { status: 401 });
  const suffix = path.replace(/^\/api\/photos-picker\//, '');
  let upstream;
  if (suffix.startsWith('v1/')) {
    if (!/^v1\/(sessions(?:\/[A-Za-z0-9_-]+)?|mediaItems)$/.test(suffix)) return new Response('Invalid endpoint', { status: 400 });
    upstream = 'https://photospicker.googleapis.com/' + suffix + new URL(request.url).search;
  } else if (suffix === 'download') {
    const raw = new URL(request.url).searchParams.get('url');
    try {
      const parsed = new URL(raw);
      if (parsed.protocol !== 'https:' || !parsed.hostname.endsWith('.googleusercontent.com') || !parsed.pathname) throw Error();
      upstream = parsed.href;
    } catch { return new Response('Invalid media URL', { status: 400 }); }
  } else return new Response('Not found', { status: 404 });
  try {
    const response = await fetch(upstream, {
      method: request.method,
      headers: { Authorization: auth, ...(request.method === 'POST' ? { 'Content-Type': 'application/json' } : {}) },
      ...(request.method === 'POST' ? { body: await request.text() } : {}),
      signal: AbortSignal.timeout(120000),
      redirect: 'error',
    });
    return new Response(response.body, {
      status: response.status,
      headers: { 'Content-Type': response.headers.get('content-type') || 'application/octet-stream', 'Cache-Control': 'no-store' },
    });
  } catch { return new Response('Google Photos could not be reached', { status: 502 }); }
}
export const config = { path: '/api/photos-picker/*' };

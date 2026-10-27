// A memory-only bridge. No credentials, responses or videos are cached.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  const match = /^\/drive-media\/([A-Za-z0-9_-]{10,100})$/.exec(url.pathname);
  if (url.origin !== self.location.origin || !match) return;
  event.respondWith((async () => {
    const client = await self.clients.get(event.clientId);
    if (!client) return new Response('Open this video from BailaCue.', { status: 403 });
    const token = await new Promise(resolve => {
      const channel = new MessageChannel(); const timeout = setTimeout(() => resolve(''), 4000);
      channel.port1.onmessage = message => { clearTimeout(timeout); channel.port1.close(); resolve(typeof message.data?.token === 'string' ? message.data.token : ''); };
      client.postMessage({ type: 'BAILACUE_MEDIA_TOKEN', fileId: match[1] }, [channel.port2]);
    });
    if (!token) return new Response('Connect Google to play this video with BailaCue controls.', { status: 401 });
    const headers = new Headers({ Authorization: `Bearer ${token}` });
    if (event.request.headers.has('range')) headers.set('Range', event.request.headers.get('range'));
    const upstream = await fetch(`https://www.googleapis.com/drive/v3/files/${match[1]}?alt=media`, { headers, signal: event.request.signal, cache: 'no-store' });
    const responseHeaders = new Headers();
    for (const key of ['content-type', 'content-length', 'content-range', 'accept-ranges']) if (upstream.headers.has(key)) responseHeaders.set(key, upstream.headers.get(key));
    responseHeaders.set('Cache-Control', 'private, no-store');
    return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
  })().catch(() => new Response('Google Drive streaming is unavailable. Try its preview.', { status: 502 })));
});

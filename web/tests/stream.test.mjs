import test from 'node:test';
import assert from 'node:assert/strict';
import { createStreamHandler } from '../stream-api.mjs';
import { parseStreamDelivery, streamEmbedUrl, streamFromApi } from '../stream-delivery.mjs';

const owner = '11111111-1111-4111-8111-111111111111';
const id = 'ABCDEFGHIJKLMNO';
const videoId = 'drive:' + id;
const uid = 'a'.repeat(32);
const host = 'customer-example123.cloudflarestream.com';
const video = { id: videoId, provider: 'drive', providerId: id, dance: 'Salsa', folderId: '1lVR5Pc-6SupJOfLIhcRE-oo69FUDM5Sm', size: 102400, filename: '0001.mp4' };
const catalogue = { rootFolderId: '1elTpDpgefwwlnrSEFc8vyREt3HUpDS8P', videos: [video] };
const publicConfig = { supabaseUrl: 'https://example.supabase.co', supabasePublishableKey: 'sb_publishable_test_key' };
const enabled = key => ({ BAILACUE_STREAM_ENABLED:'true', BAILACUE_CLOUDFLARE_ACCOUNT_ID:'b'.repeat(32), BAILACUE_CLOUDFLARE_API_TOKEN:'private-test-token' })[key] || '';
const request = (action, body = {}, bearer = true, origin = 'https://example.test') => new Request('https://example.test/api/stream/' + action, {
  method:'POST',
  headers: { 'Content-Type':'application/json', Origin: origin, ...(bearer ? {Authorization:'Bearer owner.jwt.token'} : {}) },
  body: JSON.stringify(body),
});

test('video source validator accepts only ready Cloudflare video URLs', () => {
  const row = { provider: 'cloudflare-stream', status:'ready', uid, host };
  assert.equal(parseStreamDelivery(row).uid, uid);
  assert.equal(streamEmbedUrl(row), `https://${host}/${uid}/iframe?preload=auto`);
  assert.equal(parseStreamDelivery({ ...row, host:'evil.example.test' }), null);
  assert.equal(parseStreamDelivery({ ...row, uid:'../bad' }), null);
  assert.equal(parseStreamDelivery({ ...row, signed:true }), null);
  assert.equal(parseStreamDelivery({ ...row, status:'pending' }), null);
  assert.equal(streamFromApi({ uid, playback:{hls:`https://evil.test/${uid}/manifest/video.m3u8`} }), null);
  assert.ok(streamFromApi({ uid, playback:{hls:`https://${host}/${uid}/manifest/video.m3u8`} }));
});

test('delivery preparation fails closed before paid activation', async () => {
  const mock = async () => { throw new Error('No remote access expected.'); };
  const handler = createStreamHandler({ catalogue, publicConfig, env: () => '', fetcher: mock });
  const config = await handler(new Request('https://example.test/api/stream/config'));
  assert.deepEqual(await config.json(), { enabled:false, provider:'cloudflare-stream' });
  const reply = await handler(request('prepare', { videoId }));
  assert.equal(reply.status, 503);
});

test('owner-only API rejects visitors and cross-site writes without touching Cloudflare', async () => {
  const handler = createStreamHandler({ catalogue, publicConfig, env: enabled, fetcher: async () => { throw Error('No remote access expected'); } });
  assert.equal((await handler(request('prepare', {videoId}, false))).status, 403);
  assert.equal((await handler(request('prepare', {videoId}, true, 'https://untrusted.test'))).status, 403);
});

function server(overrides = {}) {
  const calls = [], publications = [];
  const fetcher = async (url, init = {}) => {
    calls.push({ url, init });
    if (url.endsWith('/auth/v1/user')) return Response.json({ id: owner });
    if (url.includes('bailacue_web_admins')) return Response.json([{ user_id: owner }]);
    if (url.includes('api.cloudflare.com') && url.includes('direct_user=true')) {
      return new Response(null, { status: 201, headers: {Location:'https://upload.videodelivery.net/tus-fake-token', 'stream-media-id':uid} });
    }
    if (url.includes('api.cloudflare.com') && url.endsWith('/' + uid)) {
      const details = { uid, meta:{sourceid:videoId}, status:{state:'ready',pctComplete:'100'}, readyToStream:true, playback:{hls:`https://${host}/${uid}/manifest/video.m3u8`}, ...overrides };
      return Response.json({success:true, result:details});
    }
    if (url.includes('/rest/v1/bailacue_web_content?on_conflict=key')) {
      publications.push(JSON.parse(init.body));
      return new Response(null,{status:204});
    }
    throw new Error('Unexpected network request to ' + url);
  };
  return { handler: createStreamHandler({catalogue, publicConfig, env: enabled, fetcher}), calls, publications };
}

test('owner can reserve a bounded tus upload without publishing unprocessed video', async () => {
  const { handler, calls, publications } = server();
  const body = { videoId, file:{name:'0001.mp4',size:video.size,durationSeconds:120} };
  const response = await handler(request('prepare', body));
  assert.equal(response.status, 201);
  const result = await response.json();
  assert.equal(result.uid, uid);
  assert.equal(result.chunkSize, 10 * 1024 * 1024);
  const call = calls.find(x=>x.url.includes('direct_user=true'));
  assert.equal(call.init.headers['Upload-Length'], String(video.size));
  assert.equal(call.init.headers['Tus-Resumable'], '1.0.0');
  assert.match(call.init.headers['Upload-Metadata'], /sourceid /);
  assert.equal(publications.length, 0);
  const wrongFile = await handler(request('prepare', {videoId, file:{...body.file,size:video.size+1}}));
  assert.equal(wrongFile.status,400);
  const unknown = await handler(request('prepare', {videoId:'drive:unknownFile999999',file:body.file}));
  assert.equal(unknown.status,404);
});

test('only a fully ready, matching provider copy is published for public playback', async () => {
  const { handler, publications } = server();
  const response = await handler(request('status',{videoId,uid}));
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.status,'ready');
  assert.equal(publications.length,1);
  assert.equal(publications[0][0].key,'stream:'+videoId);
  assert.equal(publications[0][0].payload.host,host);
});

test('processing and unbound copies never become public', async () => {
  const processing = server({readyToStream:false,status:{state:'inprogress',pctComplete:'45'}});
  assert.equal((await processing.handler(request('status',{videoId,uid}))).status,200);
  assert.equal(processing.publications.length,0);
  const unbound = server({meta:{sourceid:'drive:someone-else-123456789'}});
  assert.equal((await unbound.handler(request('status',{videoId,uid}))).status,403);
  assert.equal(unbound.publications.length,0);
});

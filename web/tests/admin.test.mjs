import test from 'node:test';
import assert from 'node:assert/strict';
import { BailaCueAdmin } from '../admin.mjs';

const URL = 'https://example.supabase.co';
const KEY = 'sb_publishable_test_only';
const OWNER = '11111111-1111-4111-8111-111111111111';

test('a visitor can browse but cannot publish without owner login', async () => {
  const client = new BailaCueAdmin();
  client.configure({ supabaseUrl: URL, supabasePublishableKey: KEY });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    assert.equal(init.headers.apikey, KEY);
    assert.equal(init.headers.Authorization, undefined);
    assert.match(url, /bailacue_web_content/);
    return Response.json([{ key: 'labels', payload: { items: [] } }]);
  };
  try {
    assert.equal(client.isAdmin, false);
    assert.equal((await client.readContent()).length, 1);
    await assert.rejects(() => client.put('labels', { items: [] }), /Only the BailaCue administrator/);
    await assert.rejects(() => client.remove('labels'), /Only the BailaCue administrator/);
  } finally { globalThis.fetch = originalFetch; }
});

test('verified owner session persists across page loads and controls writes', async () => {
  const originalFetch = globalThis.fetch, originalStorage = globalThis.localStorage;
  const entries = new Map();
  globalThis.localStorage = {
    getItem: key => entries.get(key) ?? null,
    setItem: (key, value) => entries.set(key, value),
    removeItem: key => entries.delete(key),
  };
  const requests = [];
  globalThis.fetch = async (url, init = {}) => {
    requests.push({ url, init });
    if (url.includes('grant_type=password')) return Response.json({ access_token: 'owner-jwt', refresh_token: 'refresh-token', expires_in: 3600 });
    if (url.endsWith('/auth/v1/user')) return Response.json({ id: OWNER });
    if (url.includes('bailacue_web_admins')) return Response.json([{ user_id: OWNER }]);
    if (url.endsWith('/auth/v1/logout')) return new Response(null, { status: 204 });
    if (url.includes('bailacue_web_content')) return new Response(null, { status: 204 });
    throw Error('Unexpected request: ' + url);
  };
  try {
    const admin = new BailaCueAdmin();
    assert.equal(admin.configure({ supabaseUrl: URL, supabasePublishableKey: KEY }), true);
    await admin.signIn('owner@example.test', 'fake-password');
    assert.equal(admin.isAdmin, true);
    assert.ok(entries.size);
    await admin.put('labels', { items: [] });
    assert.ok(requests.some(x => x.url.includes('bailacue_web_content') && x.init.headers.Authorization === 'Bearer owner-jwt'));
    const resumed = new BailaCueAdmin();
    resumed.configure({ supabaseUrl: URL, supabasePublishableKey: KEY });
    assert.equal(await resumed.restore(), true);
    await resumed.signOut();
    assert.equal(resumed.isAdmin, false);
    assert.equal(entries.size, 0);
    await assert.rejects(() => resumed.put('labels', {}), /Only the BailaCue administrator/);
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.localStorage = originalStorage;
  }
});

test('a signed-in account not in the owner allowlist is rejected', async () => {
  const originalFetch = globalThis.fetch, originalStorage = globalThis.localStorage;
  const entries = new Map();
  globalThis.localStorage = { getItem: k => entries.get(k) ?? null, setItem: (k,v) => entries.set(k,v), removeItem: k => entries.delete(k) };
  globalThis.fetch = async url => {
    if (url.includes('grant_type=password')) return Response.json({ access_token: 'other-jwt', refresh_token: 'other-refresh', expires_in: 3600 });
    if (url.endsWith('/auth/v1/user')) return Response.json({ id: '22222222-2222-4222-8222-222222222222' });
    if (url.includes('bailacue_web_admins')) return Response.json([]);
    throw Error('Unexpected request: ' + url);
  };
  try {
    const admin = new BailaCueAdmin();
    admin.configure({ supabaseUrl: URL, supabasePublishableKey: KEY });
    await assert.rejects(() => admin.signIn('another@example.test', 'fake-password'), /not authorized/);
    assert.equal(admin.isAdmin, false);
    assert.equal(entries.size, 0);
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.localStorage = originalStorage;
  }
});

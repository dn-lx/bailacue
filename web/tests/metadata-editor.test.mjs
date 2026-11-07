import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const catalogue = JSON.parse(readFileSync(new URL('../catalogue.json', import.meta.url), 'utf8'));
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
let instance = 0;
async function until(check) {
  for (let i = 0; i < 150; i++) { if (check()) return; await pause(20); }
  assert.fail('The interface did not reach the expected state.');
}

async function visitor(rows) {
  const dom = new JSDOM(html, { url: 'https://bailacue.test/#library', pretendToBeVisual: true });
  const { window } = dom, descriptors = new Map(), timers = new Set(), intervals = new Set();
  const originalTimeout = globalThis.setTimeout, originalInterval = globalThis.setInterval;
  const expose = (key, value) => {
    descriptors.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  };
  for (const key of ['window','document','location','history','navigator','localStorage','sessionStorage','Element','HTMLElement','HTMLButtonElement','HTMLDialogElement','HTMLMediaElement','Event']) expose(key, key==='window' ? window : window[key]);
  window.matchMedia = query => ({ matches: query.includes('min-width'), addEventListener() {}, removeEventListener() {} });
  window.scrollTo = () => {};
  window.HTMLElement.prototype.scrollIntoView = () => {};
  window.HTMLMediaElement.prototype.pause = () => {};
  window.HTMLMediaElement.prototype.load = () => {};
  window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  window.HTMLDialogElement.prototype.close = function () { this.open = false; this.dispatchEvent(new window.Event('close')); };
  expose('setTimeout', (fn,ms,...args) => { const id=originalTimeout(fn,ms,...args); timers.add(id); return id; });
  expose('setInterval', (fn,ms,...args) => { const id=originalInterval(fn,ms,...args); intervals.add(id); return id; });
  expose('requestAnimationFrame', fn => setTimeout(fn,0));
  let failPublication=false, writes=0, authenticationRequests=0;
  const patches=[];
  expose('fetch', async (url, options={}) => {
    const path=String(url);
    if (path==='/public-config.json') return Response.json({supabaseUrl:'https://qa.supabase.co',supabasePublishableKey:'sb_publishable_fixture'});
    if (path==='/catalogue.json') return Response.json(catalogue);
    if (path.includes('/auth/') || path.includes('bailacue_web_admins')) { authenticationRequests++; throw Error('A guest editor must not authenticate'); }
    assert.equal(options.headers.Authorization, undefined, 'Public requests must not require a session');
    if (path.endsWith('/rpc/bailacue_patch_web_metadata')) {
      if (failPublication) return Response.json({message:'Fixture offline'},{status:503});
      const {p_video_id,p_patch}=JSON.parse(options.body), key='meta:'+p_video_id;
      const canonical={...rows.get(key),...p_patch};
      rows.set(key,canonical); writes++; patches.push(p_patch);
      return Response.json(canonical);
    }
    if (path.endsWith('/rpc/bailacue_add_web_label')) {
      const {p_name,p_type,p_dance}=JSON.parse(options.body);
      const label={id:'custom-fixture-'+rows.get('labels').items.length,name:p_name,type:p_type,dance:p_dance};
      rows.get('labels').items.push(label);
      return Response.json(label);
    }
    if (path.includes('bailacue_web_content') && (!options.method || options.method==='GET')) return Response.json([...rows].map(([key,payload])=>({key,payload})));
    throw Error('Unexpected public editing request: '+path);
  });
  const $ = selector => window.document.querySelector(selector);
  const fill = (selector,value,event='input') => { $(selector).value=value; $(selector).dispatchEvent(new window.Event(event,{bubbles:true})); };
  const close=()=>{
    for (const timer of timers) clearTimeout(timer);
    for (const interval of intervals) clearInterval(interval);
    dom.window.close();
    for (const [key,descriptor] of descriptors) {
      if (descriptor) Object.defineProperty(globalThis,key,descriptor);
      else delete globalThis[key];
    }
  };
  try {
    await import(`../app.js?public-metadata-regression=${++instance}`);
    await until(()=>$('#page [data-action="open"]'));
  } catch(error) { const message=$('#page').textContent; close(); throw new Error(message,{cause:error}); }
  return {$,fill,close,window,patches,fail(value){failPublication=value;},get writes(){return writes;},get authenticationRequests(){return authenticationRequests;}};
}

test('guests edit, create labels and artists, save, retry and share metadata across fresh browsers without sign-in', async () => {
  const rows=new Map([['labels',{items:[
    {id:'qa-style',name:'Partnerwork',type:'Technique',dance:'Both'},
    {id:'qa-artist',name:'Test teacher',type:'Artist',dance:'Both'},
  ]}]]);
  let h=await visitor(rows), videoId;
  try {
    const {$,fill}=h;
    videoId=$('#page [data-action="open"]').dataset.id;
    $('#page [data-action="open"]').click();
    const video=$('#video-frame video'); video.currentTime=15;
    assert.equal($('#video-details-editor').hidden,false);
    assert.equal($('#video-details-editor').hasAttribute('data-admin-only'),false);
    assert.equal($('#rating-buttons [data-rating="8"]').disabled,false);
    assert.equal(h.window.document.body.classList.contains('is-admin'),false);
    assert.equal($('[data-action="edit-video-details"]'),null);
    assert.equal($('#video-details-summary'),null);
    assert.equal($('#admin-dialog').open,false);
    assert.equal($('#video-frame video'),video); assert.equal(video.currentTime,15);
    fill('#personal-title','Editable partnerwork');
    fill('#notes','Keep the weight transfer smooth.');
    fill('#detail-event','Evening class','change');
    fill('#detail-location','Valencia','change');
    fill('#detail-recorded','2026-11-06','change');
    $('#detail-labels [data-id="qa-style"]').click();
    $('#detail-artists [data-id="qa-artist"]').click();
    fill('#detail-artists .picker-search','New public teacher');
    $('#detail-artists .picker-create button').click();
    await until(()=>$('#detail-artists .selected-tags').textContent.includes('New public teacher'));
    $('[data-action="rate"][data-rating="8"]').click();
    await until(()=>$('#note-status').textContent==='All changes saved');
    const addedArtist=rows.get('labels').items.find(l=>l.name==='New public teacher');
    assert.deepEqual(rows.get('meta:'+videoId),{
      title:'Editable partnerwork',notes:'Keep the weight transfer smooth.',
      labelIds:['qa-style'],artistIds:['qa-artist',addedArtist.id],recordedAt:'2026-11-06',
      event:'Evening class',location:'Valencia',rating:8,
    });
    assert.equal($('#player-title').textContent,'Editable partnerwork');
    assert.equal($('#video-details-editor').hidden,false);
    h.fail(true); fill('#notes','Retry this public change.');
    await until(()=>!$('#retry-video-save').hidden);
    assert.match($('#note-status').textContent,/could not be published/);
    h.fail(false); $('#retry-video-save').click();
    await until(()=>$('#note-status').textContent==='All changes saved');
    assert.equal(rows.get('meta:'+videoId).notes,'Retry this public change.');
    assert.deepEqual(h.patches.at(-1),{notes:'Retry this public change.'},'A single-field change must not overwrite unrelated shared fields');
    assert.equal(h.authenticationRequests,0);
    assert(h.writes>0);
  } finally { h.close(); }
  h=await visitor(rows);
  try {
    h.fill('#search','Editable partnerwork');
    await until(()=>h.$(`#page [data-action="open"][data-id="${videoId}"]`));
    h.$(`#page [data-action="open"][data-id="${videoId}"]`).click();
    assert.equal(h.$('#video-details-editor').hidden,false);
    assert.equal(h.$('#personal-title').value,'Editable partnerwork');
    assert.equal(h.$('#notes').value,'Retry this public change.');
    assert.equal(h.$('#detail-recorded').value,'2026-11-06');
    assert.match(h.$('#detail-artists .selected-tags').textContent,/New public teacher/);
    assert.equal(h.authenticationRequests,0);
  } finally { h.close(); }
});

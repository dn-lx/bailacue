import { createPhotosSession, selectedPhotosVideos, endPhotosSession } from './photos-picker.mjs';
import { renderBrowserCompressor } from './browser-compressor.mjs';
import { LABEL_TYPES, createLabel, normalizeName, nextNumber, numberedName } from './studio-model.mjs';
import { SOURCES } from './core.mjs';
import { parseOptimizedManifest, OPTIMIZED_ROOT } from './optimized-delivery.mjs';
export function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]); }
const esc = escapeHtml;
let pickerSequence = 0;
/** Searchable, multi-select dropdown with keyboard navigation and explicit creation. */
export function labelPicker(container, { labels, selected = [], title, artists = false, allowCreate = false, dance = 'Both', onChange, onCreate = (name, type, dance) => null }) {
  const id = `picker-${++pickerSequence}`, chosen = new Set(selected); let active = -1;
  container.innerHTML = `<details class="label-picker"><summary>${esc(title)} <span class="picker-count">${chosen.size || ''}</span></summary><div class="picker-panel"><input type="search" class="picker-search" role="combobox" aria-expanded="false" aria-controls="${id}" aria-autocomplete="list" placeholder="${artists ? 'Search artists or teachers…' : 'Search styles, technique, level…'}" aria-label="${esc(title)}"><div class="picker-options" role="listbox" aria-label="${esc(title)}" aria-multiselectable="true" id="${id}"></div><div class="picker-create"></div></div></details><div class="selected-tags"></div>`;
  const details = container.querySelector('details'), search = container.querySelector('input'), list = container.querySelector('.picker-options'), create = container.querySelector('.picker-create'), tags = container.querySelector('.selected-tags');
  const available = () => labels().filter(l => (artists ? l.type === 'Artist' : l.type !== 'Artist') && (!dance || dance === 'Both' || l.dance === 'Both' || l.dance === dance));
  function refresh() {
    const query = normalizeName(search.value), matches = available().filter(l => normalizeName(`${l.name} ${l.type} ${l.dance}`).includes(query)); active = -1; search.removeAttribute('aria-activedescendant');
    list.innerHTML = matches.length ? matches.map((l, i) => `<button type="button" role="option" id="${id}-${i}" data-id="${esc(l.id)}" aria-selected="${chosen.has(l.id)}" class="picker-option"><span>${esc(l.name)}<small>${esc(l.type)}${l.dance !== 'Both' ? ` · ${l.dance}` : ''}</small></span><span aria-hidden="true">${chosen.has(l.id) ? '✓' : '+'}</span></button>`).join('') : '<p class="picker-empty">No matching labels.</p>';
    create.innerHTML = allowCreate && query && !available().some(l => normalizeName(l.name) === query) ? `<button type="button" class="text-button">+ Create ${esc(artists ? 'artist' : 'label')} “${esc(search.value.trim())}”</button>` : '';
    create.querySelector('button')?.addEventListener('click', async event => {
      const button = event.currentTarget; button.disabled = true;
      try { const label = await onCreate(search.value.trim(), artists ? 'Artist' : 'Technique', dance); if (label) { chosen.add(label.id); search.value = ''; commit(); } }
      finally { if (button.isConnected) button.disabled = false; }
    });
    list.querySelectorAll('button').forEach(button => button.addEventListener('click', () => { const id = button.dataset.id; chosen.has(id) ? chosen.delete(id) : chosen.add(id); commit(); search.focus(); }));
    tags.innerHTML = labels().filter(l => chosen.has(l.id)).map(l => `<button type="button" class="tag" data-id="${esc(l.id)}" aria-label="Remove ${esc(l.name)}">${esc(l.name)} <span aria-hidden="true">×</span></button>`).join('');
    tags.querySelectorAll('button').forEach(button => button.addEventListener('click', () => { chosen.delete(button.dataset.id); commit(); }));
    container.querySelector('.picker-count').textContent = chosen.size ? String(chosen.size) : '';
  }
  function commit() { onChange([...chosen]); refresh(); }
  search.addEventListener('input', refresh);
  details.addEventListener('toggle', () => { search.setAttribute('aria-expanded', String(details.open)); if (details.open) search.focus(); });
  search.addEventListener('keydown', event => {
    const options = [...list.querySelectorAll('button')];
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); details.open = false; details.querySelector('summary').focus(); }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); if (!details.open) details.open = true; active = Math.max(0, Math.min(options.length - 1, active + (event.key === 'ArrowDown' ? 1 : -1))); search.setAttribute('aria-activedescendant', options[active]?.id || ''); options.forEach((el, i) => el.classList.toggle('keyboard-active', i === active)); options[active]?.scrollIntoView({ block: 'nearest' }); }
    if (event.key === 'Enter') { event.preventDefault(); options[active]?.click(); }
  });
  refresh();
}
export function renderLabelManager(page, ctx) {
  page.innerHTML = `<div class="page-heading"><div><span class="eyebrow">YOUR DANCE VOCABULARY</span><h1>Make it easy to find.</h1><p>Styles, technique, artists and teachers. Your labels, your way.</p></div></div><div class="label-workspace"><section class="editor-panel"><h2>Create a label</h2><form id="label-form"><label class="field"><span class="field-label">Name</span><input id="new-label-name" maxlength="80" required placeholder="e.g. Salsa Romántica"></label><div class="form-columns"><label class="field"><span class="field-label">Type</span><select id="new-label-type">${LABEL_TYPES.map(t => `<option>${t}</option>`).join('')}</select></label><label class="field"><span class="field-label">Dance</span><select id="new-label-dance"><option>Both</option><option>Salsa</option><option>Bachata</option></select></label></div><p class="form-error" id="label-error" role="alert"></p><button class="button primary" type="submit">Create label</button></form><p class="helper-text">Use labels for styles, techniques and levels. Choose Artist for teachers or performers.</p></section><section class="label-directory"><div class="directory-toolbar"><label class="search-box"><input id="manage-label-search" type="search" placeholder="Search labels and artists" aria-label="Search labels and artists"></label><select id="manage-label-type" aria-label="Filter label type"><option value="">All types</option>${LABEL_TYPES.map(t => `<option>${t}</option>`).join('')}</select></div><div id="label-list"></div></section></div>`;
  const render = () => {
    const query = normalizeName(page.querySelector('#manage-label-search').value), type = page.querySelector('#manage-label-type').value;
    const labels = ctx.state().labels.filter(l => (!type || l.type === type) && normalizeName(`${l.name} ${l.type} ${l.dance}`).includes(query));
    const list = page.querySelector('#label-list');
    list.innerHTML = labels.length ? labels.map(l => `<article class="label-row"><span class="label-symbol" aria-hidden="true">${l.type === 'Artist' ? 'A' : '#'}</span><div class="label-row-main"><strong>${esc(l.name)}</strong><span>${esc(l.type)} · ${esc(l.dance)} · ${Object.values(ctx.state().meta).filter(m => [...(m.labelIds || []), ...(m.artistIds || [])].includes(l.id)).length} videos</span></div><button class="text-button" data-edit="${esc(l.id)}" aria-label="Edit ${esc(l.name)}">Edit</button><button class="icon-button" data-delete="${esc(l.id)}" aria-label="Delete ${esc(l.name)}">×</button></article>`).join('') : '<div class="empty-state"><h3>No matching labels.</h3><p>Create one or try another search.</p></div>';
    list.querySelectorAll('[data-edit]').forEach(button => button.addEventListener('click', () => {
      const label = ctx.state().labels.find(l => l.id === button.dataset.edit);
      const row = button.closest('article'); row.innerHTML = `<form class="inline-label-editor"><input aria-label="Label name" value="${esc(label.name)}" required maxlength="80"><button class="button primary small">Save</button><button type="button" class="button subtle small">Cancel</button></form>`;
      row.querySelector('input').focus(); row.querySelector('button[type=button]').onclick = render;
      row.querySelector('form').onsubmit = event => { event.preventDefault(); const name = row.querySelector('input').value.trim(); if (!name || ctx.state().labels.some(l => l.id !== label.id && l.type === label.type && normalizeName(l.name) === normalizeName(name))) { ctx.toast('A label with that name and type already exists.'); return; } label.name = name; ctx.save(); render(); };
    }));
    list.querySelectorAll('[data-delete]').forEach(button => button.addEventListener('click', () => {
      const label = ctx.state().labels.find(l => l.id === button.dataset.delete); const dialog = document.createElement('dialog');
      dialog.innerHTML = `<h2>Delete “${esc(label.name)}”?</h2><p class="muted">This removes the label from every video in this browser. Video files are kept.</p><div class="dialog-footer"><button class="button subtle" data-cancel>Keep label</button><button class="button danger" data-confirm>Delete label</button></div>`; document.body.append(dialog); dialog.showModal();
      dialog.querySelector('[data-cancel]').addEventListener('click', () => dialog.close()); dialog.addEventListener('close', () => dialog.remove());
      dialog.querySelector('[data-confirm]').addEventListener('click', () => { ctx.state().labels = ctx.state().labels.filter(l => l.id !== label.id); for (const meta of Object.values(ctx.state().meta)) { meta.labelIds = (meta.labelIds || []).filter(id => id !== label.id); meta.artistIds = (meta.artistIds || []).filter(id => id !== label.id); } ctx.save(); dialog.close(); render(); ctx.toast('Label removed from your videos'); });
    }));
  };
  page.querySelector('#label-form').onsubmit = event => { event.preventDefault(); try { const name = page.querySelector('#new-label-name').value, type = page.querySelector('#new-label-type').value, dance = page.querySelector('#new-label-dance').value; const before = ctx.state().labels.length; createLabel(ctx.state().labels, name, type, dance); if (before === ctx.state().labels.length) throw new Error('This label already exists. Select it in a video’s dropdown.'); ctx.save(); page.querySelector('#new-label-name').value = ''; page.querySelector('#label-error').textContent = ''; render(); ctx.toast('Label created'); } catch (error) { page.querySelector('#label-error').textContent = error.message; } };
  page.querySelector('#manage-label-search').oninput = render; page.querySelector('#manage-label-type').onchange = render; render();
}

let photosSession;
let photosImporting = false;
const uploadSession = { files: [], jobs: new Map(), running: false, controller: null, labelIds: [], artistIds: [], dance: 'Salsa', recordedAt: '', notes: '' };
export function uploadRunning() { return uploadSession.running; }
export function renderUpload(page, ctx) {
  const connection = ctx.connection;
  page.innerHTML = `<div class="page-heading"><div><h1>Add videos</h1></div></div><section id="browser-compression" aria-labelledby="browser-compress-title" hidden></section><div class="upload-layout"><section class="upload-main"><label class="drop-zone" id="drop-zone"><span class="upload-mark" aria-hidden="true">↑</span><strong>Choose videos</strong><span>Photos or Files · select multiple</span><input id="upload-files" type="file" accept="video/*,.mkv,.avi,.m4v" multiple></label><div class="upload-actions"><button class="button subtle" type="button" id="google-photos-start">Choose from Google Photos</button></div><p class="helper-text" id="google-photos-status" role="status"></p><div class="upload-list" id="upload-list"></div><section class="editor-panel upload-details"><h2>Organise before you upload</h2><p class="helper-text">Applies to all selected videos. The upload date is saved automatically from Google Drive; “Recorded on” is optional and can be edited later.</p><div class="form-columns"><label class="field"><span class="field-label">Destination</span><select id="upload-dance"><option>Salsa</option><option>Bachata</option></select></label><label class="field"><span class="field-label">Recorded on <span class="field-optional">(optional)</span></span><input type="date" id="upload-recorded"></label></div><div class="form-columns"><div id="upload-labels"></div><div id="upload-artists"></div></div><label class="field"><span class="field-label">Notes</span><textarea id="upload-notes" rows="3" maxlength="10000" placeholder="Class, move, or something to remember…"></textarea></label></section><p class="form-error" id="upload-error" role="alert"></p><div class="upload-actions"><button class="button primary" id="upload-start">Upload to Drive</button><button class="button subtle" id="upload-pause" disabled>Pause upload</button><button class="text-button" id="upload-replan">Recheck number</button></div><progress id="upload-progress" value="0" max="100" aria-label="Upload progress"></progress><p id="upload-status" class="helper-text" role="status">Choose videos to get started. Nothing uploads until you press Upload.</p></section><aside class="upload-aside"><section class="connection-card"><span class="eyebrow">GOOGLE DRIVE</span><h2>${connection.connected ? 'Connected' : 'Not connected'}</h2><button class="button ${connection.connected ? 'subtle' : 'primary'}" id="connect-google">${connection.connected ? 'Disconnect Google' : 'Connect Google'}</button><p id="connection-status" role="status" class="helper-text">${connection.connected ? 'Ready to upload.' : (connection.clientId ? 'Connect to upload or compress.' : 'Google Drive configuration is unavailable. Reload this page to retry.')}</p></section><section class="numbering-card"><span class="eyebrow">NEXT VIDEO</span><div class="number-example">0115<span>.mp4</span></div></section><section class="source-links">${SOURCES.map(s => `<a href="https://drive.google.com/drive/folders/${s.folderId}" target="_blank" rel="noopener noreferrer">Open ${s.dance} folder <span aria-hidden="true">↗</span></a>`).join('')}<button class="text-button" id="refresh-drive">Refresh both collections</button></section><details class="connection-card" id="optimized-card"><summary title="Advanced playback-copy tools">Advanced tools</summary><p class="helper-text">Use these only when importing playback copies created outside BailaCue.</p><a href="http://127.0.0.1:38221/" target="_blank" rel="noopener noreferrer" title="Open the local FFmpeg converter if it is running">Local converter</a> · <a href="https://github.com/dn-lx/bailacue/tree/develop/ipad-processor" target="_blank" rel="noopener noreferrer" title="Experimental iPad converter source">iPad prototype</a> · <a href="https://drive.google.com/drive/folders/${OPTIMIZED_ROOT}" target="_blank" rel="noopener noreferrer">Playback folders</a><label class="field"><span class="field-label">Playback manifest <span title="Import mappings for externally compressed video copies">ⓘ</span></span><input id="optimized-manifest-file" type="file" accept=".json,application/json"></label><button class="button subtle small" type="button" id="optimized-manifest-import" title="Publish the imported playback-copy mappings">Publish copies</button><p id="optimized-import-status" role="status" class="helper-text"></p></details></aside></div>`;
  async function connectGoogle() {
    if (connection.connected) return;
    try {
      await connection.connect();
      ctx.toast('Google Drive connected for this session');
      renderUpload(page, ctx);
    } catch (error) {
      page.querySelector('#connection-status').textContent = error.message;
      throw error;
    }
  }
  renderBrowserCompressor(page.querySelector('#browser-compression'), ctx);
  const fileInput = page.querySelector('#upload-files'), danceInput = page.querySelector('#upload-dance'), status = page.querySelector('#upload-status');
  danceInput.value = uploadSession.dance;
  page.querySelector('#upload-recorded').value = uploadSession.recordedAt;
  page.querySelector('#upload-notes').value = uploadSession.notes;
  page.querySelector('#upload-recorded').oninput = event => uploadSession.recordedAt = event.target.value;
  page.querySelector('#upload-notes').oninput = event => uploadSession.notes = event.target.value;
  uploadSession.labelIds = uploadSession.labelIds.filter(id => ctx.state().labels.some(label => label.id === id));
  uploadSession.artistIds = uploadSession.artistIds.filter(id => ctx.state().labels.some(label => label.id === id));
  const makeLabel = (name, type, dance) => { try { const label = createLabel(ctx.state().labels, name, type, dance); ctx.save(); return label; } catch (error) { ctx.toast(error.message); } };
  labelPicker(page.querySelector('#upload-labels'), { title: 'Labels', labels: () => ctx.state().labels, selected: uploadSession.labelIds, allowCreate: true, onChange: ids => uploadSession.labelIds = ids, onCreate: makeLabel });
  labelPicker(page.querySelector('#upload-artists'), { title: 'Artists & teachers', labels: () => ctx.state().labels, selected: uploadSession.artistIds, artists: true, allowCreate: true, onChange: ids => uploadSession.artistIds = ids, onCreate: makeLabel });
  function renderFiles() {
    let next = nextNumber(ctx.videos().filter(v => v.dance === danceInput.value).map(v => v.filename || v.title), ctx.state().numbering[danceInput.value]);
    const example = page.querySelector('.number-example'); if (example) example.innerHTML = `${String(next).padStart(4, '0')}<span>.mp4</span>`;
    page.querySelector('#upload-list').innerHTML = uploadSession.files.map((file, index) => {
      const job = uploadSession.jobs.get(file), proposed = job?.name || numberedName(next++, file.name);
      return `<article class="upload-file"><span class="file-number">${esc(proposed)}</span><div><strong>${esc(file.name)}</strong><small>${(file.size / 1048576).toFixed(1)} MB${job?.completed ? ' · Uploaded' : ''}</small></div><button class="text-button" data-preview="${index}">Preview</button></article>`;
    }).join('');
    page.querySelectorAll('[data-preview]').forEach(button => button.addEventListener('click', () => ctx.preview(uploadSession.files[Number(button.dataset.preview)])));
    page.querySelector('#upload-start').disabled = uploadSession.running || photosImporting || !uploadSession.files.length;
    page.querySelector('#upload-pause').disabled = !uploadSession.running;
    for (const selector of ['#connect-google', '#google-photos-start', '#refresh-drive', '#upload-replan', '[data-preview]']) page.querySelectorAll(selector).forEach(button => button.disabled = uploadSession.running || photosImporting);
    danceInput.disabled = uploadSession.running || [...uploadSession.jobs.values()].some(job => job.session || job.completed);
  }
  fileInput.addEventListener('change', () => { if (uploadSession.running) return; try { const files = [...fileInput.files]; for (const file of files) numberedName(1, file.name); uploadSession.files = files; uploadSession.jobs.clear(); page.querySelector('#upload-error').textContent = ''; status.textContent = `${files.length} video${files.length === 1 ? '' : 's'} selected. Review the destination and details.`; renderFiles(); } catch (error) { page.querySelector('#upload-error').textContent = error.message; } });
  const photosStart = page.querySelector('#google-photos-start');
  const photosStatus = page.querySelector('#google-photos-status');
  let photosPending = false;
  let photosPickerTab = null;
  let photosPollTimer = null;
  function stopPhotosPolling() { if (photosPollTimer) clearInterval(photosPollTimer); photosPollTimer = null; }
  async function importPhotosOnReturn() {
    if (!page.isConnected || !photosPending || !photosSession || photosImporting || uploadSession.running) return;
    photosImporting = true;
    photosStatus.textContent = 'Checking selected videos…';
    renderFiles();
    const session = photosSession;
    try {
      const count = await selectedPhotosVideos(session, file => {
        numberedName(1, file.name);
        uploadSession.files.push(file);
        photosStatus.textContent = 'Adding selected videos…';
        renderFiles();
      });
      photosPending = false;
      photosSession = null;
      stopPhotosPolling();
      if (photosPickerTab && !photosPickerTab.closed) photosPickerTab.close();
      photosPickerTab = null;
      photosStatus.textContent = count ? `${count} video${count === 1 ? '' : 's'} ready to upload.` : 'No videos selected.';
      void endPhotosSession(session);
    } catch (error) {
      photosStatus.textContent = /Finish selecting your videos/.test(error.message)
        ? 'Select videos and tap Done in Google Photos, then return here.'
        : error.message;
      if (!/Finish selecting your videos/.test(error.message)) { photosPending = false; stopPhotosPolling(); }
    } finally {
      photosImporting = false;
      renderFiles();
    }
  }
  window.addEventListener('focus', () => { if (page.isConnected) void importPhotosOnReturn(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && page.isConnected) void importPhotosOnReturn(); });
  photosStart.onclick = async () => {
    if (photosPending && photosSession) {
      if (!photosPickerTab || photosPickerTab.closed) photosPickerTab = window.open(photosSession.url, '_blank');
      else photosPickerTab.focus();
      return;
    }
    // Open a blank tab synchronously so iOS Safari/Chrome does not block
    // the Photos picker after the asynchronous Google authorization request.
    const pickerTab = window.open('about:blank', '_blank');
    photosPickerTab = pickerTab;
    photosStart.disabled = true;
    photosStatus.textContent = 'Connecting to Google Photos…';
    try {
      const session = await createPhotosSession(connection);
      if (photosSession) void endPhotosSession(photosSession);
      photosSession = session;
      photosPending = true;
      photosStatus.textContent = 'Select videos, tap Done, then return here. They will be added automatically.';
      if (pickerTab && !pickerTab.closed) {
        pickerTab.location.replace(session.url);
        stopPhotosPolling();
        photosPollTimer = setInterval(() => { if (page.isConnected && photosPending && !photosImporting) void importPhotosOnReturn(); }, 2500);
      } else photosStatus.textContent = 'Your browser blocked the picker tab. Allow pop-ups, then tap Choose from Google Photos again.';
    } catch (error) {
      pickerTab?.close();
      photosPickerTab = null;
      stopPhotosPolling();
      photosStatus.textContent = error.message;
    } finally {
      photosStart.disabled = uploadSession.running;
    }
  };
  danceInput.onchange = () => { uploadSession.dance = danceInput.value; renderFiles(); };
  page.querySelector('#connect-google').onclick = async () => {
    if (connection.connected) {
      connection.disconnect();
      ctx.toast('Disconnected. Your library is kept.');
      renderUpload(page, ctx);
      return;
    }
    try { await connectGoogle(); } catch { /* Connection status already shows the reason. */ }
  };
  page.querySelector('#refresh-drive').onclick = async () => { try { if (!connection.connected) throw new Error('Connect Google to refresh the live folders.'); status.textContent = 'Reading the two fixed folders…'; const all = []; for (const dance of ['Salsa', 'Bachata']) all.push(...(await connection.list(dance)).videos); ctx.state().drive = all; ctx.save(); status.textContent = `${all.length} videos refreshed from Drive. Personal labels and ratings are kept.`; } catch (error) { page.querySelector('#upload-error').textContent = error.message; } };
  page.querySelector('#upload-replan').onclick = () => { for (const [file, job] of uploadSession.jobs) if (!job.session && !job.completed) uploadSession.jobs.delete(file); renderFiles(); status.textContent = 'Numbers will be checked against Drive again before upload.'; };
  page.querySelector('#upload-pause').onclick = () => uploadSession.controller?.abort();
  page.querySelector('#upload-start').onclick = async () => {
    if (!connection.connected) { page.querySelector('#upload-error').textContent = 'Connect Google before uploading. You can preview selected videos now.'; return; }
    if (!uploadSession.files.length || uploadSession.running || photosImporting) return;
    const dance = danceInput.value, details = { labelIds: [...uploadSession.labelIds], artistIds: [...uploadSession.artistIds], recordedAt: page.querySelector('#upload-recorded').value, notes: page.querySelector('#upload-notes').value };
    uploadSession.running = true; uploadSession.controller = new AbortController(); fileInput.disabled = true; page.querySelector('#upload-error').textContent = ''; renderFiles();
    const uploaded = [];
    const run = async () => {
      for (const file of uploadSession.files) {
        let job = uploadSession.jobs.get(file); if (job?.completed) continue;
        if (!job) { status.textContent = `Checking ${dance} and reserving a filename…`; job = await connection.plan(file, dance, ctx.state().numbering[dance]); ctx.state().numbering[dance] = job.number; if (!ctx.save()) throw new Error('Browser storage must work before reserving a numbered upload. Export a backup and free some space.'); uploadSession.jobs.set(file, job); renderFiles(); }
        status.textContent = `Uploading ${job.name}… keep this tab open.`;
        const result = await connection.upload(job, (bytes, total) => { const percent = Math.floor(bytes / total * 100); page.querySelector('#upload-progress').value = percent; status.textContent = `${job.name} · ${percent}% uploaded`; }, uploadSession.controller.signal);
        ctx.state().drive = [...ctx.state().drive.filter(v => v.id !== result.id), result]; ctx.patchMeta(result.id, details); ctx.save(); renderFiles();
        uploaded.push(result);
      }
      status.textContent = 'Upload confirmed by Google Drive. Your videos are in the library.'; ctx.toast('Numbered videos uploaded to Drive');
    };
    try { if (navigator.locks) await navigator.locks.request(`bailacue-upload-${dance}`, run); else await run(); }
    catch (error) { if (error.name === 'AbortError') status.textContent = 'Paused. Press Upload to resume the same files in this tab.'; else { page.querySelector('#upload-error').textContent = error.message; status.textContent = 'Not completed. Retry resumes an existing session instead of creating a duplicate.'; } }
    finally {
      uploadSession.running = false; uploadSession.controller = null; fileInput.disabled = false; renderFiles();
      if (uploaded.length && ctx.admin.isAdmin) {
        page.querySelector('#browser-compression').dispatchEvent(new CustomEvent('bailacue-uploaded', { detail: uploaded }));
      }
    }
  };

  page.querySelector('#optimized-manifest-import').onclick = async () => {
    const output = page.querySelector('#optimized-import-status');
    const file = page.querySelector('#optimized-manifest-file').files?.[0];
    if (!ctx.admin?.isAdmin) { output.textContent = 'Sign in as the administrator before publishing.'; return; }
    if (!file) { output.textContent = 'Choose the manifest generated by the free local converter.'; return; }
    if (file.size > 512 * 1024) { output.textContent = 'Manifest is too large. Check the generated JSON.'; return; }
    let manifest;
    try { manifest = parseOptimizedManifest(JSON.parse(await file.text())); }
    catch { manifest = null; }
    if (!manifest) { output.textContent = 'Invalid BailaCue optimized manifest. No changes were published.'; return; }
    const originals = new Map(ctx.videos().filter(video => video.provider === 'drive').map(video => [video.id, video]));
    const invalid = manifest.entries.find(entry => {
      const original = originals.get(entry.sourceId);
      return !original || original.dance !== entry.dance;
    });
    if (invalid) { output.textContent = 'Manifest includes an unknown source or incorrect dance folder. No changes published.'; return; }
    const button = page.querySelector('#optimized-manifest-import'); button.disabled = true;
    try {
      await ctx.publishOptimizedManifest(manifest);
      output.textContent = `${manifest.entries.length} verified optimized-copy mappings published. BailaCue now prefers these MP4 versions and keeps original videos as fallback.`;
    } catch (error) {
      output.textContent = 'Could not publish optimized copies: ' + error.message;
    } finally { button.disabled = false; }
  };
  connection.prepare().catch(error => { const el = page.querySelector('#connection-status'); if (el) el.textContent = error.message; });
  renderFiles();
}

import { createPhotosSession, selectedPhotosVideos, endPhotosSession } from './photos-picker.mjs';
import { renderBrowserCompressor } from './browser-compressor.mjs';
import { LABEL_TYPES, createLabel, normalizeName, nextNumber, numberedName } from './studio-model.mjs';
export function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]); }
const esc = escapeHtml;
const labelTypeName = type => type === 'Style & timing' || type === 'Style' ? 'Styles' : type === 'Moves' ? 'Moves' : type === 'Technique' ? 'Techniques' : type;
let pickerSequence = 0;
/** Searchable, multi-select dropdown with keyboard navigation and explicit creation. */
export function labelPicker(container, { labels, selected = [], title, artists = false, allowCreate = false, dance = 'Both', onChange, onCreate = (name, type, dance) => null }) {
  const id = `picker-${++pickerSequence}`, chosen = new Set(selected); let active = -1;
  container.innerHTML = `<details class="label-picker"><summary>${esc(title)} <span class="picker-count">${chosen.size || ''}</span></summary><div class="picker-panel"><input type="search" class="picker-search" role="combobox" aria-expanded="false" aria-controls="${id}" aria-autocomplete="list" placeholder="Search ${esc(title.toLocaleLowerCase())}…" aria-label="${esc(title)}"><div class="picker-options" role="listbox" aria-label="${esc(title)}" aria-multiselectable="true" id="${id}"></div><div class="picker-create"></div></div></details><div class="selected-tags"></div>`;
  const details = container.querySelector('details'), search = container.querySelector('input'), list = container.querySelector('.picker-options'), create = container.querySelector('.picker-create'), tags = container.querySelector('.selected-tags');
  const available = () => labels().filter(l => (artists ? l.type === 'Artist' : l.type !== 'Artist') && (!dance || dance === 'Both' || l.dance === 'Both' || l.dance === dance));
  function refresh() {
    const query = normalizeName(search.value), matches = available().filter(l => normalizeName(`${l.name} ${l.type} ${l.dance}`).includes(query)); active = -1; search.removeAttribute('aria-activedescendant');
    list.innerHTML = matches.length ? matches.map((l, i) => `<button type="button" role="option" id="${id}-${i}" data-id="${esc(l.id)}" aria-selected="${chosen.has(l.id)}" class="picker-option"><span>${esc(l.name)}<small>${l.dance !== 'Both' ? esc(l.dance) : 'Available for both dances'}</small></span><span aria-hidden="true">${chosen.has(l.id) ? '✓' : '+'}</span></button>`).join('') : `<p class="picker-empty">No matching ${esc(title.toLocaleLowerCase())}.</p>`;
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
  page.innerHTML = `<div class="page-heading"><div><span class="eyebrow">YOUR DANCE VOCABULARY</span><h1>Make it easy to find.</h1><p>Set each video’s Level on its detail form; organize Styles, Moves, Positions, Techniques and Musicality here.</p></div></div><div class="label-workspace"><section class="editor-panel"><h2>Create a label</h2><form id="label-form"><label class="field"><span class="field-label">Name</span><input id="new-label-name" maxlength="80" required placeholder="e.g. Salsa Romántica"></label><div class="form-columns"><label class="field"><span class="field-label">Type</span><select id="new-label-type">${LABEL_TYPES.filter(t => !['Level', 'Style'].includes(t)).map(t => `<option value="${esc(t)}">${esc(labelTypeName(t))}</option>`).join('')}</select></label><label class="field"><span class="field-label">Dance</span><select id="new-label-dance"><option>Both</option><option>Salsa</option><option>Bachata</option></select></label></div><p class="form-error" id="label-error" role="alert"></p><button class="button primary" type="submit">Create label</button></form><p class="helper-text">Choose a specific category for new dance vocabulary. Choose Artist for teachers or performers.</p></section><section class="label-directory"><div class="directory-toolbar"><label class="search-box"><input id="manage-label-search" type="search" placeholder="Search labels and artists" aria-label="Search labels and artists"></label><select id="manage-label-type" aria-label="Filter label type"><option value="">All types</option>${LABEL_TYPES.filter(t => !['Level', 'Style'].includes(t)).map(t => `<option value="${esc(t)}">${esc(labelTypeName(t))}</option>`).join('')}</select></div><div id="label-list"></div></section></div>`;
  const render = () => {
    const query = normalizeName(page.querySelector('#manage-label-search').value), type = page.querySelector('#manage-label-type').value;
    const labels = ctx.state().labels.filter(l => (!type || l.type === type || (type === 'Style & timing' && l.type === 'Style') || (type === 'Moves' && l.type === 'Technique')) && normalizeName(`${l.name} ${l.type} ${l.dance}`).includes(query));
    const list = page.querySelector('#label-list');
    list.innerHTML = labels.length ? labels.map(l => `<article class="label-row"><span class="label-symbol" aria-hidden="true">${l.type === 'Artist' ? 'A' : '#'}</span><div class="label-row-main"><strong>${esc(l.name)}</strong><span>${esc(labelTypeName(l.type))} · ${esc(l.dance)} · ${Object.values(ctx.state().meta).filter(m => [...(m.moveIds || []), ...(m.styleTimingIds || []), ...(m.labelIds || []), ...(m.artistIds || [])].includes(l.id)).length} videos</span></div><button class="text-button" data-edit="${esc(l.id)}" aria-label="Edit ${esc(l.name)}">Edit</button><button class="icon-button" data-delete="${esc(l.id)}" aria-label="Delete ${esc(l.name)}">×</button></article>`).join('') : '<div class="empty-state"><h3>No matching labels.</h3><p>Create one or try another search.</p></div>';
    list.querySelectorAll('[data-edit]').forEach(button => button.addEventListener('click', () => {
      const label = ctx.state().labels.find(l => l.id === button.dataset.edit);
      const row = button.closest('article'); row.innerHTML = `<form class="inline-label-editor"><input aria-label="Label name" value="${esc(label.name)}" required maxlength="80"><button class="button primary small">Save</button><button type="button" class="button subtle small">Cancel</button></form>`;
      row.querySelector('input').focus(); row.querySelector('button[type=button]').onclick = render;
      row.querySelector('form').onsubmit = async event => {
        event.preventDefault();
        const name = row.querySelector('input').value.trim();
        if (!name || ctx.state().labels.some(l => l.id !== label.id && l.type === label.type && normalizeName(l.name) === normalizeName(name))) { ctx.toast('A label with that name and type already exists.'); return; }
        const previousName = label.name;
        label.name = name;
        try {
          const saved = ctx.saveLabels ? await ctx.saveLabels() : ctx.save();
          if (saved === false) throw new Error('The label could not be saved.');
          render(); ctx.toast('Label updated');
        } catch (error) { label.name = previousName; ctx.toast('Label was not saved: ' + error.message); render(); }
      };
    }));
    list.querySelectorAll('[data-delete]').forEach(button => button.addEventListener('click', () => {
      const label = ctx.state().labels.find(l => l.id === button.dataset.delete); const dialog = document.createElement('dialog');
      dialog.innerHTML = `<h2>Delete “${esc(label.name)}”?</h2><p class="muted">This removes the label from every shared video detail. Video files are kept.</p><div class="dialog-footer"><button class="button subtle" data-cancel>Keep label</button><button class="button danger" data-confirm>Delete label</button></div>`; document.body.append(dialog); dialog.showModal();
      dialog.querySelector('[data-cancel]').addEventListener('click', () => dialog.close()); dialog.addEventListener('close', () => dialog.remove());
      dialog.querySelector('[data-confirm]').addEventListener('click', async event => {
        const confirm = /** @type {HTMLButtonElement} */ (event.currentTarget);
        const previousLabels = ctx.state().labels;
        const previousMeta = JSON.parse(JSON.stringify(ctx.state().meta));
        ctx.state().labels = ctx.state().labels.filter(item => item.id !== label.id);
        for (const meta of Object.values(ctx.state().meta)) {
          for (const key of ['labelIds', 'artistIds', 'moveIds', 'styleTimingIds']) meta[key] = (meta[key] || []).filter(id => id !== label.id);
        }
        confirm.disabled = true; confirm.textContent = 'Saving…';
        try {
          const saved = ctx.saveLabels ? await ctx.saveLabels() : ctx.save();
          if (saved === false) throw new Error('The change was not saved.');
          dialog.close(); render(); ctx.toast('Label removed from shared video details');
        } catch (error) {
          ctx.state().labels = previousLabels; ctx.state().meta = previousMeta;
          dialog.querySelector('.muted').textContent = `The shared change failed: ${error.message}. Try again.`;
          confirm.disabled = false; confirm.textContent = 'Try again';
        }
      });
    }));
  };
  page.querySelector('#label-form').onsubmit = async event => {
    event.preventDefault();
    const name = page.querySelector('#new-label-name').value, type = page.querySelector('#new-label-type').value, dance = page.querySelector('#new-label-dance').value;
    const before = ctx.state().labels.length;
    let created;
    try {
      createLabel(ctx.state().labels, name, type, dance);
      if (before === ctx.state().labels.length) throw new Error('This label already exists. Select it in a video’s dropdown.');
      created = ctx.state().labels.at(-1);
      const saved = ctx.saveLabels ? await ctx.saveLabels() : ctx.save();
      if (saved === false) throw new Error('The label could not be saved.');
      page.querySelector('#new-label-name').value = ''; page.querySelector('#label-error').textContent = ''; render(); ctx.toast('Label created');
    } catch (error) {
      if (ctx.state().labels.length > before) ctx.state().labels = ctx.state().labels.filter(item => item !== created);
      page.querySelector('#label-error').textContent = 'Label was not saved: ' + error.message;
    }
  };
  page.querySelector('#manage-label-search').oninput = render; page.querySelector('#manage-label-type').onchange = render; render();
}

let photosSession;
let photosImporting = false;
const uploadSession = { files: [], jobs: new Map(), running: false, controller: null, labelIds: [], artistIds: [], dance: 'Salsa', recordedAt: '', notes: '' };
export function uploadRunning() { return uploadSession.running; }
export function renderUpload(page, ctx) {
  const connection = ctx.connection;
  page.innerHTML = `<div class="page-heading"><div><h1>Add videos</h1></div></div><section class="upload-connect-section" aria-label="Google Drive connection"><section class="connection-card"><span class="eyebrow">GOOGLE DRIVE</span><h2>${connection.connected ? 'Connected' : 'Not connected'}</h2><button class="button ${connection.connected ? 'subtle' : 'primary'}" id="connect-google">${connection.connected ? 'Reconnect Google' : 'Connect Google'}</button><p id="connection-status" role="status" class="helper-text">${connection.connected ? 'Ready to upload. Connection saved securely.' : (connection.connectionError || 'Connect Google Drive to upload.')}</p></section></section><h2 class="upload-section-heading">Upload videos</h2><div class="upload-layout"><section class="upload-main"><label class="drop-zone" id="drop-zone"><span class="upload-mark" aria-hidden="true">↑</span><strong>Choose videos</strong><span>Photos or Files · select multiple</span><input id="upload-files" type="file" accept="video/*,.mkv,.avi,.m4v" multiple></label><div class="upload-actions"><button class="button subtle" type="button" id="google-photos-start">Choose from Google Photos</button></div><p class="helper-text" id="google-photos-status" role="status"></p><div class="upload-list" id="upload-list"></div><section class="editor-panel upload-details"><h2>Video details</h2><p class="helper-text">Applies to selected videos.</p><div class="form-columns"><label class="field"><span class="field-label">Destination</span><select id="upload-dance"><option>Salsa</option><option>Bachata</option></select></label><label class="field"><span class="field-label">Recorded on <span class="field-optional">(optional)</span></span><input type="date" id="upload-recorded"></label></div><div class="form-columns"><div id="upload-labels"></div><div id="upload-artists"></div></div><label class="field"><span class="field-label">Notes</span><textarea id="upload-notes" rows="3" maxlength="10000" placeholder="Class, move, or something to remember…"></textarea></label></section><p class="form-error" id="upload-error" role="alert"></p><div class="upload-actions"><button class="button primary" id="upload-start">Upload to Drive</button><button class="button subtle" id="upload-pause" disabled>Pause upload</button></div><progress id="upload-progress" value="0" max="100" aria-label="Upload progress"></progress><p id="upload-status" class="helper-text" role="status">Choose videos to get started. Nothing uploads until you press Upload.</p></section></div><section id="browser-compression" aria-labelledby="browser-compress-title" hidden></section>`;
  async function connectGoogle() {
    try {
      await connection.connect();
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
  let liveNumberDance = null, liveNextNumber = null;
  async function verifyDriveNumber() {
    if (!connection.connected) { liveNumberDance = null; liveNextNumber = null; renderFiles(); return; }
    const dance = danceInput.value;
    const listing = await connection.list(dance);
    if (!page.isConnected || dance !== danceInput.value) return;
    liveNumberDance = dance;
    liveNextNumber = nextNumber(listing.files.map(file => file.name));
    ctx.state().drive = [...ctx.state().drive.filter(v => v.dance !== dance), ...listing.videos];
    renderFiles();
    status.textContent = `Next ${dance} number verified from Google Drive: ${String(liveNextNumber).padStart(4, '0')}.`;
  }
  function renderFiles() {
    let next = liveNumberDance === danceInput.value ? liveNextNumber : null;
    const example = page.querySelector('.number-example'); if (example) example.textContent = next == null ? 'Check Drive' : `${String(next).padStart(4, '0')}`;
    page.querySelector('#upload-list').innerHTML = uploadSession.files.map((file, index) => {
      const job = uploadSession.jobs.get(file), proposed = job?.name || (next == null ? 'Number assigned on upload' : numberedName(next++, file.name));
      const state = job?.completed ? 'Uploaded to Drive' : job?.error ? `Needs retry: ${job.error}` : job?.status === 'uploading' ? 'Uploading…' : job?.session ? 'Paused; ready to resume' : 'Ready to upload';
      const canRemove = !job?.completed && !job?.session;
      return `<article class="upload-file${job?.error ? ' has-error' : ''}"><span class="file-number">${esc(proposed)}</span><div><strong>${esc(file.name)}</strong><small>${(file.size / 1048576).toFixed(1)} MB · ${esc(state)}</small></div><div class="upload-file-actions"><button type="button" class="text-button" data-preview="${index}">Preview</button>${job?.error ? `<button type="button" class="text-button" data-retry-file="${index}">Retry</button>` : ''}${canRemove ? `<button type="button" class="text-button" data-remove-file="${index}">Remove</button>` : ''}</div></article>`;
    }).join('');
    page.querySelectorAll('[data-preview]').forEach(button => button.addEventListener('click', () => ctx.preview(uploadSession.files[Number(button.dataset.preview)])));
    page.querySelectorAll('[data-remove-file]').forEach(button => button.addEventListener('click', () => {
      const index = Number(button.dataset.removeFile), [file] = uploadSession.files.splice(index, 1);
      if (file) uploadSession.jobs.delete(file);
      renderFiles();
    }));
    page.querySelectorAll('[data-retry-file]').forEach(button => button.addEventListener('click', () => {
      void uploadFiles([uploadSession.files[Number(button.dataset.retryFile)]]);
    }));
    const pending = uploadSession.files.filter(file => !uploadSession.jobs.get(file)?.completed).length;
    const failed = uploadSession.files.some(file => uploadSession.jobs.get(file)?.error);
    const start = page.querySelector('#upload-start');
    start.disabled = uploadSession.running || photosImporting || pending === 0;
    start.textContent = uploadSession.running ? 'Uploading…' : pending === 0 && uploadSession.files.length ? 'All selected videos uploaded' : failed ? 'Retry remaining uploads' : 'Upload to Drive';
    page.querySelector('#upload-pause').disabled = !uploadSession.running;
    for (const selector of ['#connect-google', '#google-photos-start', '#refresh-drive', '#upload-replan', '[data-preview]', '[data-remove-file]', '[data-retry-file]']) page.querySelectorAll(selector).forEach(button => button.disabled = uploadSession.running || photosImporting);
    danceInput.disabled = uploadSession.running || [...uploadSession.jobs.values()].some(job => job.session || job.completed);
  }
  function addQueueFiles(files) {
    const existing = new Set(uploadSession.files.map(file => `${file.name}:${file.size}:${file.lastModified}`));
    const added = [], rejected = [];
    for (const file of files) {
      try {
        numberedName(1, file.name);
        const key = `${file.name}:${file.size}:${file.lastModified}`;
        if (!existing.has(key)) { existing.add(key); added.push(file); }
      } catch (error) { rejected.push(`${file.name}: ${error.message}`); }
    }
    uploadSession.files.push(...added);
    const error = page.querySelector('#upload-error');
    error.textContent = rejected.length ? `Skipped unsupported file${rejected.length === 1 ? '' : 's'}: ${rejected.join(' · ')}` : '';
    if (added.length) status.textContent = `${added.length} video${added.length === 1 ? '' : 's'} added. Review the destination and details.`;
    else if (!rejected.length) status.textContent = 'Those videos are already in the upload list.';
    renderFiles();
    return added.length;
  }
  if (connection.connected) void verifyDriveNumber().catch(error => { status.textContent = `Could not check Drive numbering: ${error.message}`; });
  fileInput.addEventListener('change', () => {
    if (uploadSession.running) return;
    addQueueFiles([...fileInput.files]);
    fileInput.value = '';
  });
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
        addQueueFiles([file]);
        photosStatus.textContent = 'Adding selected videos…';
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
  danceInput.onchange = () => { uploadSession.dance = danceInput.value; liveNumberDance = null; liveNextNumber = null; renderFiles(); void verifyDriveNumber().catch(error => { status.textContent = `Could not check Drive numbering: ${error.message}`; }); };
  page.querySelector('#connect-google').onclick = async () => {
    try { await connectGoogle(); } catch { /* Connection status already shows the reason. */ }
  };
  page.querySelector('#upload-pause').onclick = () => uploadSession.controller?.abort();
  async function uploadFiles(targetFiles = uploadSession.files) {
    if (!connection.connected) { page.querySelector('#upload-error').textContent = 'Connect Google before uploading. You can preview selected videos now.'; return; }
    if (!targetFiles.length || uploadSession.running || photosImporting) return;
    const targets = targetFiles.filter(file => uploadSession.files.includes(file) && !uploadSession.jobs.get(file)?.completed);
    if (!targets.length) return;
    const dance = danceInput.value;
    const details = { labelIds: [...uploadSession.labelIds], artistIds: [...uploadSession.artistIds], recordedAt: page.querySelector('#upload-recorded').value, notes: page.querySelector('#upload-notes').value };
    uploadSession.running = true; uploadSession.controller = new AbortController(); fileInput.disabled = true; page.querySelector('#upload-error').textContent = '';
    page.querySelector('#upload-progress').value = 0; renderFiles();
    const uploaded = [], failures = [];
    const totalBytes = targets.reduce((sum, file) => sum + file.size, 0);
    let processedBytes = 0;
    const run = async () => {
      for (const [index, file] of targets.entries()) {
        let job = uploadSession.jobs.get(file);
        if (job?.completed) { processedBytes += file.size; continue; }
        try {
          if (!job?.id) {
            status.textContent = `Checking whether ${file.name} is already in Drive…`;
            job = await connection.plan(file, dance);
            uploadSession.jobs.set(file, job);
          }
          job.status = 'uploading'; job.error = ''; renderFiles();
          status.textContent = `Uploading ${job.name}… keep this tab open.`;
          const result = await connection.upload(job, (bytes, total) => {
            const percent = Math.floor(bytes / total * 100);
            page.querySelector('#upload-progress').value = totalBytes ? Math.min(100, Math.floor((processedBytes + bytes) / totalBytes * 100)) : percent;
            status.textContent = `${index + 1}/${targets.length} · ${job.name} · ${percent}% uploaded`;
          }, uploadSession.controller.signal);
          job.completed = result; job.status = 'uploaded'; job.error = '';
          ctx.state().drive = [...ctx.state().drive.filter(video => video.id !== result.id), result];
          ctx.patchMeta(result.id, details); ctx.save(); uploaded.push(result);
          renderFiles(); processedBytes += file.size;
        } catch (error) {
          if (error.name === 'AbortError') {
            if (job) { job.status = 'paused'; job.error = ''; }
            throw error;
          }
          job = job || { file, name: file.name };
          job.status = 'failed'; job.error = error.message || 'Upload failed. Try again.';
          uploadSession.jobs.set(file, job); failures.push({ file, error });
          processedBytes += file.size; renderFiles();
          if (!connection.connected) break;
        }
      }
      page.querySelector('#upload-progress').value = 100;
      page.querySelector('#upload-error').textContent = failures.length
        ? `${failures.length} video${failures.length === 1 ? '' : 's'} need attention. Retry a row or press Upload to retry all unfinished videos.` : '';
      status.textContent = failures.length
        ? `${uploaded.length} uploaded; ${failures.length} need attention. The remaining files were checked, and completed uploads are safe to resume.`
        : uploaded.length ? `${uploaded.length} Original video${uploaded.length === 1 ? '' : 's'} uploaded to Drive.` : 'There are no unfinished videos in this selection.';
      if (uploaded.length && !failures.length) ctx.toast(`${uploaded.length} original video${uploaded.length === 1 ? '' : 's'} uploaded to Drive`);
    };
    try { if (navigator.locks) await navigator.locks.request(`bailacue-upload-${dance}`, run); else await run(); }
    catch (error) {
      if (error.name === 'AbortError') status.textContent = 'Paused. Press Upload to resume the same files; completed files will be skipped.';
      else { page.querySelector('#upload-error').textContent = error.message; status.textContent = 'The batch stopped. Retry the unfinished files; completed uploads are kept.'; }
    } finally {
      uploadSession.running = false; uploadSession.controller = null; fileInput.disabled = false; renderFiles();
      if (uploaded.length && ctx.admin.isAdmin) {
        status.textContent = failures.length
          ? `${uploaded.length} Original video${uploaded.length === 1 ? '' : 's'} uploaded; ${failures.length} need attention. Playback-copy compression is starting below.`
          : 'Originals uploaded. Starting playback-copy compression below; keep this tab open.';
        page.querySelector('#browser-compression').dispatchEvent(new CustomEvent('bailacue-uploaded', { detail: uploaded }));
      } else if (uploaded.length) {
        status.textContent = 'Originals uploaded. Sign in as owner to create playback copies in the compressor below.';
      }
    }
  }
  page.querySelector('#upload-start').onclick = () => { void uploadFiles(); };

  connection.prepare().then(() => { if (connection.connected && page.querySelector('#connect-google')?.textContent?.includes('Connect Google')) renderUpload(page, ctx); }).catch(error => { const el = page.querySelector('#connection-status'); if (el) el.textContent = error.message; });
  renderFiles();
}

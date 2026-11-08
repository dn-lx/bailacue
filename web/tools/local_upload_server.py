#!/usr/bin/env python3
"""Private localhost BailaCue multi-file upload and free FFmpeg conversion.

Run on your own computer. Opens a local-only browser page at 127.0.0.1:38221.
The local desktop Google OAuth credentials are never sent to Netlify or copied
into the public website. Video bytes stay local until uploaded to Google Drive.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import secrets
import shutil
import tempfile
import threading
import webbrowser
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from convert_drive_library import authenticate, originals, ORIGINAL
from convert_library_multi import (
    PRESET, MANIFEST, VALID_QUALITIES, QUALITY,
    convert_one, create_original, existing_renditions, save_manifest,
    process_existing,
)

HOST = "127.0.0.1"
PORT = 38221
MAX_UPLOAD = 2 * 1024 * 1024 * 1024
EXTENSIONS = {".mp4", ".mov", ".m4v", ".webm", ".mkv", ".avi", ".3gp"}
BYTE_CHUNK = 1024 * 1024

PAGE = """<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>BailaCue · Free local video studio</title>
<style>
:root { color-scheme:dark; font-family:system-ui,-apple-system,Segoe UI,sans-serif }
* { box-sizing:border-box } body { margin:0; background:#10161d; color:#edf3fa; line-height:1.55 }
main { max-width:850px; margin:0 auto; padding:30px 20px 70px }
h1 {font-size:clamp(26px,5vw,38px);margin:5px 0} h2 {font-size:19px;margin:0 0 8px}
p,.muted {color:#adbacb} .eyebrow {font-size:11px;letter-spacing:.16em;color:#81cdc4;font-weight:700}
.panel { background:#1a2531;border:1px solid #344456;border-radius:16px;padding:22px;margin-top:18px }
button,select,input {font:inherit} button,select {border:1px solid #405366;border-radius:9px;background:#253648;color:#f2f7fb;padding:10px 14px}
button:hover:enabled {background:#32485c} button:disabled {opacity:.45;cursor:default} button.primary {background:#71dbbd;color:#10241e;border:0;font-weight:700}
.row {display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-top:15px}
.drop {display:block;border:2px dashed #496b80;border-radius:14px;padding:28px 22px;text-align:center;background:#172a36;cursor:pointer}
.drop:hover,.drop.over {border-color:#71dbbd;background:#1b3945}
.drop input {max-width:100%;margin-top:10px}
ul {list-style:none;padding:0;margin:15px 0 0} li {padding:9px 0;border-top:1px solid #324353;word-break:break-word}
small {color:#9bb8b0} .state {font-size:14px;color:#c1ded8}
progress {width:100%;height:12px;margin-top:12px;accent-color:#71dbbd}
a {color:#8bdfcf} .warning {color:#e9c99b} .status {white-space:pre-wrap;word-break:break-word}
</style></head><body><main>
<span class="eyebrow">BAILACUE / LOCAL PROCESSING</span>
<h1>Prepare videos on this computer.</h1>
<p>Select several videos at once. Originals stay untouched; new optimized 360p, 720p, and 1080p copies are encoded locally with free FFmpeg and uploaded to your dedicated Google Drive folders. Nothing is sent to a paid video service.</p>
<section class="panel">
<h2>1 · Add raw video files</h2>
<p>Download Google Photos or iCloud shared videos to this computer first. Or transfer from iPhone using AirDrop (Mac) or a USB cable. MP4, MOV, M4V, WebM, MKV, AVI and 3GP are accepted.</p>
<label class="drop" id="drop">Drop videos here or choose files<input type="file" id="files" multiple accept="video/*,.mov,.mkv,.avi,.m4v,.3gp"></label>
<div class="row"><label>Collection <select id="dance"><option>Salsa</option><option>Bachata</option></select></label><button id="start" class="primary">Upload & optimize selected videos</button><button id="clear">Clear list</button></div>
<ul id="queue"></ul><progress id="upload-progress" max="100" value="0" hidden></progress>
<p class="state" id="upload-status" role="status">Choose one or more files. Videos are processed sequentially.</p>
</section>
<section class="panel">
<h2>2 · Existing library (one time)</h2>
<p>Convert the originals already in the two locked Google Drive collections. Completed resolutions are skipped after a restart. The library may take substantial computer time and Drive storage space.</p>
<div class="row"><button id="backfill">Convert existing Drive videos</button><span class="warning">Keep computer on until finished; free Drive quota still applies.</span></div>
<p id="worker-status" class="state status" role="status">No conversion running.</p>
</section>
<section class="panel">
<h2>3 · Publish video qualities to BailaCue</h2>
<p>After videos finish, download the generated manifest and open BailaCue's <b>Add videos</b> page as administrator. Select the manifest under <b>Free video optimization</b> and publish it.</p>
<div class="row"><a id="manifest" href="/api/manifest" download="bailacue-optimized-manifest.json">Download latest manifest</a> <a href="https://develop--bailacue.netlify.app/#upload" target="_blank" rel="noopener noreferrer">Open BailaCue develop</a></div>
<p class="muted">Original video IDs, ratings and labels stay the same. The optimized copies are separate files; this computer does the encoding.</p>
</section></main><script>
'use strict';
const TOKEN = __TOKEN__;
const $ = id => document.getElementById(id);
let selected = [], busy = false;
const MAX = 2*1024*1024*1024, VALID = /\.(mp4|mov|m4v|webm|mkv|avi|3gp)$/i;
function safe(text) { const el = document.createElement('span'); el.textContent = text; return el.innerHTML; }
function queueRender() {
  $('queue').innerHTML = selected.map((file,i) => '<li>'+safe(file.name)+' <small>· '+(file.size/1048576).toFixed(1)+' MiB · '+safe(file.state || 'waiting')+'</small></li>').join('');
  $('start').disabled = busy || !selected.length;
  $('clear').disabled = busy;
  $('files').disabled = busy;
  $('dance').disabled = busy;
  $('backfill').disabled = busy;
}
function addFiles(files) {
  if (busy) return;
  const all = [...files].filter(file => VALID.test(file.name) && file.size >= 1024 && file.size <= MAX);
  const known = new Set(selected.map(file => file.name+':'+file.size+':'+file.lastModified));
  for (const file of all) {
    const key = file.name+':'+file.size+':'+file.lastModified;
    if (!known.has(key)) { file.state='waiting';selected.push(file);known.add(key); }
  }
  $('upload-status').textContent = selected.length+' videos in queue. Video files only, maximum 2 GiB each.';
  queueRender();
}
$('files').addEventListener('change', e => { addFiles(e.target.files);e.target.value=''; });
$('clear').onclick=()=>{selected=[];queueRender();};
const drop=$('drop');
drop.addEventListener('dragover',e=>{e.preventDefault();drop.classList.add('over');});
drop.addEventListener('dragleave',()=>drop.classList.remove('over'));
drop.addEventListener('drop',e=>{e.preventDefault();drop.classList.remove('over');addFiles(e.dataTransfer.files);});
async function statePoll() {
  try {
    const response = await fetch('/api/info', {cache:'no-store'});
    if (!response.ok) return;
    const info = await response.json();
    $('worker-status').textContent = info.message || 'Local converter ready.';
    if (info.running && !busy) $('backfill').disabled=true;
    else if (!busy) $('backfill').disabled=false;
    return info;
  } catch { $('worker-status').textContent='Local helper disconnected.'; }
}
async function submitOne(file,dance) {
  const url = '/api/upload?dance='+encodeURIComponent(dance)+'&name='+encodeURIComponent(file.name);
  return new Promise((resolve,reject)=>{
    const xhr=new XMLHttpRequest();
    xhr.open('POST',url);
    xhr.setRequestHeader('X-BailaCue-Token',TOKEN);
    xhr.setRequestHeader('Content-Type','application/octet-stream');
    xhr.upload.onprogress=e=>{
      if (e.lengthComputable) {
        const p = Math.floor(e.loaded/e.total*100);
        $('upload-progress').value=p;
        $('upload-status').textContent=file.name+' · sending original to local processor: '+p+'%. Encoding follows.';
      }
    };
    xhr.onerror=()=>reject(Error('Connection to the local converter failed.'));
    xhr.onload=()=>{
      let result={};try{result=JSON.parse(xhr.responseText);}catch{}
      if(xhr.status>=200&&xhr.status<300) resolve(result);
      else reject(Error(result.error||'Local conversion failed ('+xhr.status+').'));
    };
    xhr.send(file);
  });
}
$('start').onclick=async()=>{
  if(busy||!selected.length)return;
  busy=true;$('upload-progress').hidden=false;
  const dance=$('dance').value;
  queueRender();
  for(const file of selected){
    if(file.state==='complete')continue;
    file.state='uploading';queueRender();
    try{
      const done=await submitOne(file,dance);
      file.state='complete';$('upload-status').textContent=file.name+' ready · '+(done.qualities||[]).join(', ');
    }catch(error){
      file.state='failed';$('upload-status').textContent=file.name+': '+error.message+' — review local console before retry.';
      queueRender();break;
    }
    queueRender();
  }
  $('upload-progress').hidden=true;
  busy=false;queueRender();statePoll();
};
$('backfill').onclick=async()=>{
  if(busy)return;
  if(!confirm('Convert all existing Salsa and Bachata originals into free H.264/AAC quality copies on this computer? Original files stay unchanged. Additional Drive storage is required.'))return;
  const response=await fetch('/api/process-existing',{method:'POST',headers:{'X-BailaCue-Token':TOKEN}});
  const data=await response.json().catch(()=>({}));
  $('worker-status').textContent=response.ok?'One-time backfill started. Keep this window open.':(data.error||'Could not start.');
  statePoll();
};
queueRender();
statePoll();
setInterval(statePoll,2500);
</script></body></html>"""


def run_server(oauth_client, token, manifest, ffmpeg, ffprobe, qualities, port, launch):
    if not shutil.which(ffmpeg) or not shutil.which(ffprobe):
        raise RuntimeError("Install the free ffmpeg and ffprobe programs first.")
    service = authenticate(oauth_client, token)
    source_map = originals(service)
    copied = existing_renditions(service, source_map)
    save_manifest(manifest, copied)
    state = {
        "busy": False, "message": f"Ready · {len(source_map)} originals in Drive / {len(copied)} have optimized copies.",
        "processed": 0,
    }
    lock = threading.Lock()
    access_key = secrets.token_urlsafe(24)

    def update(message):
        with lock:
            state["message"] = str(message)[:500]
        print(message, flush=True)

    def start_processing():
        with lock:
            if state["busy"]:
                return False
            state["busy"] = True
        return True

    def stop_processing():
        with lock:
            state["busy"] = False

    class Handler(BaseHTTPRequestHandler):
        server_version = "BailaCueLocal/1.0"
        def log_message(self, fmt, *args):
            if "api/info" not in str(args):
                super().log_message(fmt, *args)

        def send_json(self, value, code=200):
            raw = json.dumps(value).encode("utf-8")
            self.send_response(code)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("Content-Length", str(len(raw)))
            self.end_headers()
            self.wfile.write(raw)

        def authorized(self):
            # No CORS or remote network listener. Only same-origin local page
            # knows the random token; no arbitrary website can trigger encoding.
            origin = self.headers.get("Origin")
            expected = f"http://{HOST}:{port}"
            return (origin in (None, expected) and
                    self.headers.get("X-BailaCue-Token") == access_key)

        def do_GET(self):
            pathname = urlparse(self.path).path
            if pathname == "/":
                html = PAGE.replace("__TOKEN__", json.dumps(access_key)).encode("utf-8")
                self.send_response(200)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.send_header("Content-Security-Policy", "default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'")
                self.send_header("Cache-Control", "no-store")
                self.send_header("Content-Length", str(len(html)))
                self.end_headers()
                self.wfile.write(html)
            elif pathname == "/api/info":
                with lock:
                    status = {"running": state["busy"], "message": state["message"],
                              "processed": state["processed"], "preset": PRESET}
                self.send_json(status)
            elif pathname == "/api/manifest":
                if not manifest.exists():
                    self.send_json({"error": "No completed renditions found."}, 404)
                    return
                data = manifest.read_bytes()
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Disposition", 'attachment; filename="bailacue-optimized-manifest.json"')
                self.send_header("Cache-Control", "no-store")
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)
            else:
                self.send_json({"error": "Not found"}, 404)

        def do_POST(self):
            parsed = urlparse(self.path)
            if not self.authorized():
                self.send_json({"error": "Unauthorized local action."}, 403)
                return
            if parsed.path == "/api/process-existing":
                if not start_processing():
                    self.send_json({"error": "A video conversion is already running."}, 409)
                    return
                def worker():
                    try:
                        process_existing(
                            service, ffmpeg, ffprobe, manifest, max_videos=0,
                            dry_run=False, requested=qualities, progress=update,
                        )
                        # Reconcile in-memory copies: a subsequent new-file upload must
                        # never replace a full backfill manifest with stale mappings.
                        refreshed_sources = originals(service)
                        refreshed_copies = existing_renditions(service, refreshed_sources)
                        source_map.clear()
                        source_map.update(refreshed_sources)
                        copied.clear()
                        copied.update(refreshed_copies)
                        save_manifest(manifest, copied)
                        update("One-time backfill finished. Download the latest manifest.")
                    except Exception as error:
                        update("Backfill stopped: "+str(error)+" · run again to resume.")
                    finally:
                        stop_processing()
                threading.Thread(target=worker, name="bailacue-backfill", daemon=True).start()
                self.send_json({"started": True}, 202)
                return
            if parsed.path != "/api/upload":
                self.send_json({"error": "Unknown action."}, 404)
                return
            if not start_processing():
                self.send_json({"error": "Another conversion is running."}, 409)
                return
            try:
                args = parse_qs(parsed.query)
                dance = args.get("dance", [""])[0]
                filename = args.get("name", [""])[0]
                length = int(self.headers.get("Content-Length") or "0")
                if (dance not in ORIGINAL or len(filename) > 180 or not filename
                    or Path(filename).name != filename or Path(filename).suffix.lower() not in EXTENSIONS
                    or length < 1024 or length > MAX_UPLOAD
                    or self.headers.get("Content-Type", "").split(";")[0] != "application/octet-stream"):
                    self.send_json({"error": "Invalid original video name, type, or size."}, 400)
                    return
                with tempfile.TemporaryDirectory(prefix="bailacue-local-upload-") as temp:
                    path = Path(temp) / ("source" + Path(filename).suffix.lower())
                    remaining = length
                    with path.open("wb") as sink:
                        while remaining > 0:
                            data = self.rfile.read(min(BYTE_CHUNK, remaining))
                            if not data:
                                raise RuntimeError("Browser upload was interrupted.")
                            sink.write(data)
                            remaining -= len(data)
                    if path.stat().st_size != length:
                        raise RuntimeError("Uploaded file byte count is incomplete.")
                    update(f"Uploading untouched original {filename} into {dance} Drive folder…")
                    original = create_original(service, dance, filename, path)
                    source_map[original["id"]] = (dance, original)
                    update("Original saved to Google Drive. Preparing optimized quality copies.")
                    completed = convert_one(
                        service, original["id"], dance, original, copied,
                        ffmpeg, ffprobe, manifest, qualities, update,
                        local_original=path,
                    )
                    with lock:
                        state["processed"] += 1
                    update(f"{original['name']} ready: "+", ".join(completed))
                    self.send_json({"success": True, "sourceId": "drive:"+original["id"],
                                    "qualities": completed})
            except Exception as error:
                update("Conversion error: "+str(error))
                self.send_json({"error": str(error)[:350] + " (an original may already be saved in Drive; check before retrying)."}, 500)
            finally:
                stop_processing()

        def do_OPTIONS(self):
            # No cross-origin preflight or Access-Control-Allow-Origin.
            self.send_response(403)
            self.send_header("Content-Length", "0")
            self.end_headers()

    server = ThreadingHTTPServer((HOST, port), Handler)
    address = f"http://{HOST}:{port}/"
    print(f"Local BailaCue conversion studio: {address}")
    print("Only this computer can connect. Use Ctrl+C to exit.")
    if launch:
        webbrowser.open(address)
    try:
        server.serve_forever(poll_interval=0.3)
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


def main():
    parser = argparse.ArgumentParser(description="Private local-browser BailaCue bulk uploader.")
    parser.add_argument("--oauth-client", type=Path, required=True,
                        help="Private Google OAuth Desktop client JSON.")
    parser.add_argument("--token", type=Path,
                        default=Path.home() / ".config" / "bailacue" / "google_token.json")
    parser.add_argument("--manifest", type=Path, default=Path(MANIFEST))
    parser.add_argument("--ffmpeg", default="ffmpeg")
    parser.add_argument("--ffprobe", default="ffprobe")
    parser.add_argument("--qualities", nargs="+", choices=VALID_QUALITIES,
                        default=list(VALID_QUALITIES))
    parser.add_argument("--port", type=int, default=PORT)
    parser.add_argument("--no-browser", action="store_true")
    options = parser.parse_args()
    if options.port < 1024 or options.port > 65535:
        parser.error("Choose a non-system local port.")
    run_server(options.oauth_client, options.token, options.manifest,
               options.ffmpeg, options.ffprobe,
               tuple(dict.fromkeys(options.qualities)), options.port,
               not options.no_browser)


if __name__ == "__main__":
    main()

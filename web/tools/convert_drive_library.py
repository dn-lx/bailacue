#!/usr/bin/env python3
"""Free, resumable BailaCue video conversion using local FFmpeg and Google Drive.

The original Salsa/Bachata files are only READ. Derived MP4 copies are placed
exclusively into the two dedicated "Optimized Playback" Drive subfolders.
Run this on a computer you control. No paid video encoding API is used.
"""
from __future__ import annotations

import argparse
import io
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path

ORIGINAL = {
    "Salsa": "1lVR5Pc-6SupJOfLIhcRE-oo69FUDM5Sm",
    "Bachata": "17CFKIazhQJTGXvlHP5sa1mqlvu9p-2i1",
}
DERIVED = {
    "Salsa": "1Z8yfu20bLFKChQGXYQQ8uZZoEDMTSx1f",
    "Bachata": "1rOwr5utjZ-gfCj5Zj6KlOjmqdFRu8ncq",
}
ROOT = "1CErkH8BmExpKGZXHSl1hnDbs6fgr08PQ"
PRESET = "h264-aac-faststart-720p-v1"
SCOPES = ["https://www.googleapis.com/auth/drive"]
CHUNK = 8 * 1024 * 1024
MANIFEST_DEFAULT = "bailacue-optimized-manifest.json"


def authenticate(oauth_path: Path, token_path: Path):
    from google.auth.transport.requests import Request
    from google.oauth2.credentials import Credentials
    from google_auth_oauthlib.flow import InstalledAppFlow
    from googleapiclient.discovery import build

    token_path.parent.mkdir(parents=True, exist_ok=True)
    creds = None
    if token_path.exists():
        creds = Credentials.from_authorized_user_file(str(token_path), SCOPES)
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            if not oauth_path.is_file():
                raise RuntimeError("Provide a local Google OAuth Desktop client JSON with --oauth-client.")
            creds = InstalledAppFlow.from_client_secrets_file(
                str(oauth_path), SCOPES
            ).run_local_server(port=0)
        token_path.write_text(creds.to_json(), encoding="utf-8")
        try:
            token_path.chmod(0o600)
        except OSError:
            pass
    return build("drive", "v3", credentials=creds, cache_discovery=False)


def list_children(service, folder_id: str):
    files = []
    token = None
    while True:
        page = service.files().list(
            q=f"'{folder_id}' in parents and trashed = false",
            pageSize=1000,
            fields="nextPageToken,files(id,name,mimeType,size,parents,appProperties,videoMediaMetadata(width,height))",
            pageToken=token,
            supportsAllDrives=True,
            includeItemsFromAllDrives=True,
        ).execute(num_retries=3)
        files.extend(page.get("files", []))
        token = page.get("nextPageToken")
        if not token:
            return files


def originals(service):
    result = {}
    for dance, folder in ORIGINAL.items():
        for item in list_children(service, folder):
            if (item.get("mimeType", "").startswith("video/")
                    and item.get("id") and int(item.get("size") or 0) >= 1024):
                result[item["id"]] = (dance, item)
    return result


def existing_copies(service, source_ids):
    entries = {}
    for dance, folder in DERIVED.items():
        for copy in list_children(service, folder):
            props = copy.get("appProperties") or {}
            source = props.get("bailacueSourceId")
            if (source not in source_ids or props.get("bailacuePreset") != PRESET
                    or not re.fullmatch(r"[A-Za-z0-9_.()-]{1,190}\.mp4", copy.get("name", ""))
                    or not copy.get("mimeType", "").startswith("video/mp4")
                    or int(copy.get("size") or 0) < 1024
                    or source_ids[source][0] != dance):
                continue
            if source in entries:
                print(f"WARNING: duplicate optimized copies found for {source}; keep the first.", file=sys.stderr)
                continue
            entries[source] = (dance, copy)
    return entries


def manifest_payload(existing):
    entries = []
    for source_id, (dance, copy) in sorted(existing.items(), key=lambda x: (x[1][0], x[1][1]["name"])):
        entries.append({
            "sourceId": "drive:" + source_id,
            "driveId": copy["id"],
            "dance": dance,
            "folderId": DERIVED[dance],
            "filename": copy["name"],
            "size": int(copy["size"]),
        })
    return {
        "version": 1,
        "rootFolderId": ROOT,
        "preset": PRESET,
        "entries": entries,
    }


def save_manifest(destination: Path, existing):
    destination.parent.mkdir(parents=True, exist_ok=True)
    data = json.dumps(manifest_payload(existing), indent=2) + "\n"
    tmp = destination.with_name(destination.name + ".tmp")
    tmp.write_text(data, encoding="utf-8")
    os.replace(tmp, destination)


def download(service, drive_id: str, target: Path, size: int):
    from googleapiclient.http import MediaIoBaseDownload
    request = service.files().get_media(fileId=drive_id, supportsAllDrives=True)
    with target.open("wb") as output:
        downloader = MediaIoBaseDownload(output, request, chunksize=CHUNK)
        done = False
        while not done:
            _, done = downloader.next_chunk(num_retries=3)
    if target.stat().st_size != size:
        raise RuntimeError("Downloaded original size did not match Google Drive metadata.")


def video_filename(source):
    name = Path(source["name"]).stem[:64]
    name = re.sub(r"[^A-Za-z0-9_.()-]+", "_", name).strip("._-") or "video"
    return f"{name}-{source['id'][:10]}.mp4"


def convert(ffmpeg: str, ffprobe: str, original: Path, target: Path):
    cmd = [
        ffmpeg, "-hide_banner", "-nostdin", "-loglevel", "error", "-y",
        "-i", str(original),
        "-map", "0:v:0", "-map", "0:a:0?", "-sn", "-dn",
        "-vf", "scale=w='min(1280,iw)':h='min(1280,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2",
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "24",
        "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "96k", "-ac", "2",
        "-movflags", "+faststart", "-max_muxing_queue_size", "1024",
        str(target),
    ]
    subprocess.run(cmd, check=True)
    probe = subprocess.run(
        [ffprobe, "-v", "error", "-show_streams", "-of", "json", str(target)],
        check=True, capture_output=True, text=True,
    )
    streams = json.loads(probe.stdout).get("streams", [])
    pictures = [s for s in streams if s.get("codec_type") == "video"]
    audios = [s for s in streams if s.get("codec_type") == "audio"]
    if (len(pictures) != 1 or pictures[0].get("codec_name") != "h264"
            or max(int(pictures[0].get("width") or 0), int(pictures[0].get("height") or 0)) > 1280
            or pictures[0].get("pix_fmt") != "yuv420p"
            or any(s.get("codec_name") != "aac" for s in audios)
            or target.stat().st_size < 1024):
        raise RuntimeError("Optimized output failed video/audio compatibility validation.")


def upload(service, dance, source, filename, path):
    from googleapiclient.http import MediaFileUpload

    media = MediaFileUpload(str(path), mimetype="video/mp4", resumable=True, chunksize=CHUNK)
    request = service.files().create(
        body={
            "name": filename,
            "parents": [DERIVED[dance]],
            "description": "Free BailaCue playback copy. Source original is preserved.",
            "appProperties": {
                "bailacueSourceId": source["id"],
                "bailacuePreset": PRESET,
            },
        },
        media_body=media,
        fields="id,name,mimeType,size,parents,appProperties",
        supportsAllDrives=True,
    )
    response = None
    while response is None:
        _, response = request.next_chunk(num_retries=3)
    if (response.get("name") != filename
            or DERIVED[dance] not in response.get("parents", [])
            or int(response.get("size") or 0) != path.stat().st_size):
        raise RuntimeError("Google Drive did not confirm the exact optimized copy; inspect before retry.")
    return response


def processing_cycle(service, ffmpeg, ffprobe, manifest, max_videos=0, dry_run=False):
    source = originals(service)
    copied = existing_copies(service, source)
    pending = [(id_, dance, item) for id_, (dance, item) in source.items() if id_ not in copied]
    pending.sort(key=lambda x: (x[1], x[2].get("name", "")))
    size_gib = sum(int(item.get("size") or 0) for _, _, item in pending) / (1024 ** 3)
    print(f"Found {len(source)} original videos and {len(copied)} optimized copies.")
    print(f"Remaining: {len(pending)} videos / {size_gib:.2f} GiB to read. Originals never change.")
    save_manifest(manifest, copied)
    if dry_run:
        print("Dry run only. Add --run to convert and upload videos at no encoding-service charge.")
        return
    processed = 0
    for source_id, dance, original in pending:
        if max_videos and processed >= max_videos:
            break
        filename = video_filename(original)
        print(f"[{processed + 1}/{len(pending)}] {dance}: {original['name']} -> {filename}", flush=True)
        with tempfile.TemporaryDirectory(prefix="bailacue-conversion-") as temp:
            src = Path(temp) / "original"
            dst = Path(temp) / filename
            download(service, source_id, src, int(original["size"]))
            convert(ffmpeg, ffprobe, src, dst)
            copy = upload(service, dance, original, filename, dst)
        copied[source_id] = (dance, copy)
        processed += 1
        save_manifest(manifest, copied)
        print(f"  Ready. {len(copied)} optimized copies saved; manifest updated.", flush=True)
    print(f"Cycle complete. Manifest: {manifest.resolve()}")


def main():
    parser = argparse.ArgumentParser(
        description="Free one-time BailaCue conversion plus optional incremental desktop watcher."
    )
    parser.add_argument("--oauth-client", type=Path, required=True,
                        help="Downloaded Google OAuth Desktop JSON (kept private).")
    parser.add_argument("--token", type=Path,
                        default=Path.home() / ".config" / "bailacue" / "google_token.json",
                        help="Private cached Google OAuth token path (outside repository).")
    parser.add_argument("--manifest", type=Path, default=Path(MANIFEST_DEFAULT))
    parser.add_argument("--ffmpeg", default="ffmpeg")
    parser.add_argument("--ffprobe", default="ffprobe")
    parser.add_argument("--run", action="store_true",
                        help="Required before any video copies are created.")
    parser.add_argument("--watch", action="store_true",
                        help="After processing existing videos, scan for new originals repeatedly.")
    parser.add_argument("--interval-minutes", type=int, default=15)
    parser.add_argument("--max-videos", type=int, default=0,
                        help="Pilot limit per cycle; default 0 processes all videos.")
    args = parser.parse_args()
    if args.watch and not args.run:
        parser.error("--watch requires --run.")
    if args.interval_minutes < 5:
        parser.error("--interval-minutes must be at least 5.")
    if args.max_videos < 0:
        parser.error("--max-videos cannot be negative.")
    if args.run and (not shutil.which(args.ffmpeg) or not shutil.which(args.ffprobe)):
        parser.error("Install the free FFmpeg utilities (ffmpeg and ffprobe) on this computer first.")
    service = authenticate(args.oauth_client, args.token)
    while True:
        try:
            processing_cycle(
                service, args.ffmpeg, args.ffprobe, args.manifest,
                max_videos=args.max_videos, dry_run=not args.run,
            )
        except KeyboardInterrupt:
            print("Stopped. Existing uploaded copies and manifest are preserved.")
            return
        except Exception as error:
            print(f"Conversion stopped safely: {error}", file=sys.stderr)
            if not args.watch:
                raise
        if not args.watch:
            return
        print(f"Scanning again in {args.interval_minutes} minutes (Ctrl+C to stop).")
        try:
            time.sleep(args.interval_minutes * 60)
        except KeyboardInterrupt:
            return


if __name__ == "__main__":
    main()

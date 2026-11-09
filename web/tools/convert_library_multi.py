#!/usr/bin/env python3
"""Free BailaCue 360p/720p/1080p batch converter and incremental desktop worker.

All original Drive videos are read-only. Only named derivative folders receive
new video files. All output is encoded with local, open-source FFmpeg.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path

from convert_drive_library import (
    authenticate, download, list_children, originals, ORIGINAL, DERIVED, ROOT,
    CHUNK,
)

PRESET = "h264-aac-ladder-v2"
LEGACY_PRESET = "h264-aac-faststart-720p-v1"
MANIFEST = "bailacue-optimized-manifest.json"
QUALITY = {"360p": (640, 360), "720p": (1280, 720), "1080p": (1920, 1080)}
VALID_QUALITIES = tuple(QUALITY)


def probe_dimensions(ffprobe: str, filename: Path):
    result = subprocess.run(
        [ffprobe, "-v", "error", "-select_streams", "v:0",
         "-show_entries", "stream=width,height",
         "-of", "json", str(filename)],
        check=True, capture_output=True, text=True,
    )
    streams = json.loads(result.stdout).get("streams", [])
    if not streams:
        raise RuntimeError("No video track found in source.")
    width = int(streams[0]["width"])
    height = int(streams[0]["height"])
    if width <= 0 or height <= 0:
        raise RuntimeError("Source video dimensions are invalid.")
    return width, height


def supported_qualities(dimensions, requested=VALID_QUALITIES):
    width, height = dimensions
    available = []
    for quality in requested:
        target_width, target_height = QUALITY[quality]
        # Never upscale smaller original videos: lower rungs are still encoded.
        if (quality != "360p" and width < target_width and height < target_height):
            continue
        available.append(quality)
    if not available:
        available = ["360p"]
    return available


def encode_rendition(ffmpeg: str, ffprobe: str, original: Path, destination: Path, quality: str):
    width, height = QUALITY[quality]
    # Cap each axis to both the original and requested raster.
    scale = f"scale=w='min(iw,{width})':h='min(ih,{height})':force_original_aspect_ratio=decrease:force_divisible_by=2"
    cmd = [
        ffmpeg, "-hide_banner", "-nostdin", "-loglevel", "error", "-y",
        "-i", str(original), "-map", "0:v:0", "-map", "0:a:0?",
        "-sn", "-dn", "-vf", scale, "-c:v", "libx264",
        "-preset", "veryfast", "-crf", "24", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "96k", "-ac", "2",
        "-movflags", "+faststart", "-max_muxing_queue_size", "1024",
        str(destination),
    ]
    subprocess.run(cmd, check=True)
    info = subprocess.run(
        [ffprobe, "-v", "error", "-show_streams", "-of", "json", str(destination)],
        check=True, capture_output=True, text=True,
    )
    streams = json.loads(info.stdout).get("streams", [])
    pictures = [s for s in streams if s.get("codec_type") == "video"]
    audio = [s for s in streams if s.get("codec_type") == "audio"]
    if (len(pictures) != 1 or pictures[0].get("codec_name") != "h264"
        or pictures[0].get("pix_fmt") != "yuv420p"
        or int(pictures[0].get("width") or 0) > width
        or int(pictures[0].get("height") or 0) > height
        or any(a.get("codec_name") != "aac" for a in audio)
        or destination.stat().st_size < 1024):
        raise RuntimeError(f"{quality} output failed compatibility validation.")


def filename_for(original, quality):
    stem = Path(original["name"]).stem[:48]
    stem = re.sub(r"[^A-Za-z0-9_.()-]+", "_", stem).strip("._-") or "video"
    return f"{stem}-{original['id'][:10]}-{quality}.mp4"


def existing_renditions(service, sources):
    copies = {}
    for dance, folder in DERIVED.items():
        for copy in list_children(service, folder):
            props = copy.get("appProperties") or {}
            source_id = props.get("bailacueSourceId")
            preset = props.get("bailacuePreset")
            quality = props.get("bailacueQuality") if preset == PRESET else "720p"
            if (source_id not in sources or sources[source_id][0] != dance
                or preset not in (PRESET, LEGACY_PRESET)
                or quality not in QUALITY
                or not re.fullmatch(r"[A-Za-z0-9_.()-]{1,190}\.mp4", copy.get("name", ""))
                or not copy.get("mimeType", "").startswith("video/mp4")
                or int(copy.get("size") or 0) < 1024):
                continue
            if quality in copies.get(source_id, {}):
                print(f"Warning: duplicate {quality} copy for {source_id}; keeping first.", file=sys.stderr)
                continue
            copies.setdefault(source_id, {})[quality] = (dance, copy)
    return copies


def manifest_payload(copies):
    entries = []
    for source_id, variants in sorted(copies.items()):
        dance = next(iter(variants.values()))[0]
        entries.append({
            "sourceId": "drive:" + source_id, "dance": dance,
            "renditions": [
                {
                    "quality": quality, "driveId": copy["id"],
                    "folderId": DERIVED[dance], "filename": copy["name"],
                    "size": int(copy["size"]),
                }
                for quality, (_, copy) in sorted(
                    variants.items(), key=lambda x: list(QUALITY).index(x[0])
                )
            ],
        })
    return {"version": 2, "rootFolderId": ROOT, "preset": PRESET, "entries": entries}


def save_manifest(path: Path, copies):
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_name(path.name + ".tmp")
    temp.write_text(json.dumps(manifest_payload(copies), indent=2) + "\n", encoding="utf-8")
    os.replace(temp, path)


def upload_rendition(service, source, dance, quality, output, source_dimensions):
    from googleapiclient.http import MediaFileUpload

    media = MediaFileUpload(
        str(output), mimetype="video/mp4", resumable=True, chunksize=CHUNK
    )
    metadata = {
        "name": output.name,
        "parents": [DERIVED[dance]],
        "description": "BailaCue free H.264/AAC quality copy; original is unchanged.",
        "appProperties": {
            "bailacueSourceId": source["id"],
            "bailacuePreset": PRESET,
            "bailacueQuality": quality,
            "bailacueSourceWidth": str(source_dimensions[0]),
            "bailacueSourceHeight": str(source_dimensions[1]),
        },
    }
    request = service.files().create(
        body=metadata, media_body=media,
        fields="id,name,mimeType,size,parents,appProperties",
        supportsAllDrives=True,
    )
    result = None
    while result is None:
        _, result = request.next_chunk(num_retries=3)
    if (result.get("name") != output.name
        or DERIVED[dance] not in result.get("parents", [])
        or int(result.get("size") or 0) != output.stat().st_size):
        raise RuntimeError("Drive did not confirm the correct optimized upload.")
    return result


def convert_one(service, source_id, dance, original, copies, ffmpeg, ffprobe,
                manifest: Path, requested=VALID_QUALITIES, progress=print, local_original=None):
    owned = original if local_original is None else None
    if owned and int(original.get("size") or 0) < 1024:
        raise ValueError("Invalid Drive source file size.")
    with tempfile.TemporaryDirectory(prefix="bailacue-renditions-") as working:
        src = Path(local_original) if local_original else Path(working) / "source"
        if not local_original:
            progress(f"Downloading {dance}: {original['name']} from Google Drive…")
            download(service, source_id, src, int(original["size"]))
        dimensions = probe_dimensions(ffprobe, src)
        wanted = supported_qualities(dimensions, requested)
        missing = [quality for quality in wanted if quality not in copies.get(source_id, {})]
        for quality in missing:
            name = filename_for(original, quality)
            output = Path(working) / name
            progress(f"Encoding {quality}: {original['name']}…")
            encode_rendition(ffmpeg, ffprobe, src, output, quality)
            progress(f"Uploading {quality} optimized copy to Google Drive…")
            copy = upload_rendition(service, original, dance, quality, output, dimensions)
            copies.setdefault(source_id, {})[quality] = (dance, copy)
            save_manifest(manifest, copies)
            output.unlink(missing_ok=True)
            progress(f"Saved {quality} copy ({len(copies[source_id])} formats available).")
    return wanted


def process_existing(service, ffmpeg, ffprobe, manifest, max_videos=0,
                     dry_run=True, requested=VALID_QUALITIES, progress=print):
    sources = originals(service)
    copies = existing_renditions(service, sources)
    def expected_quality_set(source_id, source_item):
        details = source_item.get("videoMediaMetadata") or {}
        try:
            raster = (int(details.get("width") or 0), int(details.get("height") or 0))
        except (TypeError, ValueError):
            raster = (0, 0)
        if min(raster) <= 0:
            for _, copy in copies.get(source_id, {}).values():
                props = copy.get("appProperties") or {}
                try:
                    raster = (int(props.get("bailacueSourceWidth") or 0),
                              int(props.get("bailacueSourceHeight") or 0))
                except (TypeError, ValueError):
                    raster = (0, 0)
                if min(raster) > 0:
                    break
        return set(supported_qualities(raster, requested)) if min(raster) > 0 else set(requested)

    pending = [(sid, dance, item) for sid, (dance, item) in sources.items()
               if not expected_quality_set(sid, item).issubset(set(copies.get(sid, {})))]
    pending.sort(key=lambda x: (x[1], x[2].get("name", "")))
    progress(f"Found {len(sources)} originals, {len(copies)} with quality copies, {len(pending)} pending.")
    save_manifest(manifest, copies)
    if dry_run:
        progress("Dry run: no originals altered and no new copies created.")
        return copies
    completed = 0
    for source_id, dance, original in pending:
        if max_videos and completed >= max_videos:
            break
        convert_one(service, source_id, dance, original, copies,
                    ffmpeg, ffprobe, manifest, requested, progress)
        completed += 1
    progress(f"Completed {completed} source videos; manifest written to {manifest}.")
    return copies


def create_original(service, dance, name, input_path, digest=None):
    from googleapiclient.http import MediaFileUpload

    if dance not in ORIGINAL:
        raise ValueError("Invalid dance source.")
    if not re.search(r"\.(mp4|mov|m4v|webm|mkv|avi|3gp)$", name, flags=re.I):
        raise ValueError("Choose a video file, not an arbitrary document.")
    listing = list_children(service, ORIGINAL[dance])
    used = []
    for item in listing:
        match = re.fullmatch(r"(\d{1,9})\.[A-Za-z0-9]{1,8}", item.get("name", ""))
        if match:
            used.append(int(match.group(1)))
    number = max(used, default=0) + 1
    extension = Path(name).suffix.lower()
    numbered = f"{number:04d}{extension}"
    if any(item.get("name") == numbered for item in listing):
        raise RuntimeError("Original filename already exists in Drive. Retry before upload.")
    media_type = {
        ".mp4": "video/mp4", ".m4v": "video/x-m4v",
        ".mov": "video/quicktime", ".webm": "video/webm",
        ".mkv": "video/x-matroska", ".avi": "video/x-msvideo",
        ".3gp": "video/3gpp",
    }[extension]
    media = MediaFileUpload(str(input_path), mimetype=media_type,
                            resumable=True, chunksize=CHUNK)
    metadata = {
        "name": numbered, "parents": [ORIGINAL[dance]],
        "description": "Original uploaded from BailaCue local browser; remains unmodified.",
    }
    if digest is not None:
        if not re.fullmatch(r"[0-9a-f]{64}", digest):
            raise ValueError("Invalid video checksum.")
        metadata["appProperties"] = {"bailacueUploadSha256": digest}
    request = service.files().create(
        body=metadata, media_body=media,
        fields="id,name,mimeType,size,parents,appProperties",
        supportsAllDrives=True,
    )
    result = None
    while result is None:
        _, result = request.next_chunk(num_retries=3)
    if (result.get("name") != numbered
        or ORIGINAL[dance] not in result.get("parents", [])
        or int(result.get("size") or 0) != input_path.stat().st_size):
        raise RuntimeError("Google Drive did not confirm the original file.")
    return result


def main():
    p = argparse.ArgumentParser(description="Free FFmpeg BailaCue quality ladder converter.")
    p.add_argument("--oauth-client", type=Path, required=True)
    p.add_argument("--token", type=Path,
                   default=Path.home() / ".config" / "bailacue" / "google_token.json")
    p.add_argument("--manifest", type=Path, default=Path(MANIFEST))
    p.add_argument("--ffmpeg", default="ffmpeg")
    p.add_argument("--ffprobe", default="ffprobe")
    p.add_argument("--run", action="store_true", help="Actually encode/upload video copies.")
    p.add_argument("--watch", action="store_true", help="Rescan Drive for future uploads.")
    p.add_argument("--interval-minutes", type=int, default=15)
    p.add_argument("--max-videos", type=int, default=0)
    p.add_argument("--qualities", nargs="+", choices=VALID_QUALITIES, default=list(VALID_QUALITIES))
    args = p.parse_args()
    if args.watch and not args.run:
        p.error("--watch requires --run.")
    if args.max_videos < 0 or args.interval_minutes < 5:
        p.error("Invalid limit or polling interval.")
    if args.run and (not shutil.which(args.ffmpeg) or not shutil.which(args.ffprobe)):
        p.error("Install free FFmpeg and ffprobe before converting.")
    service = authenticate(args.oauth_client, args.token)
    while True:
        try:
            process_existing(service, args.ffmpeg, args.ffprobe,
                             args.manifest, args.max_videos, not args.run,
                             tuple(dict.fromkeys(args.qualities)))
        except KeyboardInterrupt:
            return
        except Exception as error:
            print(f"Conversion stopped safely: {error}", file=sys.stderr)
            if not args.watch:
                raise
        if not args.watch:
            return
        time.sleep(args.interval_minutes * 60)


if __name__ == "__main__":
    main()

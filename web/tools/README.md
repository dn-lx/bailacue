# BailaCue free multi-video conversion studio

BailaCue supports a **local desktop browser** for uploading several raw videos,
converting them into separate **360p, 720p and 1080p** H.264/AAC MP4 copies
where the original has sufficient resolution, and saving them in Google Drive.
No paid transcoding, Cloudflare Stream or video hosting product is required.

The existing original library currently contains **266 videos (44.69 GiB)**.
No originals are modified or deleted. All processing is performed with the free
FFmpeg/ffprobe programs on your own computer, and originals and optimized
copies are held in their respective, fixed Google Drive folders.

**Important cost distinction:** the software has no conversion fee, but
Google Drive's storage quota still applies. Additional optimized copies can
consume substantial space; estimate the available quota before the full batch.
The local machine also needs free temporary disk space and a stable Internet
connection.

## One-time computer setup

1. Install **Python 3.10+** and **FFmpeg** (both `ffmpeg` and `ffprobe`
   should work from Terminal, PowerShell, or Command Prompt).
2. Download the BailaCue repo or clone it onto the computer and open a
   terminal in the repository root.
3. Install the Python dependencies:

   ```sh
   python -m pip install -r web/tools/requirements-free-video.txt
   ```

4. In Google Cloud Console, use the Google account with access to the
   Salsa and Bachata source folders and the new optimized folders.
   Enable Google Drive API and create a **Desktop** Google OAuth client.
   Download the OAuth Desktop JSON onto your computer.
   Do not copy its JSON or the generated token into the repository.
   On first run a Google authorization window opens.

## Option A — easiest: upload from your computer browser

Start the private local BailaCue processing studio:

```sh
python web/tools/local_upload_server.py --oauth-client /path/to/desktop-client.json
```

It opens **http://127.0.0.1:38221/** on that computer only.

1. Choose **Salsa** or **Bachata**.
2. Select or drag in **multiple videos at once**. MP4, MOV, WebM, M4V,
   MKV, AVI and 3GP are accepted (maximum 2 GiB each).
3. Click **Upload & optimize selected videos**. The local studio processes
   each source sequentially, saves its untouched original in the fixed
   numbered Drive collection, and creates separate optimized copies.
4. The browser displays the per-video queue and current processing status.
5. Download `bailacue-optimized-manifest.json` from the studio.

The local server listens only on `127.0.0.1`. No credentials or raw video
bytes go through the public Netlify website; originals and processed files
are uploaded to the Google Drive account you authorized locally.

**Import Google Photos and iPhone videos:** Google Photos shared links,
Google Photos albums and iCloud share pages are not raw download URLs.
Open them in the browser and **download** the actual video files first.
An iPhone can also send files to a Mac using AirDrop, or to Windows/Mac
using a supported wired transfer. Add the downloaded/transferred files
with the same multi-select file picker. Do not paste private share links
into unknown third-party downloaders.

## Option B — existing 266 videos in Drive

Open the local studio and click **Convert existing Drive videos**.
Alternatively, for a one-video pilot (recommended), run:

```sh
python web/tools/convert_library_multi.py --oauth-client /path/to/desktop-client.json --run --max-videos 1
```

Then start the remaining one-time migration:

```sh
python web/tools/convert_library_multi.py --oauth-client /path/to/desktop-client.json --run
```

Dry-run (no encoding or file uploads) is the default when `--run` is
omitted. If interrupted, restart: completed copies are discovered via their
original video ID, selected quality, and conversion preset. Partial
quality ladders resume rather than overwriting completed outputs.

## Option C — new videos uploaded through the BailaCue website

The existing BailaCue **Add videos** file picker already accepts multiple
files and uploads originals to their fixed Google Drive folders. A computer
worker can detect and optimize any newly uploaded originals:

```sh
python web/tools/convert_library_multi.py --oauth-client /path/to/desktop-client.json --run --watch --interval-minutes 15
```

This mode requires the computer to stay awake and running. It **does not**
silently execute FFmpeg inside the Android browser or on Netlify.

## Publish quality choices in BailaCue

Open [BailaCue develop](https://develop--bailacue.netlify.app/#upload),
sign in as administrator, and go to **Add videos**. If you used the local
studio to upload new originals, connect Google from BailaCue and click
**Refresh both collections** so these new original IDs enter the catalogue.
Then select the downloaded manifest under **Free video optimization** and
press **Publish optimized copies**.

BailaCue validates that every quality version belongs to the corresponding
original, then keeps the original ID, title, ratings, labels, and metadata
unchanged. The video player has a **Quality** control: Auto (prefer 720p),
360p, 720p, 1080p (when available) and Original. Changing resolution
keeps the same video identity and attempts to keep the same playback position.
If an optimized file is unavailable, it tries the original.

You can repeat the import whenever additional videos are converted; use
the newest **full** generated manifest. This avoids overwriting older
optimized copy mappings with a partial file.

## Quality and safeguards

| Output | Maximum landscape raster | Codec | Purpose |
| --- | --- | --- | --- |
| 360p | 640 × 360 | H.264/AAC | Fast mobile playback |
| 720p | 1280 × 720 | H.264/AAC | Default |
| 1080p | 1920 × 1080 | H.264/AAC | High-quality viewing |

Portrait orientation is preserved. No rendition is scaled above the
original dimensions. All outputs are **MP4 + fast-start**; this is a
manually selectable set of MP4 versions, **not HLS adaptive streaming**.

- Original files never move or overwrite.
- Optimized copies are stored only in the new Salsa/Bachata folders under:
  https://drive.google.com/drive/folders/1CErkH8BmExpKGZXHSl1hnDbs6fgr08PQ
- Temporary local video bytes are deleted after each completed conversion.
- Downloaded size, output codec, dimensions and uploaded size are validated.
- Existing conversions are discovered via Google Drive `appProperties`.
- No paid streaming conversion endpoints remain active.
- Google Drive still serves bytes through BailaCue's existing bounded media
  proxy. Quality and start time depend on public Drive access/quota/network;
  it is not a guaranteed CDN or instant playback.

The files in this repository do not convert anything on their own.
They need a real computer running FFmpeg with Google Drive credentials
and sufficient quota. The current code has been exercised in automated
lint/type/build/syntax tests, not yet against all actual 266 sources.

# BailaCue: free original-preserving video conversion

The BailaCue library has 266 Google Drive originals, around 44.69 GiB. All
originals stay in their existing Salsa/Bachata folders. A free Python + FFmpeg
script processes **one original at a time** on your own computer, then uploads a
new playback-friendly MP4 to the dedicated Drive folders. No paid encoding,
Cloudflare Stream, or other video provider is required.

Optimized folders:
- Root: https://drive.google.com/drive/folders/1CErkH8BmExpKGZXHSl1hnDbs6fgr08PQ
- Salsa: https://drive.google.com/drive/folders/1Z8yfu20bLFKChQGXYQQ8uZZoEDMTSx1f
- Bachata: https://drive.google.com/drive/folders/1rOwr5utjZ-gfCj5Zj6KlOjmqdFRu8ncq

**Google Drive storage used by optimized copies is not free if it exceeds your
existing quota.** You must have adequate Drive space, and a computer that can
run FFmpeg. The program uses CPU encoding; bandwidth and electricity may also
have real costs.

## Set up your computer

1. Install Python 3.10+ and FFmpeg (both ffmpeg and ffprobe in PATH).
2. In a terminal from the repository root, run:
   python -m pip install -r web/tools/requirements-free-video.txt
3. Use a Google Cloud OAuth **Desktop** application for the Google account
   authorized to read the original Drive folders and write the two optimized
   folders. Enable the Google Drive API in that project, and download its
   Desktop OAuth client JSON. Do not put the OAuth JSON or token in GitHub.
4. Dry run and inspect the video count, without uploading:
   python web/tools/convert_drive_library.py --oauth-client /path/to/client_secret.json
5. Pilot **one** source video, listen/watch/seek/fullscreen-test the result:
   python web/tools/convert_drive_library.py --oauth-client /path/to/client_secret.json --run --max-videos 1
6. Continue the rest of the originals:
   python web/tools/convert_drive_library.py --oauth-client /path/to/client_secret.json --run

The temporary original and converted copy are deleted after each successful
upload. Google Drive is searched for already-processed copies, using their
recorded original source ID and preset. The program saves a local JSON manifest
after each successful video, so rerunning the command resumes where it left off.
Do not run two workers simultaneously.

The manifest filename is bailacue-optimized-manifest.json.

## Publish in BailaCue

In the develop website, sign in as BailaCue administrator, choose **Add videos**,
and find **Free video optimization**. Select the generated manifest JSON and
choose **Publish optimized copies**. This validates original IDs/dance folders
and saves the mapping to the existing protected public catalogue.

The app preferentially plays the derived MP4; if it errors, it retries the
unchanged original. Video IDs, user metadata, ratings and tags stay associated
with the original.

Publish once after the single-video pilot and again after the full batch.
A later import replaces the manifest with the converter's complete list.

## Future uploads: optional free incremental desktop processing

The same script can automatically discover new BailaCue Drive uploads every
15 minutes while your computer is running:

python web/tools/convert_drive_library.py --oauth-client /path/to/client_secret.json --run --watch --interval-minutes 15

This **automatically converts and uploads copies to Drive** but does not yet
automatically import the revised manifest into BailaCue; the administrator
must re-import the updated JSON in the Add videos screen.

**Android caveat:** Browser-only video conversion on a phone may be slow,
memory-intensive and interrupted by OS background suspension, especially for
200–700 MB sources. This computer worker is the reliable, free fallback.
Native in-browser conversion for small files is a separate, unimplemented
enhancement, not something promised as working today.

## Encoding and safeguards

- Video: MP4, H.264 x264, 8-bit yuv420p, CRF 24, veryfast preset; max
  dimension 1280 pixels without upscaling (approx. 720p).
- Audio: AAC stereo 96 kbps if the original contains audio.
- MP4 fast-start moov atom for a faster playable first frame.
- Original folders are only read, never changed or overwritten.
- Files are only written into the two dedicated optimized folders.
- Every download, codec and upload size is validated before it is published.
- The generated JSON manifest never contains Google credentials.
- Google video share permissions and API quotas can limit playback.
- Optimized playback still uses BailaCue's existing 4 MiB Drive range proxy;
  it is not a dedicated CDN, so startup performance is not guaranteed.

This converter requires a **computer executing it**. Committing these files
to the website does not initiate conversion or create any optimized video.

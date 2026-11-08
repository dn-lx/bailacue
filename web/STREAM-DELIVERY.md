# BailaCue adaptive video delivery — pilot integration

Status: **automatic conversion and a one-time resumable existing-library backfill are implemented behind an off-by-default provider switch** on the `develop`
web deployment. No Cloudflare Stream account, payment plan, credentials, or upload
has been activated by this repository. The Google Drive video catalogue remains
the source of truth and continues to play through its existing validated range
proxy whenever a ready Stream copy is not published.

## Architecture

1. Owner opens a Drive-origin video while authenticated via Supabase.
2. Owner selects the **exact original local file** (same byte length) and reads
   or enters its duration. This prevents accidental mismatches.
3. `POST /api/stream/prepare` checks owner identity against
   `public.bailacue_web_admins`, confirms the locked Salsa/Bachata source,
   checks file size and the duration reservation limit, binds the source using
   Cloudflare's supported **Upload-Creator** attribute, and uses a **runtime
   Cloudflare API token** to create a short-lived direct TUS upload URL.
4. Original video bytes travel **directly from the browser to Cloudflare** in
   10 MiB resumable chunks. The API token is never returned to the browser.
   Pause, resume in the same tab, or reselect the same original after a transient
   network error. Upload progress tracks acknowledged byte offsets.
5. Processing does not make the video public automatically. The owner selects
   **Check video processing**. `POST /api/stream/status` verifies the Cloudflare
   video is fully ready, bound to its BailaCue source ID, and has a permitted
   public playback hostname. Only then does it publish a sanitized
   `stream:<drive-video-id>` mapping to existing Supabase RLS-protected content.
6. Everyone receives a Cloudflare adaptive player for **only those videos**.
   Others keep their original Google Drive player. The **Use Drive preview**
   option remains available if an adaptive copy cannot play.

This is real managed video encoding and adaptive CDN delivery, not preloading
every video file in full. Video delivery fetches encoded segments progressively
and the player selects a suitable quality for the network. It does not guarantee
instant playback or uninterrupted viewing on a poor connection.

## Credentials and activation — in Netlify UI, never Git or chat

Create an account and enable Stream separately. In Netlify BailaCue project
`https://app.netlify.com/projects/bailacue`, open Project configuration →
Environment variables and configure the **develop / branch-deploy** function
environment. All these variables must be available to **Functions**, and the
site must be redeployed after changing them:

| Variable | Value |
| --- | --- |
| `BAILACUE_STREAM_ENABLED` | `true` **only after agreeing to Cloudflare billing** (otherwise omitted or `false`) |
| `BAILACUE_CLOUDFLARE_ACCOUNT_ID` | Your Cloudflare account ID (32-character hexadecimal) |
| `BAILACUE_CLOUDFLARE_API_TOKEN` | A private Cloudflare API token with scoped **Stream Write** and video status/read permissions. Store as a **secret**; never place it in public env or Git |
| `BAILACUE_STREAM_MAX_DURATION_SECONDS` | Optional strict reservation cap; defaults to **900 seconds per upload** |

No provider secrets are in `public-config.json` or the published site.
Even if a visitor discovers `/api/stream/prepare`, it fails unless Stream
is explicitly enabled *and* the request has a valid **single-owner** Supabase
Auth token. Netlify proxies only provider-control requests, never large media
upload bytes.

**Capacity guard:** A single pilot upload may be up to 2 GiB and is limited to
15 minutes reserved by default. Cloudflare reserves video storage capacity
when a TUS upload is prepared and bills actual duration once processed.
The owner must check provider balance/limits before enabling uploads.
Enabling the provider makes **future owner uploads through BailaCue** automatically submit a derived Stream copy. A one-time backfill of existing videos remains an **explicit, separate owner action**, with a charge acknowledgement. Nothing begins automatically on deploy.

## Automatic conversion and one-time existing-video backfill

- **New uploads:** once Stream is explicitly enabled, the owner uploads normally to Google Drive. After Drive confirms the original, BailaCue confirms that original is published and uploads the already-selected file directly to Cloudflare Stream through its existing TUS workflow. A failure in optimization does **not** delete, overwrite, or roll back the original.
- **Existing videos (one-time):** sign in as BailaCue admin, connect the Google account that can read the two fixed Drive folders, open **Add videos**, and choose **Optimize existing library** under **Optional video optimization**. The page reads the existing Salsa/Bachata folders and transfers each unoptimized video in 10 MiB Drive-to-browser-to-Cloudflare chunks, **one video at a time**. The original stays untouched and is never downloaded as one giant browser Blob.
- Before a backfill run the owner must tick a checkbox acknowledging **Cloudflare Stream costs**. If the provider is not configured, the button remains disabled. The browser never receives the Cloudflare API token.
- The backfill checks existing public Stream mappings and skips already converted originals. Incomplete TUS uploads are resumable; their short-lived upload reference is kept in browser local storage to help recover after a tab closes. A processed video is only publicly published after the server confirms readiness and source association.
- Keep the browser tab open and the device awake. This is **not an unattended server-side migration**: Google OAuth access tokens can expire (reconnect and resume), the browser can be suspended on Android, and the two networks collectively transfer the original library size once to the device and once from the device.
- Videos without Drive duration metadata are skipped, not guessed: Cloudflare requires an explicit maximum duration reservation. Very long originals may exceed the configured 15-minute reservation cap and require deliberate limit changes. The tool reports skipped videos so they can be addressed separately.
- **Idempotency limitation:** in-progress provider copies not yet published and with an expired/lost upload reference could be recreated on a fresh device, incurring duplicate storage charges. Do not start backfill simultaneously in two browsers. Check the provider dashboard before retrying an uncertain or failed video.
- Do not enable all-library processing until capacity and budget are planned from actual video durations. There is no hard aggregate budget cap enforced by this browser workflow.

## Trial steps

1. Arrange suitable Stream storage capacity in Cloudflare and set the four
   Netlify runtime variables **only on develop**.
2. Sign into BailaCue's develop website as the existing admin.
3. Open **one** representative Salsa or Bachata video in the library.
4. Under **Adaptive video delivery**, select the matching file from your
   device and confirm its estimated duration. Upload/resume if needed.
5. When the upload reaches 100%, select **Check video processing** until ready.
   A ready copy is published atomically to the public catalogue; reopen the
   video on a second guest browser to verify adaptive playback and Drive fallback.
6. Check startup latency, seek response, stalls, audio synchronization,
   mobile behavior and Cloudflare usage before converting additional videos.

## Billing and capacity planning

Cloudflare Stream documentation as of November 2026:
- Stored capacity: **USD $5/month per 1,000 stored minutes**, prepaid in blocks.
- Delivered minutes: **USD $1 per 1,000 delivered minutes**.
- Encoding and ingest are included; preloaded segments can count as delivered
  minutes, so avoid auto-loading videos in bulk.
- **No new charges have been authorized or initiated in this implementation.**

The locked Google Drive catalogue currently contains **266 files, 44.7 GiB**.
Their duration metadata is unavailable; storage pricing is duration-based, so
a full-library estimate requires inspecting the files and summing durations.
For example, **266 videos × 5 minutes = 1,330 stored minutes** and would require
**2,000 minutes of prepaid storage capacity** (2 × $5/month); actual charges
depend on the real videos and the selected plan. Video delivery charges vary
with viewing volume and preloading.

## Operational safety

- Keep all Google originals; Stream copies are a **derived delivery layer**.
- Do not store provider API tokens in Supabase content or public JavaScript.
- Only publish fully processed copies, tied to an allowed source ID.
- Keep the original Drive preview available for fallback.
- Limiting who uploads is enforced in the Netlify API, not merely the UI.
- Existing catalogue URLs, labels and user-visible public video IDs are unchanged.
- Manual per-video conversion still supports selecting the matching original file.
  The automatic upload flow reuses that file after Drive confirms its save.
  The one-time backfill reads known originals via authenticated Google Drive API
  byte ranges in the owner's browser, without sharing a Google token with Cloudflare.
- A fully unattended server migration has **not** been activated or configured;
  the browser-based backfill needs an active owner session and can be resumed.
- If a paid Stream copy is unpublished, Cloudflare will still bill for stored
  video **until that video is deleted from Cloudflare**. The UI does not
  automatically delete provider assets.

## Files and checks

- `stream-delivery.mjs`: validates ready provider metadata and playback hosts.
- `stream-admin.mjs`: owner browser uploader, auto-conversion engine, bounded Drive byte-range backfill, resumable TUS and status publication.
- `studio-ui.mjs`: upload-triggered optimization and explicit one-time backfill controls.
- `tests/stream-automation.test.mjs`: disabled-provider and validated Drive-range checks.
- `stream-api.mjs`: authenticated, disabled-by-default ingestion and publication.
- `netlify/functions/stream.mjs`: Netlify function entry point and secret access.
- `player.mjs`: adaptive player with Drive fallback.
- `tests/stream.test.mjs`: cost gate, auth, upload, readiness and hostile inputs.
- `netlify.toml`: limited additional frame, image and upload origins.

```sh
cd web
npm ci
npm run lint
npm run typecheck
npm test
npm run build
```

Docs:
- https://developers.cloudflare.com/stream/pricing/
- https://developers.cloudflare.com/stream/uploading-videos/direct-creator-uploads/
- https://developers.cloudflare.com/stream/uploading-videos/resumable-uploads/
- https://developers.cloudflare.com/stream/viewing-videos/using-the-stream-player/
- https://developers.cloudflare.com/stream/uploading-videos/upload-via-link/

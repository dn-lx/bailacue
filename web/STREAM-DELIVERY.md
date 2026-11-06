# BailaCue adaptive video delivery — pilot integration

Status: **implemented behind an off-by-default provider switch** on the `develop`
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
   checks file size and the duration reservation limit, and uses a **runtime
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
There is no batch migration or automatic paid job.

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
- Current pilot assumes the owner already has (or downloads) a local copy of
  the matching original. The browser Google OAuth token is intentionally not
  sent to Cloudflare or stored on the server.
- **Automatic Drive-to-Stream migration of all 266 originals is not implemented**.
  Google Drive share links are unsuitable as reliable Stream copy URLs.
  A later server-side migrator should use the authorized Drive API and
  Cloudflare resumable uploads with bounded concurrency, audit records,
  retry/idempotency, capacity planning and an explicit spending limit.
- If a paid Stream copy is unpublished, Cloudflare will still bill for stored
  video **until that video is deleted from Cloudflare**. The UI does not
  automatically delete provider assets.

## Files and checks

- `stream-delivery.mjs`: validates ready provider metadata and playback hosts.
- `stream-admin.mjs`: owner browser uploader and processing status.
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

# BailaCue web · Public collection and private administration

BailaCue is a public Salsa and Bachata video website. Viewers do not need accounts.
The browser app is under `web/` and deploys as a Netlify branch build. The Expo
mobile app is separate and has not been changed in this version.

## Experience
- Public video library, search, artist/style labels and the fixed Salsa/Bachata collections.
- The video popup prioritizes portrait and landscape playback, includes touch/keyboard video-height dragging, optional desktop width dragging, and Reset size/Auto height controls. Preferences are stored locally and video frames remain uncropped.
- Choose the number of videos (from 1 up to the available catalogue size), then create a Salsa mix, Bachata mix or combined Salsa + Bachata mix. Mix size is saved locally, and is limited to the number of videos available for the selected dance. Native HTML5 and individual YouTube videos advance automatically to the next mix item when a video ends, where autoplay is permitted; iframe fallback and adaptive Stream copies retain manual Next/Previous controls.
- No favourites tab, learning status, BPM entry or saved A–B practice loops.
- Footer: "Create your own BailaCue with your own videos", opening
  `https://wa.me/491796932923`.
- Video uses the existing native HTML5 player (Drive originals), or YouTube's
  official iframe player. HTML5 video now requests early buffering
  (`preload="auto"`) and waits until it is playable to enable controls.

## Public navigation and accessibility
The header shows **Sign in** instead of administrator terminology, with password visibility and remembered owner access. Mobile viewers have a dedicated Settings shortcut, large touch targets, and accessible video result counts. See [UI-UX-AUDIT.md](UI-UX-AUDIT.md) for the latest refinements.

## Administration and authentication
The owner signs in using the already-existing Supabase Auth email/password
credentials. The client uses only the public publishable key. Tokens are restored
from browser storage and refreshed as needed, until the owner signs out.
No signup flow is exposed.

The isolated tables `public.bailacue_web_admins` (one seeded owner) and
`public.bailacue_web_content` were created in the connected Me+ Supabase project.
They have row-level security: guests and logged users may **read published
content**, and only that listed admin may insert, update or delete content.
Original Me+ domain and retired BailaCue tables remain untouched.

Public content contains keys `labels`, `meta:<video-id>`,
`drive:<video-id>`, and `youtube:<video-id>`. Browser legacy state is
not copied to the shared library automatically. If an older browser had private
labels, YouTube entries or notes, a one-time backup is retained locally; once
signed in, the administrator can export that original from Settings and decide
whether to import it into the new shared public collection. New metadata and new uploads
are published through the authenticated Supabase Data API. The editor still
requires separate Google Drive OAuth to upload original video files into the
fixed Salsa/Bachata folders.

The relevant migration is documented in `ADMIN-DATABASE.sql`. Do not grant
edit access based on user-controlled metadata, and never embed a service-role key
in browser code.

## Adaptive delivery pilot (disabled until a paid provider is explicitly enabled)

A Cloudflare Stream integration is available on `develop` for **one-video-at-a-time** pilot conversion. It adds owner-authorized resumable TUS uploads (up to 2 GiB), provider processing checks and automatic public playback mapping only after the provider marks a copy ready. Drive originals remain unchanged and serve as fallback. A 15-minute per-upload reservation cap and a disabled-by-default configuration help prevent accidental charges.

**No Cloudflare account credentials or paid processing have been configured.** Read [STREAM-DELIVERY.md](STREAM-DELIVERY.md) for setup, costs, permission boundaries and operation.

## Large originals and smooth playback
The original Google Drive files are typically much larger than a normal
web-app asset (the current library's median is about 160 MiB; some exceed
700 MiB). The existing Netlify media proxy returns validated 4 MiB byte-range
responses with no video copies. The HTML5 player now asks to preload promptly
and prepares a playable buffer before enabling Play. **It does not download
100–700 MiB originals in full before playback**: browsers may continue fetching
while playback progresses. YouTube also uses streaming/adaptive delivery rather
than downloading the entire file before play. True upload-once, CDN-delivered
video requires an ingestion/transcoding/storage pipeline, plus bandwidth and
cost planning. This was not enabled or charged for.

The fixed catalogue is bundled in `web/catalogue.json` and existing functions
serve those entries without viewer authentication. The media handler also checks
the public Supabase content table for newly owner-published Drive files,
validates their IDs, fixed-folder association and size, then serves them through
the existing bounded range proxy without requiring a catalogue redeploy.
Playback still depends on Drive's public sharing permissions, quotas and codecs;
Drive preview and Open original remain fallbacks.

## Build and deployment
```sh
cd web
npm ci
npm run lint
npm run typecheck
npm test
npm run build
```

`netlify.toml` runs all checks before publishing `web/dist`. Changes are
committed on `develop` and deployed to `https://develop--bailacue.netlify.app`.
`main` and production `https://bailacue.netlify.app` remain untouched.

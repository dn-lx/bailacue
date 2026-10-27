# BailaCue

**Watch. Practise. Repeat.** A private dance video library with Salsa, Bachata and custom dance types for Android
and iOS, built with React Native, TypeScript and Expo SDK 58.

<img src="assets/brand/symbol-color-transparent.png" alt="BailaCue transparent blue b symbol with centered play button" width="160" />

## Install Android

Download [BailaCue 0.3.0 for Android](https://github.com/dn-lx/BailaCue/releases/download/v0.3.0-preview.27/BailaCue-v0.3.0-build27-preview.apk)
or open [release notes](https://github.com/dn-lx/BailaCue/releases/tag/v0.3.0-preview.27).
Open it on an Android phone and allow installation from your browser/files app when
Android asks. This is an internal preview signed with a test certificate, not a
Play Store release. Version **0.3.0 (27)**; minimum Android 7/API 24.

No Metro server or Expo Go is needed for the APK. iOS needs a separate signed build
with an Apple Developer account; an Android APK cannot be installed on an iPhone.

Preview publication is gated on Google ARTEMIS native checks, including actual
resize/trim-handle gestures, real import, new-file trimming, original-byte preservation,
saving to Photos, artist-label creation/reuse and rated Salsa/Bachata Daily Picks.
Native checks, the separate live YouTube attempt and public APK identity are recorded in the verification report below.
[Verification and screenshots](docs/VERIFICATION.md) record exact scope and remaining
live-provider/iOS setup. The release verification records the final native and public-download evidence.

## What is implemented

- [Optional numbered filenames](docs/SOURCE-NUMBERING.md): preview, explicitly apply, pause and retry per-file failures. Connecting/refreshing keeps actual filenames. New-upload numbering is off by default.
- Preview an imported video before choosing its dance style and destination.
- Owner-selected concept05 b/play icon, black alternate, wordmarks, adaptive icon, splash,
  coordinated badges and blue/black light/dark themes. [Brand asset inventory](docs/brand/README.md)
  lists 70 exports, geometric SVG and outlined-wordmark masters, transparent/monochrome families and platform assets.
- [Rating-led Daily Picks](docs/DAILY-PICKS.md): one video per selected dance by default, advanced source selection, unrated counted as 5★,
  independent cooldowns, minimum stars and an explicit update-today action.
- [Continuous Practice](docs/PRACTICE.md): filtered, rating-weighted balanced queues, Previous/Next,
  named loops, actual active-time timing, breaks, safe restore and idempotent history.
- [YouTube videos/playlists](docs/YOUTUBE.md): explicit cue discovery without starting playback, visible Add, durable save/retry and Open Library; optional owner-supplied Bachata Tutorials,
  manual links, previews, selection, pagination/refresh and deduplicated personal metadata.
  Opt in for online Daily Picks/Practice; YouTube has no file-download or editing actions.
- [Product/reliability audit PDF](docs/audits/BailaCue-Audit-2026-10-18.pdf) with prioritized improvements
  and evidence; other recommendations remain open.
- Searchable [label dropdowns](docs/LABELS.md): choose existing video-type/artist labels or
  create new ones in imports, video details and cloud-folder defaults.
- Local import/camera recording, all star ratings and Unrated, numeric/date/rating/title sorting, dance/label/source filters,
  unified notes/moments, ordered collections, Daily Picks and continuous timed Practice.
- Native player with draggable and accessible resize grip, speed/pitch, mirror, full screen,
  seeking, timeline trim handles and named A–B loops.
- **[New trimmed MP4 files](docs/VIDEO-EDITING.md)** as separate library entries: choose phone storage or an
  exact cloud folder before saving; Save to Photos / Share / Save file for phone clips. Originals are preserved. Speed and Mirror
  are practice controls and are not baked into exported trims.
- User-selected **Drive and Dropbox accounts/folders**, defaults, folder refresh,
  stable file identities, online streaming and selective phone downloads.
- Imports/recordings offer **phone or online storage**: upload directly to a selected
  folder; retain a phone copy or remove it only after upload confirmation.
- Separate **Salsa and Bachata folder sources**, including two folders on one
  account or a mix of providers; independent defaults and Library source filters.
- Wi-Fi preference, download progress/cancel/delete, explicit online/phone choice,
  and recoverable chunked uploads with stable destinations and no original overwrite.
- Side-by-side reference/self comparison with manual offset, speed, mirror and mute;
  configurable local reminders/quiet hours and optional biometric/device lock.
- Local SQLite libraries, migration of existing phone libraries, label management,
  checksummed file/Drive/Dropbox metadata backups and optional two-way Google Sheets
  sync with offline retry, conflict review and versioned recovery.
- Refined compact layouts, denser Library cards and native press/entry motion that
  honors reduced motion. The approved blue/black concept05 b/play icon is retained.

Each user connects their own video repository. OAuth still requires the app's
one-time Google/Dropbox registration: see [cloud setup](docs/CLOUD-STORAGE.md).
Google registration errors now offer a clear explanation, Files import and setup help;
**Drive sign-in still requires Google Cloud OAuth registration.** The preview contains
no invented credentials. Without provider registration, import
videos from installed cloud apps through the phone's Files picker. Local use needs
no BailaCue account. Ratings are user choices; labels start from folder defaults,
not automatic video-content analysis.

See [actual verification](docs/VERIFICATION.md) and the [full scope ledger](docs/BACKLOG.md).
The [approved requirements](docs/PRODUCT-REQUIREMENTS.md), [implementation tracker](docs/IMPLEMENTATION-TRACKER.md)
and [UI/UX direction](docs/UI-UX-DIRECTION.md) describe the first delivery.
The [round-2 requirements](docs/REQUIREMENTS-ROUND-2.md) add reliable playlist imports, compact YouTube titles, resize/full screen the transparent b/play identity and centered chip groups.
Implemented source and mock tests do not imply live OAuth or physical-device validation.
WebDAV/S3 adapters and store publication remain separate work.

## Develop and test

Requirements: Node 24, npm; Java 21 + Android SDK/NDK for Android; macOS/Xcode for iOS.

```sh
npm ci
npm run start               # custom development build; Expo Go is insufficient
npm run android
npm run ios                 # macOS/Xcode only
npm run web
npm run typecheck
npm run lint
npm test                    # domain, provider APIs, actual SQLite, recovery and Sheets
npm run build:web -- --clear
npx playwright install --with-deps chromium
npm run test:e2e             # owned MP4 fixtures in tests/fixtures; no private videos
```

Browser previews support real local IndexedDB imports and compatible streaming;
mobile native export, downloads, recording and device lock require the mobile app.
Browser provider credentials are memory-only and need reconnect after reload.

## Builds and signing

```sh
export ANDROID_HOME=/path/to/android-sdk
export BAILACUE_ARCHS=arm64-v8a,x86_64
npm run build:android
```

The script generates Android from Expo config and builds a bundled release-mode APK
at `artifacts/BailaCue-v0.3.0-build27-preview.apk` with SHA-256. Native media code is
committed under `modules/baila-media`; generated root `android/` and `ios/` are ignored.
The generated internal debug certificate is used for previews; configure your own
release signing before store publication. Never commit signing keys.

EAS is supported by `eas.json`, but needs your Expo account/project and potentially
paid build capacity. The unsigned iOS simulator compile passes on a macOS Actions runner;
iOS device distribution still needs Apple signing/provisioning. No store submission is performed by CI.

## Local storage and configuration

See [local storage and recovery](docs/LOCAL-STORAGE.md) and the
[current requirements](docs/LOCAL-FIRST-REQUIREMENTS.md). The mobile app has no Me+
endpoint or BailaCue account dependency. Historical gateway/migrations are archived;
shared production data has not been deleted or modified.

[Cloud setup](docs/CLOUD-STORAGE.md) and [.env.example](.env.example) list public
Google/Dropbox app identifiers and optional YouTube API configuration. Google Sheets
API must also be enabled in the OAuth app's Google Cloud project before spreadsheet
sync works. Users choose their own storage accounts, folders and spreadsheet.
Full YouTube pagination needs a Data API key; keyless discovery can be limited.
Never put service/admin credentials, client secrets or refresh tokens in public config.

## Privacy

Phone files are app-private copies; Android backup is disabled and the native iOS
module protects/excludes owned media from backups. Original provider/gallery files
are never removed by app deletion or trimming. Photos/external shares require their
own deletion. Downloads cannot be remotely revoked while offline; permission is checked
online. Disconnecting a provider clears its app credentials; review the in-app choices for retained phone copies. Keep originals in your
chosen storage. Local notification delivery depends on OS settings; no exact remote
refresh or push-delivery guarantee is made.

[Architecture](docs/ARCHITECTURE.md) · [Brand assets](docs/brand/README.md) ·
[Build brief](docs/BUILD-BRIEF.md) · [ARTEMIS testing](docs/ARTEMIS.md)

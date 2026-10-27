# BailaCue architecture · 0.2.3

Expo SDK 58 / React Native 0.88 / TypeScript, Expo Router and a shared Android/iOS UI.
Routes in `src/app` use `LibraryProvider`, domain functions and platform services.
Metadata persists through a serial write queue. Guest/account libraries have distinct
keys and keyed provider lifetimes. OAuth credentials and upload sessions use native
SecureStore; browser previews keep credentials in memory. Metadata contains no tokens.

## Media and providers

`VideoProvider` adapters isolate Drive/Dropbox listing, folder capabilities and playback.
Sources contain a user connection, folder reference, friendly name and defaults. Complete
paginated scans reconcile deterministic provider/account/file IDs and memberships;
refresh/reconnect preserves user-owned title/labels/rating/notes/sections. Failed scans
leave availability unchanged. A full scan, rather than incremental provider cursors,
is currently used. Sources scan their immediate folder, not descendants implicitly.

Drive uses native Google sign-in with readonly access and explicit write escalation.
Dropbox uses browser OAuth PKCE/state and device-secured refresh tokens. One-time app
registrations are required independently of each user's account; see CLOUD-STORAGE.md.
Remote playback resolves fresh addresses/headers with caching disabled. Selected phone
copies use bounded native download progress, validation and partial cleanup. Native
uploads read bounded chunks and securely persist provider-acknowledged progress.
Drive reserves its file ID before starting a session; Dropbox keeps a stable unique
path, strict conflict checks and session cursors. Retry first reconciles completion.

Expo Video handles independent practice/comparison players. `modules/baila-media` is
an autolinked Expo module: Android Media3 Transformer 1.9.1, iOS AVFoundation. Import
retains a private copy; export validates canonical private paths and real duration,
creates a unique MP4 and registers a separate video with fresh metadata. No source
overwrite. Cancel/failure deletes partial output. Export is foreground work; playback
speed, mirror and count are not baked into output. iOS source has not been compiled here.

## Scoped Me+ backend

The original 23-table owner-isolated migration is live in the explicitly approved Me+
project. The new service-only sessions/snapshots/rate-limits/collection-grants migration
and `bailacue-api` function are deployed after explicit owner approval. See ACCOUNT-API.md.

The gateway verifies credentials through Supabase Auth and returns only a custom
random BailaCue session. Me+ Auth JWT/refresh tokens stay server-side. Owner IDs derive
from hashed, unexpired sessions, never request bodies. The app has no health-domain
access path. RLS/grants forbid client access to private gateway tables. Cleanup targets
an allowlist of BailaCue tables and does not remove the shared `auth.users` identity.

Metadata snapshots use compare-and-swap revisions and explicit user resolution. Device
paths, thumbnails, OAuth credentials, upload sessions, lock/reminder state are excluded.
Sync is manual; no automatic merging is claimed. Collection grants expose allowlisted
provider references/titles. Each recipient must prove provider access with its own
credentials. Revocation is checked online; offline remote-wipe is not promised.

## Practice

Only available videos enter deterministic Daily Picks. Score: 12/preferred label,
8/preferred style, 3 × importance, To learn 8 / Practising 6 / Learned −8, never-practised
6, up to 10 for time since practice, and 6 × bounded user feedback. Cooldown defaults
to three days; diversity discounts repeated style/labels. Stable-day picks survive
preference edits. Skip is a day flag. Manual sync can transfer the saved selection;
server-generated daily selection and automatic cross-device merge are pending.

Weekly native notification triggers use local time. Quiet-hour calculations adjust
day rollover, deterministic identifiers prevent duplicates, and changes cancel the
previous plan. Contextual permission is requested only when enabling. App foreground
reconciliation handles schedule/timezone changes; OS delivery limits still apply.
New-video remote checks need separately consented server provider credentials and
scheduler/push infrastructure. Background device execution is not substituted for it.
Optional LocalAuthentication protects reopening the app. The count overlay is manual
BPM/pattern/offset; comparison uses manual alignment, not exact synchronisation.

## Verification boundaries

Actual PostgreSQL tests exercise both migrations, negative grants/ownership and cleanup;
mock gateway/provider tests exercise network failures, identity/revision boundaries and
retry behaviour. Browser journeys exercise rendered UI and real synthetic playback.
Live OAuth and two real Me+ accounts, large-file stress and device accessibility/codec
acceptance remain distinct from these results. See VERIFICATION.md and ARTEMIS.md.

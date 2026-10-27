# Complete product scope and acceptance ledger

The original [build brief](BUILD-BRIEF.md) and subsequently approved [full-document requirements](PRODUCT-REQUIREMENTS.md) define current scope. The latest user decisions supersede older UI/default descriptions in this historical milestone ledger. See [current implementation](IMPLEMENTATION-TRACKER.md). No item below is
a claim of native device validation. `[x]` means implemented with recorded local
verification; `[ ]` means still pending, including implemented code awaiting its
necessary integration/device validation. See VERIFICATION.md for exact evidence.

## 0.2.3 continuation

Implemented: Drive/Dropbox account and folder UI, native credentials/PKCE, paginated
scans, defaults/deduplication/reconnect preservation, source filters, streaming,
selective phone copies, recoverable uploads, Photos/file saves, comparison, reminders,
quiet hours and device lock. The scoped account/sync/sharing API and additive migration
are implemented and locally tested; production deployment is live after explicit owner approval. See
[CLOUD-STORAGE.md](CLOUD-STORAGE.md) and [ACCOUNT-API.md](ACCOUNT-API.md).

The unchecked milestone acceptance below remains unchecked where live registration,
server deployment or device validation is still required. WebDAV/S3, automatic sync,
server-generated picks and remote new-video push remain implementation work.

## M1 · Foundation and first local vertical slice

- [x] Shared TypeScript Android/iOS project; tab navigation; routed video details.
- [x] Original icon, adaptive icon, splash, palette, typography, status/style badges.
- [x] Light/dark/system themes; labelled controls and 44–48 dp touch targets.
- [x] Local video import, title/style/labels/importance/teacher/class/location/date/notes.
- [x] Persisted local library, search, combined style/status/importance filters.
- [x] Browser-verified playback, saved sections, notes, timestamp seeking/bookmarks.
- [x] Collections with cross-library membership and manual order.
- [x] Me+ identity/schema read-only inspection and integration design.
- [x] Additive owner-isolated schema; real local PostgreSQL negative access tests.
- [x] Full scope backlog, CI definitions, build instructions and versioning.
- [x] Android ARM64 preview APK built; signature, version and packaged assets verified.
- [x] Android API35 emulator launch/import/section/export/Photos acceptance via Google ARTEMIS.
- [ ] Physical Android hardening; iOS native compile, signing and device validation.

## M2 · Connected working core

- [x] Owner explicitly selected shared Me+; additive migration applied and advisors checked.
- [ ] Reuse Me+ Auth; username/password registration/login, rate limits, recovery,
      secure expiring/revocable sessions, password change and logout. Never read health data.
- [ ] Real two-account RLS/API and existing Me+ policy review.
- [ ] Secure Google OAuth PKCE flow, callbacks, least scopes, token expiry/reconnect.
- [ ] Two independent Drive folders on one account; source add/rename/edit/disconnect;
      default style/labels; write capability; preserve metadata on reconnect.
- [ ] Existing-folder discovery, initial import, pull-to-refresh, incremental refresh,
      last sync, moved/renamed/deleted/restricted files and deduped memberships.
- [ ] Pick explicit writable destination; upload gallery/file/recording with metadata.
- [ ] Resumable upload initiation, persisted secure jobs, progress/cancel/retry;
      reconcile expiry/completion by stable provider ID; register only confirmed files.
- [x] Mock-HTTP tests for Drive paging, two folders, read-only/401/403/404 errors.
- [x] Upload transport tests for retry identity, interruption, acknowledgement, completion.
- [ ] Real interrupted upload, read-only destination, duplicate retry and token expiry tests.
- [ ] Authenticated remote playback; remote labels/priority/notes/search and source filters.
- [ ] Cross-device metadata sync, stable IDs, optimistic revision/conflict UI.
- [ ] Acceptance journey: register → connect Salsa + Bachata → upload to chosen folder
      → label/rate/note → saved loop → receive/open Daily Pick on device.

## M3 · Practice and personalisation

- [x] Explainable deterministic picks; status/importance/labels/unwatched/recency;
      cooldown/diversity/fallbacks; More/Less/Learned/Skip; device-local persistence.
- [x] Ranking/cooldown, stable-day, missing-access, empty-library and Skip tests.
- [ ] Server-stable cross-device picks; reroll; weekdays/timezone/frequency/teacher/level options.
- [ ] Native playback verification: full screen, resume, speed/pitch, seeking, mirror,
      A–B loops with multiple named sections; format and unavailable-file errors.
- [ ] Selected-video offline downloads, usage/delete controls, Wi-Fi preference,
      permission revocation handling, user-specific protected-cache cleanup on logout.
- [x] Local focus/break timer and session journal with weekly goals/progress.
- [ ] Timer interruption/device clock tests and session conflict/recovery policy.
- [ ] Contextual notification permission; local practice and pick reminders, quiet hours,
      immediate preference changes, DST/timezone reconciliation and deep links.
- [ ] Schedule-change/cancellation/duplicate-suppression and permission denial tests.

## M4 · Editing, comparison, sharing and privacy

- [x] Android Media3 trim1–4s to separate MP4, original checksum unchanged and Photos save verified by ARTEMIS.
- [ ] AVFoundation/iOS compilation/runtime; native cancel/failure/unsupported-codec paths.
      Native implementation and export/Photos/share UI exist in this branch.
- [ ] Native camera permission/denial, recording and explicit local-save validation.
- [ ] Side-by-side reference/self recording with manual alignment and independent mute.
- [x] Adjustable count overlay with tempo/pattern/offset; explicit manual timing copy.
- [ ] Count overlay native verification at different playback speeds and seek positions.
- [ ] Export upload to explicitly chosen writable source; export-job recovery/storage cleanup.
- [ ] Provider-aware playlist sharing, explicit access adjustment and grant revocation;
      inaccessible-video UI. Never make provider files public implicitly.
- [ ] Optional biometric/device lock, authenticated account deletion, metadata retention,
      downloaded/cache cleanup and revocation limitations disclosed in settings.
- [ ] Server scheduler/push infrastructure for new-video alerts and remote refresh events;
      per-source alert preferences, quiet hours and deduplication; delivery limits.
- [ ] Dropbox, WebDAV/S3 or other adapters as requested; never label untested adapters connected.

## M5 · Hardening and release preparation

- [ ] Real end-to-end Android device test of the connected journey; iOS parity.
- [ ] Large-file/storage-pressure, airplane-mode, force-stop, expiry/reconnect tests.
- [ ] Screen reader, dynamic type, contrast and one-hand usability device review.
- [ ] Privacy policy/data export/retention, security review, performance budgets.
- [ ] Protected caches and account cleanup across devices; no originals deleted.
- [x] Versioned Android preview APK published with matching successful native-test checksum/signature evidence.
- [ ] Store release signing, AAB/IPA distribution and iOS evidence.
- [ ] App store publication / production deployment only on separate instruction.

## Planned YouTube and design work

- [ ] Owner-curated optional beginner suggestions for Salsa/Bachata, supporting
      playlists and single videos, plus manual link entry. Owner supplies links.
- [ ] YouTube playlist sources, online player, metadata refresh/deduplication,
      personal labels/ratings and explicit Daily Picks source participation.
- [ ] YouTube availability, attribution, quota and capability-aware UI; no file
      download, original renaming or native trim/export for linked YouTube content.
- [ ] **UX-01:** Use the owner's [Agent Project Starter](https://github.com/dn-lx/agent-project-starter)
      design workflow for a focused UI/UX audit, improved screens/components and a
      more distinctive dance icon, adapted to the existing Expo/React Native app.
- [x] **BR-01 decision:** Owner chose blue/black concept 03 (BC + play) for the icon
      and authorized the matching app theme on 2026-10-20.
- [ ] **BR-02:** Maintain the complete logo/icon family in Git with source artwork,
      platform exports, manifest and generation instructions; finish pure-vector,
      clean transparent and Android themed monochrome assets. See [brand inventory](brand/README.md).

Requirements and acceptance: [YOUTUBE-REQUIREMENTS.md](YOUTUBE-REQUIREMENTS.md).
Required design process and acceptance: [UI-UX-DIRECTION.md](UI-UX-DIRECTION.md).
These items are not implemented in the current preview; no new build is implied.

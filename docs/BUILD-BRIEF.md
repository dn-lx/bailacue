# BailaCue — Codex build brief

Repository: https://github.com/dn-lx/BailaCue
Prepared: 18 October 2026
Product name: BailaCue
Tagline: Watch. Practise. Repeat.

## Instructions to Codex

Build BailaCue, a polished Android and iOS app for organising and practising Salsa and Bachata using the user's own videos. Deliver working software, rather than mock screens. Inspect the repository, AGENTS.md files, available integrations, and development environment first. The repository appeared empty when this brief was prepared. Make routine implementation decisions autonomously and document assumptions. Ask only for missing credentials, unresolved account identity, or decisions that materially affect the implementation. Never claim a build, integration, or device test passed unless it actually ran.

This brief authorises app implementation. It does not authorise publishing to app stores, production deployment, paid service purchases, destructive changes to Me+, or broad sharing of private videos. Work in development and use feature branches/PRs; leave production untouched. Use GitHub tooling for GitHub activities, not a remote desktop. Keep the scope below as the complete product plan; implement in milestones without silently dropping features.

## Product experience

BailaCue is a personal dance video library and practice companion. Users connect video sources, upload their own videos to a chosen source, organise moves, practise with playback tools, and receive personalised video suggestions. Videos remain in their configured storage provider; the app database stores references and user metadata.

Use a modern, warm dance identity: readable typography, uncluttered cards, inviting colours, clear controls, large touch targets, light/dark themes and accessible contrast. Make the main journeys comfortable with one hand. No technical provider terms or debug labels in normal user flows. Never show placeholder labels such as IMAGE_1. Do not copy another app's branding or present the name as a registered trademark.

Suggested navigation: Today, Library, Upload, Practice, Settings. The video detail/player should expose tags, priority, learning status, saved sections and notes without crowding playback.

## Platforms and architecture

Preferred starting point: React Native with TypeScript and Expo development builds for shared Android/iOS code. Validate current official documentation and native module support before choosing packages. Use native modules or prebuild where required for video, secure storage, downloads and recording. Do not assume Expo Go supports every feature. Android is the first installable validation target; maintain iOS support throughout. If iOS signing, Xcode or devices are unavailable, report that limitation explicitly.

Separate UI, authentication, video-source adapters, metadata storage, recommendations, notifications, upload/download jobs and playback. Define a provider interface so adding another storage service does not require rewriting the app. Google Drive is the first real provider; additional provider types can follow. Multiple sources must work immediately, including several folders from the same Drive account. Do not claim other providers work until implemented and tested.

## Accounts and existing Me+ database

For now, provide username and password registration/login using the existing Me+ database infrastructure. The user requested keeping account information in the Me+ table temporarily. Inspect the actual project, schema, account ownership and authentication model before deciding how to integrate; no schema, credentials, project IDs or table names have been supplied in this brief.

Reuse the existing user identity table where safe, or link BailaCue profiles to it through an additive migration. Do not mix dance records with Me+ health records or expose health data to this app. Never overwrite or weaken Me+ authentication. Prefer the existing authentication service for password verification; if custom credentials truly must be stored in the table, store only salted adaptive password hashes using a maintained server-side implementation. Never store plaintext or reversibly encrypted passwords. Password verification runs on a trusted backend, never through a client-readable credential table. Never reuse a user's app password to authenticate Google Drive.

Use expiring, revocable sessions, rate-limited login, secure device credential storage and server-enforced user isolation. Include logout, password change and a documented recovery path. Keep admin/service keys and Drive client secrets out of the app and Git. Scope all data to its owner or an explicit sharing grant. Verify cross-user access denial. If the requested Me+ table is unsuitable, explain the concrete issue and propose the smallest compatible addition before changing that schema. Google/Apple login can be added later; it is not required for the initial login flow.

## Multiple video sources and uploads

Each user can add, name, edit, reconnect and disconnect multiple sources. A source has provider, connected account, folder identifier, friendly name, default dance style/labels, permissions and sync state. Example: “My Bachata” points to one Drive folder and assigns Bachata; “My Salsa” points to another and assigns Salsa. Allow the same style across several sources and mixed-style sources. Labels remain editable per video.

Connect Drive with OAuth and the least permissions that actually support selecting, listing, playing and uploading to the chosen folders. Verify the permission scope against the required existing-folder workflow; do not assume file-only scope can list arbitrary Drive folders. Ask for additional access only when needed. Show whether each source is writable. Reauthentication must preserve notes and video associations.

Upload from the device gallery/file picker or a new recording. The user explicitly chooses a writable destination source. Before uploading, allow title, dance style, labels, importance, teacher/class and optional notes. Show destination, file size and progress. Use resumable uploads for large files, cancellation and retry, and persist enough job state to recover safely after interruption. Respect mobile background execution limits; do not promise uninterrupted uploads after force-stop. Prevent retry-created duplicates and register library metadata only against confirmed provider results. Clearly distinguish uploading, processing, ready and failed states. Never silently upload private recordings or replace source files.

Support initial import, pull-to-refresh, incremental refresh where supported, and best-effort background refresh. Detect moved, renamed, deleted or inaccessible files. Show last successful refresh and actionable errors. Use provider file IDs for identity and avoid duplicate imports of a file referenced through multiple sources. Disconnecting a source must not delete remote files. Any remote deletion requires an explicit, separate user action and confirmation.

## Library and video organisation

- Video titles, thumbnails, duration and source.
- User-defined labels plus Salsa/Bachata, level, footwork/partnerwork, technique and teacher.
- Importance from 1 to 5, distinct from recommendation feedback.
- Learning status: To learn, Practising, Learned.
- Playlists with manual ordering; video membership can span sources.
- Search and combined filters for title, labels, source, style, priority and status.
- Teacher, class/event, location and lesson date fields, all optional.
- General notes, timestamped notes and named timestamp bookmarks. Tapping a timestamp seeks playback.
- Metadata sync across the user's devices with clear conflict handling and stable identifiers.

## Player, editing and practice

Provide reliable authenticated streaming, full screen, seeking, resume position, playback speed with pitch preservation where supported, horizontal mirror mode and A–B looping. Store multiple named practice sections per video using valid start/end times. The primary trimming feature is nondestructive: play only the chosen section and optionally loop it, preserving the original file.

Also provide an export action that creates a separate trimmed video file. Let the user choose local save or upload to a writable source; never overwrite the original. Handle unsupported formats/codecs and processing failures clearly. Use real media processing, not a UI that merely changes timestamps. Export processing can follow the core player milestone but remains in scope.

Include selected-video offline downloads with storage usage, delete-download controls, Wi-Fi preference and revocation handling. Protect private cached files and remove user-specific caches on logout/account removal. Clearly state that downloaded copies cannot be remotely revoked while a device is offline. Respect provider download restrictions.

Include a practice timer with breaks; session history; weekly goals and progress; camera recording; and reference/self-recording side-by-side comparison with manual timing alignment. Request camera/microphone permission only when used. Do not upload recordings without explicit selection. Include an adjustable dance count overlay with user-set tempo, count pattern and timing offset. Do not imply automatic beat detection or exact musical synchronisation unless implemented.

## Daily Picks recommendation algorithm

Default to one suggested video per day, selected from videos the user can access. Users choose preferred labels, styles, levels, optional teachers, frequency, number of videos, weekdays, notification time and timezone. Support recommendations without notifications, and disabling either independently.

Start with a deterministic, explainable label-based ranking system, not AI video analysis. Candidate scoring should combine weighted preference-label matches, explicit importance, To learn/Practising status, unwatched content and time since last practice. Apply repetition cooldowns and a diversity step so the same video or label does not dominate. Learned videos can return for occasional review. Never recommend unavailable videos or another user's private content. Define and document weights and fallback rules.

Support More like this, Less like this, Already learned and Skip today. Treat Skip today as a scheduling action, not automatically a dislike. Explain each pick with a short reason such as “Matches your Bachata footwork preference.” Save the daily selection so it remains stable across refreshes/devices; reroll only on explicit action or loss of access. Handle empty libraries, no matching labels and exhausted candidates gracefully.

## Notifications

Include scheduled practice reminders, Daily Picks and optional new-video alerts per source. Request notification permission contextually. Support quiet hours, local timezone/daylight-saving changes, deep links to the right video and duplicate suppression. Allow immediate preference changes. Use a server scheduler/push infrastructure for events requiring remote source checks; device background execution alone cannot guarantee exact refresh times. Local scheduled reminders can operate offline but should not promise a fresh daily selection without connectivity. Document delivery limits and show useful in-app picks if notifications are denied.

## Sharing and privacy

Share selected playlists/collections with partners or classmates. Enforce both BailaCue sharing permissions and underlying provider permissions: sharing a playlist must not automatically make Drive files public or grant broader access. Show inaccessible videos and an explicit owner-controlled path to adjust access. Support revoking collection access. Offer optional biometric/device authentication lock; this complements account authentication rather than replacing it. Define account deletion, metadata retention and downloaded-file cleanup without silently deleting originals in connected storage.

## Suggested data model

Adapt to the inspected backend rather than blindly applying these names: user/profile reference; source_connections; video_sources; videos; video_source_memberships; user_video_state; labels and video_labels; playlists and playlist_items; notes; bookmarks; practice_segments; practice_sessions; practice_goals; recommendation_preferences; daily_picks and feedback; upload_jobs; device push tokens; notification preferences; share grants. Keep device-only cache/job details local where appropriate. Enforce owner-scoped access, foreign keys, uniqueness and idempotent writes. Store OAuth tokens only in appropriate secure storage and keep them inaccessible to other users. Separate global provider file metadata from per-user ratings/notes.

## Build sequence and completion criteria

1. Foundation: project setup, navigation/design, account integration plan, isolated schema migrations and development configuration.
2. Working core: login, two independent Drive folder sources, upload to either destination, refresh, real playback, labels, priority, notes and search.
3. Practice and personalisation: loops, speed, mirror, segments, playlists, learning status, bookmarks, Daily Picks, configurable reminders, history/goals/timer and offline downloads.
4. Advanced features: trimmed-file export, camera/comparison, sharing, new-video alerts, count overlay and biometric lock.
5. Hardening and release preparation: interruption recovery, privacy/account cleanup, accessibility, device testing, documentation and versioned build artifacts.

For each milestone, deliver working functionality, meaningful tests and an honest status list. Test recommendation ranking/cooldowns, upload retry idempotency, cross-user isolation, notification schedule changes and loop bounds. Exercise Drive token expiry, read-only destinations, interrupted upload, deleted videos, offline use, permission denial and reconnect. Include an end-to-end journey: register/login → connect Salsa and Bachata sources → upload a video to the selected folder → label/rate/note it → play a saved loop → receive/open a Daily Pick.

Provide a README with setup, required environment-variable names without values, OAuth callback configuration, development commands, migrations, test/build instructions and remaining external setup. Provide Android installable APKs when the environment permits, named BailaCue-v<version>-build<buildNumber>-<variant>.apk, with matching app version/build number. Document Android/iOS signing separately. Provide CI for checks/builds where feasible, and never commit signing secrets, passwords, tokens or private videos. Report actual checks run and blockers. Do not publish to stores or production without a separate instruction.

Begin by inspecting the repository and accessible environment, proposing a concise architecture and milestone plan, then implementing the first working vertical slice. Preserve the entire feature scope in a tracked backlog. No provider connections, Me+ schema details, OAuth credentials or device capabilities are assumed to have been verified by this brief.

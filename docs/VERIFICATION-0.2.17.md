# Verification · BailaCue 0.2.17 / build22

[Download Android](https://github.com/dn-lx/BailaCue/releases/download/v0.2.17-preview.22/BailaCue-v0.2.17-build22-preview.apk) · [Release](https://github.com/dn-lx/BailaCue/releases/tag/v0.2.17-preview.22)

The approved 22-issue document is implemented. Source implementation and acceptance
are tracked separately in [IMPLEMENTATION-TRACKER.md](IMPLEMENTATION-TRACKER.md).

## Automated source and browser checks

185 unit/database tests in 18 suites, TypeScript, ESLint, web export, 10 browser
journeys and Expo Doctor 20/20 passed. [Source checks](https://github.com/dn-lx/BailaCue/actions/runs/39444650316)
verify app source `30bbe30b30c69e866d4d13118f99652fb29b35e0`.

Browser evidence covers synthetic-file import, seek/trim, resize, Mirror transform,
saved sections/unified notes, persistence, exact upload destination/rename retry,
custom dances, exact ratings and Unrated, numeric sorting, Daily mix, continuous
Practice/Previous/pause/restore/history, and mocked official YouTube pagination,
deduplication and online-only capabilities. Layouts cover eight screens at 320,
360 and 412px; large-text checks cover Library, Settings, Practice and YouTube.
[CI screenshots and provenance](verification/browser-build22/checks.json).

## Android native acceptance and public APK

[Build](https://github.com/dn-lx/BailaCue/actions/runs/39444651211) compiled and signed
build22. Its first device run stopped after four checks because the navigation
swipe crossed the native import-preview seek controls. Harness-only commit
`6d1a870095afcadb5dc114974f79dab3b825564a` moves navigation swipes into the page margin;
resize/trim gestures and every application assertion remain intact.

[Acceptance rerun](https://github.com/dn-lx/BailaCue/actions/runs/39448344894) passed
**all 14 native checks on the same APK**, using the pinned Google ARTEMIS controller
and helper 1.2.0 on API35. No autonomous model, real account or private video was used.
[Report](verification/android-build22/report.json) · [Media proof](verification/android-build22/media-proof.json).

Actual rendered pixels reverse with Mirror and restore afterward (normal error
195.88, mirrored error 0.30). Drag resize reached 304px; both trim handles, named loop,
separate Media3 MP4 export and Save to Photos passed. The 1–4s export measures
3.017075s; original-before/after bytes and SHA-256 match. Artist creation/reuse,
case-insensitive selection, and rated Salsa/Bachata Daily Picks passed. Practice
recorded nine active seconds before pause, excluded paused time, and returned from
background with an explicit Resume action.

[Recovery publication](https://github.com/dn-lx/BailaCue/actions/runs/39449571245)
required successful acceptance and its exact APK checksum before publishing.
The public download was independently checked against the accepted artifact:

- Version 0.2.17, versionCode22; package `app.bailacue.mobile`.
- 69,090,235 bytes; ARM64 and x86_64; minimum API24, target API36.
- SHA-256 `5249c1458f2719fbb4bcdb45497d418e150c7f28e3e092af25b9b78b463e173d`.
- APKv2 signature and content digests verified. Preview signer remains unchanged:
  SHA-1 `5e8f16062ea3cd2c4a0d547876baa6f38cabf625`.
- Public bytes equal the build artifact and accepted report. [APK proof](verification/android-build22/apk-proof.json).

## iOS and external acceptance

[The fresh unsigned iOS simulator compile](https://github.com/dn-lx/BailaCue/actions/runs/39444659378)
passed for version 0.2.17, using generated Expo native projects on macOS/Xcode.
The iOS-target Hermes JavaScript export also passed. [Compile evidence](verification/ios-build22/report.json).
This is compilation, not signed iPhone distribution or runtime playback acceptance.

YouTube/Dropbox integration tests use mocked official endpoints. A separate
[live browser attempt](verification/youtube-live-browser22/report.json) could not
tunnel to YouTube through this execution network; the UI showed retry/fallback and
kept the library unchanged. It does not prove a successful stream. Creator-specific
YouTube/autoplay behavior, physical iOS playback, live cloud transfers, physical
phone calls and full TalkBack/VoiceOver review remain manual acceptance.
Full playlist pagination requires a device Data API key; the keyless visible-player
list may be limited and is disclosed. See [YouTube setup](YOUTUBE.md).

66 brand exports regenerate from committed symbol/outlined-wordmark paths, with
sizes/alpha/checksums in the manifest. Renaming stays explicit and off by default;
originals and exact upload destinations keep their existing safeguards. No new
production database deployment, main merge or store submission was performed.

## Withheld candidates

- Build18 was cancelled for the unselected-dance eligibility correction.
- Build19 was cancelled for YouTube title, full-screen contrast and revoked-copy UI corrections.
- Build20 failed rendered-pixel acceptance because a hidden full-screen VideoView
  stole the inline surface. Build21 mounts only one video surface.
- Build21 passed 13 checks but exposed a Practice pause/state race. Build22 rejects
  stale session/mount events, preserves authoritative pause intent and stabilizes
  preview order across metadata-only updates. Seven regression cases cover this.
- Build22's first run was a harness navigation failure, not accepted as a pass.
  [Initial report](verification/android-build22-initial/report.json).

The earlier brand-only build17 remains [historical evidence](VERIFICATION-0.2.12.md).

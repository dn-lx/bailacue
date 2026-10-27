# Verification · BailaCue 0.2.8 (build11)

Local checks on2026-10-18:130 unit/database tests /16 suites; six browser journeys;
TypeScript, ESLint and web export. GitHub source checks also passed in [run39164210653](https://github.com/dn-lx/BailaCue/actions/runs/39164210653), including Deno and Expo Doctor20/20. Android build11 is published after all12 native checks passed.
Historical [build9 evidence](VERIFICATION-0.2.6.md) is retained separately.

New upload regression: synthetic114.5MiB native-adapter Drive and Dropbox transfers,
lost acknowledgement/resume, maximum2MiB reads, exact chunk boundary markers and a
Blob constructor deliberately rejecting buffers. HTTP and file handles are mocked;
this is not a live provider transfer. Source/numbering tests cover stable allocation,
external additions, provider parent checks, rename retries, complete-scan semantics,
metadata persistence and phone-copy safety. Phone copies check hash/size before reuse.

Browser journeys cover the existing practice/edit/labels flow plus playable import
preview, mocked source renames/discovery, both source Daily Picks, unrated stars and
minimum ratings. Layout checks cover seven screens at320/360/412px with long source
names/account emails and ensure buttons do not overflow the viewport.

Android build11 passed all12 Google ARTEMIS controller checks in
[acceptance run39166069113](https://github.com/dn-lx/BailaCue/actions/runs/39166069113),
testing the exact APK from [build run39164214724](https://github.com/dn-lx/BailaCue/actions/runs/39164214724).
Native preview playback, player drag resizing (170→217px), both trim handles,
import, named loop, artist labels, separate MP4 export, original preservation,
Photos saving and rated phone-video Daily Picks all passed. Source-based cloud
picks/renames are separately covered by mocked browser/provider checks.

The first native attempt passed11 checks then selected a title containing Bachata
instead of the below-fold style button, opening the keyboard. The harness now
matches style/star controls exactly. The successful rerun tested the same APK;
no application assertion was skipped. Publication recovery
[run39166585417](https://github.com/dn-lx/BailaCue/actions/runs/39166585417) required
successful native acceptance and its APK hash to equal the build artifact.

The public APK was independently downloaded and checked: **70,229,381 bytes**,
SHA256 `b3db5adec0b0590bd87a79387c2e2b8bec21c8540294ec8837ed4f9826b5f2ba`. Built, native-tested and public bytes match.
Checksum, APKv2 signature, package/version and ARM64+x86_64 were verified.
MinimumAPI24/target36, version0.2.8/build11. Signer SHA1
`5e8f16062ea3cd2c4a0d547876baa6f38cabf625` matches the previous preview.
The 1–4s exported clip was independently measured at3.017075s; before/after originals
both hash to `ba9ae8ea60f222465b2d9af337fa267734a9c15fc10a9d11d53f9f3ff60c68c2`.

[Native report](verification/android-build11/report.json) ·
[First attempt](verification/android-build11/first-attempt.json) ·
[Public APK details](verification/android-build11/public-apk.json) ·
[Native preview](verification/android-build11/import-preview.jpg) ·
[Trim](verification/android-build11/timeline-trim.jpg) ·
[Photos save](verification/android-build11/photos-saved.jpg).
Native screenshots retain original ARTEMIS JPEG bytes with corrected extensions.

Live Drive/Dropbox transfers/renames/consent, physical accessibility/notifications,
two-user Me+ acceptance and iOS compilation/signing remain unverified. No production
writes or real private media were used for this update.

App source: `11c796165917e7b376a3591784cd2bdd0d04a4cb`.
[Browser/check details](verification/browser-build11/checks.json) ·
[Import preview](verification/browser-build11/import-preview.png) ·
[Settings source cards](verification/browser-build11/layout-settings-320.png) ·
[Storage source cards](verification/browser-build11/layout-storage-320.png).
Screenshots are original Playwright bytes, using synthetic media/accounts.

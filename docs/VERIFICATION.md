# Verification · BailaCue 0.3.0 / build27

[Download the Android APK](https://github.com/dn-lx/BailaCue/releases/download/v0.3.0-preview.27/BailaCue-v0.3.0-build27-preview.apk).
App source `568002863e5b8a057cec2fc5b117d3700ccb1924`.
[Requirements](LOCAL-FIRST-REQUIREMENTS.md) · [Storage/recovery guide](LOCAL-STORAGE.md).

| Gate | Actual result |
| --- | --- |
| [Source checks](https://github.com/dn-lx/BailaCue/actions/runs/39792048684) | 189 tests/20 suites, 17 browser journeys, typecheck/lint/web export and Expo Doctor 20/20 pass |
| [Android build](https://github.com/dn-lx/BailaCue/actions/runs/39789411994) | Bundled ARM64+x86_64 preview, package app.bailacue.mobile, version 0.3.0/build27, API24 minimum/API36 target |
| [Google ARTEMIS acceptance](https://github.com/dn-lx/BailaCue/actions/runs/39793692531) | 15 checks pass on the exact compiled APK; real pinned controller/helper 1.2.0 on API35 |
| Public download | Public bytes match the accepted SHA-256; APKv2 signature/content digest and unchanged preview signer independently verified |
| [iOS compile](https://github.com/dn-lx/BailaCue/actions/runs/39789409753) | Fresh unsigned simulator compile succeeds; iOS Hermes export succeeds. No signed iPhone runtime claim |
| Layout/motion | 320/412px chip rows centered in both themes with reduced motion; 320/360/412px route overflow and large-text checks pass |
| Metadata/backup/sync | Actual SQLite transactions/migration/rollback/checkpoints; portable backup integrity; controlled official provider/Sheets endpoint tests for transfer, history, retry, conflicts and recovery |

[Native report](verification/android-build27/report.json) · [Public APK proof](verification/android-build27/public-apk-proof.json) · [Media proof](verification/android-build27/media-proof.json) · [Browser evidence](verification/browser-build27/checks.json) · [iOS scope](verification/ios-build27/report.json).

Native checks include real import-preview playback, player drag resizing, rendered
Mirror reversal/restoration, both timeline trim handles, named loops, a new native
MP4, unchanged originals, Photos save, artist-label creation/reuse, rated Salsa and
Bachata picks and Practice pause/background behavior. The final check inspects the
actual SQLite database for saved imports/sections and global label removal, verifies
integrity and restarts the app. The exported clip measures 3.017075 seconds; original
before/after SHA-256 values match.

The [initial device attempt](verification/android-build27-initial/README.md) passed
11 checks, then stopped in test keyboard/navigation handling. A harness-only
correction passed all 15 on the same APK. Subsequent commits affect CI/test tooling
and documentation only; application source/config/package inputs remain unchanged.
Browser CI now uses the runner's existing Chrome and committed owned MP4 fixtures,
avoiding stalled system-package/browser downloads. The same 17 journeys pass with
those fixtures locally; current source checks repeat them in GitHub.

The compiled Android/iOS JS contains no retired Me+ endpoint. The app uses local
SQLite/IndexedDB and user-owned storage. No production Me+ data was modified or
deleted. Backups exclude device paths, video bytes, credentials and security settings.
The owner reports Google Sheets API enabled in the app project. Live private-account
Sheets/Drive/Dropbox acceptance, simultaneous multi-phone edits and OS background
scheduling have not been tested here; the guide records these boundaries.

The supplemental live public YouTube attempt did not expose addable contents within
its bound. It is blocked/unverified and not counted as a passed check. Controlled
YouTube regression journeys pass; full pagination still needs a device API key.

SHA-256: `f9fb5d66e3b82cbc606ee5668cc629be9c076ae8e2741f0677eb3f580bcce821`.
APK size: 73,353,134 bytes. Install over the existing preview to retain app-private data.

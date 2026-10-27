# Verification · BailaCue 0.2.4 (build7)

Executed on 2026-10-18. App source tag `v0.2.4-preview.7` points to
`6c2e0fb40486a16fddc3c423d95db708c38ba9fe`. Later documentation commits do not
change the APK. [Previous build5 verification](VERIFICATION-0.2.3.md) is historical.

| Check                                                   | Actual result                                                                                                                     |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| TypeScript / ESLint                                     | Passed locally and in Actions                                                                                                     |
| Vitest                                                  | 80 tests across nine suites passed                                                                                                |
| Labels                                                  | Unit checks cover Unicode/whitespace/case deduplication, existing/create choices and library-scoped suggestions                   |
| Google native SDK                                       | Nine mock regressions cover photographed DEVELOPER_ERROR/code10, missing iOS setup, read/write scopes and account/token isolation |
| Browser                                                 | Four Chromium journeys passed, including artist/type label creation, reuse across videos, editing and reload persistence          |
| Existing database/provider/filesystem tests             | Passed; includes migration isolation, scoped gateway, mocked provider transfers and awaited native copy/move readiness            |
| Deno / Expo Doctor / web export                         | Passed /20 of 20 /passed in Actions                                                                                               |
| Android                                                 | Universal APK compiled, signature/checksum verified, native acceptance passed and prerelease published in run39111878471          |
| Google ARTEMIS                                          | All eight Android API35 controller checks passed against the published APK                                                        |
| Live Google OAuth                                       | Not verified; app registration remains unconfigured and a saved Google Cloud browser session is awaited                           |
| iOS / live provider transfers / two-user Me+ acceptance | Not run; previous limitations remain                                                                                              |

[Successful build, native tests and publication](https://github.com/dn-lx/BailaCue/actions/runs/39111878471).
[Source checks](https://github.com/dn-lx/BailaCue/actions/runs/39111879404).

Follow-up test-only verification: **83 tests** now pass, adding Salsa/Bachata folder
isolation for Google Drive, Dropbox and a mixed-provider library. The four browser
journeys pass with the cloud journey extended to connect both folders to the same
account, check source filtering and retain both after refresh. TypeScript and lint
also pass. Application code and the published build7 APK are unchanged; the release
run above tested the original80-test suite.

## Published APK and exact-byte evidence

[Download Android](https://github.com/dn-lx/BailaCue/releases/download/v0.2.4-preview.7/BailaCue-v0.2.4-build7-preview.apk)
· [Release](https://github.com/dn-lx/BailaCue/releases/tag/v0.2.4-preview.7).

`BailaCue-v0.2.4-build7-preview.apk` is **68,515,481 bytes**.
SHA256: `59557aa55efecff2baa0250f239b4f9478a66fb00f43d3ee827731d53f06faa8`.
The public download was fetched again, checksum/signature verified and matched to
[the successful native report](verification/android-build7/report.json).
Package `app.bailacue.mobile`, version0.2.4/code7, minimumAPI24/target36,
ARM64+x86_64, APKv2 signature. Preview certificate SHA1:
`5e8f16062ea3cd2c4a0d547876baa6f38cabf625`, matching build5 for in-place upgrades.

ARTEMIS used its real controller/helper1.2.0 on an accelerated API35 Google APIs
emulator. It passed launch, Settings/Library navigation, real document import,
named section/loop controls, a separate Media3 trim, original-byte preservation,
explicit Photos saving and artist-label creation/reuse with case-insensitive search.
ffprobe measured **3.017075 seconds** for the 1–4s section. Both original hashes
match fixture SHA256 `ba9ae8ea60f222465b2d9af337fa267734a9c15fc10a9d11d53f9f3ff60c68c2`.
The report, output duration and before/after hashes were independently checked again
in the workspace. [Native screenshots/report](verification/android-build7/report.json)
and the run's `BailaCue-ARTEMIS-device-evidence` artifact retain evidence.
Autonomous Gemini was not invoked. Test videos were synthetic.

## Google Drive error: fixed handling, pending remote setup

The reported SDK DEVELOPER_ERROR/code10 identifies an app/Google Cloud registration
mismatch. The client now maps it to an actionable setup explanation, Files import
and setup-help actions. Tests mock the native SDK failure; they do not prove a real
Google sign-in. The SDK's required Android package/certificate registration cannot
be replaced by a friendlier error message. See [exact setup](CLOUD-STORAGE.md#fixing-the-reported-developer_error--code10).

No Google Cloud project or outbound identity is configured in the cloud workspace.
Remote OAuth registration and successful real-account sign-in remain pending.
No passwords, browser sessions or Google client secrets belong in this repository.

## Scope and remaining work

Label pickers cover local import, existing video details and cloud-folder defaults.
The existing string arrays/manual metadata sync remain compatible; no migration
was needed. Saved video/folder labels supply suggestions for the current library.
Artists are user-applied labels, not automatic face recognition.

Owner-approved Me+ APIv2 and the three additive BailaCue migrations remain deployed.
Existing health data/auth settings were not changed by this update. Camera,
physical-device/large-file/codec/accessibility hardening, real provider consent and
transfers, two-user account acceptance and iOS compilation/signing remain unverified.
Automatic sync/merge, remote new-video push, server picks and WebDAV/S3 remain pending.
This is an internal preview with a test certificate, not a store release.

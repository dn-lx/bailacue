# Verification · BailaCue 0.2.5 (build8)

Executed on 2026-10-18. App source commit `95a088b8d776eb5017862ebbc7c52992315c9fcc`, Android release
tag `v0.2.5-preview.8`. Later documentation/evidence commits do not change the APK.
[Previous build7 verification](VERIFICATION-0.2.4.md) is historical.

| Check                                         | Result                                                                                                                                    |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| TypeScript / ESLint                           | Passed locally and in Actions                                                                                                             |
| Vitest                                        | 100 tests across ten suites passed                                                                                                        |
| Folder routing                                | Mock Drive parent IDs and fresh Dropbox paths checked for separate Salsa/Bachata destinations; resume cannot change folder/account        |
| Save registration                             | Selected source only, latest labels/ratings, collection/pick/practice/feedback references and online/phone copy choices checked           |
| Editing bounds                                | Drag handles cannot cross or escape the video; viewport sizing bounded                                                                    |
| Google native SDK                             | Read/write scope refresh, registration failures and account-token isolation checked with SDK mocks                                        |
| Browser                                       | Four Chromium journeys passed, extended for handle keyboard/drag movement, three player sizes and selected-folder failed-upload retention |
| Android / ARTEMIS                             | Universal APK built; all ten native checks passed and the gated prerelease was published                                                  |
| Live Google OAuth / Drive / Dropbox transfers | Not verified; user reports completing Cloud registration, API activation and consent scopes                                               |
| iOS / real two-user Me+ acceptance            | Not run                                                                                                                                   |

## New behavior

Local saves create a phone entry without uploading. Selecting Online storage on an
import or native clip save starts the exact chosen folder upload. Online-only cleanup
runs after confirmed transfer; failures retain the owned local video. Upload jobs
record original source, folder, account and provider. Choosing Salsa or Bachata is
explicit and independent of the video's labels/style.

The player exposes resizable video bounds, presets and start/end trim handles on the
playback line. Native trim export creates a separate MP4; cloud originals remain
unchanged. Streaming-only videos need a phone download before native export.

## Boundaries

Provider HTTP tests and the browser OAuth fixture are mocks. They do not prove live
Google/Dropbox consent, transfer quotas, token revocation or large-file durability.
The owner reports completing registration/scopes manually in Google Cloud; no real
Drive login/transfer result has been observed by this workspace. Do not infer it from
console setup. Phone camera, notifications, physical-device accessibility, iOS signing,
automatic sync and new-video server push retain the earlier verification limits.

No private media or credentials are used in tests or committed.

## Published APK and native evidence

[Download Android](https://github.com/dn-lx/BailaCue/releases/download/v0.2.5-preview.8/BailaCue-v0.2.5-build8-preview.apk)
· [Successful test/publication run](https://github.com/dn-lx/BailaCue/actions/runs/39115739082)
· [Source checks](https://github.com/dn-lx/BailaCue/actions/runs/39115736709).

APK **68,528,909 bytes**, SHA256
`1a7c65aca5c0c7097b7af0b30746a9980a1915989408417443dbe44ebe7a1bba`.
The public download was fetched again and matched the built artifact and passing
ARTEMIS report byte for byte. APKv2 signature verified; package `app.bailacue.mobile`,
version0.2.5/code8, minimumAPI24/target36, ARM64+x86_64. Preview signing SHA1
`5E:8F:16:06:2E:A3:CD:2C:4A:0D:54:78:76:BA:A6:F3:8C:AB:F6:25`
is unchanged from build7.

Google ARTEMIS's real controller/helper1.2.0 on Android API35 passed all ten checks:
launch/navigation, real document import, native player preset and drag resizing,
dragging both timeline handles, named looping, separate Media3 MP4 export,
original-byte preservation, Photos save and artist-label creation/reuse. Native
resize changed the compact frame from170 to220 logical pixels. The dragged range
was0.89–5.11s. A separate precision export of1–4s measured **3.017075s** with ffprobe.
Original before/after SHA256 both equal
`d3d6879a81686c3812fbea54fcec3d86e6f7226b9578a66cd00e54344b9ce435`.
These duration/hash checks were independently repeated in the workspace.

[Report](verification/android-build8/report.json) ·
[Native timeline handles](verification/android-build8/timeline-trim.jpg) ·
[Resized player](verification/android-build8/player-resized.jpg) ·
[New clip ready](verification/android-build8/trim-ready.jpg) ·
[Photos save](verification/android-build8/photos-saved.jpg).
Screenshots are unchanged ARTEMIS JPEG bytes, renamed from the harness's.png extension.
Full hierarchy/log/media evidence remains in the run's
`BailaCue-ARTEMIS-device-evidence` artifact. Autonomous Gemini was not invoked.

The first native job lost its ADB connection at `adb root`, before installation or
app launch. Rerunning the failed native/publication jobs reused the successful build
artifact; it did not rebuild or change the APK or omit an application assertion.
The retry passed all ten checks and publication succeeded.

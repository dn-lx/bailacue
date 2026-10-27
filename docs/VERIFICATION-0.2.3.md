# Verification · BailaCue 0.2.3 (build 5)

Executed on 2026-10-18. Linux cloud workspace, Node24.19/npm11.9/JDK21.
[Earlier 0.1.0 evidence](VERIFICATION-0.1.md) remains historical.

| Check | Actual result |
|---|---|
| TypeScript / ESLint | Passed |
| Vitest | 68 tests across 7 suites passed |
| PostgreSQL | All three migrations tested in PGlite; 27 tables with RLS; negative grants, owner/FK isolation, rate limits, stale revisions and BailaCue-only cleanup |
| Gateway transport | Mock tests: hashed opaque sessions, no broad Auth token return, forged-owner denial, rate limits, path/secret rejection, conflicts, sharing/revocation and literal username underscores |
| Providers | Mock HTTP: paging/folders, access errors, temporary URLs, stable upload identity, completed-file reconciliation, lost Dropbox acknowledgement and strict no-overwrite commits |
| Native filesystem | Deferred-I/O mocks verify completed copy/move before inspection, picker-cache lifetime and partial-file cleanup |
| Notifications | Mock OS: replacement/cancellation, duplicates, denied permission, serial changes and quiet-hour rollover |
| Browser | All three Chromium journeys passed: import/playback/loop/notes/persistence; themes/collections; mocked Dropbox PKCE/folder/stream/edit/refresh |
| Deno / Expo Doctor / web export | Passed /20 of 20 /passed |
| Android build5 | Universal APK compiled in run39102137159; checksum-bound native acceptance passed before publication |
| ARTEMIS | Seven Android API35 controller checks passed in run39104109693; measured 3.017075s export, original unchanged and Photos saved |
| Live Me+ API | API v2 and all three migrations deployed after explicit approval; anonymous/invalid-login 401 and private table/RPC denial verified |
| Live provider OAuth/transfers | Not run: BailaCue app registrations were not supplied |
| iOS compilation/signing/runtime | Not run: macOS/Xcode/Apple signing unavailable |

## Build5 native and binary evidence

[Successful ARTEMIS run](https://github.com/dn-lx/BailaCue/actions/runs/39104109693)
passed launch, Settings/Library navigation, real document import, editable title,
named 1–4 second loop control, separate Media3 export and Photos saving. ffprobe measured
**3.017075 seconds**; original-before/after SHA256 both match the synthetic fixture.
The clip and both hashes were independently checked again in the workspace.
[Report/screenshots](verification/android-build5/report.json) · [Full details](ARTEMIS.md).

Publication run39104394080 required successful native acceptance and an exact match
between the report's APK SHA256 and the built artifact. Builds2–4 remain withdrawn.
Native acceptance initially failed on harness visibility/input issues; these were
corrected and the same immutable build5 artifact was retested, without recompilation.

## Published Android APK

[Download](https://github.com/dn-lx/BailaCue/releases/download/v0.2.3-preview.5/BailaCue-v0.2.3-build5-preview.apk)
· [Release](https://github.com/dn-lx/BailaCue/releases/tag/v0.2.3-preview.5).
`BailaCue-v0.2.3-build5-preview.apk`: **68,508,221 bytes**.
SHA256: `7443b70330a8b6e0afdddfbab1711415b074f9c82a85df416fcf20008e42bb1f`.
Public bytes were downloaded again and match the successful ARTEMIS report.
APK v2 signature verified; package `app.bailacue.mobile`, version0.2.3/code5,
minimumAPI24/target36, ARM64+x86_64. Internal preview certificate SHA1:
`5e8f16062ea3cd2c4a0d547876baa6f38cabf625`. Production store signing is separate.

## Real native findings

Build3 compiled and its public bytes/signature/version were verified, but ARTEMIS
found a native Room/WorkManager startup crash. DEX class inspection confirmed R8
retained WorkDatabase_Impl while removing its reflective no-argument constructor.
Build4 disables release shrinking through the SDK58 expo-build-properties plugin.
Its constructor is retained, and ARTEMIS passed native launch/Today/Settings/Library.

Correcting the DocumentsUI harness (transition timing, separate Preview action,
viewport scaling) reached the importer and exposed a second actual app bug:
SDK58 File.copy and File.move return promises. Inspecting their destinations before
awaiting completion failed on device. Build5 awaits both, preserves temporary input
until copying/inspection complete, and removes partial owned copies on failed copy.
Three new deferred-I/O regressions pass. Directory.create and File.delete remain
synchronous in SDK58; upload FileHandle.readBytes was already awaited.

Builds2–4 are retired/withdrawn drafts. Build4's historical public APK was 68,507,957
bytes, SHA256 `b9a24d42dfe0d64f252e878bf4a55421cb314eda241bc1e603be5bbedf48822b`.
That hash is not for build5 and that APK is not recommended. Build5 source/tag:
`3cf916c1c811ecd238f5920b236cc718559adfec`, `v0.2.3-preview.5`.
[Build5 workflow](https://github.com/dn-lx/BailaCue/actions/runs/39102137159).
[ARTEMIS details and evidence](ARTEMIS.md).

## Scope and remaining acceptance

Browser fixtures are synthetic H.264. Dropbox endpoints are intercepted: the test
checks app PKCE/UI behavior, not Dropbox production consent. No private user media
was uploaded. Browser tests caught an unbound fetch receiver bug and a reconnect
assertion race; final combined runs passed. Core tests do not imply device codecs,
real provider permissions or physical notification delivery.

Production migration filenames match remote history. Me+ initially denied service
access to new BailaCue tables; an explicit BailaCue-only service grant fixed an
invalid-login 503 to 401. Tests emulate those actual defaults. All four new private tables
have RLS and zero anon/authenticated grants; both new RPCs are SECURITY INVOKER and
service-only. Advisors report informational RLS-with-no-policy notices for those
intentionally private tables. Existing Me+ health tables, functions, domain records
and auth settings were untouched. No real credentials or health data were used in
live probes. Positive two-user registration/recovery/sync remains acceptance work.

Native camera, unsupported-codec/cancel/failure paths, large-file/low-space recovery,
real provider consent/transfers, accessibility, physical reminders and iOS parity
remain unverified. Photos/external copies cannot be remotely erased; app downloads
cannot be remotely revoked while offline. Automatic merge/sync, remote new-video
push, server-generated picks and WebDAV/S3 remain implementation work.

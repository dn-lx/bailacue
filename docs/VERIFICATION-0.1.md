# Verification · BailaCue 0.1.0 (build 1)

Environment: managed Linux cloud workspace, Node 24.19.0, npm 11.9.0.
Date: 2026-10-18. This records executed checks, not planned acceptance.

| Check                                  | Actual result                                                                                                |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| TypeScript `npm run typecheck`         | Passed                                                                                                       |
| ESLint `npm run lint`                  | Passed without errors or warnings                                                                            |
| `npm test`                             | 33 passed across 3 suites                                                                                    |
| `npm run build:web`                    | Passed, Metro production bundle in `dist/`                                                                   |
| Playwright Chromium / Pixel 7 viewport | 2 journeys passed                                                                                            |
| `NODE_USE_ENV_PROXY=1 npx expo-doctor` | 20/20 checks passed                                                                                          |
| `npx expo install --check`             | Dependencies up to date                                                                                      |
| Expo native autolinking                | BailaMedia Android module resolved                                                                           |
| Shared Me+ migration                   | Applied after explicit owner authorisation                                                                   |
| Live BailaCue catalog                  | 23 tables, 23 RLS flags, 23 owner policies, 42 validated FKs, 3 time-validation triggers, 0 anonymous grants |
| Supabase security advisor              | No findings for BailaCue objects                                                                             |
| Supabase performance advisor           | New unused indexes are informational; no BailaCue unindexed FK finding                                       |
| Android release-mode preview APK       | Passed; signed ARM64 APK generated and checked                                                               |
| Physical Android / emulator runtime    | Not run; no attached device or KVM                                                                           |
| iOS build / device / signing           | Not run; no macOS/Xcode/Apple credentials                                                                    |
| Live Auth, Drive, uploads, push        | Not connected or tested                                                                                      |

Migration history version: `20261018032846`. Source SHA-256:
`79693dafbba6bcbc9e719785e61d70ed45f612992b8f6eacc712b52fff76ec2c`.

The first Android build installed SDK 37 / build tools 37 and NDK 27.1, then
failed because the preinstalled Java runtime lacked `JAVA_COMPILER`. A full
JDK 21 was installed and the retry succeeded (8m 12s). The documented build
script then succeeded (3m 24s); the final text-only bundle update passed an
incremental build (29s).
The initial network-dependent Expo Doctor run failed before Node was configured
to use the session proxy; its later complete run passed all 20 checks.

The browser journey uses a generated six-second H.264/AAC test pattern, not any
private user video: import, title/labels, named 1–4 second section, A–B playback
including a real loop wrap, note/bookmark, Daily Pick, reload with IndexedDB
video playback, deletion confirmation/cancellation, local deletion and preserved
source fixture. A separate journey changes theme and creates a collection.
The web exporter displays the supported-platform message; it does not pretend
to create a trimmed video in the browser. Mobile exports still need real device
codec, bounds, Photos/share, cancellation and original-checksum verification.

Local PostgreSQL tests apply the actual migration in PGlite, define two synthetic
auth identities, and exercise owner reads, foreign-owner denial, ownership-change
denial, owner FK checks, server section bounds, provider-ID uniqueness, all-table
RLS and anonymous denial. These are real PostgreSQL policy tests, not SQL string
assertions. They are not Supabase login tests or real two-account API tests.

Existing Me+ advisor notices were present before the migration and remain
unchanged: private/service tables with RLS and no policies, signed-in callable
Me+ security-definer functions, and the existing Auth password-protection setting.
No Me+ settings or functions were modified. Review these existing policies and
use a scoped BailaCue backend session before enabling accounts in the mobile app,
so broad Me+ Auth credentials are not handed to this app by accident.
[Advisor guidance](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).
[Password-security guidance](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).
[Unused-index guidance](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index).

Final artifact: `artifacts/BailaCue-v0.1.0-build1-preview.apk` (33,016,705 bytes).
SHA-256: `20cbb92334b2e3b27d514584e26ba564970ba2e295895295c235c8ea2b02187c`.
`aapt dump badging` verified `app.bailacue.mobile`, versionName `0.1.0`,
versionCode `1`, minimum API 24, target API 36 and `arm64-v8a` only.
`apksigner verify --verbose` passed APK Signature Scheme v2. Archive inspection
confirmed the bundled Hermes program and ARM64 native libraries. The certificate
is the generated internal debug certificate, not a production signing identity.
The APK was not installed on a device in this environment.

GitHub's Checks workflow passed on PR #1 (both push and PR runs). The first
Android CI attempt stopped in `setup-android` because its default requested the
obsolete SDK package `tools`. The workflow now explicitly requests `platform-tools`
and command-line tools 13114758 (the version used successfully in this workspace).
The Android CI rerun is separate from the locally verified APK; check its current
status in the PR rather than treating its definition as a passed build.

Screenshots from the executed browser run are in `docs/brand/app-*.png`.
They verify the rendered preview, not an Android/iOS screenshot. See the
[complete backlog](BACKLOG.md) for device and connected-product acceptance.

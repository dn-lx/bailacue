# Verification · BailaCue 0.2.9 (build14)

Number-only correction: source video titles are numeric only; actual source filenames
and BailaCue-owned phone copies keep only the allocated number plus media extension.
Previous descriptive prefixes migrate without reallocating numbers. New external
files use the persisted next number; each source keeps an independent sequence.

Local validation:140 tests across16 suites, TypeScript and ESLint passed. All six browser journeys passed in the complete final run. All12 Google ARTEMIS native checks passed; Android build14 is published.

Focused regressions cover existing numbered-file migration, extension preservation,
non-recycled incremental allocation, offline title normalization and title invariants
on edits, legacy/new upload staging names and duplicate reservations, source renames,
phone-copy staging/cleanup ordering and upload registration without descriptive titles.
Existing large native-buffer upload and practice/edit tests are retained.

Live cloud consent/transfers/renames and iOS compilation remain unverified. Tests use
synthetic media and mocked provider responses; no private media or production writes.

[Previous build11 evidence](VERIFICATION-0.2.8.md).

Final app source: `f3885fa595b7802ad094de9e7cd70482b28e7831`.
[GitHub source checks39172852220](https://github.com/dn-lx/BailaCue/actions/runs/39172852220) passed, including Deno, Expo Doctor and all six browser journeys.
[Numeric library screenshot](verification/browser-build14/numeric-source-library.png).

Android build, ARTEMIS and publication passed in
[run39172854949](https://github.com/dn-lx/BailaCue/actions/runs/39172854949).
ARTEMIS used the real pinned controller and helper1.2.0 with synthetic phone videos;
no autonomous model session. Preview playback, player resizing (dragged height219px),
both trim handles, document import, loops, artist labels, separate MP4 export,
original checksum preservation, Photos saving and rated phone-video Daily Picks passed.
Source-based cloud titles/picks/renames use separate mocked provider/browser coverage.

The public APK was independently downloaded and equals the built artifact and passing
native report: **70,231,089bytes**, SHA256
`18ade8ba0e623e9f8f871cecb2d39e9e9edee8f7634add7433d9b828389aa7bf`.
APKv2 signature, package `app.bailacue.mobile`, version0.2.9/build14,
minimumAPI24/target36 and ARM64+x86_64 verified. Signer SHA1
`5e8f16062ea3cd2c4a0d547876baa6f38cabf625` matches the installed preview identity.

[Native report](verification/android-build14/report.json) ·
[Public APK details](verification/android-build14/public-apk.json) ·
[Native preview](verification/android-build14/import-preview.jpg) ·
[Native Daily Picks](verification/android-build14/daily-picks.jpg) ·
[Photos save](verification/android-build14/photos-saved.jpg).
Native screenshots retain original ARTEMIS JPEG bytes with corrected extensions.

Build12/run39170414260 and build13/run39171131452 were cancelled before publication
while fixing numeric outside additions, reservation collisions and post-rename retry.
Neither has a public APK. Their tags were retained without modification.

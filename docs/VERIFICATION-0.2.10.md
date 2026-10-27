# Verification · BailaCue 0.2.10 (build15)

Source discovery is now read-only. Existing filenames change only after an explicit
reviewed Rename existing videos action. New-upload numbering is a separate source
preference, off by default for both new and upgraded libraries. Actual observed
filenames supply library titles; an unapplied number is never displayed as success.

153 unit/database tests in16 suites, TypeScript and ESLint passed locally. All six browser journeys and web export passed. All12 Google ARTEMIS device checks passed; Android build15 is published. Focused regressions
cover no rename/copy/upload-job vault access on discovery, default-off upload naming, preview,
partial failures with actual filenames, paused/resumed jobs, reviewed-file scope,
queued manual actions, stable allocations, per-file permission errors, and omission
of device-local rename results from metadata snapshots.

Browser coverage uses synthetic media and a mocked provider. Live folder metadata
was inspected with owner authorization; the previously running app completed its
rename pass during inspection. No connector rename writes were made. Private file
names, IDs, folder URLs and account details are not included in this repository.

Android publication is gated on the existing12 real Google ARTEMIS controller/helper
checks. Live provider uploads/rename failures, physical-device hardening and iOS
compilation/signing remain unverified. No production database changes.

[Previous build14 verification](VERIFICATION-0.2.9.md).

Final app source: `fe73e07156a279e6b607911a8bd3aece4142814a`.
[GitHub source checks39214128650](https://github.com/dn-lx/BailaCue/actions/runs/39214128650) passed, including Deno, Expo Doctor and all six browser journeys.
[Rename preview](verification/browser-build15/rename-preview.png) · [Per-file failure](verification/browser-build15/rename-failure.png).

Build, ARTEMIS and publication passed in
[run39214131930](https://github.com/dn-lx/BailaCue/actions/runs/39214131930).
ARTEMIS used the pinned real controller and helper1.2.0 with synthetic phone videos;
no autonomous model session. Preview playback, player resizing (dragged height221px),
both trim handles, document import, loops, artist labels, separate MP4 export,
original preservation, Photos saving and rated phone-video Daily Picks passed.
The explicit cloud rename/default-off/progress/failure flows have separate mocked
provider/browser coverage, rather than real provider mutations in the native suite.

The public APK was independently downloaded and equals the built artifact and passing
native report: **70,240,141bytes**, SHA256
`0c4901c01f83f277ab08a5dee9a911a6d484b40efde26e5f60d51e19a6cf52d5`.
APKv2 signature, package `app.bailacue.mobile`, version0.2.10/build15,
minimumAPI24/target36 and ARM64+x86_64 verified. Signer SHA1
`5e8f16062ea3cd2c4a0d547876baa6f38cabf625` matches the installed preview identity.

[Native report](verification/android-build15/report.json) ·
[Public APK details](verification/android-build15/public-apk.json) ·
[Native preview](verification/android-build15/import-preview.jpg) ·
[Native Daily Picks](verification/android-build15/daily-picks.jpg) ·
[Photos save](verification/android-build15/photos-saved.jpg).
Native screenshots retain original ARTEMIS JPEG bytes with corrected extensions.

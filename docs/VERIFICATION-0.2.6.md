# Verification · BailaCue 0.2.6 (build9)

Executed on 2026-10-18. Published tag `v0.2.6-preview.9`, source commit
`30a389b7f9e6d8db999b3aeaf0658473193003ec`.
[Release run39120175502](https://github.com/dn-lx/BailaCue/actions/runs/39120175502) ·
[Source checks39120173559](https://github.com/dn-lx/BailaCue/actions/runs/39120173559).
[Previous build8 verification](VERIFICATION-0.2.5.md) remains historical evidence.

| Check | Result |
| --- | --- |
| TypeScript / ESLint / Expo Doctor / web export | Passed |
| Unit/database tests | 110 tests /11 suites passed |
| Browser | Five Chromium journeys passed |
| Daily mix | Rating-first ranking, independent Salsa/Bachata cooldowns, minimum rating, missing styles, explicit update, migration and stable-day behavior covered |
| Android ARTEMIS | All11 controller checks passed on API35; real imports and both Daily Picks included |
| Media editing | Both native trim handles dragged; separate 1–4s MP4 measured3.017075s; original hashes unchanged; explicit Photos save passed |
| Public APK | Byte-for-byte match with built artifact and passing native report; checksum and APKv2 signature verified |
| Audit | Source/UX review, synthetic failure reproductions and illustrative scan benchmark completed; no production writes |
| Dependencies | npm audit reported29 affected entries (20 high/9 moderate), rooted in three advisories; tooling/runtime exposure needs triage |
| Live providers / two-user account acceptance / physical-device gaps / iOS | Still unverified |

Public APK: **70,197,869 bytes**, package `app.bailacue.mobile`, version0.2.6/build9,
minimumAPI24/target36, ARM64+x86_64. SHA256:
`1bbd27d402e047f1dfa0f677d239e17ae221837b4274a387ed7bb04792d78c66`.
Signer SHA1: `5e8f16062ea3cd2c4a0d547876baa6f38cabf625` (same preview certificate as build8).

[Native report](verification/android-build9/report.json) ·
[Public-byte details](verification/android-build9/public-apk.json) ·
[Screenshots and ARTEMIS scope](ARTEMIS.md).

The new icon uses an image-generated opaque master, centered within the adaptive
icon safe area. Package/signing identity, saved data keys, OAuth callbacks and
production endpoints remain unchanged. No iOS native build was produced.

The [audit PDF](audits/BailaCue-Audit-2026-10-18.pdf) and
[structured findings](audits/2026-10-18.json) separate reproduced behavior from
source-review risks and unverified device outcomes. Recommendations other than
the requested Daily Picks/icon change remain open. No production changes were made.

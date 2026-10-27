# Current handoff · published 0.3.0/build27

[Direct Android download](https://github.com/dn-lx/BailaCue/releases/download/v0.3.0-preview.27/BailaCue-v0.3.0-build27-preview.apk) · [Requirements](LOCAL-FIRST-REQUIREMENTS.md) · [Usage](LOCAL-STORAGE.md) · [Verification](VERIFICATION.md).

Application source is `568002863e5b8a057cec2fc5b117d3700ccb1924`.
189 tests/20 suites, 17 browser journeys and type/lint/export/Doctor 20/20 pass.
All 15 Google ARTEMIS native checks pass on the public APK. Signature, unchanged
preview signer, public bytes and accepted hash were independently verified.
Fresh unsigned iOS simulator compilation and iOS Hermes export pass; signed iPhone
runtime/distribution remains separate.

Android/iOS use SQLite; browser uses IndexedDB. Legacy on-device libraries migrate
separately and original records are retained. No production Me+ action was taken.
Supabase runtime, accounts and username sharing are retired; historical server
code is archived. Provider-folder sharing guidance replaces the old account flow.

Personal file/Drive/Dropbox metadata backups, separate recovery folders, optional
Sheets two-way sync, editable metadata tabs/versioned recovery, offline retry,
conflict review, visible label removal and global deletion are implemented.
The owner reports Sheets API enabled; no live private-account Sheet test is claimed.
Background execution remains OS-dependent; Sheets has cross-device transaction limits.
The live keyless public YouTube attempt remained blocked/unverified; it is not a pass.

Compact headers/cards, tab indicators and native press/entry/progress motion retain
the approved concept05 b/play identity. Both themes, reduced motion, centered chip
rows and narrow/large-text layouts are checked. Agent Project Starter workflow
adaptation is recorded in requirements. No web animation library was added to native.

CI-only followups fixed native test keyboard handling and browser tooling stalls.
The application bytes were never replaced. Raw reports retain the initial partial
native run and successful rerun; browser fixtures are owned generated test patterns.

PR#1 remains draft and main unmerged. Do not use TinyFish, paid services, production
DB deletion or store submission. Do not spawn agents without explicit delegation.

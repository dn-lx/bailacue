# Current handoff

## 2026-11-26 · compact web video titles

GitHub had deleted `develop` after PR #20 merged. Restored integration from
`bb2192d69cc498122ea3afb46208a6e47bcb519d`; this task does not update or merge `main`.

Web display titles now use `DDMMYY - Style one, Style two - Level`, skipping empty
sections and deduplicating style names across legacy text and typed label IDs.
Per the owner's clarification, omit the dance category entirely. Keep readable
label names, accents and punctuation; omit moves, techniques, events and teachers.
Preserve the existing modified-date/added-date fallback, filenames, IDs and all
stored metadata. A completely undescribed video displays `Video`.
The open player's title updates when styles or level change; search and sorting
use the same resolved display titles.

Local verification: 129/129 web tests, web lint/typecheck/build, native typecheck
and native lint pass (one existing array-type warning in uploadEngine.ts).
The unchanged native suite passes 187/189 tests; two native-upload tests fail
because the mocked file has no `digest` method. Native source/tests/dependencies
are unchanged from the starting commit. No private-account or production writes.

Hosted verification of application commit `9f6079d21a8e9be986d5b441d44df4ae1cb7fb62`:
[BailaCue web passed](https://github.com/dn-lx/bailacue/actions/runs/45876524725),
including the existing Python/iPad checks. The
[mobile visual run](https://github.com/dn-lx/bailacue/actions/runs/45876524662)
passed 15/18 cases; all three failures concern the mute control extending 8.5px
past the left edge at 320px. The
[earlier develop run](https://github.com/dn-lx/bailacue/actions/runs/45869410123)
has the same failures and measurements. The earlier
[main checks](https://github.com/dn-lx/bailacue/actions/runs/45869883586)
also confirm the same two native-upload mock failures. These unrelated issues
remain for separate work; title tests pass and `main` is unchanged.

## Earlier published release · 0.3.0/build27

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


## Agent workflow update

The develop branch now contains progressive starter guidance with Ponytail, local Graphify, compact project memory and repeatable workflows. This changes repository guidance only, not app runtime code. Run documented checks on the exact commit before calling it verified.

# BailaCue project memory

BailaCue is a local-first Salsa/Bachata practice library built with React Native, TypeScript and Expo. README reports Expo SDK 58 and native/web targets; handoff describes SQLite native and IndexedDB web storage. Verify in source before changing.

- Preserve original media; edits/encodes are separate outputs.
- Treat Drive, Dropbox and YouTube as explicit external sources; no YouTube media download or silent access widening.
- Supabase runtime/account flows are retired per CURRENT-HANDOFF.
- Integration `develop`; production `main`; release needs owner approval.
- Graphify and its venv are local dev tooling, excluded from builds.

Resume from AGENTS, CURRENT-HANDOFF and relevant README-linked docs. Current AGENTS lists Expo lint, TypeScript and Doctor checks; honor the lockfile/package manager and CI.

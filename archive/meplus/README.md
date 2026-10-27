# Retired Me+ integration

These are historical migrations, gateway code and tests from the preview account integration. They are not part of the mobile app, current CI or a deployment workflow. The new app uses local SQLite and optional user-owned backup/Sheets storage. No database, deployed function, account or production data was deleted by archiving this source.

Do not run these deployment instructions as part of ordinary BailaCue releases. Existing on-device account libraries migrate separately; server-only snapshots remain in the previous project and need an explicit export to recover them.

# Local library, personal recovery and modern UI

Owner-approved scope: replace the app's Me+ dependency with local SQLite, optional
personal Drive/Dropbox backups and optional Google Sheets synchronization. Improve
the design and add restrained motion. Add visible label removal and global deletion.

## Data and migration

- Android/iOS use a transactional SQLite repository. The browser preview uses
  IndexedDB. Preserve videos, ratings, labels, notes, collections and practice data.
- Import existing guest and account libraries as separate local libraries. Select
  the last active library when known; retain the legacy records for recovery.
- Remove runtime Me+ login, password, username sharing, sync endpoints and build
  configuration. Preserve historical server code separately; no production data
  or Me+ users are deleted as part of this app migration.
- Never remove phone videos or provider credentials during migration or restore.
  Surface migration errors without replacing an unreadable library with an empty one.

## Personal backup and recovery

- Export/import versioned, validated metadata files and save/list/restore them in
  an exact user-selected Drive/Dropbox folder. Cloud saves create new files.
- Backups include personal metadata, not video bytes, credentials, API keys or
  device paths. Explain phone-only video recovery and reconnect requirements.
- Preview restores. Keep current-only items; offer add-missing or explicit backup
  precedence for matching metadata. Save a local checkpoint before applying.

## Google Sheets

- Users choose their own Google account and spreadsheet or create a dedicated one.
  Prepare only BailaCue-owned tabs; refuse conflicting unrecognized tab contents.
- Include editable labels/settings, readable library information and complete
  portable recovery data. Keep an append-only version history for recovery.
- Queue changes locally offline. Synchronize on foreground/resume, after a bounded
  debounce and with backoff; offer Sync now and an honest status/last-success time.
- Merge disjoint changes against a saved base. Stop for review when both sides
  change the same data. Preserve both versions and offer explicit resolution.
- Sheets batch writes are atomic within one request, but Sheets has no database
  compare-and-swap transaction across devices. Recheck before writes and retain
  versions; do not promise linearizable, continuous or conflict-free synchronization.
- Background execution is best effort under OS scheduling. SQLite remains usable
  with no account, connection, spreadsheet or internet access.

## Labels

- Keep a reusable label catalog, including labels not currently assigned to a video.
- Show a clearly named Remove action on selected labels. Provide a label manager
  with counts and a confirmation before global deletion.
- Global deletion removes the label from videos, folder/YouTube defaults, filters
  and Practice/Daily Picks preferences. Persist it and synchronize the deletion.

## Visual and motion contract

Retain BailaCue, the approved concept05 b/play artwork and blue/black identity.
Use the owner's Agent Project Starter Premium Redesign/Design Stack workflow at
revision 2a2be2b54595ab67768b1f13cc2a0794f5787f64, adapted to native React Native.

- Compact editorial headers, clearer primary actions, calmer surfaces and less
  repetitive card chrome. Give practice/video content priority over decoration.
- Center complete chip rows, including shorter wrapped rows; keep text readable.
- Add interruptible press feedback, short entry transitions and progress motion.
  Use native transform/opacity animation; honor reduced motion and preserve focus.
- Never animate/reparent/reload a video player to decorate a transition.
- Verify light/dark, narrow/large-text, loading/empty/error/conflict and recovery
  states. Test migration/SQLite transactions, backup integrity, Sheets conflicts,
  labels and the actual native video export/original-preservation journey.

Delivery: source, updated documentation and evidence in GitHub, followed by a new
tested Android preview. Store publication and production database deletion are
separate actions. iOS compilation is distinct from signed iPhone runtime acceptance.

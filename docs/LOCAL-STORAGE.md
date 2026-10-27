# Local storage, backups and Google Sheets

BailaCue now works without a BailaCue account or a hosted database. Android/iOS
use `expo-sqlite`; the browser preview uses IndexedDB. Google/Dropbox sign-in only
connects the user's own storage. The app no longer calls the Me+ gateway.

## Updating an existing phone

The first launch imports the old guest and account-specific AsyncStorage records
into separate local library profiles. It validates records first, commits each
profile transactionally and records completion. Original old keys are retained as
migration recovery. Repeating initialization never overwrites an imported profile.

Video paths, downloads, notes, ratings, collections, settings and paused Practice
state are preserved. Only the old BailaCue session is retired. Provider credentials
remain in the existing secure vault. If several previous libraries exist, choose
one in **Settings → Backups & recovery**. Switching opens Today and does not merge
or erase any profile.

Old server-only Me+ snapshots are not automatically accessible without the old
account identity. The production gateway and tables have **not** been changed or
deleted. Such data needs an explicit authenticated export and conversion to a
reviewable backup; it must not be recovered by querying unrelated production data.
Historical deployment code is under `archive/meplus` and excluded from app/CI builds.

## Recovery copies

**Settings → Backups & recovery** can export/import a checksummed JSON file or save
a dated recovery copy to the exact Drive/Dropbox folder you select. A separate
metadata folder can be selected without creating a video source or Daily Pick.
It needs a connected account with write permission to save. Reading a file checks
that it remains inside the reviewed folder. New files use unique names and never
replace an original video or older backup.

The portable format includes labels, ratings, video identities, notes/moments,
sections, dance types, collections, practice history and preferences. It excludes
video bytes, device paths, thumbnails, OAuth/API credentials, upload jobs, device
lock and reminder permissions. Keep original videos separately. A backup can only
recover a device-only video's metadata on another phone until its file is supplied.
Reconnect provider accounts after moving to another device.

Imports validate the format, structure, size and SHA-256 checksum before displaying
a preview. “Add missing items” preserves matching current metadata; “Use backup’s
matching metadata” explicitly replaces matches while keeping current-only records
and phone files. A local recovery checkpoint is saved first. Five recent phone
checkpoints are retained. Uninstalling removes these local recovery points too.

## Google Sheets

Open **Settings → Backups & recovery → Google Sheets sync**. Connect a Google Drive
account with write access. Create a dedicated spreadsheet or review an existing
spreadsheet link and confirm connection. BailaCue adds its six named tabs while
preserving unrelated tabs. It refuses conflicting/unrecognized BailaCue tab sets.

The app owner must enable **Google Sheets API** once in the Google Cloud project
that owns the app's OAuth registration. Drive API alone is insufficient:
https://console.cloud.google.com/apis/library/sheets.googleapis.com
The existing full Drive scope is supported by Sheets v4; no client secret belongs
in the app. OAuth test-user/verification requirements still apply to public distribution.

| Tab | Purpose |
| --- | --- |
| BailaCue Info | Format marker, saved revision and editing instructions |
| BailaCue Labels | Editable catalog; add rows to create, remove rows to delete a label everywhere |
| BailaCue Config | Editable preference values as JSON; retain setting names |
| BailaCue Videos | Editable title/dance/rating/labels, stable ID, source and readable notes |
| BailaCue Recovery | Full portable snapshot, split into cells below Google's cell limit |
| BailaCue Versions | Append-only dated, checksummed recovery history |

A blank rating means unrated, which Daily Picks considers 5★. Video labels use a
JSON list such as `["Artist", "Footwork"]`. Config examples: theme `"dark"`, weekly
minutes `90`, selected dances `["Salsa", "Bachata"]`. Video IDs and recovery tabs
must remain unchanged. Add/remove videos, edit notes and source settings in the app.
Removing a Labels row removes its assignments/defaults/filters on the next sync.

The app syncs after edits, polls while open, and retries on resume. Offline changes
remain durable locally. Failures use exponential backoff from 30 seconds to 15
minutes, with **Sync now** for an explicit retry. Last-success, queued status,
errors and conflicting fields are visible. Disjoint edits merge against the last
synced base. Concurrent same-field changes stop for review: choose the phone's or
spreadsheet's conflicting values; other changes still combine.

Google batch updates are atomic within a request. BailaCue rechecks the remote
fingerprint before writing and verifies the result afterward; each write appends
recovery versions, including previously edited Sheet content. **Sheets has no
cross-device compare-and-swap transaction**. Two clients can still race between a
check and a write. Versions and conflict review aid recovery; this is not a
linearizable database or a guarantee against every simultaneous-edit race.

Android/iOS register an optional background task with a 15-minute minimum request.
The OS decides if/when it runs, especially with battery restrictions or after force
quit. Background execution only pushes when the Sheet has not changed; incoming
changes wait for the foreground app. Browser sync works only while the page is
open. Neither platform promises continuous sync while closed or offline.

Recover an older version with **Find spreadsheet recovery versions**, preview it,
and confirm recovery. Pausing sync leaves the Sheet and history intact. Protect
access to the Sheet as you would any personal notes. Google account deletion,
manual Sheet deletion, quotas and provider availability remain outside BailaCue.
No live private Google/Dropbox account test is implied by controlled API tests.

# Optional source numbering · 0.2.10 and later

Connecting a source, reopening the app, foreground polling and Refresh videos only
read cloud metadata. They never rename provider files or existing phone copies.
Library titles follow actual observed source filenames. Older libraries with a
numbering registry do not implicitly enable renaming on upgrade.

Each source card has two separate controls:

- **Rename existing videos…** refreshes a read-only preview of current names and
  number-only targets. Apply numbered filenames is the only bulk rename action.
  Cancel keeps filenames. Only the reviewed file IDs are changed; files discovered
  after the preview wait for another reviewed action. Matching owned phone copies
  are included. Progress shows checked, renamed, already numbered, pending uploads
  and each individual failure. Pause stops after the current file. Review remaining
  renames previews a retry and skips cloud filenames already applied successfully.
- **Number new uploads** is off by default. Enable it explicitly for a source to
  number future app uploads. This does not rename existing or externally added
  videos. Turning it off keeps chosen video titles on new uploads. Saved jobs keep
  their captured naming choice; old jobs without this flag default to off.

When selected, numbered names are `0001.mp4`, `0002.mp4`, and up, with each actual
media extension preserved. App titles use only the filename stem. No descriptive
suffix is appended. Each source retains its own increasing allocation registry.
Existing allocations remain attached to stable Drive/Dropbox IDs. Removed videos
and cancelled jobs do not free numbers. New outside identities take the next
allocation regardless of their old numeric filename. Existing numbers can be
recovered on a first connection without a registry. Manual snapshots retain the
registry and new-upload preference, excluding device-local progress/errors.

Before any cloud rename, the registry is saved durably. The provider verifies the
selected parent and write permission. Only successful provider responses update
actual filenames/titles; errors retain the observed name and report the file and
reason. Drive errors include HTTP status and its returned message. Video contents,
sharing, ownership, ratings, labels and notes are not changed by filename updates.

Phone-copy changes are staged before references are committed and old copies are
removed. Existing target reuse requires matching size and SHA256. Photos/Files
originals outside BailaCue are not renamed. Browser file keys remain stable.

Unfinished uploads stay protected at their saved IDs/paths. Only a job-unique
staging name or confirmed stable ID can claim its reservation. Conflicting legacy
allocations are repaired durably before finalization. Completed Dropbox retries
find the saved file ID after its temporary path was renamed; missing or mismatched
IDs never start a duplicate upload. Only explicitly opted-in new jobs receive
numbered final names; ordinary uploads finalize under their chosen original title.

Discovery still runs on open/resume, every five foreground minutes and manually.
There is no closed-app discovery guarantee or central multi-device sequence lock.
A renamed file keeps its stable identity, so source membership, notes, ratings and
Daily Picks remain attached.

Older builds renamed during discovery and recorded the scan time before the
sequential rename pass completed. Their source cards did not expose active per-file
progress, so a partly changed folder could appear finished. This behavior has been
replaced by the explicit action and progress/results above.

# Android build27 acceptance

[Exact APK build](https://github.com/dn-lx/BailaCue/actions/runs/39789411994) ·
[15-check Google ARTEMIS acceptance](https://github.com/dn-lx/BailaCue/actions/runs/39793692531).
The source is `568002863e5b8a057cec2fc5b117d3700ccb1924`; the acceptance harness
uses the keyboard-navigation correction in `c177135`. No app bytes changed.

The pinned Google ARTEMIS controller/helper 1.2.0 performs actual API35 device
observation/actions with owned synthetic media. No autonomous model/private
Google account is involved. Reports cover playback/resize/rendered-pixel Mirror,
trim handles/loop, new native MP4/original preservation, Photos, labels, rated
Salsa/Bachata picks and Practice pause/background behavior. The final check pulls
the real SQLite database, checks integrity and confirms saved imports/sections
and global label removal after a durable commit, then restarts the app.

`media-proof.json` independently rechecks file hashes and ffprobe duration.
`apk-proof.json` independently verifies APK signature/content digest, identity,
version/ABIs and exact ARTEMIS-accepted hash. Images are original screenshot bytes
with the correct .jpg extension. The exported media and database remain in the
workflow artifact; synthetic videos and DB contents are not committed here.

The supplemental public YouTube attempt did not expose addable playlist contents
within its bound. It remains blocked/unverified and is not counted among 15 passes.
Live private Sheets/Drive/Dropbox account acceptance is separate and unperformed.

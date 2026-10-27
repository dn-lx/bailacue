# Owned synthetic browser video fixtures

These small, generated test patterns contain no private video. Keeping their
exact bytes in Git removes package-mirror/FFmpeg installation from browser CI.
The real import/playback/loop/export tests still use actual MP4 input.
`manifest.json` records sizes and SHA-256. The native ARTEMIS gate independently
generates its asymmetric fixture and validates the exported media with ffprobe.

Regenerate intentionally, using FFmpeg with libx264 (24fps, 320×240, yuv420p):

```sh
ffmpeg -y -f lavfi -i testsrc2=size=320x240:rate=24 -f lavfi -i sine=frequency=440 -t 6 -c:v libx264 -pix_fmt yuv420p -c:a aac tests/fixtures/bailacue-test-video.mp4
ffmpeg -y -f lavfi -i testsrc2=size=320x240:rate=24 -t 6 -c:v libx264 -pix_fmt yuv420p tests/fixtures/bailacue-cloud-test.mp4
ffmpeg -y -f lavfi -i testsrc2=size=320x240:rate=24 -t 3 -c:v libx264 -pix_fmt yuv420p tests/fixtures/bailacue-flow-test.mp4
```

Encoder/version differences can change bytes; review and update the manifest when
regenerating. The committed fixture content is the source of truth for browser runs.

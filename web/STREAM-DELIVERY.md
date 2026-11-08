# BailaCue video delivery: free optimized MP4 copies

**Current approach: free local processing only.**

The earlier Cloudflare Stream pilot is retired. The Netlify endpoint
`/api/stream/:action` returns HTTP 410 and cannot create paid encoding
uploads. The legacy modules are kept only for backwards compatibility
with old playback metadata/tests, not as the active upload flow.
No paid video-encoding service was activated or used by this migration.

BailaCue now uses the following pipeline:

1. Existing originals stay intact in the fixed Salsa and Bachata Google Drive folders.
2. On a computer, run the free **local FFmpeg studio** or the one-time batch
   converter. You can select **multiple videos** in the studio browser.
3. Local FFmpeg creates independent H.264/AAC MP4 versions at **360p, 720p,
   1080p** when the source resolution permits, never artificially upscaling.
4. The computer uploads these separate versions to the dedicated
   **BailaCue — Optimized Playback (H.264)** Drive folders, preserving
   the original files and stable video identities.
5. The owner imports the generated manifest into BailaCue's **Add videos**
   admin screen. Original metadata, ratings, labels, and IDs remain unchanged.
6. The player prefers optimized playback and offers manual Quality selection.
   If a rendition is inaccessible, the player falls back to the original.

This approach uses **no paid transcoding service**, but extra Google Drive
storage, internet bandwidth, and local electricity may incur costs.
Playback still depends on Google Drive download range support and limits;
the separate MP4 ladder is not automatically adaptive HLS or a guaranteed CDN.

Start here: [Free local studio setup](tools/README.md).

Dedicated optimized folders:
- Root: https://drive.google.com/drive/folders/1CErkH8BmExpKGZXHSl1hnDbs6fgr08PQ
- Salsa: https://drive.google.com/drive/folders/1Z8yfu20bLFKChQGXYQQ8uZZoEDMTSx1f
- Bachata: https://drive.google.com/drive/folders/1rOwr5utjZ-gfCj5Zj6KlOjmqdFRu8ncq

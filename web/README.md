# BailaCue web · 0.4.0

Account-free browser companion to BailaCue mobile. This update lives on `develop`;
mobile implementation and `main` remain unchanged. The web interface uses text
branding without the previous logo.

## Run and check

Node 24; TypeScript 6.0.3 checks the code. The player uses native HTML5 video.

```sh
cd web
npm ci
npm run lint
npm run typecheck
npm test
npm run build
```

Serve `web/dist` with a static server. Netlify reads root `netlify.toml`, builds in
`web` and publishes `dist`. Keep node_modules, dist, .netlify and local identity files
out of Git. Native Expo dependencies are outside this web build.

## Drive originals · 0.4

Shared Drive originals play through a bounded, same-origin Netlify range proxy into
BailaCue's HTML5 player. No streaming-provider account, playback copies or viewer
sign-in is needed. Google quota/permission errors have an explicit preview fallback.
See [STREAMING-SETUP.md](STREAMING-SETUP.md).

## Collections and uploads

Parent folder: `1elTpDpgefwwlnrSEFc8vyREt3HUpDS8P`.

| Dance | Fixed source and destination | Deployed catalogue |
| --- | --- | --- |
| Salsa | `1lVR5Pc-6SupJOfLIhcRE-oo69FUDM5Sm` | 114 videos |
| Bachata | `17CFKIazhQJTGXvlHP5sa1mqlvu9p-2i1` | 152 videos |

`catalogue.json` holds actual Drive metadata; no video bytes are copied to GitHub or
Netlify. Guests browse this versioned snapshot and add YouTube without signing in.
The original folders and their permissions have not been changed.

Add videos offers multi-file selection, local preview, a fixed dance destination,
labels, artists, recording date and notes. Optional Google authorization enables
live refresh and real resumable Drive upload. A public web OAuth client ID is still
required: see [GOOGLE-SETUP.md](GOOGLE-SETUP.md). Missing configuration is reported
honestly; upload success is reported only after Google's completion response.

Uploads inspect current Drive names, reserve a generated file ID, and number new
files above observed numeric names and locally reserved numbers, e.g. `0115.mp4`.
Each dance has its own sequence and extensions are retained. Existing Drive files
and local originals are never renamed or overwritten. Progress uses acknowledged
bytes; Pause/Retry resumes the same session and ID while this tab stays open.
Canceled allocations may leave gaps. Same-browser uploads use Web Locks where
available. Cross-device numbering is checked but is not globally atomic; recheck
on a collision. There is no shared sequence server.

Connected refresh and confirmed uploads update this browser's library. Other guests
see the deployed snapshot until refreshed/redeployed. This is not automatic public
catalogue publishing or a shared metadata backend.

## Metadata and discovery

- Personal title, typed labels, artists/teachers, recording date, class/event,
  location, BPM, notes, 1–10 rating, learning status, favourites and saved A–B loops.
- Real Drive creation/modification dates, size, duration and resolution when known.
  Artists and recording dates are user-entered; unknown values are not guessed.
- Create, rename and delete labels across local videos. Types: Style, Technique,
  Video type, Level, Artist. Optional Salsa/Bachata style suggestions are included.
- Searchable label/artist dropdowns, dance/source/rating filters, text search,
  numeric/title/rating/date sort and paging. Labels match together; artists match any.
- Validated YouTube videos, Shorts and playlists, deduplicated and removable.
  A playlist remains one library source and rating; it is not silently enumerated.
- Daily Picks, balanced practice queues and explicit practice tracking are retained.
  Queues advance manually so a move can be repeated as long as needed.

Personal metadata uses browser storage (`bailacue:web:v1`) with backward-compatible
migration. There is no BailaCue account or cross-device sync. Export/import merges
validated backups including labels and uploaded entries. Google tokens stay in
memory and never enter backups or playback URLs.

## Player

Every source offers Compact/Comfortable/Wide sizes, height adjustment, theater view
and Full screen. A full-window layout and Exit button work when native fullscreen
is unavailable. Escape exits that layout before closing the player.

YouTube uses its official IFrame API. Shared Drive originals, local previews and authorized Drive streams
use HTML5 video. Controls include play/pause, seek, speed, mute and A–B loops;
native video also has mirror. Saved loops are metadata, not edited video files.
A service worker forwards authorized Drive range streams without caching media or
persisting tokens.

If an original cannot play, choose Drive preview and its own controls. Its cross-origin
iframe cannot use BailaCue's custom seek/speed/loops. Connected Drive playback can
also read newly uploaded videos before a catalogue redeploy.
Drive processing/quota/permissions, provider restrictions, codecs or expired tokens
can prevent playback. Open original remains available. No trimming, re-encoding or
automatic watch tracking is claimed.

## Deployment

Netlify `bailacue` (`0aeef340-5366-454e-b379-14bfee4c1784`) is linked to
`dn-lx/bailacue`. Only develop is enabled as an additional branch deploy:
`https://develop--bailacue.netlify.app`. Production branch remains `main`.
The primary `https://bailacue.netlify.app` retains the initial tested 0.1 build;
updating develop does not merge main or republish production.

See [VERIFICATION.md](VERIFICATION.md) and [DESIGN-REVIEW-0.2.md](DESIGN-REVIEW-0.2.md).
No retired mobile Supabase table or Me+ database is used. The previous Cloudflare integration has been removed.

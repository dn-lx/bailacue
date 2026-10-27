# Full-document implementation · preview22

The later [round-2 requirements and implementation](REQUIREMENTS-ROUND-2.md) are a separate list, delivered in build26. [Current verification](VERIFICATION.md) records that APK; the table below remains the historical first-round record.

The owner authorized all 22 issues on20 October2026. The organized specification
is mirrored in [PRODUCT-REQUIREMENTS.md](PRODUCT-REQUIREMENTS.md). Earlier review-only
wording is superseded. All original screenshots remain in the Google Doc.

| Issues             | Delivered source                                                                                                                                | Evidence / limits                                                                                                                             |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| BC00 / BC20        | Agent Project Starter design guidance, semantic blue/black tokens, chosen BC/play icon,66 vector/PNG exports                                    | Starter revision2a2be2b54595ab67768b1f13cc2a0794f5787f64 reviewed; full asset inventory in brand/README.md                                    |
| BC01 / BC02        | TextureView Mirror, unmirrored controls, drag and accessible/keyboard resize; removed presets/count UI                                          | Browser seek/resize/Mirror regression; native rendered-pixel check added                                                                      |
| BC03               | Primary details; expandable extra tools, context, comparison, trims, notes, file actions                                                        | Browser details persistence; native editing gate                                                                                              |
| BC04               | Unified notes/moments, edit/delete/seek; idempotent bookmark migration                                                                          | Upgrade test retains IDs/text/times and avoids duplicates                                                                                     |
| BC05 / BC06        | Shared custom dances, explicit source defaults, grouped suggestions and custom artist labels                                                    | Migration/source identity and custom-dance browser tests                                                                                      |
| BC07 / BC08 / BC09 | Single dance row, searchable labels, secondary storage/star filters, numeric/date/rating/title sorts                                            | Browser exact stars+Unrated/numeric order; sort persists; unnumbered/missing dates last, ties source/id                                       |
| BC10 / BC11        | Direct star ratings; no More/Less/Learned; one per dance, advanced source selection, optional label gates                                       | Rating/cooldown/stability/empty-slot tests; unrated counts5★; old metadata retained                                                           |
| BC12 / BC13        | Rating-weighted queue without replacement, balanced dance turns, actual video playback and Previous/Next, loops, explicit repeat/finish         | Browser continuous playback and Previous; shared domain queue tests                                                                           |
| BC14 / BC15        | Actual playing wall time, paused timer for loading/pause/background, breaks, explicit resume, persisted position/history, idempotent final save | Domain clock/save tests and browser pause/reload/history; native background test added; physical call interruptions still need device review  |
| BC16 / BC17        | Official YouTube player/oEmbed/Data API, combined-link choice, playlist pagination/preview/selection/refresh, dedupe and memberships            | Browser mock official endpoints; complete pagination requires device API key; keyless player list may be limited and is disclosed             |
| BC18               | Versioned optional owner catalog: Bachata Tutorials by Roberto & Magdalena Bachata                                                              | Supplied playlistPL2E0b6twkkHkMemtovF3zHgo95pURUUmy; no invented Salsa links; language marked not specified; no automatic add                 |
| BC19               | YouTube opt-in for Daily Picks/Practice, online-only, supported rates/fallback, no file actions                                                 | Domain/browser integration checks; live YouTube and iOS autoplay/embedding remain external acceptance                                         |
| BC21               | 185 unit/database tests, 10 browser journeys, type/lint, web export and Expo Doctor 20/20; Android pipeline                                       | All 14 native checks and public-byte verification pass; fresh iOS simulator compile passes; physical iPhone/live providers remain manual |

Working defaults: shared dance types independent of storage; one Daily Pick per
selected dance; exact Library ratings plus Unrated; newest-added sort; old learning
state kept as metadata only. Practice uses a weighted permutation with balanced
dances, no within-cycle repeats, and actual active wall time independent of speed.
No automatic source renaming. Original video bytes and destination selection retain
their existing upload/trim safeguards. No new production tables are required: the
existing private metadata snapshot holds catalog IDs and YouTube memberships.

Build17 (`v0.2.12-preview.17`) is the earlier brand-only build. Build22 includes the
full-document source; do not attribute these features to build17.

Unpublished build18/tag v0.2.13-preview.18/run39429970323 was cancelled before publication to fix unselected dances entering total-count Daily Picks. Immutable tag/source retained.

Build19/tag v0.2.14-preview.19/run39431016837 was cancelled before publication for final YouTube import, full-screen contrast and revoked-copy UI corrections.

Build20/tag v0.2.15-preview.20/run39432080504 built successfully but was blocked after 5 native checks: the hidden full-screen VideoView stole the inline video surface. Source21 conditionally mounts it. Evidence is in verification/android-build20-initial/. No build20 release was published.

Build21 passed 13 native checks, including real pixel Mirror reversal, export/original integrity, labels and Daily Picks, but was withheld for the final Practice pause check. Build22 rejects stale session/mount events and preserves explicit pause intent. Its rerun passed all 14 checks on the same APK, and the accepted bytes were published.

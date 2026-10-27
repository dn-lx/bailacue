# Requirements · owner-authorized full implementation

Source: https://docs.google.com/document/d/14gHkXfuTIZxQUjV_kn7Ra1nsD7A_hjv8Mn3jILW0gWc

BailaCue improvements — implementation requirements and order
Updated 20 October 2026 · All 22 issues implemented; Android build22 published and verified; external manual acceptance remains in VERIFICATION.md
This draft turns your screenshot notes into specific requirements and smaller implementation issues. It also incorporates the previously requested YouTube sources and use of your Agent Project Starter. “Owner request” means you asked for it; “Proposal” means a recommendation to review. The owner has now authorized implementation of the full backlog. Proposed defaults are the working decisions unless changed below; acceptance status is recorded separately from implementation.
Read the product rules, implementation order and review decisions first. Your original wording and all seven screenshots remain unchanged in the appendix. Refer to an issue ID when requesting a correction or implementation.
Approved brand update — 20 October 2026
BR-01 — Approved identity: use concept 03 from the blue-and-black set, the BC monogram with an embedded play triangle. Electric blue #1465FF, near-black #080D18 and white are the new brand palette; apply readable light/dark app themes.
BR-02 — Git asset requirement: commit all maintained logos and icons, including source artwork, primary/light/dark/monochrome symbols, transparent logos, horizontal/stacked wordmarks, Android launcher/adaptive/themed monochrome assets, iOS/app-store artwork, splash, favicons and badges. Keep paths, dimensions, checksums, regeneration instructions and completion status in the repository.
Brand delivery: the approved concept now has traced SVG symbol paths, outlined Outfit wordmark paths, clean transparent and monochrome logo families, Android adaptive/themed assets, iOS/splash/favicon/badge and social exports. All 66 exports and original artwork are maintained in Git with an inventory and SHA-256 manifest.
Scope approved now: implement every requirement below, alongside the selected icon, blue/black colour theme and complete brand assets. The owner supplied the beginner playlist “Bachata Tutorials” by Roberto & Magdalena Bachata: https://www.youtube.com/playlist?list=PL2E0b6twkkHkMemtovF3zHgo95pURUUmy. It is an optional suggestion; users preview and choose whether to add it.
1. Product rules
Owner decision: keep BailaCue and use selected blue-and-black concept 03 (BC + play) as the icon. Improve UI/UX using dn-lx/agent-project-starter; maintain the complete logo/icon family in Git.
Owner request: show Salsa and Bachata when relevant and support additional dance types, such as Tango. Do not show a permanent “Other” chip beside them.
Owner request: remove duplicate category/source buttons. Everyday browsing should focus on dance types and user-selected labels. Keep source connections and storage configuration separate.
Owner request: support all explicit ratings from 1 to 5 stars. Unrated videos remain visibly unrated but count as 5 stars for recommendations until the user rates them.
Owner request: remove “More like this,” “Less like this” and “Already learned” from Daily Picks. Ratings express how useful a video is; preserve artist/type labels.
Owner request: retain drag-to-resize, remove Compact/Standard/Large presets, fix Mirror, remove “Count it out,” combine notes and bookmarks, and put labels/ratings immediately after playback controls.
Owner request: Practice must play a sequence of relevant videos while the timer runs, with full playback controls and Next/Previous.
Owner request: support optional beginner YouTube playlists/single videos chosen by the owner, and manual links chosen by each user.
Existing requirements to preserve: phone and online libraries remain distinct; uploads go to the exact selected folder; multiple folders/accounts are supported; originals survive trimming and failed uploads. Renaming stays explicit and off by default.
Scope boundary: the owner subsequently authorized implementation of every issue in this document. Existing optional-renaming safeguards remain. This authorization does not merge main, submit to stores, or require a new production database deployment.
2. Recommended implementation order
The phases below are the proposed delivery sequence, not a promised schedule. Each issue should be independently reviewable; “Medium” means it should retain the listed smaller scope rather than become one large PR.
Phase 0 — Agree the UX direction and review decisions. Use Agent Project Starter, capture the current screens and prepare key-screen mockups plus icon concepts.
Phase 1 — Repair and simplify the current player. Fix Mirror first; then remove redundant controls and unify metadata and annotations.
Phase 2 — Introduce flexible dance types and a shared label catalog, then replace duplicate filters and add sorting.
Phase 3 — Simplify Daily Picks around ratings, selected dances/sources, labels and recency.
Phase 4 — Deliver continuous Practice in four slices: selection/queue, playback/navigation, timer lifecycle and history/recovery.
Phase 5 — Add YouTube in four slices: manual video playback, playlists/refresh, beginner suggestions and recommendation integration.
Phase 6 — Finish the shared visual polish and chosen icon, then run release acceptance across the changed journeys.
Why this order: repair the broken player before reusing it in Practice; settle dance/label identities before filters and recommendation work; prove manual YouTube playback before importing whole playlists. Define the design system early and apply it throughout, with a final consistency pass rather than postponing all design until the end.
3. Issue-sized requirements
Phase 0 — Design direction and review
BC-00 — Use Agent Project Starter for this redesign
Requirement: Use the owner’s dn-lx/agent-project-starter Premium Redesign and Design Stack guidance: Taste for direction, UI/UX Pro Max for design-system guidance, Impeccable for critique/polish, and rendered/accessibility verification. Adapt the guidance to Expo/React Native.
Acceptance: Record the reviewed starter revision, current screenshots, reusable design tokens and proposed Library, Player, Practice and Settings flows. Icon exploration is complete: use owner-selected concept 03, BC + play, in blue and black. Preserve existing app behavior and project rules; do not run a new-project bootstrap or import web-only runtime assumptions.
Dependencies: Owner review of section 5; existing UI/UX requirement UX-01. Size: Medium.
Phase 1 — Player reliability and simplification
BC-01 — Make Mirror visibly work
Requirement: Mirror the rendered video horizontally, not the control labels. Keep the selected state honest in normal, resized and full-screen playback wherever the native player supports it.
Acceptance: Use an asymmetric test clip with readable left/right markers. Toggling Mirror visibly reverses the image and toggling again restores it; seeking, speed changes, orientation and full screen do not lose the state. If a platform playback surface cannot mirror, provide a supported rendering path or a clear capability limit. Mirroring does not alter the source or exported trim.
Dependencies: None; fast-track this bug independently of the broader redesign. Size: Small.
BC-02 — Simplify and align playback controls
Requirement: Remove Compact video, Standard video and Large video. Retain the resize grip, aspect ratio, seeking, play/pause, ±5 seconds, speed, Mirror and full screen. Remove the Count it out panel and count overlay from the user flow.
Acceptance: Controls are symmetric or centered, wrap without clipping at narrow widths and remain usable with large text. Drag-resize cannot hide essential controls. Existing count preferences cannot leave an invisible overlay active. Resize has an accessible adjustment alternative, such as screen-reader increment/decrement actions.
Dependencies: BC-00 design tokens; BC-01 remains separately testable. Size: Small.
BC-03 — Move details up and make extras secondary
Requirement: Place a compact Details panel directly after playback controls: actual title/number, dance type, choose/create labels and full 1–5-star rating. Put trim/saved sections, notes/bookmarks, downloads, comparison and less-used actions under clearly named expandable extra options.
Acceptance: Labels and rating can be edited without scrolling through all tools. Changes persist after reopening, preserve source identity and never rename a file. Extra options stay discoverable and retain existing data. Use consistent save feedback for labels, dance and ratings; do not imply that a cloud file itself has changed.
Dependencies: BC-00; BC-06 later replaces fixed dance choices with dynamic choices. Size: Small.
BC-04 — Combine notes and bookmarks
Requirement: Replace Make a note of it and Bookmark this moment with one Notes & moments feature. A record has text/title and an optional playback timestamp: a note can be untimed, while a named moment jumps to its saved time.
Acceptance: One editor creates either kind; one chronological list supports edit, delete and seek where timed. Existing notes and bookmarks migrate without losing text, timestamps or stable video links; retrying migration creates no duplicate records. Keep saved A–B practice sections as a separate feature.
Dependencies: BC-03; migration strategy agreed before schema changes. Size: Medium.
Phase 2 — Categories, filters and sorting
BC-05 — Support user-defined dance types safely
Requirement: Use one shared, extensible set of dance types across source setup, imports, video details, Library, Daily Picks and Practice. Start with Salsa and Bachata when relevant; let the user create Tango or another type. A source has an explicit default dance type, not a second category inferred forever from its folder name.
Acceptance: Two Salsa folders create one Salsa dance chip. Adding a Tango source/type makes Tango available consistently. Existing Salsa/Bachata metadata, ratings, picks and source IDs survive migration. Preserve legacy Other/unassigned videos and offer a way to classify them without a permanent Other chip. Do not silently assign a dance from the video image.
Dependencies: BC-00; review decision D1. Size: Medium.
BC-06 — Create a useful shared label picker
Requirement: Offer searchable suggested labels grouped by dance substyle, technique, video type and level, plus user-created artist/teacher labels. Reuse the same choose-existing-or-create interaction in imports, details, source defaults and practice setup. See section 4 for starter suggestions.
Acceptance: Users can choose existing labels, create custom ones and select several labels. Case/spacing duplicates are avoided while unrelated terms remain separate. Suggestions do not automatically tag every video or alter existing custom labels. Artist names are user-supplied, not guessed from uploader names or faces.
Dependencies: BC-05; review decision D2. Size: Medium.
BC-07 — Remove duplicate Library filter buttons
Requirement: Show one consolidated dance-type row and a compact searchable label selector. Remove duplicate Salsa/Bachata source chips and move Connect/manage storage to Settings or an explicit source-management action. Keep physical source and phone/online filtering in a secondary Filters panel.
Acceptance: With Salsa and Bachata sources there is one chip for each dance, not one per folder plus one per style. Tango appears when configured. Users can still distinguish two folders of the same dance in the secondary panel. Active filters and one Clear filters action are visible. Filter changes never modify provider files.
Dependencies: BC-05 and BC-06; review decision D2. Size: Small.
BC-08 — Filter by any star rating
Requirement: Replace Priority 4–5 with All ratings, explicit 1/2/3/4/5-star choices and Unrated. Proposal: allow a set of exact ratings, so 2 and 4 can be selected together. Show Unrated separately even though it has effective recommendation priority 5.
Acceptance: Each explicit rating returns only matching rated videos; Unrated returns only videos never explicitly rated. Search, dance, labels and source filters combine predictably. Clearing ratings restores all videos. Minimum-star controls in Daily Picks/Practice are clearly described as thresholds, not exact-rating filters.
Dependencies: BC-07; review decision D3. Size: Small.
BC-09 — Add stable Library sorting
Requirement: Offer Number ascending/descending, Date added newest/oldest, Rating high/low and Title A–Z/Z–A. Proposal: offer Original file date only when reliable provider metadata exists and identify its meaning.
Acceptance: Numbers sort numerically: 0002 precedes 0010 and 0100. Different sources may each contain 0001, so ties use source then stable video identity. Unnumbered items and missing dates have documented, stable placement. Sort persists and applies after filtering without renaming files or changing remote order.
Dependencies: BC-07 and BC-08; review decision D4. Size: Small.
Phase 3 — Rating-led Daily Picks
BC-10 — Remove redundant feedback controls
Requirement: Remove More like this, Less like this and Already learned from Daily Pick cards. Offer a compact 1–5-star rating there or a clear route to edit it. Proposal: hide learning-status controls in the main browsing flow and stop old status/More-Less scores from influencing recommendations.
Acceptance: Changing a rating persists. Stored notes/labels are untouched. Legacy feedback/status remains preserved during migration but no longer overrides the new algorithm. Keep Skip today as a separate action; skipping is not a low rating. No user-created artist/type labels are removed.
Dependencies: BC-03 and BC-08; review decision D5. Size: Small.
BC-11 — Share eligibility rules and explain Daily Picks
Requirement: Use available videos, selected dances/sources, minimum stars and chosen label rules as eligibility gates. Within eligible videos, keep Daily Picks rating-first; use labels and recency to break ties, with a recent-pick cooldown. Unrated counts as 5 stars. Never silently lower the rating threshold.
Acceptance: One Salsa plus one Bachata is an explicit mix, without adding a slot for every connected folder. Advanced selection can target individual sources. Save valid picks for the local calendar day and replace them only for explicit update or lost eligibility. Explain an empty dance slot, avoid the same underlying video twice, and test cooldown fallback independently per slot.
Dependencies: BC-05, BC-06 and BC-10; review decisions D2 and D6. Size: Medium.
Phase 4 — Continuous Practice
BC-12 — Build the Practice setup and queue
Requirement: Before Start, choose session length, break length, dances, optional sources, labels/keywords and minimum rating. Choose from actual categories and the shared label picker, not a separate free-text system. Show a queue preview. Proposal: use the rating-weighted variety policy in D6.
Acceptance: Only videos matching the selected filters enter the queue; duplicates across sources play once. Selected dances receive balanced turns, so one large source cannot dominate. Explain when no eligible video exists. Do not play unavailable online videos in an offline-only session. Preferences can be reused next time.
Dependencies: BC-05 through BC-08 and BC-11; review decision D6. Size: Medium.
BC-13 — Play continuously with Next and Previous
Requirement: Starting Practice starts both the focus timer and the first ready video. When a video ends, continue to the next eligible item unless the user enabled an A–B loop or paused. Reuse the Player controls, including speed, seeking, Mirror, resize, Next and Previous.
Acceptance: Next advances once; Previous returns through real queue history. No duplicate playback or stacked audio occurs. A selected loop stays on the current item until disabled or Next is chosen. Queue exhaustion offers an explained repeat cycle or session finish; it does not pretend there are unseen videos. A broken item can be skipped with an explanation.
Dependencies: BC-01, BC-02 and BC-12. Size: Medium.
BC-14 — Define timer, buffering and interruption behavior
Requirement: Proposal: pause media and focus time during manual pause, app backgrounding, breaks and interruptions; do not count loading/buffering as active practice. Pause at a break/end, show Continue/Finish, and resume only by a deliberate user action. Editing filters replans only the remaining queue after confirmation.
Acceptance: Test phone calls/background/foreground, connection loss, buffering, timer expiry mid-video, speed changes and loop playback. Played media time at 0.5× does not halve wall-clock practice time. Leaving the app never results in hidden video playback or an unexpectedly completed session. See D7 before implementation.
Dependencies: BC-13; review decision D7. Size: Medium.
BC-15 — Save practice history and recover a session
Requirement: Record actual active practice time and the videos worked on. Keep session queue/history distinct from today's saved Daily Picks. Proposal: recover an interrupted session with Resume or Finish, without autoplay.
Acceptance: Pause/break/loading time is excluded under the agreed timer policy. Save once even after retries or process restart. Next/Previous and session completion update practice recency from actual use, not merely from queue inclusion. No double-counted weekly minutes; resume retains filters, current item and position where supported.
Dependencies: BC-14. Size: Medium.
Phase 5 — YouTube sources and beginner suggestions
This phase carries forward the GitHub YouTube requirements. It must not delay the current-player fixes or require replacing Drive/Dropbox storage.
BC-16 — Add a single YouTube video manually
Requirement: Paste a public watch/youtu.be link, preview title/creator, assign dance/labels and add it. Play through the supported YouTube embedded player, with Open in YouTube fallback. A URL containing video and playlist IDs must ask which to add.
Acceptance: Deduplicate by video ID, preserve creator attribution and handle embedding/access restrictions honestly. Mark YouTube · Online. Do not offer media download, upload-to-Drive, original renaming, Photos saving or native trim/export for YouTube links. Confirm official API/player configuration and current terms before implementation.
Dependencies: BC-05 and BC-06; YouTube API configuration. Size: Medium.
BC-17 — Import and refresh YouTube playlists
Requirement: Add multiple public playlists as independent sources. Preview contents, preserve playlist order and paginate imports; support adding the playlist or selected lessons. Refresh discovers new items and updates availability.
Acceptance: Repeated imports and overlapping playlists reuse one video's ratings/labels/notes while preserving source memberships. Deleted/private entries have an honest unavailable state; refresh does not silently erase personal metadata. Removing a source changes nothing on YouTube. Explain partial failures, quota exhaustion and retry.
Dependencies: BC-16. Size: Medium.
BC-18 — Offer owner-curated beginner suggestions
Requirement: Create an optional beginner area for Salsa/Bachata playlists and single videos supplied by the owner. Show preview, creator, language, level and reason; Add to my library requires a user action. Manual add and Skip remain available.
Acceptance: Nothing is added automatically. Already-added items are indicated without duplicates. A versioned catalog stores type/link/dance/language/level/order/enabled state; catalog edits do not silently change existing libraries. No playlist links are invented on the owner's behalf.
Dependencies: BC-16 and BC-17; owner's chosen playlist/video links. Size: Small.
BC-19 — Integrate YouTube with recommendations and Practice
Requirement: Let users explicitly include YouTube in Daily Picks and Practice. Reuse ratings, labels, dance mix and identity rules while respecting online availability and real embedded-player capabilities.
Acceptance: Adding a playlist does not increase the daily count silently. Prove next-video behavior on Android/iOS; handle autoplay blocking with a visible Play action and paused timer. Unsupported player functions are absent or explained, not falsely presented as working. Channels/private playlists and full native-player parity remain later scope.
Dependencies: BC-11, BC-13, BC-14 and BC-17. Size: Medium.
Phase 6 — Visual finish, icon and release evidence
BC-20 — Apply the design system and chosen icon
Requirement: Complete the Agent Project Starter design workflow across the revised screens: consistent spacing, alignment, typography, cards, labels, loading/failure states and source status. Refine the owner-selected icon into editable vector artwork plus Android adaptive/monochrome, iOS, splash and badge assets.
Acceptance: Compare before/after screens and icon at real launcher size. Verify 320/360/412-width layouts, long names, large fonts, screen-reader labels, contrast and safe areas. Preserve originals, optional numbering and existing destinations. Browser screenshots complement, but do not replace, native checks.
Dependencies: BC-00; completed UI slices; owner's icon selection. Size: Medium.
BC-21 — Verify and prepare a reviewable release
Requirement: Run meaningful migration, recommendation/queue, transfer and native-player checks for changed behavior. Include Google ARTEMIS Android acceptance where supported, alongside accessibility and manual device review. Document iOS verification separately.
Acceptance: Evidence covers Mirror, resize, details, annotation migration, full rating filters, numeric sort, daily mix and Practice interruptions; test YouTube on its actual player when included. Verify trim creates a new file and failed uploads retain a recoverable phone copy. Match published APK bytes to the accepted build. Mark untested platforms/providers explicitly; production deployment or store publication needs its own authorized step.
Dependencies: Each included issue meets its acceptance criteria; report external-service and untested-platform limits explicitly. Size: Medium.
4. Proposed label catalog
These are searchable suggestions, not automatic classifications and not a claim that every video contains these elements. Keep the catalog curated and extensible instead of placing dozens of permanent buttons on each screen. Users may add their own spellings and labels; normalize only clear aliases, never unrelated dance traditions.
Bachata substyles/influences: Dominican / Dominicana, Traditional, Modern, Sensual, Bachazouk, Fusion.
Salsa substyles/timing: Cuban / Casino, LA / On1, New York / On2, Colombian / Cali, Rueda de Casino.
Dance-related styles/influences: Rumba, Son, Afro-Cuban, Cha-cha-cha. These are distinct traditions; they may be dance types or descriptive labels according to the user's classification.
Technique: Basic step, Weight transfer, Timing, Rhythm, Musicality, Footwork / Shines, Partnerwork, Leading, Following, Frame, Connection, Turns, Spins, Balance, Body movement, Isolations, Styling, Arm styling, Coordination, Transition, Combination.
Video type: Tutorial, Class recap, Demonstration, Drill, Warm-up, Solo practice, Partner practice, Social dance, Performance, Self-recording.
Level: Absolute beginner, Beginner, Improver, Intermediate, Advanced. Level labels do not replace a user's star rating.
Optional vocabulary for custom interests: Pachanga, Boogaloo, Mambo, Dips, Waves, Rolls. These are discoverability terms, not endorsements of suitability for beginners.
People and context: Artist/teacher name, Leader, Follower, Workshop, Festival, Class date/location. Never invent names or infer identity from a face. Optional level/safety notes can help users avoid unsuitable drills.
Keyword matching proposal: selected labels match any selected term by default, with a clear Match all option. A dance/source filter is combined with the label filter, not replaced by it. Example: Bachata + Footwork returns Bachata videos explicitly tagged Footwork/Shines under an approved alias rule.
5. Decisions for your review
The owner authorized full implementation after this review. D1–D7 are now the working defaults; the owner can request changes by ID. The supplied beginner Bachata playlist resolves the catalog-link part of D8.
D1 — Category meaning. Proposal: a dance type is a shared category, independent of storage. A source gets an explicit default type; adding a Tango source/type makes Tango selectable. Keep unclassified legacy items reachable in Filters. Confirm whether source creation should also offer Create dance type.
D2 — Clean filters and daily mix. Proposal: one dance row plus searchable labels; source/phone/online filters move to a secondary panel. Default Daily Picks becomes one per selected dance, with advanced source-specific slots. With two Salsa folders and one Bachata folder this means two daily videos, not three. Confirm this supersedes the earlier one-per-source default.
D3 — Ratings. Proposal: Library supports exact multi-select stars and a separate Unrated choice. Daily Picks/Practice keep a minimum threshold. An explicit 5-star Library filter excludes unrated videos; recommendation scoring still treats unrated as 5.
D4 — Dates and numbers. Proposal: default sort is Date added, newest first; Number sort is numeric within each source with stable source ties. Provider-created date is a separate option only if reliable. Confirm your preferred default.
D5 — Learning status. The screenshot explicitly removes Daily Pick feedback buttons. Proposal: also hide To learn/Practising/Learned filters and stop learning-status/More-Less feedback affecting new recommendations, while preserving stored values for reversibility. Confirm whether learning-status editing should remain under Extra options or disappear entirely.
D6 — Rating and variety. Keep Daily Picks deterministic, rating-first and stable for the day. Proposal for Practice: filter first, balance the selected dances, avoid repeats until the eligible queue cycle is exhausted, and shuffle within each dance with weight equal to effective stars (5-star has five times the initial draw weight of 1-star). Fix the generated session order so Next/Previous is predictable; only replan the remainder deliberately. This lets lower-rated eligible videos appear without treating all ratings equally. Confirm whether you prefer strict rating-first Practice instead.
D7 — Practice timer. Proposal: manual pause, breaks, background and buffering pause both practice time and video; focus time measures actual active wall-clock practice. Timer expiry pauses the video for Continue/Finish. Confirm whether you instead want a timer that keeps counting while you pause to practise a move.
D8 — Future scope. Supply the beginner YouTube playlist/single-video links when ready. Icon choice is settled: concept 03 (BC + play), blue and black. Recommend delivering player/filter improvements before YouTube. Whole channels, private playlists, video-content auto-tagging and automatic cloud filename changes are excluded.
6. Cross-cutting acceptance
No data loss: migrate custom dances, labels, ratings, notes, bookmarks, source IDs and saved sections safely. Preserve originals and app-owned phone-copy references. Repeated migration is safe; test upgrades from the published build.
Clear state: empty, loading, permission, offline and failure states say what happened and provide a useful next action. Never claim upload, rename or playback success before it is confirmed.
Consistent persistence: selected filters, sorting and practice setup survive reopening where expected. Metadata sync must preserve new IDs and relationships without inventing automatic conflict-free merging.
Source capabilities: Drive/Dropbox/phone support their actual file operations; YouTube is an online playback/catalog source. Do not show file actions that cannot work for that source.
Evidence: unit/domain tests for migrations, filtering, numeric sorting and queue rules; browser layout checks; native playback/timer/trim/transfer evidence for the changed device behavior. Do not present mocks as live provider verification.
Implementation authorization: the owner's instruction to implement all changes supersedes the earlier review gate. Apply the documented defaults, preserve data and verify acceptance. Native Android, iOS and live-provider evidence must remain distinguished.
7. Mapping from your original notes
Original 1, Settings dance buttons → BC-05 (dynamic dance types).
Original 2, duplicate Library buttons and all ratings → BC-07 and BC-08.
Original 3, remove Daily Pick feedback → BC-10 and BC-11.
Original 4, size presets, Mirror and alignment → BC-01 and BC-02.
Second original 4, remove Count it out → BC-02.
Original 5, combine notes and bookmarks → BC-04.
Original 6, move details up and make the rest extra options → BC-03.
Original 7, sorting → BC-09.
Original 8, continuous algorithm-based Practice and keywords → BC-06 and BC-12–BC-15.
Earlier YouTube request → BC-16–BC-19. Earlier Agent Project Starter/icon request → BC-00 and BC-20.
8. Related requirements and design references
BailaCue YouTube requirements
BailaCue UI/UX and icon requirements
Owner's Agent Project Starter — Design Stack
Owner's Agent Project Starter — Premium Redesign
The organized requirements are mirrored in GitHub docs/PRODUCT-REQUIREMENTS.md; docs/IMPLEMENTATION-TRACKER.md records delivery and acceptance. The original screenshots and private notes stay in this Doc.

# BailaCue interface audit · 0.5

Scope: Today, Library/Favourites, Practice, Labels, Add videos, Settings,
YouTube form, player, display settings, fullscreen, loading/error/preview states,
and keyboard interaction. Applies to the develop web app; no data migration.

## Findings and corrections

| Area | Finding | Correction |
| --- | --- | --- |
| Playback | Small left-aligned text buttons did not resemble a media player. | Centered rewind/play/forward group, 58px circular triangle play button and pause icon. |
| Timeline | Seek slider competed with speed, volume and practice buttons. | Dedicated full-width seek row with a separate elapsed/total readout. |
| Secondary controls | Mute was a text button and fullscreen was distant from playback. | Conventional speaker and fullscreen icons beside speed/volume controls. |
| Practice | A/B, loop, save and mirror crowded basic playback. | Separate expandable Practice tools section, with descriptive start/end labels. |
| State | Setting a new A left the previous loop toggle visually on. | New A clears the loop and resets its pressed state. |
| Accessibility | Static play/pause and mute labels did not describe the next action. | Dynamic action names, icon titles and a spoken current/total seek position. |
| Display | Three sizing controls and two buttons added clutter above every video. | Size, height and theater grouped under Display settings; fullscreen stays at the player. |
| Theater | Changing size could leave stale theater button text/state. | Size changes reset theater text and aria-pressed. |
| Forms | Optional text occupied an extra flex row and displaced adjacent inputs. | A shared label-line wrapper keeps optional markers beside labels. |
| Hierarchy | 11px labels, mixed helper rules and input placeholders competed visually. | 14px semibold labels, 12px normal helper/optional text, 14px placeholders and 16px input text. |
| Touch | Examples included 28px settings, 29px favourites/delete and 33px ratings. | Main buttons, media controls, rating choices, navigation and row actions have 44px targets. |
| Metadata | Cards, badges, dates and detail facts shrank to 7–10px on phones. | Card secondary text has an 11px floor; detail/help text is 12px. |
| Ratings | Eleven uneven choices wrapped unpredictably. | Two consistent rows of five scores, followed by a full-width Unrated action. |
| Search | Small filter labels and inconsistent control heights hindered scanning. | Shared readable filter scale, 44px selects and better wrapping. |
| Label picker | The first Down arrow skipped the first result; stale active descendants could remain. | Start at -1, clear stale references on filtering, reveal dropdown when navigating. |
| Labels | Small edit/delete actions and dense type subtitles. | Larger names, 12px type metadata, 44px actions and readable search controls. |
| Copy | Long upload instructions and connection details competed with form work. | Shorter hints; owner-specific configuration stays in an explicit disclosure. |
| Motion | Heading entrance began invisible during navigation. | Stable headings with no entrance animation; reduced-motion rules retained. |
| Dark mode | Secondary copy and callout contrast varied. | Consistent muted-text token and dark connection-card treatment. |
| Narrow layouts | Dense navigation and side-by-side controls were prone to crowding. | Larger bottom-navigation labels, responsive wrapping, stacked filters on very narrow screens and compact volume treatment. |
| Fullscreen | Expanding practice tools could consume the video area. | Controls have a bounded scroll area while the video retains the available space. |

## Verification

- Syntax checks, TypeScript, all 26 existing functional tests and production build.
- Live visual and interaction checks are performed against the develop deployment
  after the initial audit commit. Any follow-up findings are fixed forward.
- No all-video codec compatibility claim: Drive original playback still depends
  on browser codecs. Unsupported originals keep the explicit Drive preview option.
- Upload OAuth configuration remains a separate pre-existing requirement.


## Live review follow-up

- Verified the centered main button with a bounding-box calculation: 0px error,
  58×58px target. Verified the triangle/pause state and decoded video picture.
- Verified speaker mute/unmute, 0.5× speed, five-second seeking, A/B creation and
  resetting an existing loop by setting a new A. Controls retain accessible names.
- Verified the label manager uses 14px labels and 12px hints on the deployed page.
- Reviewed phone-width screenshots at 390px (upload) and 360px (library). Optional
  markers remain inline and the filter stack wraps without a horizontal scrollbar.
- The phone screenshots caught a too-tall header action: minimum height had leaked
  onto the inner text span. Reset the span and give the button one 44px height.
- Kept the player title/close row sticky while scrolling long metadata on phones.
- Removed the duplicate full-screen exit row; the normal fullscreen icon changes
  its accessible name to Exit full screen and remains enabled in preview mode.
- Added spacing before the label-form hint so it does not collide with Create.

Limit: screenshot checks exercise responsive CSS, not physical Android hardware.

- Keyboard review found Escape in the label search also closing the parent player.
  The picker now consumes Escape, closes its own dropdown and returns focus to its
  summary; a later Escape can close the player normally. First Down selects the
  first result, confirmed by matching aria-activedescendant to the first option.

## Public-site UX refinement · 0.6 · 6 November 2026

The current public BailaCue site is not an account-management product. Keep
the viewer experience simple; the single-owner authorization remains enforced
by Supabase and backend RLS.

| Finding | Implementation on `develop` |
| --- | --- |
| Header said **Admin sign in** and the dialog title emphasized internal roles. | Public action now reads **Sign in**, dialog reads **Sign in to BailaCue** and briefly explains public viewing vs owner editing. Owner authorization is unchanged. |
| Password field had no visibility toggle. | Keyboard-accessible Show/Hide password control with `aria-pressed`, input focus retention and reset on dialog close. |
| Settings button was inside the desktop-only sidebar footer and disappeared on phones. | Dedicated 44px gear button in the mobile header, wired to Settings and marked active on the Settings page. |
| Owner's header actions competed with the brand on narrow phones. | Hide redundant YouTube/add-video shortcuts in the mobile header; owner actions remain available in the bottom navigation. |
| The **DEVELOP** badge appeared in the production HTML. | Badge starts hidden and is shown only on the develop hostname (or local development). |
| Video cards said **Practice**, even though the public flow is a mix builder. | Changed cards, queue button, public picks and toast copy to **Add to mix**, **In mix**, and **Watch video**. |
| Changing dance filters replaced the focused button. | The corresponding selected filter regains keyboard focus after rendering. |
| Library count did not communicate pagination range. | Live-announced **Showing 1–20 of N videos**, updated on search/filter changes. |
| Mixes were a manual sequence requiring Next after every video. | Native video and individual YouTube playback now advance to the next mix item after ending. The first and manually selected mix item also attempts playback. If autoplay is blocked, users get a prompt to tap Play. |
| Adaptive Stream and Google preview players are iframe-based. | Their player completion cannot be detected without a separate provider event API. Existing visible Next/Previous mix controls remain available; automatic advancement is not claimed for these sources. |

Verification: the BailaCue web workflow checks syntax, JavaScript types,
unit tests including `tests/ux-regressions.test.mjs`, and a static build.
Changes target **develop only**; no new users, backend policies, video
sources, billing or cloud processing were added.

Limitations: automated checks do not replace a real-device
responsive/keyboard review. The site should be checked on a physical phone
before promoting these changes to main.

## Incremental UX update · 6 November 2026 — develop only

The public header already says **Sign in** and the dialog says **Sign in to BailaCue**. This is intentional: site visitors can watch without an account and the single owner can use the same sign-in action to manage videos.

| Finding | Implementation |
| --- | --- |
| Mix generation was simple, but custom mixes could not be reordered without rebuilding them. | Each queued video now has separately labelled **Move up** and **Move down** controls, with unavailable directions disabled. The order is saved in browser state and updates the mix immediately. Focus follows the moved video rather than disappearing after re-render. |
| Mix row controls could crowd small mobile widths. | Grouped action buttons, 44 px tap targets and a responsive second action row below the title at narrow widths. Play and remove remain alongside reorder controls. |
| Viewers had no quick route back to a video they had opened earlier. | **Recently opened** appears on Discover after a video has been opened. It displays up to four valid, still-available catalogue entries, most recent first. The section uses the same tested video cards. |
| Personal viewing context should not be published to the shared catalogue. | Openings are stored only in existing browser-local history, never Supabase. Entries are deduplicated and capped at 50. Local previews are excluded; **Clear recent** deletes the local history explicitly. |

Verification: tests for bounded history, removed sources, stable mix reordering, keyboard control labels and available row actions; web lint, typecheck, automated unit tests and build via GitHub Actions. These checks do not represent live Android device testing.

Production `main` and backend permissions are unchanged.

## Mobile Mixes screenshot follow-up · 6 November 2026 — develop only

Screenshot observation: The **Play this mix** button had a white background and invisible white text inside the dark mix panel. The separate timer card left substantial unused space, and creating a mix always generated ten items.

| Finding | Correction |
| --- | --- |
| “Play this mix” looked like an empty white button. | The secondary button now specifies `color: var(--text)` against `background: var(--surface)`, with hover contrast. This works for both supported themes. |
| The timer was not part of the desired public BailaCue experience. | Removed timer markup, start/reset logic, visibility handling, interval, and obsolete styling. |
| The number of mix videos could not be changed. | Added labelled numeric “Number of videos” control (default 10). Values are validated and preserved in browser-local state; Salsa/Bachata/combined mixes cap their count to available videos. |
| Split timer/creator layout wasted space and contributed to poor mobile wrapping. | The mix creator now spans the whole page width. The three dance buttons form a responsive grid with readable labels and touch-size controls. |
| Existing mixes might be lost during reconfiguration. | Changing the desired count does not modify the existing mix; generating a new mix replaces it as before. The existing Play, reorder and remove actions are retained. |

Verification: workflow syntax, typecheck, unit tests covering mix counts and the button's CSS contrast, and Netlify branch deployment. This is not equivalent to physical Android-browser validation. Production `main` is untouched.

## Unified dropdown controls · 6 November 2026 — develop only

Audit scope: Library source/rating/sort filters; label and artist search pickers; label manager and uploads; YouTube dance selector; player speed, player size, and metadata controls; the Library More filters disclosure; player Display settings and Practice tools; upload connection settings; and video information disclosures.

| Problem | Change |
| --- | --- |
| Native selects displayed differing platform chevrons and sizes. | Standardized closed selects with one 18 px SVG chevron, 46 px minimum height, 16 px text, right arrow spacing, borders and corner radius. The native option popup remains controlled by the operating system for keyboard, screen-reader and touch support. |
| Dark mode and player selects used different arrow visibility. | Theme-aware arrow assets and a high-contrast player-speed variant maintain contrast on light and dark surfaces. |
| Label, artist and More filters disclosures used the text character `⌄`. | Removed the text arrows. All `details > summary` controls now use the same drawn CSS chevron with a consistent 45° closed state and 225° open state. |
| Secondary disclosures showed the separate character `⌃` when expanded. | Unify the player Display settings, Practice tools, video details and upload configuration controls with the same CSS arrow and transition. |
| Small metadata and owner-only fields could overlap select arrows. | Right padding reserves room for the chevron, including the more-specific player metadata form rules. Focus indicators, disabled states and reduced-motion preferences remain supported. |

Validation: BailaCue web lint, TypeScript, regression tests and build on `develop`; Netlify branch deployment. These are automated checks and do not constitute a physical Android visual review. No backend data, account permissions or production `main` changes.

## Popup player redesign · 7 November 2026 — develop only

Observed on an Android screenshot: the modal contained a relatively small video area, tall vertical chrome, and a speed selector that rendered a repeating chevron pattern instead of a legible rate. The visual problem affected the primary public viewing flow, particularly vertical Salsa and Bachata clips.

| Area | Improvement |
| --- | --- |
| Viewing space | The phone modal now uses almost the full viewport width and reduces its inner margins. The viewing stage defaults substantially taller, with a portrait-specific height when native video metadata identifies vertical content. Videos remain `object-fit: contain`, never crop the dancers. |
| Responsive controls | Tighter, consistent header, playback timeline, centered Play/skip transport, volume and action spacing. Mobile retains generous touch targets but hides the narrow-screen volume slider while keeping Mute/Unmute. |
| Speed selector | Styled a single player-only CSS chevron instead of a potentially tiled image. The rate value retains readable text, a dark background and accessible selection. |
| Resize video height | A visible grip directly below the video supports pointer drag on touch and mouse. It is also an accessible slider supporting arrow keys, Home/End and displayed height values. A range control inside Display settings is an alternative. |
| Resize player width | On desktop, drag the horizontally oriented grip inside Display settings or use Compact / Comfortable / Wide presets. Width dragging is hidden on narrow mobile screens where the player automatically fills the available width. |
| Persistence and recovery | Height and custom width remain browser-local settings, not Supabase metadata. **Auto height** restores responsive video height; **Reset size** restores both default width and auto height. |
| Provider playback | For Drive preview and adaptive streaming iframe playback, the provider continues to own its controls. The native BailaCue controls are hidden in preview mode; full-screen behavior is retained. |

Quality gates: GitHub Actions web syntax/lint, TypeScript, unit/regression tests and static build; successful Netlify branch deployment. Automated verification does not certify appearance or touch behavior on a physical Android device. Production `main` is unchanged.

## Player popup redesign · 7 November 2026 — develop only

The user-supplied Android screenshot showed a comparatively small portrait playback area, an oversized control stack, and an inconspicuous way to adjust video size.

| Finding | Change on `develop` |
| --- | --- |
| Portrait videos were visually small inside a landscape-shaped player stage. | After loaded metadata confirms portrait orientation, the player expands its responsive video height to approximately 77% of viewport height (bounded to 820px) while preserving `object-fit: contain` — the video is never cropped. Landscape videos retain a shorter default. |
| The surrounding dialog wasted mobile space. | Reduced modal edge padding, tightened top and bottom spacing, made the header sticky while scrolling, and compacted transport, timeline, and action styling. |
| The video could not be enlarged easily. | The clearly labelled grip below the video adjusts height with touch or mouse; arrow keys also work. Height is persisted locally and the display slider stays synchronized, including when portrait metadata arrives. |
| Desktop users could select only three discrete player widths. | Added a horizontally draggable, keyboard-accessible Resize width control inside Display settings. The selected custom width is saved to local browser state; mobile always stays viewport-wide. |
| It was hard to return to sensible sizing. | Added Reset size (960px desktop width plus automatic responsive video height), alongside an explicit Auto height control. |
| Some UI controls needed harmonization. | Retained the clean player-speed chevron and centered transport, keeping focus visibility and 44px touch targets. |
| Fullscreen and source fallbacks could behave differently. | Player sizing only applies to the non-fullscreen dialog; original Google Drive, YouTube, and adaptive stream sources retain their existing fallbacks and controls. |

Validation: GitHub Actions lint, typecheck, tests and build; Netlify branch-deployment verification. No real Android device interaction or real-provider playback was verified in this environment. Production `main` remains untouched.

## Browser-wide player and unified controls · 7 November 2026 — develop only

Follow-up from the Android screenshot and feedback: the player opened as a relatively small popup; the settings disclosure sat above the video; fallback and text actions were too prominent; volume adjustment was hard to use; and speed/transport controls could overlap.

| Reported issue | Correction |
| --- | --- |
| Tapping a Library or mix video should fill the browser screen. | `openPlayer()` now enables `browser-wide` by default for both entry points. The dialog covers the browser viewport (`100vw × 100dvh`) but does **not** request device-native fullscreen, so the browser's toolbar rules still apply and **Close** remains available. The expand control toggles compact vs browser-wide. |
| Settings belong below playback, replacing Drive preview. | **Player settings** is now an action below the video. The Drive fallback button is inside that settings panel and only shown when relevant. The original-source link remains available. |
| Inconsistent text action buttons. | Buttons in the lower settings panel now share a minimum 44px target, border radius, weight, padding, contrast and hover/focus treatments. Advanced metadata and owner-only editing stay reachable in expandable settings rather than filling the viewer. |
| Hard-to-adjust volume. | Added visible volume slider, mute action, 10% decrease/increase buttons and a percentage readout. Mobile retains the slider and step buttons. YouTube uses its player volume API; adaptive/Drive iframe previews continue to use embedded provider controls. |
| Speed selector overlapped the play button. | Centered back/play/forward in a dedicated transport row. Speed, volume and mirror/expand are in a separate responsive utility grid with two distinct rows on narrow phones. |
| Video sizing was lost in expanded mode. | Responsive default video stage fills remaining browser height; user-set video heights switch to scrollable custom sizing, with a 44px touch/keyboard resize grip. Close stays accessible in scrollable settings. |

Checks: web lint/typecheck/tests/build and Netlify `develop` branch deploy. A physical Android interaction test is outstanding; the connected live-browser test provider cannot run with the current account balance. No Supabase policies, paid streaming providers, or production `main` were changed.

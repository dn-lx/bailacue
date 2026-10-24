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

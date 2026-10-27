# BailaCue 0.2 design review

## Reference and baseline

Used dn-lx/agent-project-starter's premium-redesign and frontend-verification skills,
its DESIGN-STACK.md, and linked Taste guidance. These were read from its default
prod branch and Taste's main branch. No remote installer or framework migration.

The 0.1 baseline had prominent logo art, an undifferentiated card grid, sparse
metadata and provider-only playback controls. The latest owner request establishes
text branding, richer video details, direct playback tools, uploads and labels.

## Direction

Ink navigation, steel-blue actions, neutral surfaces and restrained dance accents.
Text-only BailaCue anchors the sidebar. Asymmetric Today picks give videos emphasis;
Library keeps comparable metadata cards. Add videos puts preparation alongside
connection and numbering guidance. Labels have a dedicated management workspace.

Headlines, task titles and metadata have distinct scale and weight. Spacing, radii,
borders and focus treatment are consistent. Player sizing/fullscreen precede the
frame; editable details follow it. Actual Drive dates and optional recording dates
have distinct labels. Artists remain unknown until entered by the user.

Motion uses short opacity/transform entrances, staggered cards, dropdown reveal,
press/hover feedback, modal transitions and actual upload progress. Reduced-motion
preferences remove entrance/stagger/shimmer motion. Native dialogs, labelled controls,
keyboard dropdown navigation, focus styles and a skip link support accessibility.
No scroll hijacking or decorative overlay competes with video.

## Rendered review

Compared the existing branch with new desktop Today, Library, Labels, Add videos
and player in the actual cloud browser. At 390px and 320px embedded viewports,
scrollWidth equalled clientWidth (375/305px after scrollbars). Navigation and fields
fit. This is browser layout validation, not a physical phone or all-browser test.

Real Drive preview and official YouTube controls rendered. Local MP4 preview played
with seek, 0.5× speed, mirror and A–B loop. Verified full-window expansion, theater,
Compact sizing, label assignment and artist filtering after reload. Native fullscreen
was unreliable in the cloud environment, so an explicit full-window fallback and
Exit button were added. Upload drafts survive preview and connection rerenders.

## Boundaries

Actual Drive upload and authorized streaming still require the missing Google web
client ID and live consent testing. Guest Drive uses Google's embedded controls.
Personal metadata is browser-local with backup. Numbering is checked, not globally
atomic across devices. No video editing or complete accessibility audit is claimed.
Native mobile screens remain unchanged.

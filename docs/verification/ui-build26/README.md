# Centered chip groups · build26

Source `9bc627d1c6aff5918938d506e1cbdf8a03ab2914`.

The actual exported web UI was opened in Chromium at320px and412px widths.
Library, Settings and Practice produced34 chip groups across six page/width checks.
Each group was measured row by row using the rendered button bounds; the maximum
horizontal offset from its parent center was0px. The shorter last wrapped rows
are included. Light screenshots and a separate dark Settings screenshot are retained.

These measurements verify group placement, rather than changing text alignment
inside individual chips. They complement the native acceptance gate; they do not
claim native font-scale, TalkBack/VoiceOver or physical-device validation.
Screenshots capture each React Native ScrollView viewport, not all below-fold content.

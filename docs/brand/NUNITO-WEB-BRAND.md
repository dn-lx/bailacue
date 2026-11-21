# BailaCue — Nunito brand identity (development)

The simplified brand identity uses a deep navy B with a magenta play cue and the **Nunito** wordmark. It replaces the old multicolour dance favicon on the **web develop branch** only.

## Primary palette
- Deep navy: `#201747`
- Magenta: `#D80D87`
- White: `#FFFFFF`

## Web SVG deliverables
- `web/assets/bailacue-logo-light.svg`: horizontal logo for light surfaces
- `web/assets/bailacue-logo-dark.svg`: horizontal logo for dark surfaces
- `web/assets/bailacue-logo-stacked.svg`: stacked identity
- `web/assets/bailacue-symbol.svg`: compact mark
- `web/assets/bailacue-icon.svg`: rounded app/PWA icon
- `web/assets/bailacue-icon-monochrome.svg`: monochrome icon
- `web/assets/dance-favicon.svg`: live favicon
- `web/assets/icon.svg`: PWA icon
- `web/assets/logo.svg`: generic web logo

## Typography
Use **Nunito**, weights 400–900. The SVG wordmarks declare Nunito as a font-family; when displayed as external SVG files they can fall back to Arial if Nunito is unavailable. For print-ready, font-independent vector exports, outline the wordmark in a vector editor.

## Scope
The existing raster iOS/Android launcher icons in `assets/` and older raster brand exports in `assets/brand/` are **not replaced** by this web update. Those require regenerated PNG assets and a separate mobile build. Production `main` remains unchanged.

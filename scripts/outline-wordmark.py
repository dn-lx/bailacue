"""Outline the bundled OFL Outfit wordmark. Requires fonttools; no font embedding."""
from pathlib import Path
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.boundsPen import BoundsPen
font=TTFont('node_modules/@expo-google-fonts/outfit/600SemiBold/Outfit_600SemiBold.ttf')
glyphs=font.getGlyphSet(); cmap=font.getBestCmap(); offset=0; paths=[]; bounds=[]
for index,char in enumerate('BailaCue'):
    name=cmap[ord(char)]; glyph=glyphs[name]; pen=SVGPathPen(glyphs); transform=(1,0,0,-1,offset,0)
    glyph.draw(TransformPen(pen,transform)); b=BoundsPen(glyphs);glyph.draw(TransformPen(b,transform));bounds.append(b.bounds)
    paths.append(f'<path fill="{"#080D18" if index<5 else "#1465FF"}" d="{pen.getCommands()}"/>');offset+=glyph.width
low=min(b[1] for b in bounds);high=max(b[3] for b in bounds)
Path('assets/brand/wordmark-master.svg').write_text(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 {low} {offset} {high-low}"><title>BailaCue — Outfit SemiBold outlined</title>'+''.join(paths)+'</svg>\n')

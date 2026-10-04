"""
ChiSetup brand geometry generator (DESIGN-V3 §6).

Hand-built letterforms: every glyph is a polygon drawn upright on a 141-unit cap height, then
slanted forward (x += SLANT * height-above-baseline). Corners are 45-degree chamfers. The tagline
"GAMING GEAR & SETUP" is Exo 2 Light (slanted 6 degrees) converted to outlines (OFL font, file next to this
script), so no font is needed at runtime.

The coordinate space is the one of docs/brand/v3/reference/logo-target.png (1155x416), so the
geometry can be overlaid on the reference 1:1 while tuning.

Outputs (run from the repo root: `python docs/brand/v3/tools/gen_brand.py`):
  shared/src/brand/logo.ts        path data for the React <Logo>/<LogoMark> in frontend/ and site/
  docs/brand/v3/logo-full.svg     wordmark + HUD brackets + tagline
  docs/brand/v3/logo-compact.svg  wordmark only
  docs/brand/v3/mark.svg          CS app icon (rounded tile)
  frontend/app/icon.svg, site/app/icon.svg  = mark.svg
Raster files (bot avatar, cover, apple-icon) are made by render_brand.mjs from these.

Needs: Python 3 + fontTools (+ brotli for woff2).
"""
from __future__ import annotations

import os
import re

from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", ".."))
HERE = os.path.dirname(os.path.abspath(__file__))

SLANT = 0.3          # forward lean, ~16.7 degrees
TOP = 118.0          # cap line (image y)
BASE = 141.0         # cap height in local units; baseline = TOP + BASE


def fmt(v: float) -> str:
    s = f"{v:.1f}"
    s = s.rstrip("0").rstrip(".") if "." in s else s
    return "0" if s in ("-0", "") else s


def skew(pts, slant=SLANT, base=BASE, ox=0.0, oy=TOP):
    """Upright local (x, y-from-cap-line) -> image coords, leaning forward."""
    return [(x + slant * (base - y) + ox, y + oy) for x, y in pts]


def poly(pts) -> str:
    return "M" + "L".join(f"{fmt(x)} {fmt(y)}" for x, y in pts) + "Z"


# ---------------------------------------------------------------------------------------------
# Wordmark "ChiSetup" — upright local coordinates. y: 0 = cap line, 39 = x-height, 141 = baseline,
# 186 = descender. x: same as the reference image once slanted.
# ---------------------------------------------------------------------------------------------
XH = 39      # x-height line
BAR = 34     # horizontal bar thickness

C = [(84, 0), (226, 0), (215, 36), (106, 36), (96, 46), (96, 97), (107, 108), (222, 108),
     (222, 141), (89, 141), (48, 100), (48, 36)]
H = [(237, 0), (275, 0), (275, XH), (343, XH), (363, XH + 20), (363, 141), (324, 141),
     (324, XH + 31), (275, XH + 31), (275, 141), (237, 141)]
# the "i" is one stem split by a 45-degree cut: orange top (the dot), white bottom
I_TOP = [(375, 0), (416, 0), (416, 13), (375, 50)]
I_BOTTOM = [(377, 65), (416, 32), (416, 141), (377, 141)]
S = [(451, 0), (582, 0), (569, 37), (470, 37), (470, 58), (561, 58), (581, 78), (581, 121),
     (561, 141), (431, 141), (431, 108), (540, 108), (540, 88), (455, 88), (428, 61), (428, 23)]
E_OUT = [(601, XH), (704, XH), (718, XH + 14), (718, 107), (636, 107), (636, 118), (718, 118),
         (718, 141), (618, 141), (594, 117), (594, XH + 8)]
E_EYE = [(632, 68), (681, 68), (681, 79), (632, 79)]
T = [(729, 0), (768, 0), (768, XH), (807, XH), (807, 69), (768, 69), (768, 108), (808, 108),
     (808, 141), (752, 141), (729, 118)]
U = [(820, XH), (859, XH), (859, 108), (905, 108), (905, XH), (944, XH), (944, 127), (930, 141),
     (845, 141), (820, 116)]
P_OUT = [(960, XH), (1062, XH), (1088, XH + 26), (1088, 124), (1071, 141), (1001, 141),
         (1001, 186), (960, 186)]
P_EYE = [(1001, 72), (1047, 72), (1047, 107), (1001, 107)]

WHITE_PATH = "".join(poly(skew(p)) for p in (C, H, I_BOTTOM))
ORANGE_PATH = "".join(poly(skew(p)) for p in (I_TOP, S, E_OUT, E_EYE, T, U, P_OUT, P_EYE))


def bbox(paths_pts):
    xs = [x for pts in paths_pts for x, _ in pts]
    ys = [y for pts in paths_pts for _, y in pts]
    return min(xs), min(ys), max(xs), max(ys)


WORD_BOX = bbox([skew(p) for p in (C, H, I_TOP, I_BOTTOM, S, E_OUT, T, U, P_OUT)])

# ---------------------------------------------------------------------------------------------
# HUD brackets (full variant), measured off the reference: box 43..1114 x 37..372, stroke 9,
# 45-degree chamfer 60, arms 90 (horizontal) and 40 (vertical) past the chamfer.
# Drawn as filled outlines (not strokes) so they scale exactly with the wordmark.
# ---------------------------------------------------------------------------------------------
BL, BT, BR_, BB = 43.0, 37.0, 1114.0, 372.0
SW, CH, ARM_H, ARM_V = 9.0, 60.0, 90.0, 40.0


def bracket_tl():
    # outer contour then inner contour of an L with a chamfered corner (filled polygon)
    o = [(BL + CH + ARM_H, BT), (BL + CH, BT), (BL, BT + CH), (BL, BT + CH + ARM_V)]
    k = SW * (2 ** 0.5 - 1)  # inner offset along the 45-degree edge
    i = [(BL + SW, BT + CH + ARM_V), (BL + SW, BT + CH + k), (BL + CH + k, BT + SW),
         (BL + CH + ARM_H, BT + SW)]
    return o + i


def mirror(pts, mx=False, my=False):
    cx, cy = (BL + BR_) / 2, (BT + BB) / 2
    return [((2 * cx - x) if mx else x, (2 * cy - y) if my else y) for x, y in pts]


TL = bracket_tl()
TR = mirror(TL, mx=True)
BLB = mirror(TL, my=True)
BRB = mirror(TL, mx=True, my=True)
BRACKETS_WHITE = poly(TL) + poly(BRB)
BRACKETS_ORANGE = poly(TR) + poly(BLB)
FULL_BOX = (BL, BT, BR_, BB)

# ---------------------------------------------------------------------------------------------
# Tagline: Exo 2 @ wght 300 outlines, slanted by TAG_SLANT, cap height 23, ink spans x 189..910, baseline 320.
# ---------------------------------------------------------------------------------------------
TAG_TEXT = "GAMING GEAR & SETUP"
TAG_LEFT, TAG_RIGHT, TAG_BASE, TAG_CAP = 189.0, 910.0, 320.0, 23.0
TAG_SLANT = 0.1   # a light forward lean, like the reference
TAG_WEIGHT = 300


def tagline_path():
    font = TTFont(os.path.join(HERE, "Exo2-latin.woff2"))
    font = instantiateVariableFont(font, {"wght": TAG_WEIGHT})
    cmap = font.getBestCmap()
    gs = font.getGlyphSet()
    hmtx = font["hmtx"]
    cap = font["OS/2"].sCapHeight
    k = TAG_CAP / cap

    def ink(gname):
        from fontTools.pens.boundsPen import BoundsPen
        bp = BoundsPen(gs)
        gs[gname].draw(bp)
        return bp.bounds

    names = [cmap[ord(c)] for c in TAG_TEXT]
    adv = [hmtx[n][0] * k for n in names]
    # solve tracking so that first ink-left .. last ink-right == TAG_LEFT..TAG_RIGHT
    first = ink(names[0])
    last = ink(names[-1])
    natural = sum(adv[:-1]) + last[2] * k - first[0] * k
    n_gaps = len(names) - 1
    track = (TAG_RIGHT - TAG_LEFT - natural) / n_gaps
    x = TAG_LEFT - first[0] * k
    out = []
    for n, a in zip(names, adv):
        if n != "space":
            pen = SVGPathPen(gs, ntos=lambda v: fmt(v))
            tp = TransformPen(pen, (k, 0, TAG_SLANT * k, -k, x, TAG_BASE))
            gs[n].draw(tp)
            out.append(pen.getCommands())
        x += a + track
    return "".join(out)


TAGLINE_PATH = tagline_path()

# ---------------------------------------------------------------------------------------------
# CS monogram for the app icon — same construction: chamfered C, S split by a 45-degree slit
# (like the "i"), slanted by SLANT. Units: 512 tile. Measured off reference/icon-target.png.
# ---------------------------------------------------------------------------------------------
TILE = 512.0
# upright coordinates in "reference pixels" (icon-target.png, tile ~114px), converted below
MC = [(41, 46), (73.2, 46), (71.2, 53), (42, 53), (42, 74), (60.2, 74), (60.2, 81), (42, 81),
      (31.5, 70.5), (31.5, 55.5)]
MS_A = [(71, 55.5), (95.6, 55.5), (93.3, 62.5), (72.6, 62.5), (72.6, 64.6), (83.8, 75.8),
        (70.4, 75.8), (60.6, 66.4), (60.6, 65.4)]
MS_B = [(79.6, 64.6), (92, 64.6), (102, 74.6), (102, 83.5), (95.5, 90), (63.2, 90), (63.2, 83),
        (90.6, 83), (90.6, 75.6)]
MON_SLANT = 0.34
MON_K = 4.6          # reference px -> 512 units


def mono_paths():
    groups = [MC, MS_A, MS_B]
    ys = [y for g in groups for _, y in g]
    ymid = (min(ys) + max(ys)) / 2
    sk = [[(x + MON_SLANT * (ymid - y), y) for x, y in g] for g in groups]
    xs = [x for g in sk for x, _ in g]
    cx = (min(xs) + max(xs)) / 2
    cy = ymid
    tr = [[((x - cx) * MON_K + TILE / 2, (y - cy) * MON_K + TILE / 2) for x, y in g] for g in sk]
    return poly(tr[0]), poly(tr[1]) + poly(tr[2])


MONO_WHITE, MONO_ORANGE = mono_paths()

# icon brackets: inset 70, chamfer 44, arms 74 / 40, stroke 12
IB_IN, IB_CH, IB_AH, IB_AV, IB_SW = 70.0, 44.0, 76.0, 40.0, 10.0


def icon_bracket_tl():
    L = T_ = IB_IN
    o = [(L + IB_CH + IB_AH, T_), (L + IB_CH, T_), (L, T_ + IB_CH), (L, T_ + IB_CH + IB_AV)]
    k = IB_SW * (2 ** 0.5 - 1)
    i = [(L + IB_SW, T_ + IB_CH + IB_AV), (L + IB_SW, T_ + IB_CH + k), (L + IB_CH + k, T_ + IB_SW),
         (L + IB_CH + IB_AH, T_ + IB_SW)]
    return o + i


def imirror(pts, mx=False, my=False):
    return [((TILE - x) if mx else x, (TILE - y) if my else y) for x, y in pts]


ITL = icon_bracket_tl()
ICON_BR_WHITE = poly(ITL) + poly(imirror(ITL, True, True))
ICON_BR_ORANGE = poly(imirror(ITL, mx=True)) + poly(imirror(ITL, my=True))
ICON_RADIUS = 104

# ---------------------------------------------------------------------------------------------
# Colours
# ---------------------------------------------------------------------------------------------
WHITE_STOPS = [(0, "#FFFFFF"), (1, "#D9D9DE")]
ORANGE_STOPS = [(0, "#FF8533"), (0.5, "#FF6600"), (1, "#F25500")]
TAG_COLOR = "#E4E4E7"
# gradients run down the cap height (userSpaceOnUse, logo space)
GRAD_Y1, GRAD_Y2 = TOP, TOP + BASE
ORANGE_Y2 = TOP + 186  # through the descender of "p"

PAD = 2.0
cx0, cy0, cx1, cy1 = WORD_BOX
COMPACT_VB = (cx0 - PAD, cy0 - PAD, cx1 - cx0 + 2 * PAD, cy1 - cy0 + 2 * PAD)
FULL_VB = (BL, BT, BR_ - BL, BB - BT)


def vb(v):
    return " ".join(fmt(n) for n in v)


def stops(st):
    return "".join(f'<stop offset="{o}" stop-color="{c}"/>' for o, c in st)


def defs(prefix=""):
    return (
        f'<linearGradient id="{prefix}w" gradientUnits="userSpaceOnUse" x1="0" y1="{fmt(GRAD_Y1)}" x2="0" y2="{fmt(GRAD_Y2)}">{stops(WHITE_STOPS)}</linearGradient>'
        f'<linearGradient id="{prefix}o" gradientUnits="userSpaceOnUse" x1="0" y1="{fmt(GRAD_Y1)}" x2="0" y2="{fmt(ORANGE_Y2)}">{stops(ORANGE_STOPS)}</linearGradient>'
    )


def svg_logo(full: bool) -> str:
    v = FULL_VB if full else COMPACT_VB
    title = "ChiSetup — Gaming Gear &amp; Setup" if full else "ChiSetup"
    w = round(v[2])
    h = round(v[3])
    body = [
        f'<path fill="url(#w)" d="{WHITE_PATH}"/>',
        f'<path fill="url(#o)" fill-rule="evenodd" d="{ORANGE_PATH}"/>',
    ]
    if full:
        body += [
            f'<path fill="{TAG_COLOR}" d="{TAGLINE_PATH}"/>',
            f'<path fill="#FFFFFF" d="{BRACKETS_WHITE}"/>',
            f'<path fill="#FF6600" d="{BRACKETS_ORANGE}"/>',
        ]
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb(v)}" width="{w}" height="{h}">'
        f"<title>{title}</title><defs>{defs()}</defs>" + "".join(body) + "</svg>\n"
    )


def svg_mark(full_bleed: bool = False) -> str:
    r = 0 if full_bleed else ICON_RADIUS
    rim = "" if full_bleed else (
        f'<rect x="2" y="2" width="508" height="508" rx="{r - 2}" fill="none" stroke="url(#rim)" stroke-width="4"/>'
    )
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">'
        "<title>ChiSetup</title><defs>"
        '<linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#151515"/><stop offset="1" stop-color="#0E0E10"/></linearGradient>'
        '<linearGradient id="rim" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFFFFF" stop-opacity=".22"/><stop offset=".55" stop-color="#FFFFFF" stop-opacity=".07"/><stop offset="1" stop-color="#FF6600" stop-opacity=".22"/></linearGradient>'
        '<linearGradient id="mw" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFFFFF"/><stop offset="1" stop-color="#D9D9DE"/></linearGradient>'
        '<linearGradient id="mo" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FF8533"/><stop offset=".5" stop-color="#FF6600"/><stop offset="1" stop-color="#F25500"/></linearGradient>'
        "</defs>"
        f'<rect width="512" height="512" rx="{r}" fill="url(#bg)"/>{rim}'
        f'<path fill="#FFFFFF" d="{ICON_BR_WHITE}"/>'
        f'<path fill="#FF6600" d="{ICON_BR_ORANGE}"/>'
        f'<path fill="url(#mw)" d="{MONO_WHITE}"/>'
        f'<path fill="url(#mo)" d="{MONO_ORANGE}"/>'
        "</svg>\n"
    )


def ts_module() -> str:
    def s(v):
        return '"' + v + '"'

    def stops_ts(st):
        return "[" + ", ".join(f'[{o}, "{c}"]' for o, c in st) + "]"

    return f"""/**
 * ChiSetup brand geometry (DESIGN-V3 §6) — GENERATED by docs/brand/v3/tools/gen_brand.py,
 * do not edit by hand. Hand-built chamfered letterforms, slanted; the tagline is Exo 2 Light
 * Italic converted to outlines, so nothing depends on a font being loaded.
 *
 * All wordmark paths share one coordinate space; `compact` and `full` only differ in viewBox
 * (full = HUD brackets + tagline around the same wordmark). Gradients are userSpaceOnUse in
 * that space. The mark (CS app icon) lives in its own 512x512 space.
 */

export type BrandStops = ReadonlyArray<readonly [number, string]>;

export const BRAND_WHITE_STOPS: BrandStops = {stops_ts(WHITE_STOPS)};
export const BRAND_ORANGE_STOPS: BrandStops = {stops_ts(ORANGE_STOPS)};

export const LOGO_GEOMETRY = {{
  /** viewBox of the bare wordmark (headers, navbar). */
  compactViewBox: {s(vb(COMPACT_VB))},
  compactAspect: {COMPACT_VB[2] / COMPACT_VB[3]:.4f},
  /** viewBox of the wordmark inside HUD brackets with the tagline (hero, login). */
  fullViewBox: {s(vb(FULL_VB))},
  fullAspect: {FULL_VB[2] / FULL_VB[3]:.4f},
  /** "Ch" + the lower half of the split "i". */
  white: {s(WHITE_PATH)},
  /** the "i" dot half + "Setup" (fill-rule evenodd: e and p have counters). */
  orange: {s(ORANGE_PATH)},
  tagline: {s(TAGLINE_PATH)},
  taglineColor: "{TAG_COLOR}",
  bracketsWhite: {s(BRACKETS_WHITE)},
  bracketsOrange: {s(BRACKETS_ORANGE)},
  /** userSpaceOnUse gradient lines (vertical). */
  whiteGradient: {{ y1: {fmt(GRAD_Y1)}, y2: {fmt(GRAD_Y2)} }},
  orangeGradient: {{ y1: {fmt(GRAD_Y1)}, y2: {fmt(ORANGE_Y2)} }},
}} as const;

export const MARK_GEOMETRY = {{
  viewBox: "0 0 512 512",
  radius: {ICON_RADIUS},
  white: {s(MONO_WHITE)},
  orange: {s(MONO_ORANGE)},
  bracketsWhite: {s(ICON_BR_WHITE)},
  bracketsOrange: {s(ICON_BR_ORANGE)},
}} as const;
"""


def write(rel, content):
    p = os.path.join(ROOT, rel)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    with open(p, "w", encoding="utf-8", newline="\n") as f:
        f.write(content)
    print("wrote", rel, len(content))


if __name__ == "__main__":
    write("shared/src/brand/logo.ts", ts_module())
    write("docs/brand/v3/logo-full.svg", svg_logo(True))
    write("docs/brand/v3/logo-compact.svg", svg_logo(False))
    mark = svg_mark()
    write("docs/brand/v3/mark.svg", mark)
    write("docs/brand/v3/tools/mark-full-bleed.svg", svg_mark(full_bleed=True))
    write("frontend/app/icon.svg", mark)
    write("site/app/icon.svg", mark)

"""Builds the MAXSOLCH brand SVGs for Telegram (bot avatar, Mini App cover).

Text is OUTLINED to SVG paths from Inter Black (wght 900) — the font the site and the Mini App
use — so the files render identically everywhere, without the font installed.

    python docs/brand/build_brand.py [path/to/Inter-latin.woff2 path/to/Inter-cyrillic.woff2]
    node docs/brand/render_png.mjs            # SVG -> PNG (sharp)

Defaults point at the woff2 files `next/font` drops into frontend/.next/static/media after a
build (variable Inter, latin + cyrillic subsets). Needs `pip install fonttools brotli`.
"""
import glob
import os
import sys

from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))

# Palette — identical to frontend/app/globals.css and site/app/globals.css (light theme).
BG = "#F4F1E6"      # cream page
INK = "#141414"     # ink: text, borders, plate
ACCENT = "#FF5A2C"  # orange
YELLOW = "#FFD23F"
BLUE = "#2F6BFF"
GREEN = "#16B36B"
PINK = "#FF73B5"
TRACK = -0.025      # Tailwind tracking-tight, as in the site wordmark


def load_fonts(paths):
    fonts = []
    for p in paths:
        f = TTFont(p)
        if "fvar" in f:
            f = instantiateVariableFont(f, {"wght": 900, "opsz": 32} if any(
                a.axisTag == "opsz" for a in f["fvar"].axes) else {"wght": 900})
        fonts.append(f)
    return fonts


def find_fonts():
    if len(sys.argv) > 2:
        return sys.argv[1:3]
    media = glob.glob(os.path.join(ROOT, "frontend", ".next", "static", "media", "*.woff2"))
    latin = cyr = None
    for p in media:
        cmap = TTFont(p).getBestCmap() or {}
        if ord("M") in cmap and latin is None:
            latin = p
        if ord("Ж") in cmap and cyr is None:
            cyr = p
    if not (latin and cyr):
        sys.exit("Inter woff2 not found: run `npm run build -w frontend` first or pass paths")
    return [latin, cyr]


FONTS = load_fonts(find_fonts())


def _font_for(ch):
    for f in FONTS:
        if ord(ch) in (f.getBestCmap() or {}):
            return f
    raise KeyError(ch)


def text_path(text, size, x, baseline, track=TRACK):
    """Returns (svg path d, advance width, (xmin, ymin, xmax, ymax) ink bounds in SVG coords)."""
    d_parts = []
    pen_x = x
    xmin = ymin = float("inf")
    xmax = ymax = float("-inf")
    for i, ch in enumerate(text):
        f = _font_for(ch)
        upm = f["head"].unitsPerEm
        s = size / upm
        gname = f.getBestCmap()[ord(ch)]
        gs = f.getGlyphSet()
        sp = SVGPathPen(gs)
        # font units (y up) -> svg (y down)
        tp = TransformPen(sp, (s, 0, 0, -s, pen_x, baseline))
        gs[gname].draw(tp)
        d_parts.append(sp.getCommands())
        bp = BoundsPen(gs)
        gs[gname].draw(bp)
        if bp.bounds:
            bx0, by0, bx1, by1 = bp.bounds
            xmin = min(xmin, pen_x + bx0 * s)
            xmax = max(xmax, pen_x + bx1 * s)
            ymin = min(ymin, baseline - by1 * s)
            ymax = max(ymax, baseline - by0 * s)
        adv = f["hmtx"][gname][0] * s
        pen_x += adv + (track * size if i < len(text) - 1 else 0)
    return " ".join(d_parts), pen_x - x, (xmin, ymin, xmax, ymax)


def measure(text, size, track=TRACK):
    _, _, b = text_path(text, size, 0, 0, track)
    return b  # ink bounds relative to (0, baseline 0)


def fit_size(text, width, track=TRACK):
    b = measure(text, 100, track)
    return 100 * width / (b[2] - b[0])


def grid(w, h, step, opacity=0.07):
    lines = [f'<path d="' + " ".join(
        [f"M{x} 0V{h}" for x in range(0, w + 1, step)] +
        [f"M0 {y}H{w}" for y in range(0, h + 1, step)]) +
        f'" stroke="{INK}" stroke-opacity="{opacity}" stroke-width="1.5" fill="none"/>']
    return "".join(lines)


def plate(x, y, w, h, border, shadow, plate_fill=INK, line=INK, shadow_fill=ACCENT, r=8):
    """Neo block: hard offset shadow + filled plate with a thick border (border drawn inside)."""
    return (
        f'<rect x="{x + shadow}" y="{y + shadow}" width="{w}" height="{h}" rx="{r}" fill="{shadow_fill}"/>'
        f'<rect x="{x + border / 2}" y="{y + border / 2}" width="{w - border}" height="{h - border}" '
        f'rx="{r}" fill="{plate_fill}" stroke="{line}" stroke-width="{border}"/>'
    )


def svg(w, h, body, title):
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}">'
        f"<title>{title}</title>{body}</svg>\n"
    )


def placed(text, size, cx=None, left=None, top=None, fill=INK, track=TRACK):
    """Path whose INK box is centred on cx (or starts at `left`) with its cap top at `top`."""
    b = measure(text, size, track)
    x = (cx - (b[0] + b[2]) / 2) if cx is not None else (left - b[0])
    baseline = top - b[1]
    d, _, bb = text_path(text, size, x, baseline, track)
    return f'<path d="{d}" fill="{fill}"/>', bb


# ---------------------------------------------------------------------------
# Avatar A — stacked "MAX / SOLCH", justified to one width, on the ink plate.
# ---------------------------------------------------------------------------
def avatar_stacked(S=640):
    c = S / 2
    text_w = 344                     # justified width of both lines
    s_solch = fit_size("SOLCH", text_w)
    s_max = fit_size("MAX", text_w)
    bm, bs = measure("MAX", s_max), measure("SOLCH", s_solch)
    h_max, h_solch = bm[3] - bm[1], bs[3] - bs[1]
    gap = 24
    pad_x, pad_y, border, shadow = 44, 44, 14, 22
    block_h = h_max + gap + h_solch
    pw, ph = text_w + 2 * pad_x, block_h + 2 * pad_y
    # optical centre: shift up-left by half the shadow so plate+shadow sits centred in the circle
    px, py = c - pw / 2 - shadow / 2, c - ph / 2 - shadow / 2
    top = py + pad_y
    tcx = px + pw / 2
    p1, _ = placed("MAX", s_max, cx=tcx, top=top, fill=BG)
    p2, _ = placed("SOLCH", s_solch, cx=tcx, top=top + h_max + gap, fill=ACCENT)
    body = (
        f'<rect width="{S}" height="{S}" fill="{BG}"/>' + grid(S, S, 40, 0.08)
        + plate(px, py, pw, ph, border, shadow) + p1 + p2
    )
    return svg(S, S, body, "MAXSOLCH — bot avatar (stacked)")


# ---------------------------------------------------------------------------
# Avatar B — "MS" monogram: cream M + orange S on the ink plate.
# ---------------------------------------------------------------------------
def avatar_monogram(S=640):
    c = S / 2
    size = 236
    bm = measure("M", size)
    bs = measure("S", size)
    gap = 0.03 * size
    w = (bm[2] - bm[0]) + gap + (bs[2] - bs[0])
    h = max(bm[3] - bm[1], bs[3] - bs[1])
    pad, border, shadow = 50, 16, 24
    pw, ph = w + 2 * pad, h + 2 * pad
    px, py = c - pw / 2 - shadow / 2, c - ph / 2 - shadow / 2
    left = px + pad
    top = py + pad
    p1, b1 = placed("M", size, left=left, top=top + (h - (bm[3] - bm[1])), fill=BG)
    p2, _ = placed("S", size, left=b1[2] + gap, top=top + (h - (bs[3] - bs[1])) / 2, fill=ACCENT)
    body = (
        f'<rect width="{S}" height="{S}" fill="{BG}"/>' + grid(S, S, 40, 0.08)
        + plate(px, py, pw, ph, border, shadow) + p1 + p2
    )
    return svg(S, S, body, "MAXSOLCH — bot avatar (MS monogram)")


# ---------------------------------------------------------------------------
# Cover 640x360 — the site wordmark + a sticker tagline on the graph-paper page.
# ---------------------------------------------------------------------------
def cover(W=640, H=360):
    word_w = 420
    s = fit_size("MAXSOLCH", word_w)
    bmax = measure("MAX", s)
    bw = measure("MAXSOLCH", s)
    cap_h = bw[3] - bw[1]
    pad_x, pad_y, border, shadow = 26, 22, 10, 14
    pw, ph = word_w + 2 * pad_x, cap_h + 2 * pad_y
    px = (W - pw) / 2 - shadow / 2
    py = 92
    left = px + pad_x
    top = py + pad_y
    p_max, bm = placed("MAX", s, left=left, top=top, fill=BG)
    # SOLCH continues the same line: start where MAX's advance + tracking ends
    _, adv_max, _ = text_path("MAX", s, 0, 0)
    d_solch, _, _ = text_path("SOLCH", s, left - bmax[0] + adv_max + TRACK * s, top - bw[1])
    p_solch = f'<path d="{d_solch}" fill="{ACCENT}"/>'

    # tagline sticker (yellow, slightly rotated) under the plate
    tag = "ІГРОВА ПЕРИФЕРІЯ"
    ts = 24
    tb = measure(tag, ts, 0.02)
    tw, th = tb[2] - tb[0], tb[3] - tb[1]
    tpx, tpy = 16, 12
    sw, sh = tw + 2 * tpx, th + 2 * tpy
    sx, sy = W / 2 - sw / 2, py + ph + 34
    p_tag, _ = placed(tag, ts, left=sx + tpx, top=sy + tpy, fill=INK, track=0.02)
    sticker = (
        f'<g transform="rotate(-2 {W / 2} {sy + sh / 2})">'
        + plate(sx, sy, sw, sh, 6, 7, plate_fill=YELLOW, shadow_fill=INK, r=4) + p_tag + "</g>"
    )

    # decorative neo blocks in the corners (site palette)
    deco = (
        plate(36, 34, 54, 54, 6, 7, plate_fill=BLUE, shadow_fill=INK, r=4)
        + f'<g transform="rotate(12 572 74)">' + plate(546, 48, 52, 52, 6, 7, plate_fill=YELLOW, shadow_fill=INK, r=4) + "</g>"
        + f'<g transform="rotate(-10 72 296)">' + plate(48, 274, 46, 46, 6, 7, plate_fill=PINK, shadow_fill=INK, r=4) + "</g>"
        + plate(548, 272, 58, 58, 6, 7, plate_fill=GREEN, shadow_fill=INK, r=29)
    )
    body = (
        f'<rect width="{W}" height="{H}" fill="{BG}"/>' + grid(W, H, 30, 0.08) + deco
        + plate(px, py, pw, ph, border, shadow) + p_max + p_solch + sticker
    )
    return svg(W, H, body, "MAXSOLCH — Mini App cover")


def favicon(S=64):
    """Small MS monogram for the Mini App tab icon (frontend/app/icon.svg)."""
    size = 30
    bm, bs = measure("M", size), measure("S", size)
    w = (bm[2] - bm[0]) + (bs[2] - bs[0]) + 0.04 * size
    h = bm[3] - bm[1]
    left, top = (S - w) / 2 - 2, (S - h) / 2 - 2
    p1, b1 = placed("M", size, left=left, top=top, fill=BG)
    p2, _ = placed("S", size, left=b1[2] + 0.04 * size, top=top + (h - (bs[3] - bs[1])) / 2, fill=ACCENT)
    body = plate(2, 2, S - 8, S - 8, 4, 4, r=4) + p1 + p2
    return svg(S, S, body, "MAXSOLCH")


if __name__ == "__main__":
    out = {
        "bot-avatar.svg": avatar_stacked(),          # chosen: full name, reads at 48px
        "bot-avatar-alt.svg": avatar_monogram(),
        "miniapp-cover-640x360.svg": cover(),
        "icon-64.svg": favicon(),
    }
    for name, content in out.items():
        with open(os.path.join(HERE, name), "w", encoding="utf-8") as fh:
            fh.write(content)
        print("wrote", name)

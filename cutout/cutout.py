"""Product cut-out: the photo in, the product alone out (PNG with alpha, cropped to it).

BiRefNet_lite (MIT, dynamic-size ONNX export) gives the mask at 768 px — on the shop's 2-core ARM server that is
~11 s and ~1.3 GB peak, where the stock 1024 export needs 7+ GB. Lite at 1024 also cut the bottom off a white
keyboard in tests; 768 did not. The edge colour is then unmixed from the old background (flat-background
foreground estimate), so a product shot on white does not glow when it is put on #1a1a1a.

Refuses (422) when there is nothing to cut: no object found, or the object fills the whole frame.
"""
from __future__ import annotations

import io
from dataclasses import dataclass

import numpy as np
from PIL import Image, ImageOps

SIDE = 768
MAX_OUT = 2048
MEAN = np.array([0.485, 0.456, 0.406], np.float32)
STD = np.array([0.229, 0.224, 0.225], np.float32)
#: below this share of the frame the mask found nothing; above, there is no background to remove
MIN_COVER, MAX_COVER = 0.005, 0.97

Image.MAX_IMAGE_PIXELS = 40_000_000


class NothingToCut(Exception):
    """The photo has no separable product (empty mask or no background)."""


@dataclass(frozen=True)
class Cut:
    png: bytes
    width: int
    height: int
    cover: float


def load(data: bytes) -> Image.Image:
    img = Image.open(io.BytesIO(data))
    img = ImageOps.exif_transpose(img)
    if img.mode in ("RGBA", "LA", "PA") or (img.mode == "P" and "transparency" in img.info):
        return img.convert("RGBA")
    return img.convert("RGB")


def fit(img: Image.Image, limit: int = MAX_OUT) -> Image.Image:
    k = limit / max(img.size)
    if k >= 1:
        return img
    return img.resize((round(img.width * k), round(img.height * k)), Image.LANCZOS)


def mask(session, rgb: Image.Image) -> np.ndarray:
    x = np.asarray(rgb.resize((SIDE, SIDE), Image.BILINEAR), np.float32) / 255.0
    x = ((x - MEAN) / STD).astype(np.float32).transpose(2, 0, 1)[None]
    logits = session.run(None, {"input_image": x})[0][0, 0]
    small = Image.fromarray((255 / (1 + np.exp(-logits))).astype(np.uint8))
    return np.asarray(small.resize(rgb.size, Image.BILINEAR), np.float32) / 255.0


def background(rgb: np.ndarray, alpha: np.ndarray) -> np.ndarray:
    """The old background's colour: the median of what the mask calls background (or of the frame's edge)."""
    bg = rgb[alpha < 0.05]
    if len(bg) < 100:
        h, w, _ = rgb.shape
        bg = np.concatenate([rgb[0], rgb[-1], rgb[:, 0], rgb[:, -1]])
    if len(bg) > 200_000:
        bg = bg[:: len(bg) // 200_000]
    return np.median(bg, axis=0)


def unmix(rgb: np.ndarray, alpha: np.ndarray, bg: np.ndarray) -> np.ndarray:
    """Edge pixels are product colour mixed with the background: C = aF + (1-a)B, so F = (C - (1-a)B) / a."""
    a = alpha[..., None]
    soft = (alpha > 0.02) & (alpha < 0.98)
    fg = rgb.copy()
    est = (rgb - (1 - a) * bg) / np.maximum(a, 0.02)
    fg[soft] = np.clip(est[soft], 0, 1)
    return fg


def cut(session, data: bytes) -> Cut:
    img = fit(load(data))
    if img.mode == "RGBA" and np.asarray(img.getchannel("A")).min() < 250:
        # already a cut-out (transparent PNG): its own alpha is better than any mask
        rgba = np.asarray(img, np.float32) / 255.0
        rgb, alpha = rgba[..., :3], rgba[..., 3]
    else:
        rgb_img = img.convert("RGB")
        rgb = np.asarray(rgb_img, np.float32) / 255.0
        alpha = mask(session, rgb_img)
        # the 768 mask is upscaled ~2x: tighten its soft ramp back to about the original's edge width
        alpha = np.clip((alpha - 0.1) / 0.8, 0, 1)
        rgb = unmix(rgb, alpha, background(rgb, alpha))
    cover = float(np.mean(alpha > 0.5))
    if cover < MIN_COVER or cover > MAX_COVER:
        raise NothingToCut(f"cover {cover:.3f}")
    ys, xs = np.where(alpha > 0.02)
    y0, y1 = max(0, ys.min() - 2), min(alpha.shape[0], ys.max() + 3)
    x0, x1 = max(0, xs.min() - 2), min(alpha.shape[1], xs.max() + 3)
    out = np.dstack([rgb, alpha])[y0:y1, x0:x1]
    png = io.BytesIO()
    Image.fromarray((out * 255 + 0.5).astype(np.uint8), "RGBA").save(png, "PNG", compress_level=1)
    return Cut(png.getvalue(), x1 - x0, y1 - y0, cover)

#!/usr/bin/env python3
"""Generate SSIES brand assets from wordmark + NoBG icon sources."""
from __future__ import annotations

import sys
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    print("Install Pillow: pip install Pillow", file=sys.stderr)
    sys.exit(1)

ROOT = Path(__file__).resolve().parents[1]
WORDMARK_SOURCE = ROOT / "SSIES COLOUR.png"
ICON_SOURCE = ROOT / "NoBG icon.png"
WEB_IMG = ROOT / "static" / "img"
MOBILE_ASSETS = ROOT / "mobile" / "assets"


def ensure_dirs() -> None:
    WEB_IMG.mkdir(parents=True, exist_ok=True)
    MOBILE_ASSETS.mkdir(parents=True, exist_ok=True)


def trim_transparent(img: Image.Image) -> Image.Image:
    if img.mode != "RGBA":
        img = img.convert("RGBA")
    bbox = img.getbbox()
    if not bbox:
        return img
    return img.crop(bbox)


def save_wordmark(img: Image.Image) -> None:
    for dest in (
        WEB_IMG / "ssies-logo.png",
        MOBILE_ASSETS / "ssies-logo.png",
    ):
        img.save(dest, optimize=True)
        print(f"  wordmark -> {dest.relative_to(ROOT)}")


def save_mark(img: Image.Image) -> None:
    mark = trim_transparent(img)
    dest = MOBILE_ASSETS / "ssies-mark.png"
    mark.save(dest, optimize=True)
    print(f"  mark -> {dest.relative_to(ROOT)}")


def padded_square_rgba(img: Image.Image, size: int, padding_ratio: float = 0.14) -> Image.Image:
    """Fit image on transparent square canvas."""
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    src = trim_transparent(img)
    pad = int(size * padding_ratio)
    inner = size - pad * 2
    w, h = src.size
    scale = min(inner / w, inner / h)
    nw, nh = int(w * scale), int(h * scale)
    resized = src.resize((nw, nh), Image.Resampling.LANCZOS)
    x = (size - nw) // 2
    y = (size - nh) // 2
    canvas.paste(resized, (x, y), resized)
    return canvas


def padded_square_on_color(img: Image.Image, size: int, bg: tuple[int, int, int], padding_ratio: float = 0.14) -> Image.Image:
    rgba = padded_square_rgba(img, size, padding_ratio)
    canvas = Image.new("RGBA", (size, size), bg + (255,))
    canvas.paste(rgba, (0, 0), rgba)
    return canvas


def save_icons(mark: Image.Image) -> None:
    web_sizes = {
        WEB_IMG / "favicon-32.png": 32,
        WEB_IMG / "favicon-180.png": 180,
    }
    for path, size in web_sizes.items():
        square = padded_square_on_color(mark, size, (0, 0, 0))
        square.convert("RGB").save(path, optimize=True)
        print(f"  icon {size}px -> {path.relative_to(ROOT)}")

    mobile_sizes = {
        MOBILE_ASSETS / "icon.png": 1024,
        MOBILE_ASSETS / "adaptive-icon.png": 1024,
        MOBILE_ASSETS / "splash-icon.png": 512,
    }
    for path, size in mobile_sizes.items():
        square = padded_square_on_color(mark, size, (255, 255, 255))
        square.save(path, optimize=True)
        print(f"  icon {size}px -> {path.relative_to(ROOT)}")

    ico_path = WEB_IMG / "favicon.ico"
    ico_images = [padded_square_on_color(mark, s, (0, 0, 0)).convert("RGB") for s in (16, 32, 48)]
    ico_images[0].save(
        ico_path,
        format="ICO",
        sizes=[(16, 16), (32, 32), (48, 48)],
        append_images=ico_images[1:],
    )
    print(f"  favicon -> {ico_path.relative_to(ROOT)}")


def main() -> None:
    if not ICON_SOURCE.exists():
        print(f"Icon not found: {ICON_SOURCE}", file=sys.stderr)
        sys.exit(1)
    ensure_dirs()
    mark = Image.open(ICON_SOURCE).convert("RGBA")
    print(f"Mark: {ICON_SOURCE} ({mark.size[0]}x{mark.size[1]})")
    if WORDMARK_SOURCE.exists():
        wordmark = Image.open(WORDMARK_SOURCE).convert("RGBA")
        print(f"Wordmark: {WORDMARK_SOURCE} ({wordmark.size[0]}x{wordmark.size[1]})")
        save_wordmark(wordmark)
    else:
        print("  wordmark source missing — keeping existing ssies-logo.png")
    save_mark(mark)
    save_icons(mark)
    print("Done.")


if __name__ == "__main__":
    main()

"""Generate adaptive and legacy Android launcher resources from the owner's mark.

The original mark is embedded at android/icon-source/Looply-official.webp.
Keep its white background and entire lettering; never remove the dark pixels.
"""
from pathlib import Path
from PIL import Image

ANDROID_DIR = Path(__file__).resolve().parents[1]
SOURCE = ANDROID_DIR / "icon-source" / "Looply-official.webp"
RES = ANDROID_DIR / "app" / "src" / "main" / "res"


def resize_on_white(image: Image.Image, size: int) -> Image.Image:
    # Android adaptive masks vary by launcher. The owner's white square is
    # preserved verbatim (no crop or recoloring) but has an extra white margin
    # so the circular ring and the final 'y' stay clear of circular masks.
    canvas = Image.new("RGBA", (size, size), (255, 255, 255, 255))
    scaled_size = round(size * 0.86)
    offset = (size - scaled_size) // 2
    canvas.alpha_composite(
        image.resize((scaled_size, scaled_size), Image.Resampling.LANCZOS),
        (offset, offset),
    )
    return canvas


def main() -> None:
    image = Image.open(SOURCE).convert("RGBA")
    if image.width != image.height or image.width < 192:
        raise ValueError("Official icon must be square and at least 192 pixels.")
    adaptive = resize_on_white(image, 432)
    # Detect logo ink, not white background, to catch a source that accidentally
    # clips the brand before Android applies its own launcher mask.
    rgb = adaptive.convert("RGB")
    ink = [(x, y) for y in range(432) for x in range(432)
           if min(rgb.getpixel((x, y))) < 150]
    if not ink:
        raise ValueError("Official Looply logo ink is missing.")
    # Safe circular mask radius (in pixels) intentionally leaves room for
    # platform-specific launchers and ensures the wordmark stays complete.
    if max((x - 215.5) ** 2 + (y - 215.5) ** 2 for x, y in ink) > (432 * .34) ** 2:
        raise ValueError("Official Looply logo is outside the adaptive safe zone.")
    (RES / "drawable").mkdir(parents=True, exist_ok=True)
    adaptive.save(RES / "drawable" / "ic_launcher_foreground.png", optimize=True)

    # Android 13 themed icon uses only the ink silhouette, not the white page.
    monochrome = Image.new("RGBA", adaptive.size, (255, 255, 255, 0))
    src, dst = adaptive.load(), monochrome.load()
    for y in range(adaptive.height):
        for x in range(adaptive.width):
            r, g, b, _ = src[x, y]
            ink = 255 - min(r, g, b)
            alpha = max(0, min(255, round(ink * 255 / 125)))
            dst[x, y] = (255, 255, 255, alpha)
    monochrome.save(RES / "drawable" / "ic_launcher_monochrome.png", optimize=True)

    densities = (("mdpi", 48), ("hdpi", 72), ("xhdpi", 96), ("xxhdpi", 144), ("xxxhdpi", 192))
    for density, size in densities:
        directory = RES / f"mipmap-{density}"
        directory.mkdir(parents=True, exist_ok=True)
        icon = resize_on_white(image, size)
        icon.save(directory / "ic_launcher.png", optimize=True)
        icon.save(directory / "ic_launcher_round.png", optimize=True)


if __name__ == "__main__":
    main()

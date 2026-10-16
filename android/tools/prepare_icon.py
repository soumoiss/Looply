from pathlib import Path
from PIL import Image

ANDROID_DIR = Path(__file__).resolve().parents[1]
SOURCE = ANDROID_DIR / "icon-source" / "Looply-original.jpeg"
RES = ANDROID_DIR / "app" / "src" / "main" / "res"


def remove_black_backdrop(image: Image.Image) -> Image.Image:
    rgba = image.convert("RGBA")
    pixels = rgba.load()
    for y in range(rgba.height):
        for x in range(rgba.width):
            red, green, blue, _ = pixels[x, y]
            brightness = max(red, green, blue)
            alpha = 0 if brightness <= 12 else 255 if brightness >= 30 else round(
                (brightness - 12) * 255 / 18
            )
            pixels[x, y] = (red, green, blue, alpha)
    return rgba


def centered_art(image: Image.Image, size: int, scale: float) -> Image.Image:
    dimension = round(size * scale)
    artwork = image.resize((dimension, dimension), Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    canvas.alpha_composite(artwork, ((size - dimension) // 2, (size - dimension) // 2))
    return canvas


def main() -> None:
    image = remove_black_backdrop(Image.open(SOURCE))
    adaptive = centered_art(image, 432, 0.72)
    (RES / "drawable").mkdir(parents=True, exist_ok=True)
    adaptive.save(RES / "drawable" / "ic_launcher_foreground.png", optimize=True)

    monochrome = adaptive.copy()
    mono_pixels = monochrome.load()
    for y in range(monochrome.height):
        for x in range(monochrome.width):
            _, _, _, alpha = mono_pixels[x, y]
            mono_pixels[x, y] = (255, 255, 255, alpha)
    monochrome.save(RES / "drawable" / "ic_launcher_monochrome.png", optimize=True)

    densities = (("mdpi", 48), ("hdpi", 72), ("xhdpi", 96), ("xxhdpi", 144), ("xxxhdpi", 192))
    for density, size in densities:
        directory = RES / f"mipmap-{density}"
        directory.mkdir(parents=True, exist_ok=True)
        icon = centered_art(image, size, 0.94)
        icon.save(directory / "ic_launcher.png", optimize=True)
        icon.save(directory / "ic_launcher_round.png", optimize=True)


if __name__ == "__main__":
    main()


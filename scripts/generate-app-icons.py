"""Icônes de lancement BENSKIN IMPACT générées depuis la marque (assets/brand/logo_mark.svg).

Produit pour Android : icônes classiques et rondes, icône adaptative (fond, premier plan, monochrome
pour les icônes à thème d'Android 13), ainsi qu'une copie 1024 px et 512 px dans assets/brand.
Nécessite Pillow :  python scripts/generate-app-icons.py
"""

import math
import os

from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MOBILE = os.path.join(ROOT, "apps", "mobile")
RES = os.path.join(MOBILE, "android", "app", "src", "main", "res")
BRAND = os.path.join(MOBILE, "assets", "brand")
WEB_ICONS = os.path.join(MOBILE, "web", "icons")

UNIT = 24  # pixels par unité du viewBox 120 × 120 (sur-échantillonnage)
SKEW = math.tan(math.radians(-14))  # skewX(-14) : x' = x + SKEW · y

BLUE = (15, 111, 178, 255)
GREEN = (22, 163, 74, 255)
ORANGE = (245, 158, 11, 255)
WHITE = (255, 255, 255, 255)

DENSITIES = {"mdpi": 1, "hdpi": 1.5, "xhdpi": 2, "xxhdpi": 3, "xxxhdpi": 4}


def shape(x, y, w, h, radius, color, skew=False):
    layer = Image.new("RGBA", (120 * UNIT, 120 * UNIT), (0, 0, 0, 0))
    ImageDraw.Draw(layer).rounded_rectangle(
        [x * UNIT, y * UNIT, (x + w) * UNIT, (y + h) * UNIT], radius=radius * UNIT, fill=color
    )
    if skew:
        # Pillow applique la transformation inverse : le pixel (x', y) lit l'entrée en (x' - SKEW · y, y).
        layer = layer.transform(layer.size, Image.AFFINE, (1, -SKEW, 0, 0, 1, 0), resample=Image.BICUBIC)
    return layer


def brand_mark():
    """Reproduit le SVG de la marque, dans le même ordre de superposition."""
    mark = Image.new("RGBA", (120 * UNIT, 120 * UNIT), (0, 0, 0, 0))
    for layer in (
        shape(30, 8, 18, 104, 9, BLUE, skew=True),
        shape(66, 8, 18, 104, 9, GREEN, skew=True),
        shape(6, 36, 104, 17, 8.5, GREEN),
        shape(2, 68, 100, 17, 8.5, ORANGE),
        shape(40 + 9, 36, 20, 17, 0, BLUE, skew=True),  # skewX(-14) translate(9 0)
    ):
        mark.alpha_composite(layer)
    return mark.crop(mark.getbbox())


def compose(mark, size, content_ratio, background=None, corner_ratio=0.0, circle=False):
    master = 1024
    canvas = Image.new("RGBA", (master, master), (0, 0, 0, 0))
    if background:
        draw = ImageDraw.Draw(canvas)
        if circle:
            draw.ellipse([0, 0, master - 1, master - 1], fill=background)
        else:
            draw.rounded_rectangle([0, 0, master - 1, master - 1], radius=int(master * corner_ratio), fill=background)
    scale = master * content_ratio / max(mark.size)
    resized = mark.resize((round(mark.width * scale), round(mark.height * scale)), Image.LANCZOS)
    canvas.alpha_composite(resized, ((master - resized.width) // 2, (master - resized.height) // 2))
    return canvas if size == master else canvas.resize((size, size), Image.LANCZOS)


def silhouette(image):
    """Couche monochrome : seule la transparence compte, Android applique la couleur du thème."""
    white = Image.new("RGBA", image.size, WHITE)
    white.putalpha(image.getchannel("A"))
    return white


def save(image, *parts):
    path = os.path.join(*parts)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    image.save(path, optimize=True)
    return path


def main():
    mark = brand_mark()
    written = []

    for density, factor in DENSITIES.items():
        folder = os.path.join(RES, f"mipmap-{density}")
        legacy = round(48 * factor)
        adaptive = round(108 * factor)
        written.append(save(compose(mark, legacy, 0.64, WHITE, corner_ratio=0.22), folder, "ic_launcher.png"))
        written.append(save(compose(mark, legacy, 0.58, WHITE, circle=True), folder, "ic_launcher_round.png"))
        # Zone sûre de l'icône adaptative : cercle de 66 dp sur 108 dp, la marque doit y tenir entière.
        foreground = compose(mark, adaptive, 0.46)
        written.append(save(foreground, folder, "ic_launcher_foreground.png"))
        written.append(save(silhouette(foreground), folder, "ic_launcher_monochrome.png"))

    written.append(save(compose(mark, 1024, 0.64, WHITE, corner_ratio=0.22), BRAND, "app_icon.png"))
    written.append(save(compose(mark, 512, 0.64, WHITE, corner_ratio=0.22), BRAND, "app_icon_512.png"))

    if os.path.isdir(WEB_ICONS):
        written.append(save(compose(mark, 192, 0.64, WHITE, corner_ratio=0.22), WEB_ICONS, "Icon-192.png"))
        written.append(save(compose(mark, 512, 0.64, WHITE, corner_ratio=0.22), WEB_ICONS, "Icon-512.png"))
        written.append(save(compose(mark, 192, 0.46, WHITE), WEB_ICONS, "Icon-maskable-192.png"))
        written.append(save(compose(mark, 512, 0.46, WHITE), WEB_ICONS, "Icon-maskable-512.png"))
        written.append(save(compose(mark, 32, 0.8, WHITE, corner_ratio=0.2), MOBILE, "web", "favicon.png"))

    for path in written:
        print(os.path.relpath(path, ROOT))


if __name__ == "__main__":
    main()

"""Renders the PNG app icons from the same geometry as icons/mark.svg.
Usage: python3 scripts/make-icons.py  (requires Pillow)"""
import math, os
from PIL import Image, ImageDraw

OUT = os.path.join(os.path.dirname(__file__), '..', 'icons')
STOPS = [(0.0, (0xF4, 0xB1, 0x83)), (0.55, (0x8C, 0x7B, 0xD6)), (1.0, (0x3E, 0x41, 0x99))]

def lerp(stops, t):
    for (t0, c0), (t1, c1) in zip(stops, stops[1:]):
        if t <= t1:
            f = (t - t0) / (t1 - t0)
            return tuple(round(a + (b - a) * f) for a, b in zip(c0, c1))
    return stops[-1][1]

def render(size, radius_ratio, art_scale):
    S = size * 4  # supersample
    img = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    grad = Image.new('RGBA', (S, S))
    gd = ImageDraw.Draw(grad)
    for y in range(S):
        gd.line([(0, y), (S, y)], fill=lerp(STOPS, y / (S - 1)) + (255,))
    mask = Image.new('L', (S, S), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, S - 1, S - 1], radius=int(S * radius_ratio), fill=255)
    img.paste(grad, (0, 0), mask)
    d = ImageDraw.Draw(img)
    u = S / 64 * art_scale
    off = S / 2 - 32 * u
    P = lambda x, y: (off + x * u, off + y * u)
    # dotted sun path
    for i in range(9):
        a = math.pi + i * math.pi / 8
        x, y = 32 + 20 * math.cos(a), 41 + 20 * math.sin(a)
        r = 1.25 * u
        cx, cy = P(x, y)
        d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(255, 255, 255, 140))
    # sun half-disc
    x0, y0 = P(21, 30); x1, y1 = P(43, 52)
    d.pieslice([x0, y0, x1, y1], 180, 360, fill=(255, 255, 255, 255))
    # horizon
    w = 2.6 * u
    a, b = P(13, 41), P(51, 41)
    d.rounded_rectangle([a[0] - w / 2, a[1] - w / 2, b[0] + w / 2, b[1] + w / 2], radius=w / 2, fill=(255, 255, 255, 255))
    return img.resize((size, size), Image.LANCZOS)

render(192, 15 / 64, 1).save(os.path.join(OUT, 'icon-192.png'))
render(512, 15 / 64, 1).save(os.path.join(OUT, 'icon-512.png'))
render(512, 0, 0.78).save(os.path.join(OUT, 'maskable-512.png'))  # full bleed, art inside safe zone
apple = render(180, 0, 0.9)  # iOS rounds the corners itself
bg = Image.new('RGB', (180, 180)); bg.paste(apple, (0, 0), apple); bg.save(os.path.join(OUT, 'apple-touch-icon.png'))
print('icons written')

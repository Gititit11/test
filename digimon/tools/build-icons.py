"""디지타마 아이콘 만들기: python3 digimon/tools/build-icons.py"""
import os
from PIL import Image, ImageDraw

OUT = os.path.join(os.path.dirname(__file__), '..', 'icons')
BG, INK = (15, 17, 21), (27, 31, 23)
SHELL, SPOT, LCD = (255, 214, 170), (255, 140, 50), (215, 232, 196)

# 앱 화면의 알과 같은 도트 (X 테두리, A 껍질, B 무늬)
EGG = ['..XXXX..', '.XAAAAX.', 'XAABBAAX', 'XABBBBAX', 'XAABBAAX',
       'XAAAAAAX', 'XABAABAX', 'XAAAAAAX', '.XAAAAX.', '..XXXX..']


def draw(size, maskable=False):
    S = 4
    n = size * S
    im = Image.new('RGBA', (n, n), BG + (255,) if maskable else (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    if not maskable:
        d.rounded_rectangle([0, 0, n - 1, n - 1], radius=int(n * 0.22), fill=BG)
    k = 0.72 if maskable else 0.9
    # LCD 화면
    m = n * (1 - k) / 2
    d.rounded_rectangle([m, m, n - m, n - m], radius=int(n * 0.12 * k), fill=LCD)
    cell = int(n * k * 0.075)
    w, h = 8 * cell, 10 * cell
    x0, y0 = (n - w) / 2, (n - h) / 2
    pal = {'X': INK, 'A': SHELL, 'B': SPOT}
    for y, row in enumerate(EGG):
        for x, ch in enumerate(row):
            if ch == '.':
                continue
            d.rectangle([x0 + x * cell, y0 + y * cell, x0 + (x + 1) * cell - 1, y0 + (y + 1) * cell - 1], fill=pal[ch])
    return im.resize((size, size), Image.NEAREST if size >= 180 else Image.LANCZOS)


os.makedirs(OUT, exist_ok=True)
draw(192).save(os.path.join(OUT, 'icon-192.png'))
draw(512).save(os.path.join(OUT, 'icon-512.png'))
draw(512, True).save(os.path.join(OUT, 'icon-maskable-512.png'))
draw(180, True).convert('RGB').save(os.path.join(OUT, 'apple-touch-icon.png'))
print('ok')

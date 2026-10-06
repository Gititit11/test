"""스캔메이트 아이콘 만들기: python3 scanner/tools/build-icons.py"""
import os
from PIL import Image, ImageDraw

OUT = os.path.join(os.path.dirname(__file__), '..', 'icons')
BG, PAPER, BRAND, INK = (15, 17, 21), (245, 247, 250), (47, 212, 167), (160, 170, 186)


def draw(size, maskable=False):
    S = 4  # 크게 그려서 줄이면 테두리가 매끈하다
    n = size * S
    im = Image.new('RGBA', (n, n), BG + (255,) if maskable else (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    if not maskable:
        d.rounded_rectangle([0, 0, n - 1, n - 1], radius=int(n * 0.22), fill=BG)
    k = 0.78 if maskable else 1.0  # 마스커블은 가운데 안전 영역 안에 그린다

    def p(x, y):
        return (n / 2 + (x - 0.5) * n * k, n / 2 + (y - 0.5) * n * k)

    # 종이
    x0, y0 = p(0.31, 0.24); x1, y1 = p(0.69, 0.76)
    d.rounded_rectangle([x0, y0, x1, y1], radius=int(n * 0.025 * k), fill=PAPER)
    for i, w in enumerate([0.26, 0.26, 0.26, 0.17]):
        a = p(0.37, 0.35 + i * 0.09); b = p(0.37 + w, 0.35 + i * 0.09)
        d.line([a, b], fill=INK, width=int(n * 0.03 * k))
    # 스캔 모서리 괄호
    lw, L, m = int(n * 0.045 * k), 0.13, 0.17
    for cx, cy, sx, sy in [(m, m, 1, 1), (1 - m, m, -1, 1), (1 - m, 1 - m, -1, -1), (m, 1 - m, 1, -1)]:
        d.line([p(cx, cy + sy * L), p(cx, cy), p(cx + sx * L, cy)], fill=BRAND, width=lw, joint='curve')
        r = lw / 2
        for q in (p(cx, cy + sy * L), p(cx + sx * L, cy), p(cx, cy)):
            d.ellipse([q[0] - r, q[1] - r, q[0] + r, q[1] + r], fill=BRAND)
    return im.resize((size, size), Image.LANCZOS)


os.makedirs(OUT, exist_ok=True)
draw(192).save(os.path.join(OUT, 'icon-192.png'))
draw(512).save(os.path.join(OUT, 'icon-512.png'))
draw(512, True).save(os.path.join(OUT, 'icon-maskable-512.png'))
draw(180, True).convert('RGB').save(os.path.join(OUT, 'apple-touch-icon.png'))
print('ok')

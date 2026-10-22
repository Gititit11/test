"""디지타마 아이콘 만들기: python3 digimon/tools/build-icons.py

LCD 화면 안에 아구몬 도트(sprites/agumon.png 첫 프레임)를 정수배로 키워 넣는다.
안드로이드 앱 아이콘(android/.../mipmap-*/ic_launcher.png)도 같이 만든다.
"""
import os
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'icons')
RES = os.path.join(HERE, '..', 'android', 'app', 'src', 'main', 'res')
BG, LCD = (15, 17, 21), (215, 232, 196)


def sprite():
    sheet = Image.open(os.path.join(HERE, '..', 'sprites', 'agumon.png')).convert('RGBA')
    w = sheet.width // 12
    f = sheet.crop((0, 0, w, sheet.height))
    return f.crop(f.getbbox())


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
    # 아구몬 (도트가 뭉개지지 않게 정수배로)
    f = sprite()
    scale = max(1, int(n * k * 0.78 / max(f.width, f.height)))
    big = f.resize((f.width * scale, f.height * scale), Image.NEAREST)
    im.alpha_composite(big, ((n - big.width) // 2, (n - big.height) // 2))
    return im.resize((size, size), Image.NEAREST if size >= 180 else Image.LANCZOS)


os.makedirs(OUT, exist_ok=True)
draw(192).save(os.path.join(OUT, 'icon-192.png'))
draw(512).save(os.path.join(OUT, 'icon-512.png'))
draw(512, True).save(os.path.join(OUT, 'icon-maskable-512.png'))
draw(180, True).convert('RGB').save(os.path.join(OUT, 'apple-touch-icon.png'))
for d, px in (('mipmap-xxhdpi', 144), ('mipmap-xxxhdpi', 192)):
    draw(px).save(os.path.join(RES, d, 'ic_launcher.png'))
print('ok')

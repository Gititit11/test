"""바브 도트를 앱 시트(sprites/<id>.png)로 옮긴다.

세 가지 원본을 받는다.

  1) 256x256 PNG (가로 4 x 세로 3 칸, 칸 64px) — 손실 없이 그대로 옮긴다
     python3 digimon/tools/import-sheets.py png 원본.png --id agumon

  2) 한 줄에 12칸씩 여러 디지몬이 들어간 큰 그림 (검은 배경, JPEG 이어도 됨)
     python3 digimon/tools/import-sheets.py grid 사진.jpg --ids vorvomon,lavorvomon,...
     칸 너비 64px 로 줄여서 되돌리고, 검은 배경을 지운 뒤 1px 검은 테두리를 다시 두르고
     색을 정리한다. 원본이 줄어들거나 JPEG 이면 PNG 보다 조금 흐리다.

  3) 배경을 지운 그림 한 장 (포즈가 하나뿐일 때) — 12프레임을 모두 그 그림으로 채운다
     python3 digimon/tools/import-sheets.py single 잘라낸.png --id guilmon

시트는 12프레임을 가로로 이은 PNG 이다. 모든 프레임을 덮는 상자 하나로 잘라서
프레임끼리의 위치 차이(뛰기, 눕기)는 그대로 남는다. 끝나면 js/sheets.js 를 다시 쓴다.
필요: pip install pillow numpy scipy
"""
import argparse, glob, json, os
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'sprites')
INDEX = os.path.join(HERE, '..', 'js', 'sheets.js')
CELL = 64


def save_strip(frames, sid):
    """frames: RGBA 배열 12개 (같은 크기). 전체를 덮는 상자로 잘라 가로로 잇는다."""
    alpha = np.any([f[:, :, 3] > 0 for f in frames], axis=0)
    ys, xs = np.nonzero(alpha)
    y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    w, h = x1 - x0, y1 - y0
    strip = np.zeros((h, w * len(frames), 4), 'uint8')
    for i, f in enumerate(frames):
        strip[:, i * w:(i + 1) * w] = f[y0:y1, x0:x1]
    os.makedirs(OUT, exist_ok=True)
    save_png(strip, os.path.join(OUT, sid + '.png'))
    print(sid, w, 'x', h)


def save_png(a, path):
    """색이 256개 이하면 팔레트 PNG 로 (손실 없이 훨씬 작다)."""
    a = a.copy()
    a[a[:, :, 3] == 0] = 0
    cols, inv = np.unique(a.reshape(-1, 4), axis=0, return_inverse=True)
    if len(cols) > 256:
        Image.fromarray(a).save(path, optimize=True)
        return
    im = Image.fromarray(inv.reshape(a.shape[:2]).astype('uint8'), 'P')
    im.putpalette(cols.flatten().tolist(), rawmode='RGBA')
    im.save(path, optimize=True)


def from_png(src, sid):
    im = Image.open(src).convert('RGBA')
    if im.size == (768, 768):  # 3배로 키운 것
        im = Image.fromarray(np.asarray(im)[1::3, 1::3])
    a = np.asarray(im)
    assert a.shape[:2] == (256, 256), a.shape
    frames = [a[r * CELL:(r + 1) * CELL, c * CELL:(c + 1) * CELL] for r in range(3) for c in range(4)]
    save_strip(frames, sid)


def from_grid(src, ids, cols, colors):
    from scipy import ndimage
    from scipy.cluster.vq import kmeans2
    im = Image.open(src).convert('RGB')
    ratio = im.width / (cols * CELL)
    H = round(im.height / ratio)
    a = np.asarray(im.resize((cols * CELL, H), Image.BOX)).astype(float)
    rows = len(ids)
    rh = H / rows
    for r, sid in enumerate(ids):
        ya, yb = round(r * rh), round((r + 1) * rh)
        cells = [a[ya:yb, c * CELL:(c + 1) * CELL] for c in range(cols)]
        masks = []
        for f in cells:
            body = f.max(axis=2) > 34
            lab, n = ndimage.label(body)
            sizes = ndimage.sum(body, lab, range(1, n + 1))
            body = np.isin(lab, [i + 1 for i, s in enumerate(sizes) if s >= 6])
            body = ndimage.binary_fill_holes(body)
            masks.append(body)
        pix = np.concatenate([f[m] for f, m in zip(cells, masks)])
        cent, _ = kmeans2(pix, colors, minit='++', seed=1)
        frames = []
        for f, m in zip(cells, masks):
            q = cent[((f[:, :, None, :] - cent[None, None]) ** 2).sum(-1).argmin(-1)]
            ring = ndimage.binary_dilation(m) & ~m  # 지워진 검은 테두리를 다시 그린다
            out = np.zeros(f.shape[:2] + (4,), 'uint8')
            out[m, :3] = q[m].clip(0, 255)
            out[m, 3] = 255
            out[ring] = (4, 4, 4, 255)
            frames.append(out)
        save_strip(frames, sid)


def from_single(src, sid):
    a = np.asarray(Image.open(src).convert('RGBA'))
    save_strip([a] * 12, sid)


def is_silhouette(fr):
    rgb = fr[fr[:, :, 3] > 0][:, :3].astype(int)
    if not len(rgb): return True
    return (rgb.max(1) - rgb.min(1)).max() < 24 and len({tuple(c) for c in rgb}) <= 3


def write_index():
    sheets = {}
    for path in sorted(glob.glob(os.path.join(OUT, '*.png'))):
        sid = os.path.splitext(os.path.basename(path))[0]
        a = np.asarray(Image.open(path).convert('RGBA'))
        n = 12
        w = a.shape[1] // n
        gray = [i for i in range(n) if is_silhouette(a[:, i * w:(i + 1) * w])]
        sheets[sid] = {'w': w, 'h': a.shape[0], 'n': n, 'gray': gray}
    with open(INDEX, 'w') as f:
        f.write('/* tools/import-sheets.py 가 만든다. 직접 고치지 마세요. */\n')
        f.write('var SHEETS = ' + json.dumps(sheets, separators=(',', ':')) + ';\n')
        f.write("if (typeof module !== 'undefined' && module.exports) module.exports = SHEETS;\n")
    print('sheets.js:', len(sheets), '종')


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('kind', nargs='?', choices=['png', 'grid', 'single'])
    ap.add_argument('src', nargs='?')
    ap.add_argument('--id')
    ap.add_argument('--ids')
    ap.add_argument('--cols', type=int, default=12)
    ap.add_argument('--colors', type=int, default=28)
    a = ap.parse_args()
    if a.kind == 'png':
        from_png(a.src, a.id)
    elif a.kind == 'single':
        from_single(a.src, a.id)
    elif a.kind == 'grid':
        from_grid(a.src, a.ids.split(','), a.cols, a.colors)
    write_index()

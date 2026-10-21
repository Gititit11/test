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

  4) 64x56 칸 4x3 개가 1px 분홍 선으로 나뉜 시트 (342x172, 오른쪽 초상화는 버린다)
     배경은 초록(#00ff00)이거나 투명. 손실 없이 옮긴다.
     크게 키운 사본(예: 1456x732)이면 342x172 로 줄이고 색을 정리한 뒤 옮긴다.
     python3 digimon/tools/import-sheets.py cells 시트.png --id growlmon

  6) 바이탈 브레스 카드 원본 시트 (가로 4 x 세로 3 칸, 256x256 은 칸 64, 512x512 는 칸 128) — 손실 없이
     python3 digimon/tools/import-sheets.py sheet c0189.png --id agumon

  7) 디지타마 시트 (가로 4 x 세로 2 칸, 칸 32x40: 흔들기 2 · 금 가기 5 · 깨짐 1)
     python3 digimon/tools/import-sheets.py egg tamago012.png --id egg_agumon

  5) 도트를 크게 키운 그림 (가로 4 x 세로 3, 검은 배경, 도트 간격이 딱 맞지 않아도 됨)
     도트 한 칸 크기를 찾아서 줄인 뒤 grid 와 같은 방식으로 정리한다.
     python3 digimon/tools/import-sheets.py big 그림.png --id gigimon   (잘못 잡으면 --dot 5.4)

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


def from_cells(src, sid, colors=48):
    im = Image.open(src).convert('RGBA')
    if im.size != (342, 172):
        # 크게 키운 사본: 원래 크기로 줄이고, 줄이면서 섞인 색을 정리한다
        im = im.resize((342, 172), Image.BOX)
        a = np.asarray(im).copy()
        rgb = a[:, :, :3].astype(float)
        # 줄이면서 테두리와 섞인 어두운 초록까지 배경으로 본다
        green = (rgb[:, :, 1] - np.maximum(rgb[:, :, 0], rgb[:, :, 2]) > 30) & (rgb[:, :, 1] > 60)
        from scipy.cluster.vq import kmeans2
        body = ~green
        cent, _ = kmeans2(rgb[body], colors, minit='++', seed=1)
        q = cent[((rgb[:, :, None, :] - cent[None, None]) ** 2).sum(-1).argmin(-1)]
        a[body, :3] = q[body].clip(0, 255)
        a[green] = (0, 255, 0, 255)
        im = Image.fromarray(a)
    a = np.asarray(im).copy()
    rgb = a[:, :, :3].astype(int)
    green = (rgb[:, :, 1] > 200) & (rgb[:, :, 0] < 80) & (rgb[:, :, 2] < 80)
    a[green | (a[:, :, 3] < 128)] = 0
    a[a[:, :, 3] > 0, 3] = 255
    frames = [a[1 + r * 57:1 + r * 57 + 56, 1 + c * 65:1 + c * 65 + 64].copy() for r in range(3) for c in range(4)]
    from scipy import ndimage
    for f in frames:
        # 몸과 떨어진 자잘한 점(번진 초록, 서명 글자 조각)을 지운다
        lab, n = ndimage.label(f[:, :, 3] > 0)
        if n > 1:
            sizes = ndimage.sum(f[:, :, 3] > 0, lab, range(1, n + 1))
            for i, z in enumerate(sizes):
                if z < 6:
                    f[lab == i + 1] = 0
    save_strip(frames, sid)


def from_big(src, sid, colors, dot=None):
    from scipy import ndimage
    from scipy.cluster.vq import kmeans2
    im = Image.open(src).convert('RGB')
    ref = np.asarray(im).astype(float)
    if not dot:
        # 색이 확 바뀌는 경계 사이의 간격 = 도트 한 칸. 간격들의 가운데 값을 쓴다.
        gaps = []
        for arr in (ref, ref.transpose(1, 0, 2)):
            d = np.abs(np.diff(arr, axis=1)).sum(2) > 60
            for row in d:
                idx = np.nonzero(row)[0]
                g = np.diff(idx)
                gaps.extend(g[(g >= 3) & (g <= 12)].tolist())
        dot = float(np.median(gaps))
    w, h = round(im.width / dot), round(im.height / dot)
    s = np.asarray(im.resize((w, h), Image.BOX)).astype(float)
    cw, ch = w // 4, h // 3
    cells = [s[r * ch:(r + 1) * ch, c * cw:(c + 1) * cw] for r in range(3) for c in range(4)]
    masks = []
    for f in cells:
        m = f.max(axis=2) > 40
        lab, n = ndimage.label(m)
        sizes = ndimage.sum(m, lab, range(1, n + 1))
        masks.append(ndimage.binary_fill_holes(np.isin(lab, [i + 1 for i, z in enumerate(sizes) if z >= 6])))
    pix = np.concatenate([f[m] for f, m in zip(cells, masks)])
    cent, _ = kmeans2(pix, colors, minit='++', seed=1)
    # 칸마다 그림 위치가 제각각이라, 잘라 낸 뒤 발끝(아래)과 가운데를 맞춰 다시 놓는다
    crops = []
    for f, m in zip(cells, masks):
        ys, xs = np.nonzero(m)
        f, m = f[ys.min():ys.max() + 1, xs.min():xs.max() + 1], m[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
        q = cent[((f[:, :, None, :] - cent[None, None]) ** 2).sum(-1).argmin(-1)]
        sat = (f[m].max(1) - f[m].min(1)).mean()
        if sat < 20:
            q[:] = (128, 128, 128)  # 회색 실루엣 = 그 동작이 없다
        crops.append((q, m))
    W = max(m.shape[1] for _, m in crops) + 2
    H = max(m.shape[0] for _, m in crops) + 2
    frames = []
    for q, m in crops:
        out = np.zeros((H, W, 4), 'uint8')
        y0, x0 = H - 1 - m.shape[0], (W - m.shape[1]) // 2
        mm = np.zeros((H, W), bool)
        mm[y0:y0 + m.shape[0], x0:x0 + m.shape[1]] = m
        out[mm, :3] = q[m].clip(0, 255)
        out[mm, 3] = 255
        out[ndimage.binary_dilation(mm) & ~mm] = (4, 4, 4, 255)
        frames.append(out)
    print('도트 한 칸', round(dot, 1), 'px')
    save_strip(frames, sid)


def from_sheet(src, sid):
    a = np.asarray(Image.open(src).convert('RGBA'))
    c = a.shape[1] // 4
    save_strip([a[r * c:(r + 1) * c, k * c:(k + 1) * c] for r in range(3) for k in range(4)], sid)


def from_egg(src, sid):
    a = np.asarray(Image.open(src).convert('RGBA'))
    w, h = a.shape[1] // 4, a.shape[0] // 2
    save_strip([a[r * h:(r + 1) * h, k * w:(k + 1) * w] for r in range(2) for k in range(4)], sid)


def is_silhouette(fr):
    """그 동작이 없는 칸: 회색 한 색(바브) 이거나 채도가 낮은 갈색 톤(레이드 보스)"""
    rgb = fr[fr[:, :, 3] > 0][:, :3].astype(int)
    if not len(rgb): return True
    sat = (rgb.max(1) - rgb.min(1)).max()
    if len(np.unique(rgb, axis=0)) <= 3 and sat < 24:
        return True                       # 바브: 회색 한 색
    return fr.shape[1] >= 96 and sat < 60  # 레이드 보스(칸 128): 옅은 갈색 톤


def write_index():
    sheets = {}
    for path in sorted(glob.glob(os.path.join(OUT, '*.png'))):
        sid = os.path.splitext(os.path.basename(path))[0]
        a = np.asarray(Image.open(path).convert('RGBA'))
        n = 8 if sid.startswith('egg_') else 12
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
    ap.add_argument('kind', nargs='?', choices=['png', 'grid', 'single', 'cells', 'big', 'sheet', 'egg'])
    ap.add_argument('src', nargs='?')
    ap.add_argument('--id')
    ap.add_argument('--ids')
    ap.add_argument('--cols', type=int, default=12)
    ap.add_argument('--colors', type=int, default=28)
    ap.add_argument('--dot', type=float, help='big: 도트 한 칸 크기(px). 안 주면 찾는다')
    a = ap.parse_args()
    if a.kind == 'png':
        from_png(a.src, a.id)
    elif a.kind == 'single':
        from_single(a.src, a.id)
    elif a.kind == 'sheet':
        from_sheet(a.src, a.id)
    elif a.kind == 'egg':
        from_egg(a.src, a.id)
    elif a.kind == 'cells':
        from_cells(a.src, a.id)
    elif a.kind == 'big':
        from_big(a.src, a.id, min(a.colors, 16), a.dot)
    elif a.kind == 'grid':
        from_grid(a.src, a.ids.split(','), a.cols, a.colors)
    write_index()

"""스크린샷 속 디지몬 도트를 원래 픽셀로 되돌려 시트로 만든다.

폰으로 찍은 스크린샷은 도트가 몇 배로 커지고 JPEG 으로 번져 있다. 픽셀 간격(피치)과
시작 위치를 찾아 칸 가운데를 뽑고, 색을 몇 가지로 정리하고, 바깥 흰 배경을 투명하게 한다.

  python3 digimon/tools/extract-sprites.py 사진.jpg --id agumon --y 300 1050
  python3 digimon/tools/extract-sprites.py 사진.jpg --id greymon --y 1300 2060 --blank 975 1286 1029 1340
  python3 digimon/tools/extract-sprites.py --index      # js/sheets.js 만 다시 쓰기

--y 는 그 디지몬 그림들이 있는 세로 범위(원본 픽셀). 그 안의 그림을 위→아래, 왼→오른 순서로
프레임으로 쓴다. --blank 는 페이지 번호 상자처럼 그림에 붙은 군더더기를 흰색으로 지운다.
필요: pip install pillow numpy scipy
"""
import argparse, glob, json, os
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'sprites')
INDEX = os.path.join(HERE, '..', 'js', 'sheets.js')
PAD = 4


def boxes_of(reg):
    from scipy import ndimage
    fg = reg.min(axis=2) < 225
    lab, _ = ndimage.label(ndimage.binary_dilation(fg, iterations=6))
    bs = []
    for sl in ndimage.find_objects(lab):
        if sl[0].stop - sl[0].start > 60 and sl[1].stop - sl[1].start > 60:
            bs.append((sl[0].start, sl[0].stop, sl[1].start, sl[1].stop))
    # 같은 줄끼리 (윗변이 비슷하면 한 줄)
    bs.sort(key=lambda b: b[0])
    rows, cur = [], []
    for b in bs:
        if cur and b[0] - cur[0][0] > 80:
            rows.append(cur); cur = []
        cur.append(b)
    if cur: rows.append(cur)
    return [b for r in rows for b in sorted(r, key=lambda b: b[2])]


def fit_error(g, p, ox, oy):
    xs = np.arange(ox + p / 2, g.shape[1], p).astype(int)
    ys = np.arange(oy + p / 2, g.shape[0], p).astype(int)
    if len(xs) < 4 or len(ys) < 4: return 1e9
    yi = np.clip(((np.arange(g.shape[0]) - oy) // p).astype(int), 0, len(ys) - 1)
    xi = np.clip(((np.arange(g.shape[1]) - ox) // p).astype(int), 0, len(xs) - 1)
    return np.abs(g[np.ix_(ys, xs)][np.ix_(yi, xi)] - g).mean()


def find_pitch(patch):
    g = patch.mean(axis=2)
    best = None
    for p in np.arange(2.5, 8.01, 0.02):
        for ox in np.arange(0, p, 0.5):
            for oy in np.arange(0, p, 0.5):
                e = fit_error(g, p, ox, oy)
                if best is None or e < best[0]: best = (e, p)
    return best[1]


def sample(patch, p):
    g = patch.mean(axis=2)
    best = None
    for ox in np.arange(0, p, 0.25):
        for oy in np.arange(0, p, 0.25):
            e = fit_error(g, p, ox, oy)
            if best is None or e < best[0]: best = (e, ox, oy)
    _, ox, oy = best
    xs = np.arange(ox + p / 2, patch.shape[1] - 1, p)
    ys = np.arange(oy + p / 2, patch.shape[0] - 1, p)
    out = np.zeros((len(ys), len(xs), 3))
    for a, yy in enumerate(ys):
        for c, xx in enumerate(xs):
            y_, x_ = int(round(yy)), int(round(xx))
            # 칸 가운데 3x3 평균 — JPEG 번짐을 줄인다
            out[a, c] = patch[max(0, y_ - 1):y_ + 2, max(0, x_ - 1):x_ + 2].reshape(-1, 3).mean(0)
    return out


def background(f):
    from scipy import ndimage
    lab, _ = ndimage.label(f.min(axis=2) > 200)
    edge = set(lab[0]) | set(lab[-1]) | set(lab[:, 0]) | set(lab[:, -1])
    edge.discard(0)
    return np.isin(lab, list(edge))


def extract(src, sid, y0, y1, colors, blanks):
    from scipy.cluster.vq import kmeans2
    im = np.asarray(Image.open(src).convert('RGB')).copy()
    for x0, by0, x1, by1 in blanks:
        im[by0 - 2:by1 + 3, x0 - 2:x1 + 3] = 255
    reg = im[y0:y1].astype(float)
    bs = boxes_of(reg)
    if not bs: raise SystemExit('그림을 못 찾았어요. --y 범위를 확인하세요')
    crop = lambda b: reg[max(0, b[0] - PAD):b[1] + PAD, max(0, b[2] - PAD):b[3] + PAD]
    p = find_pitch(crop(bs[0]))
    frames = [sample(crop(b), p) for b in bs]
    masks = [background(f) for f in frames]

    pix = np.concatenate([f[~m] for f, m in zip(frames, masks)])
    cent, _ = kmeans2(pix, colors, minit='++', seed=1)
    cent = np.array([c if c.max() > 55 else np.array([16, 16, 20]) for c in cent])  # 테두리는 한 색

    def snap(f, m):
        q = cent[((f[:, :, None, :] - cent[None, None]) ** 2).sum(-1).argmin(-1)]
        return np.concatenate([q, np.where(m, 0, 255)[..., None]], -1).clip(0, 255).astype('uint8')

    fr = [snap(f, m) for f, m in zip(frames, masks)]
    bbs = []
    for a in fr:
        ys, xs = np.nonzero(a[:, :, 3])
        bbs.append((ys.min(), ys.max(), xs.min(), xs.max()))
    W = max(b[3] - b[2] + 1 for b in bbs); W += W % 2
    H = max(b[1] - b[0] + 1 for b in bbs)
    sheet = np.zeros((H, W * len(fr), 4), 'uint8')
    for i, (a, b) in enumerate(zip(fr, bbs)):
        c = a[b[0]:b[1] + 1, b[2]:b[3] + 1]
        h, w = c.shape[:2]
        x = i * W + (W - w) // 2   # 바닥-가운데 맞춤
        sheet[H - h:H, x:x + w] = c
    os.makedirs(OUT, exist_ok=True)
    Image.fromarray(sheet).save(os.path.join(OUT, sid + '.png'), optimize=True)
    print(sid, '피치', round(p, 2), '프레임', len(fr), '크기', W, 'x', H)


def is_silhouette(fr):
    rgb = fr[fr[:, :, 3] > 0][:, :3].astype(int)
    if not len(rgb): return True
    return (rgb.max(1) - rgb.min(1)).max() < 24 and len({tuple(c) for c in rgb}) <= 3


def write_index():
    sheets = {}
    for path in sorted(glob.glob(os.path.join(OUT, '*.png'))):
        sid = os.path.splitext(os.path.basename(path))[0]
        a = np.asarray(Image.open(path).convert('RGBA'))
        h = a.shape[0]
        n = 12 if a.shape[1] % 12 == 0 else max(1, round(a.shape[1] / h))
        w = a.shape[1] // n
        # 회색 실루엣 프레임은 그 동작이 없다는 뜻이라 빼 둔다
        gray = [i for i in range(n) if is_silhouette(a[:, i * w:(i + 1) * w])]
        sheets[sid] = {'w': w, 'h': h, 'n': n, 'gray': gray}
    with open(INDEX, 'w') as f:
        f.write('/* tools/extract-sprites.py 가 만든다. 직접 고치지 마세요. */\n')
        f.write('var SHEETS = ' + json.dumps(sheets, ensure_ascii=False, indent=1) + ';\n')
        f.write("if (typeof module !== 'undefined' && module.exports) module.exports = SHEETS;\n")
    print('sheets.js:', ', '.join(sheets) or '(없음)')


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('src', nargs='?')
    ap.add_argument('--id')
    ap.add_argument('--y', nargs=2, type=int)
    ap.add_argument('--colors', type=int, default=20)
    ap.add_argument('--blank', nargs=4, type=int, action='append', default=[])
    ap.add_argument('--index', action='store_true')
    a = ap.parse_args()
    if a.src:
        extract(a.src, a.id, a.y[0], a.y[1], a.colors, a.blank)
    write_index()

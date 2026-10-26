"""갈무리 글꼴 줄이기: python3 digimon/tools/subset-fonts.py <갈무리 dist 폴더>

육성 화면 글씨는 갈무리(Galmuri, SIL OFL 1.1, fonts/OFL.md)를 쓴다.
원본은 수백 KB 라서, 앱 소스(index.html, js/*.js)에 나오는 한글과 ASCII 만 남긴 woff2 를 fonts/ 에 둔다.
새 글자가 들어간 문구나 디지몬 이름을 더하면 다시 돌린다. 빠진 글자는 기본 글꼴로 보인다.

  원본 받기:  npm pack galmuri && tar xzf galmuri-*.tgz   → package/dist
  필요한 것:  pip install fonttools brotli
"""
import glob
import os
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
APP = os.path.join(HERE, '..')
FONTS = ['Galmuri11', 'Galmuri9']


def glyphs():
    text = ''
    for p in [os.path.join(APP, 'index.html')] + glob.glob(os.path.join(APP, 'js', '*.js')):
        with open(p, encoding='utf-8') as f:
            text += f.read()
    keep = {c for c in text if 0xAC00 <= ord(c) <= 0xD7A3}
    keep |= {chr(c) for c in range(0x20, 0x7F)}
    keep |= set('·…×→←★☆♪%()[]~!?')
    return ''.join(sorted(keep))


def main(dist):
    with tempfile.NamedTemporaryFile('w', suffix='.txt', delete=False, encoding='utf-8') as f:
        f.write(glyphs())
    for name in FONTS:
        subprocess.check_call([
            sys.executable, '-m', 'fontTools.subset', os.path.join(dist, name + '.ttf'),
            '--text-file=' + f.name, '--flavor=woff2', '--layout-features=*', '--no-hinting',
            '--output-file=' + os.path.join(APP, 'fonts', name + '.woff2')])
    os.unlink(f.name)


if __name__ == '__main__':
    main(sys.argv[1])

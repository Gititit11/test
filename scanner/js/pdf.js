/* JPEG 페이지들로 PDF 만들기.
 *
 * PDF 는 JPEG 을 그대로 품을 수 있어서(DCTDecode) 다시 압축할 필요가 없다.
 * 그래서 jsPDF 같은 라이브러리 없이 객체 몇 개와 xref 표만 쓰면 된다.
 *
 *   Pdf.build([{ jpeg: Uint8Array, width, height }], { size: 'a4' | 'fit' }) → Blob
 */
var Pdf = (function () {
  'use strict';

  var A4 = [595.28, 841.89]; // pt (1/72 inch)

  function num(n) { return (Math.round(n * 100) / 100).toString(); }

  function build(pages, opts) {
    opts = opts || {};
    var enc = new TextEncoder(), parts = [], offset = 0, xref = [];

    function put(x) {
      var b = typeof x === 'string' ? enc.encode(x) : x;
      parts.push(b); offset += b.length;
    }
    function obj(id, body) { xref[id] = offset; put(id + ' 0 obj\n' + body + '\nendobj\n'); }

    put('%PDF-1.4\n');
    put(new Uint8Array([37, 226, 227, 207, 211, 10])); // 이진 파일 표시

    var kids = pages.map(function (_, i) { return (3 + i * 3) + ' 0 R'; }).join(' ');
    obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
    obj(2, '<< /Type /Pages /Kids [' + kids + '] /Count ' + pages.length + ' >>');

    pages.forEach(function (p, i) {
      var pid = 3 + i * 3, cid = pid + 1, iid = pid + 2;
      var pw, ph, dw, dh;
      if (opts.size === 'fit') {
        // 긴 변을 A4 긴 변에 맞추고 비율은 사진 그대로
        var s = A4[1] / Math.max(p.width, p.height);
        pw = dw = p.width * s; ph = dh = p.height * s;
      } else {
        var land = p.width > p.height;
        pw = land ? A4[1] : A4[0]; ph = land ? A4[0] : A4[1];
        var k = Math.min(pw / p.width, ph / p.height);
        dw = p.width * k; dh = p.height * k;
      }
      var x = (pw - dw) / 2, y = (ph - dh) / 2;
      var content = 'q ' + num(dw) + ' 0 0 ' + num(dh) + ' ' + num(x) + ' ' + num(y) + ' cm /Im0 Do Q';

      obj(pid, '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + num(pw) + ' ' + num(ph) + ']' +
        ' /Resources << /XObject << /Im0 ' + iid + ' 0 R >> >> /Contents ' + cid + ' 0 R >>');
      obj(cid, '<< /Length ' + enc.encode(content).length + ' >>\nstream\n' + content + '\nendstream');

      xref[iid] = offset;
      put(iid + ' 0 obj\n<< /Type /XObject /Subtype /Image /Width ' + p.width + ' /Height ' + p.height +
        ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' + p.jpeg.length +
        ' >>\nstream\n');
      put(p.jpeg);
      put('\nendstream\nendobj\n');
    });

    var size = 3 + pages.length * 3, start = offset;
    var table = 'xref\n0 ' + size + '\n0000000000 65535 f \n';
    for (var i = 1; i < size; i++) table += ('0000000000' + xref[i]).slice(-10) + ' 00000 n \n';
    put(table + 'trailer\n<< /Size ' + size + ' /Root 1 0 R >>\nstartxref\n' + start + '\n%%EOF\n');

    return new Blob(parts, { type: 'application/pdf' });
  }

  return { build: build };
})();

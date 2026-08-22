/**
 * 図を PNG として保存するための、印刷用 HTML に埋め込む小さなスクリプト。
 *
 * SVG から PNG への変換には普通は変換ソフトが要るが、担任のブラウザ自身が
 * それをできる。追加の導入を求めずに済むので、この方法を採る。
 *
 * 印刷には出さない（ボタンが紙に写ると邪魔なので）。
 */

/** 板書のように大きく使う図は、投影や掲示に耐える解像度で出す。 */
const SCALE = 4;

export const SAVE_IMAGE_CSS = `
.figure-save {
  display: block;
  margin: 4pt auto 0;
  padding: 4pt 12pt;
  font-family: inherit;
  font-size: 10pt;
  color: #555;
  background: #f4f4f4;
  border: 1px solid #ccc;
  border-radius: 999px;
  cursor: pointer;
}
.figure-save:hover { background: #e8e8e8; color: #111; }
.figure-save[disabled] { opacity: 0.5; cursor: default; }
@media print { .figure-save { display: none; } }
`;

export const SAVE_IMAGE_SCRIPT = `
(function () {
  var SCALE = ${SCALE};

  // 日本語を含む SVG を data URL にする。btoa は非 ASCII をそのまま扱えない。
  function svgToDataUrl(svg) {
    var xml = new XMLSerializer().serializeToString(svg);
    if (!/^<svg[^>]+xmlns=/.test(xml)) {
      xml = xml.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
    }
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(xml);
  }

  function fileName(svg, index) {
    var label = svg.getAttribute('aria-label') || '図';
    return (document.title + '_' + label + '_' + (index + 1) + '.png').replace(/[\\\\/:*?"<>|]/g, '_');
  }

  function save(svg, index, button) {
    var width = svg.viewBox && svg.viewBox.baseVal && svg.viewBox.baseVal.width
      ? svg.viewBox.baseVal.width : svg.clientWidth;
    var height = svg.viewBox && svg.viewBox.baseVal && svg.viewBox.baseVal.height
      ? svg.viewBox.baseVal.height : svg.clientHeight;

    var image = new Image();
    image.onload = function () {
      var canvas = document.createElement('canvas');
      canvas.width = Math.round(width * SCALE);
      canvas.height = Math.round(height * SCALE);
      var ctx = canvas.getContext('2d');
      // 白で塗ってから描く。透明のままだと貼り先によって黒く出る
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(function (blob) {
        if (!blob) { button.textContent = '保存できませんでした'; return; }
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = fileName(svg, index);
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
        button.textContent = '保存しました（ダウンロード）';
        setTimeout(function () { button.textContent = '画像として保存'; }, 2500);
      }, 'image/png');
    };
    image.onerror = function () { button.textContent = '保存できませんでした'; };
    image.src = svgToDataUrl(svg);
  }

  document.addEventListener('DOMContentLoaded', function () {
    var blocks = document.querySelectorAll('.figure-block');
    Array.prototype.forEach.call(blocks, function (block, index) {
      var svg = block.querySelector('svg');
      if (!svg) return;
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'figure-save';
      button.textContent = '画像として保存';
      button.addEventListener('click', function () { save(svg, index, button); });
      block.appendChild(button);
    });
  });
})();
`;

import test from 'node:test';
import assert from 'node:assert/strict';

import { BASE_CSS, buildHtml } from './templates.mjs';
import { markdownToHtml } from './markdown.mjs';

const page = (md) => buildHtml({ title: 'てすと', bodyHtml: markdownToHtml(md), css: BASE_CSS });

test('図のあるページには、画像として保存する手段が付く', () => {
  const html = page('```図\ntype: board\nareas: めあて,まとめ\n```');
  assert.match(html, /figure-save/);
  assert.match(html, /画像として保存/);
  assert.match(html, /toBlob/);
});

test('保存ボタンは印刷に出さない', () => {
  const html = page('```図\ntype: tenframe\ncount: 5\n```');
  assert.match(html, /@media print \{ \.figure-save \{ display: none; \} \}/);
});

test('図が無いページでも壊れない（ボタンは付かないだけ）', () => {
  const html = page('# みだし\n\nほんぶん');
  assert.doesNotMatch(html, /<figure class="figure-block">/);
  assert.match(html, /ほんぶん/);
});

test('埋め込むスクリプトは構文として通る', async () => {
  const { SAVE_IMAGE_SCRIPT } = await import('./saveimage.mjs');
  assert.doesNotThrow(() => new Function(SAVE_IMAGE_SCRIPT));
});

test('板書は 3600×1200 の比のまま HTML に入る', () => {
  const html = page('```図\ntype: board\nareas: めあて,まとめ\n```');
  assert.match(html, /viewBox="0 0 900 300"/);
});

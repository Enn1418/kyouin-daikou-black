/**
 * 職員室の絵の置き場所と、受け取る形のテスト。
 *
 * ここが緩むと、教材フォルダの外に書けたり、PNG のつもりで別の中身を
 * 置けたりする。文書用の読み書きと違って拡張子のホワイトリストが効かない口なので、
 * 名前と中身の検査がそのまま安全の線引きになる。
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { assetRelativePath, decodePngDataUrl, encodePngDataUrl } from './assets.mjs';

/** 1×1 の透明 PNG。テストで使う最小の本物。 */
const TINY_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

test('種類と id から置き場所が決まる', () => {
  assert.equal(assetRelativePath('room-bg', 'sn-japanese'), '90_職員室/背景/sn-japanese.png');
  assert.equal(assetRelativePath('agent-face', 'sn-jp-lead'), '90_職員室/顔/sn-jp-lead.png');
});

test('知らない種類は受け取らない', () => {
  assert.throws(() => assetRelativePath('script', 'x'), /扱えない種類/);
});

test('id で親フォルダへ抜けられない', () => {
  for (const id of ['../../秘密', 'a/b', '.bridge-token', '', 'あ']) {
    assert.throws(() => assetRelativePath('room-bg', id), /id は英数字/);
  }
});

test('PNG の data URL を読める', () => {
  const buffer = decodePngDataUrl(`data:image/png;base64,${TINY_PNG_BASE64}`);
  assert.ok(buffer.length > 8);
  assert.equal(encodePngDataUrl(buffer), `data:image/png;base64,${TINY_PNG_BASE64}`);
});

test('PNG 以外は受け取らない', () => {
  assert.throws(() => decodePngDataUrl(`data:image/svg+xml;base64,${TINY_PNG_BASE64}`), /PNG の data URL/);
  assert.throws(() => decodePngDataUrl('data:image/png;base64,QUJD'), /PNG として読めません/);
  assert.throws(() => decodePngDataUrl(''), /PNG の data URL/);
});

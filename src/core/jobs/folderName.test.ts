import test from 'node:test';
import assert from 'node:assert/strict';

import { caseFolderName, caseFolderPath } from './folderName.ts';

test('教科と単元名から、そのまま読めるフォルダ名になる', () => {
  assert.equal(caseFolderName('算数 わり算の導入'), '算数 わり算の導入');
});

test('Windows で使えない文字を置き換える', () => {
  // \ / : * ? " < > | (半角) はすべて Windows のファイル名で使えない
  assert.equal(caseFolderName('国語: 読み書き / 支援'), '国語_ 読み書き _ 支援');
  assert.equal(caseFolderName('かさ<LとdL>'), 'かさ_LとdL_');
  // 全角の記号（？や＜＞等）は Windows のファイル名として問題ないので、そのまま残す
  assert.equal(caseFolderName('かさ？（LとdL）'), 'かさ？（LとdL）');
});

test('末尾のピリオドと空白を落とす（Windows 側で無視され混乱のもと）', () => {
  assert.equal(caseFolderName('わり算 .'), 'わり算');
  assert.equal(caseFolderName('わり算...'), 'わり算');
});

test('連続する空白は1つにまとめる', () => {
  assert.equal(caseFolderName('算数    わり算'), '算数 わり算');
});

test('空の案件名でも、フォルダ名として成り立つものを返す', () => {
  assert.equal(caseFolderName(''), '無題の案件');
  assert.equal(caseFolderName('   '), '無題の案件');
});

test('長い案件名は切り詰める（パスが壊れないように）', () => {
  const long = 'あ'.repeat(100);
  const name = caseFolderName(long);
  assert.ok(name.length <= 61, `長すぎる: ${name.length}`);
  assert.match(name, /…$/);
});

test('保存先パスは 04_案件 の下、フォルダ名部分はサニタイズ済み', () => {
  assert.equal(caseFolderPath('算数 わり算の導入'), '04_案件/算数 わり算の導入');
  assert.equal(caseFolderPath('国語: 支援'), '04_案件/国語_ 支援');
});

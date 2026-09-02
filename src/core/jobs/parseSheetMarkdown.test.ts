/**
 * 依頼票の雛形（Markdown）を読み戻せるかのテスト。
 *
 * ここが壊れると、CEO が前もって書いておいた条件が黙って落ちる。
 * 「入れたつもりが入っていない」まま制作が始まるのが一番困るので、
 * 書き出し→読み込みで元に戻ること（往復）を軸に確かめる。
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { buildSheetMarkdown, parseSheetMarkdown } from './requirementSheet.ts';
import { EMPTY_SHEET } from './types.ts';
import type { RequirementSheet } from './types.ts';

const FILLED: RequirementSheet = {
  ...EMPTY_SHEET,
  subject: '算数',
  grade: '1〜4年',
  unitName: 'かさ（LとdL）',
  teachingContent: 'かさの単位を知り、比べられるようにする',
  competencies: '量を比べて説明する力',
  activityImage: '実物のますで水を移してから、絵カードで並べ替える',
  hours: 5,
  pupils: 'A児は数唱まで、B児は繰り上がりでつまずく',
  participants: ['A児', 'B児'],
  ict: ['大型提示装置'],
  wantedOutputs: ['略案', '3段階のプリント'],
  outputFormats: ['md', 'print-html'],
  style: '略案でよい',
  constraints: '45分・裏面なし'
};

test('書き出した雛形を読み戻すと、元の内容に戻る', () => {
  const { patch } = parseSheetMarkdown(buildSheetMarkdown(FILLED, '算数 かさ'));
  const restored = { ...EMPTY_SHEET, ...patch };
  assert.deepEqual(restored, FILLED);
});

test('やりたい活動のイメージも往復する', () => {
  const { patch } = parseSheetMarkdown(buildSheetMarkdown(FILLED, 'x'));
  assert.equal(patch.activityImage, FILLED.activityImage);
});

test('（未記入）のままの欄は空のままにする', () => {
  const { patch, filled } = parseSheetMarkdown(buildSheetMarkdown(EMPTY_SHEET, '新しい案件'));
  assert.deepEqual(patch, {});
  assert.deepEqual(filled, []);
});

test('手書きの素朴な書き方でも読める', () => {
  const { patch } = parseSheetMarkdown(
    '# 依頼票\n\n## 教科\n国語\n\n## 参加する児童\nA児, C児\n\n## 授業時数\n全4時間\n'
  );
  assert.equal(patch.subject, '国語');
  assert.deepEqual(patch.participants, ['A児', 'C児']);
  assert.equal(patch.hours, 4);
});

test('出力形式は、表示名でも内部の値でも受け取る', () => {
  const byLabel = parseSheetMarkdown('## 出力形式\nMarkdown（そのまま読める）、画像').patch;
  assert.deepEqual(byLabel.outputFormats, ['md', 'image']);

  const byCode = parseSheetMarkdown('## 出力形式\nmd、print-html').patch;
  assert.deepEqual(byCode.outputFormats, ['md', 'print-html']);
});

test('知らない見出しは捨てずに報告する', () => {
  const { unknown, patch } = parseSheetMarkdown('## 教科\n算数\n\n## 好きな色\n青\n');
  assert.equal(patch.subject, '算数');
  assert.deepEqual(unknown, ['好きな色']);
});

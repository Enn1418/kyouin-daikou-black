import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildMissingQuestion,
  buildSheetMarkdown,
  buildSheetSummary,
  isSheetComplete,
  missingRequired
} from './requirementSheet.ts';
import { EMPTY_SHEET, SHEET_FIELDS } from './types.ts';
import type { RequirementSheet } from './types.ts';

/** 必須が全部埋まった依頼票。個別のテストで1項目ずつ壊して使う。 */
const full: RequirementSheet = {
  ...EMPTY_SHEET,
  subject: '算数',
  grade: '1〜4年',
  unitName: 'かさ（LとdL）',
  teachingContent: '1Lますを使って、かさを数で表せるようにする',
  competencies: '普遍単位の必要性に気づき、LとdLで表す',
  hours: 6,
  pupils: 'A児は数唱10まで。B児は繰り上がりでつまずく。',
  participants: ['A児', 'B児', 'D児'],
  wantedOutputs: ['略案', '3段階のプリント'],
  outputFormats: ['print-html']
};

test('必須が空なら制作に進めない', () => {
  assert.equal(isSheetComplete(EMPTY_SHEET), false);
  const missing = missingRequired(EMPTY_SHEET);
  const required = SHEET_FIELDS.filter((f) => f.required);
  assert.equal(missing.length, required.length);
});

test('必須が全部埋まれば進める', () => {
  assert.equal(isSheetComplete(full), true);
  assert.deepEqual(missingRequired(full), []);
});

test('空白だけの記入は未記入として扱う', () => {
  assert.equal(isSheetComplete({ ...full, unitName: '   ' }), false);
});

test('時数0は未記入として扱う（0時間の単元は存在しない）', () => {
  assert.equal(isSheetComplete({ ...full, hours: 0 }), false);
});

test('参加児童が空の配列なら未記入', () => {
  assert.equal(isSheetComplete({ ...full, participants: [] }), false);
});

test('任意項目が空でも進める', () => {
  assert.equal(isSheetComplete({ ...full, ict: [], style: '', constraints: '' }), true);
});

test('不足はまとめて1回で尋ねる（1項目ずつにしない）', () => {
  const q = buildMissingQuestion({ ...full, subject: '', hours: 0 });
  assert.match(q, /2項目だけ確認/);
  assert.match(q, /教科/);
  assert.match(q, /授業時数/);
  // 番号つきで並ぶ＝1回の質問にまとまっている
  assert.match(q, /1\. /);
  assert.match(q, /2\. /);
});

test('不足が無ければ質問しない', () => {
  assert.equal(buildMissingQuestion(full), '');
});

test('要約には確定条件が入り、参加児童を落とさない', () => {
  const s = buildSheetSummary(full, 'かさ_2026-09');
  assert.match(s, /算数/);
  assert.match(s, /かさ（LとdL）/);
  assert.match(s, /A児・B児・D児/);
  assert.match(s, /6/);
  assert.match(s, /勝手に変えず/);
});

test('要約は長い記述を切り詰めても、全体が短いままである', () => {
  const long = 'あ'.repeat(2000);
  const s = buildSheetSummary(
    { ...full, teachingContent: long, competencies: long, pupils: long, constraints: long },
    'テスト'
  );
  // 毎回のプロンプトに載るので、伸びっぱなしにしない
  assert.ok(s.length < 900, `要約が長すぎる: ${s.length}`);
  assert.match(s, /…/);
});

test('未記入の欄は「（未記入）」と出る（もっともらしく埋めない）', () => {
  const s = buildSheetSummary({ ...EMPTY_SHEET }, '未確定');
  assert.match(s, /教科: （未記入）/);
});

test('保存用の依頼票には全項目が見出しつきで並ぶ', () => {
  const md = buildSheetMarkdown(full, 'かさ_2026-09');
  SHEET_FIELDS.forEach((f) => {
    assert.ok(md.includes(`## ${f.label}`), `${f.label} が無い`);
  });
  assert.match(md, /全部門がこの内容を見て作ります/);
});

import test from 'node:test';
import assert from 'node:assert/strict';

import { buildMissingQuestion, isSheetComplete, missingRequired } from './requirementSheet.ts';
import { EMPTY_SHEET } from './types.ts';
import type { RequirementSheet } from './types.ts';

/**
 * 会話から依頼票を埋めていく流れの確認。
 *
 * 実地でつまずいた点（2026-08-24）: 秘書室に「小3わり算導入・全4時間・対象D児F児」と
 * 話しかけても、案件を作る手段が無く「CEO が画面から作ってください」で止まっていた。
 * ここでは、その会話から取れる分だけを入れたときに、
 * **何が残るかを正しく数え、まとめて一度で尋ねられるか**を固定する。
 */

/** 実際の依頼文から読み取れる範囲。書かれていない欄は空のまま。 */
const fromFirstMessage: RequirementSheet = {
  ...EMPTY_SHEET,
  subject: '算数',
  grade: '3年',
  unitName: 'わり算の導入',
  hours: 4,
  participants: ['D児', 'F児']
};

test('最初のひとことでは、まだ確定できない', () => {
  assert.equal(isSheetComplete(fromFirstMessage), false);
});

test('最初のひとことで埋まる欄は、埋まったと数える', () => {
  const missing = missingRequired(fromFirstMessage).map((f) => f.key);
  for (const k of ['subject', 'grade', 'unitName', 'hours', 'participants']) {
    assert.ok(!missing.includes(k as any), `${k} は埋まっているはず`);
  }
});

test('残りは5項目で、まとめて一度に尋ねられる', () => {
  const missing = missingRequired(fromFirstMessage);
  assert.deepEqual(
    missing.map((f) => f.key),
    ['teachingContent', 'competencies', 'pupils', 'wantedOutputs', 'outputFormats']
  );

  const q = buildMissingQuestion(fromFirstMessage);
  assert.match(q, /5項目だけ確認/);
  missing.forEach((f) => assert.ok(q.includes(f.label), `${f.label} が質問に無い`));
});

test('答えを足していくと確定できるようになる', () => {
  const answered: RequirementSheet = {
    ...fromFirstMessage,
    teachingContent: '等分除の意味をつかむ',
    competencies: 'わり算の式に表せる',
    pupils: 'D児はかけ算の九九が未定着。F児は学年相当。',
    wantedOutputs: ['略案', '2段階のプリント'],
    outputFormats: ['print-html']
  };
  assert.equal(isSheetComplete(answered), true);
  assert.equal(buildMissingQuestion(answered), '');
});

test('部分的に答えても、残りだけを尋ね続ける', () => {
  const half: RequirementSheet = {
    ...fromFirstMessage,
    teachingContent: '等分除の意味をつかむ',
    competencies: 'わり算の式に表せる'
  };
  const q = buildMissingQuestion(half);
  assert.match(q, /3項目だけ確認/);
  assert.ok(!q.includes('指導したい内容'), '答え済みの項目を聞き直さない');
});

test('空文字で上書きしても、埋まった扱いにはならない', () => {
  const blanked = { ...fromFirstMessage, subject: '   ' };
  assert.ok(missingRequired(blanked).some((f) => f.key === 'subject'));
});

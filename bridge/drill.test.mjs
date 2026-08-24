/**
 * ドリル生成のテスト。`npm test` で実行（node:test。追加の依存なし）。
 *
 * ここが壊れると、児童に配るプリントの答えが間違う。生成が決定的であること、
 * 条件（繰り上がり・段の限定・割り切れる）が実際に守られていること、
 * 条件が厳しすぎるときに黙って埋めないことを固定する。
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { generateDrill, hasCarry, hasBorrow, drillToMarkdown, drillAnswersToMarkdown } from './drill.mjs';

test('繰り上がり・繰り下がりの判定', () => {
  assert.equal(hasCarry(7, 5), true);
  assert.equal(hasCarry(3, 4), false);
  assert.equal(hasCarry(18, 5), true);   // 一の位で繰り上がる
  assert.equal(hasBorrow(23, 8), true);
  assert.equal(hasBorrow(28, 3), false);
});

test('答えは必ず正しい', () => {
  const r = generateDrill({ kind: 'add', a: { min: 1, max: 20 }, b: { min: 1, max: 20 } }, 30, 1);
  assert.equal(r.problems.length, 30);
  for (const p of r.problems) assert.equal(p.a + p.b, p.answer);
});

test('繰り上がりありの指定が守られ、答えの上限も効く', () => {
  const r = generateDrill(
    { kind: 'add', a: { min: 1, max: 9 }, b: { min: 1, max: 9 }, carry: true, answerMax: 20, noZero: true },
    20, 42
  );
  assert.equal(r.problems.length, 20);
  for (const p of r.problems) {
    assert.ok(hasCarry(p.a, p.b));
    assert.ok(p.answer <= 20);
    assert.notEqual(p.a, 0);
  }
});

test('同じ問題が二度出ない', () => {
  const r = generateDrill({ kind: 'add', a: { min: 1, max: 9 }, b: { min: 1, max: 9 }, carry: true }, 20, 42);
  const seen = new Set(r.problems.map((p) => `${p.a}+${p.b}`));
  assert.equal(seen.size, r.problems.length);
});

test('seed が同じなら同じプリント、違えば変わる', () => {
  const spec = { kind: 'add', a: { min: 1, max: 9 }, b: { min: 1, max: 9 }, carry: true };
  assert.deepEqual(generateDrill(spec, 20, 42).problems, generateDrill(spec, 20, 42).problems);
  assert.notDeepEqual(generateDrill(spec, 20, 42).problems, generateDrill(spec, 20, 7).problems);
});

test('九九は指定した段だけになる', () => {
  const r = generateDrill({ kind: 'mul', a: { min: 1, max: 9 }, b: { min: 1, max: 9 }, tables: [2, 5] }, 12, 3);
  for (const p of r.problems) {
    assert.ok([2, 5].includes(p.b));
    assert.equal(p.a * p.b, p.answer);
  }
});

test('ひきざんは負にならず、繰り下がりなしを指定できる', () => {
  const r = generateDrill({ kind: 'sub', a: { min: 10, max: 99 }, b: { min: 1, max: 9 }, borrow: false }, 15, 9);
  for (const p of r.problems) {
    assert.ok(p.answer >= 0);
    assert.equal(hasBorrow(p.a, p.b), false);
    assert.equal(p.a - p.b, p.answer);
  }
});

test('わり算は割り切れるものだけ', () => {
  const r = generateDrill({ kind: 'div', a: { min: 1, max: 81 }, b: { min: 1, max: 9 } }, 10, 5);
  for (const p of r.problems) {
    assert.ok(Number.isInteger(p.answer));
    assert.equal(p.b * p.answer, p.a);
  }
});

test('条件が厳しすぎるときは黙って埋めず、足りないと伝える', () => {
  const r = generateDrill({ kind: 'add', a: { min: 1, max: 2 }, b: { min: 1, max: 2 }, carry: true }, 20, 1);
  assert.equal(r.problems.length, 0);
  assert.equal(r.shortfall, 20);
});

test('児童用プリントに答えは載らない', () => {
  const r = generateDrill({ kind: 'add', a: { min: 1, max: 9 }, b: { min: 1, max: 9 }, carry: true }, 6, 2);
  const sheet = drillToMarkdown(r, { title: 'たしざん', columns: 2 });
  for (const p of r.problems) assert.ok(!sheet.includes(`＝ ${p.answer}`));
  assert.ok(sheet.includes('なまえ'));

  const answers = drillAnswersToMarkdown(r, { title: 'たしざん' });
  for (const p of r.problems) assert.ok(answers.includes(`**${p.answer}**`));
});

test('未知の種類は拒否する', () => {
  assert.throws(() => generateDrill({ kind: 'pow' }, 5, 1), /未知の種類/);
});

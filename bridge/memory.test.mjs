/**
 * 記憶の追記ルールのテスト。
 *
 * ここが壊れると、同じ指摘が何度も溜まってプロンプトを圧迫するか、
 * 逆に担任の指摘が残らず「同じ直しを毎回させられる」ことになる。
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { mergeMemoryNote, MEMORY_MAX_NOTES } from './memory.mjs';

test('空の記憶に1件追記できる', () => {
  assert.equal(mergeMemoryNote('', 'プリントは1枚に収める'), '- プリントは1枚に収める\n');
});

test('既存の記憶の末尾に足す', () => {
  const before = '- プリントは1枚に収める\n';
  assert.equal(
    mergeMemoryNote(before, '実験の手順は5ステップまで'),
    '- プリントは1枚に収める\n- 実験の手順は5ステップまで\n'
  );
});

test('同じ指摘は増やさない（記法や空白の違いも同一とみなす）', () => {
  const before = '- プリントは1枚に収める\n';
  assert.equal(mergeMemoryNote(before, 'プリントは1枚に収める'), null);
  assert.equal(mergeMemoryNote(before, '- プリントは1枚に収める'), null);
  assert.equal(mergeMemoryNote(before, 'プリントは  1枚に  収める'), null);
});

test('空白だけの指摘は無視する', () => {
  assert.equal(mergeMemoryNote('- A\n', '   '), null);
  assert.equal(mergeMemoryNote('- A\n', ''), null);
});

test('改行を含む指摘は1行にまとめる', () => {
  assert.equal(mergeMemoryNote('', 'A児の分は\n絵を多く'), '- A児の分は 絵を多く\n');
});

test('上限を超えたら古いほうから落とす', () => {
  const before = Array.from({ length: MEMORY_MAX_NOTES }, (_, i) => `- 指摘${i}`).join('\n') + '\n';
  const after = mergeMemoryNote(before, '新しい指摘');
  const lines = after.split('\n').filter(Boolean);
  assert.equal(lines.length, MEMORY_MAX_NOTES);
  assert.equal(lines.at(-1), '- 新しい指摘');
  assert.equal(lines[0], '- 指摘1');          // 一番古いものが落ちている
  assert.ok(!after.includes('- 指摘0\n'));
});

test('担任が手で書いた見出しや箇条書きを壊さない', () => {
  const before = '# この学級での約束\n\n- プリントは1枚に収める\n';
  const after = mergeMemoryNote(before, '筆算はマス目つき');
  assert.ok(after.includes('# この学級での約束'));
  assert.ok(after.includes('- プリントは1枚に収める'));
  assert.ok(after.endsWith('- 筆算はマス目つき\n'));
});

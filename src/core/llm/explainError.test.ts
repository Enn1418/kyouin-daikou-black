/**
 * エラーの言い換えのテスト。
 *
 * ここが外れると、担任は「英語のJSON」か「見当違いの対処」を見せられる。
 * とくに復帰日時は、UTC のまま出すと**9時間ずれて、まだ使えないのに使えると思う**。
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { explainApiError } from './explainError.ts';

const USAGE_LIMIT =
  '400 {"type":"error","error":{"type":"invalid_request_error","message":"You have reached ' +
  'your specified API usage limits. You will regain access on 2026-09-01 at 00:00 UTC."},' +
  '"request_id":"req_011CeSenVy5yPaYeB2yPjrKQ"}';

test('利用上限は、意味と復帰日時を日本時間で伝える', () => {
  const e = explainApiError(USAGE_LIMIT);
  assert.match(e.title, /利用上限/);
  // 2026-09-01 00:00 UTC = 9月1日（火）09:00 JST
  assert.match(e.advice, /9月1日（火）09:00/);
  assert.match(e.advice, /console\.anthropic\.com/);
});

test('案件の上限額と混同しないよう、はっきり分けて書く', () => {
  assert.match(explainApiError(USAGE_LIMIT).advice, /依頼票の「この案件の上限額」とは別/);
});

test('原文は捨てずに残す', () => {
  assert.equal(explainApiError(USAGE_LIMIT).raw, USAGE_LIMIT);
});

test('よくあるエラーを見分ける', () => {
  const cases: [string, RegExp][] = [
    ['429 rate_limit_error: too many requests', /短い時間に呼びすぎ/],
    ['401 authentication_error: invalid x-api-key', /受け付けられませんでした/],
    ['403 permission_error: forbidden', /使えない操作/],
    ['529 overloaded_error', /混み合っています/],
    ['Your credit balance is too low to access the API', /残高が足りません/],
    ['TypeError: Failed to fetch', /通信できませんでした/],
    ['Claude API key is required', /設定されていません/],
    ['Gemini API key is required for image generation', /Gemini のキー/]
  ];
  for (const [raw, expected] of cases) {
    assert.match(explainApiError(raw).title, expected, `見分けられなかった: ${raw}`);
  }
});

test('心当たりのない形は、知ったかぶりせず原文に案内する', () => {
  const e = explainApiError('something entirely unexpected happened');
  assert.equal(e.title, 'エラーが起きました');
  assert.match(e.advice, /原文/);
  assert.equal(e.raw, 'something entirely unexpected happened');
});

test('復帰日時が読み取れなくても、対処だけは伝える', () => {
  const e = explainApiError('You have reached your specified API usage limits.');
  assert.match(e.title, /利用上限/);
  assert.match(e.advice, /月が変わると/);
});

import test from 'node:test';
import assert from 'node:assert/strict';

import { renderFigure, parseFigureSpec, FIGURE_TYPES } from './figures.mjs';

const countOf = (svg, tag) => (svg.match(new RegExp(`<${tag}\\b`, 'g')) || []).length;
/** 塗りつぶし（黒）の円だけ数える。枠線だけの円は数えない。 */
const filledCircles = (svg) => (svg.match(/<circle[^>]*fill="#000"[^>]*>/g) || []).length;

test('十マス: 指示した数だけ丸を置く', () => {
  const svg = renderFigure({ type: 'tenframe', count: '7' });
  assert.equal(filledCircles(svg), 7);
});

test('十マス: 10を超えたら枠が増え、数は合ったまま', () => {
  const svg = renderFigure({ type: 'tenframe', count: '13' });
  assert.equal(filledCircles(svg), 13);
  assert.equal(countOf(svg, 'rect'), 2, '13個なら十マスは2つ');
});

test('十マス: 0個でも枠は出る', () => {
  const svg = renderFigure({ type: 'tenframe', count: '0' });
  assert.equal(filledCircles(svg), 0);
  assert.equal(countOf(svg, 'rect'), 1);
});

test('ドット: 個数と列で行数が決まる', () => {
  const svg = renderFigure({ type: 'dots', count: '12', cols: '5' });
  assert.equal(filledCircles(svg), 12);
  assert.match(svg, /height="144"/, '5列12個なら3行');
});

test('数直線: 目もりの数は (max-min)/step + 1', () => {
  const svg = renderFigure({ type: 'numberline', min: '0', max: '10', step: '2' });
  // 軸1本 + 目もり6本
  assert.equal(countOf(svg, 'line'), 7);
  assert.match(svg, />10</);
});

test('数直線: marks は印、blanks は空欄の四角', () => {
  const svg = renderFigure({ type: 'numberline', min: '0', max: '10', marks: '3', blanks: '7' });
  assert.equal(filledCircles(svg), 1);
  assert.equal(countOf(svg, 'rect'), 1);
});

test('かさ: 入っている量は高さに比例する', () => {
  const half = renderFigure({ type: 'container', total: '10', filled: '5' });
  const full = renderFigure({ type: 'container', total: '10', filled: '10' });
  const h = (svg) => Number(svg.match(/<rect[^>]*height="([\d.]+)"[^>]*fill="#d0d0d0"/)[1]);
  assert.ok(Math.abs(h(full) - h(half) * 2) < 0.001, '10dLは5dLのちょうど2倍の高さ');
});

test('かさ: 入れ物より多い量は描かずに断る', () => {
  const svg = renderFigure({ type: 'container', total: '10', filled: '12' });
  assert.match(svg, /figure-error/);
});

test('時計: 針は2本、文字は1〜12', () => {
  const svg = renderFigure({ type: 'clock', hour: '3', minute: '15' });
  assert.match(svg, /aria-label="時計 3時15分"/);
  assert.match(svg, />12</);
  assert.match(svg, />1</);
});

test('時計: ありえない分は断る', () => {
  assert.match(renderFigure({ type: 'clock', hour: '3', minute: '75' }), /figure-error/);
});

test('テープ図: parts の数だけ区切る', () => {
  const svg = renderFigure({ type: 'tape', parts: '3,5', labels: '3こ,5こ', total: '8こ' });
  assert.equal(countOf(svg, 'rect'), 3, '2区切り + 合計ラベルの白抜き');
  assert.match(svg, />3こ</);
  assert.match(svg, />8こ</);
});

test('テープ図: 区切りの幅は比のとおり', () => {
  const svg = renderFigure({ type: 'tape', parts: '1,3' });
  const widths = [...svg.matchAll(/<rect x="[\d.]+" y="60" width="([\d.]+)"/g)].map((m) => Number(m[1]));
  assert.equal(widths.length, 2);
  assert.ok(Math.abs(widths[1] - widths[0] * 3) < 0.001);
});

test('分数: 塗られるのは分子の数だけ', () => {
  const svg = renderFigure({ type: 'fraction', numerator: '3', denominator: '4' });
  assert.equal((svg.match(/fill="#c8c8c8"/g) || []).length, 3);
  assert.equal(countOf(svg, 'rect'), 4);
});

test('分数: 分子が分母を超えたら断る', () => {
  assert.match(renderFigure({ type: 'fraction', numerator: '5', denominator: '4' }), /figure-error/);
});

test('お金: 実在しない額面は断る', () => {
  assert.match(renderFigure({ type: 'coins', values: '100,30' }), /figure-error/);
  assert.doesNotMatch(renderFigure({ type: 'coins', values: '100,50,10' }), /figure-error/);
});

test('方眼: 線の数は行数+列数+2', () => {
  const svg = renderFigure({ type: 'grid', rows: '3', cols: '4' });
  assert.equal(countOf(svg, 'line'), 4 + 5);
});

test('知らない種類は例外にせず、直せる注記を返す', () => {
  const svg = renderFigure({ type: 'ぞう' });
  assert.match(svg, /figure-error/);
  assert.match(svg, /使えるのは/);
  FIGURE_TYPES.forEach((t) => assert.match(svg, new RegExp(t)));
});

test('指示の読み取り: 全角コロンと余分な空白を許す', () => {
  const spec = parseFigureSpec('type：tenframe\n  count :  7 \nメモ: これは無視');
  assert.deepEqual(spec, { type: 'tenframe', count: '7' });
});

test('すべての種類が、最低限の指示で描ける', () => {
  const minimal = {
    tenframe: { count: 5 },
    dots: { count: 5 },
    numberline: {},
    container: { total: 10, filled: 3 },
    clock: { hour: 9 },
    tape: { parts: '2,3' },
    fraction: { numerator: 1, denominator: 2 },
    coins: { values: '100' },
    grid: {}
  };
  FIGURE_TYPES.forEach((type) => {
    const svg = renderFigure({ type, ...minimal[type] });
    assert.doesNotMatch(svg, /figure-error/, `${type} が描けない`);
    assert.match(svg, /^<svg /);
  });
});

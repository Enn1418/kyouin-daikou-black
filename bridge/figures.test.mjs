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
    grid: {},
    board: { columns: [{ items: [{ kind: 'text', text: 'めあて' }] }] }
  };
  FIGURE_TYPES.forEach((type) => {
    const svg = renderFigure({ type, ...minimal[type] });
    assert.doesNotMatch(svg, /figure-error/, `${type} が描けない`);
    assert.match(svg, /^<svg /);
  });
});

test('板書: 区画の幅は指示した比のとおり', () => {
  const svg = renderFigure({ type: 'board', columns: [{ width: 1, items: [] }, { width: 3, items: [] }] });
  // 区画の区切り線が1本入る位置で比が分かる
  const divider = svg.match(/<line x1="([\d.]+)" y1="\d+" x2="\1"/);
  assert.ok(divider, '区切り線が無い');
  const x = Number(divider[1]);
  assert.ok(Math.abs(x - (10 + 1180 / 4)) < 1, `区切りの位置がおかしい: ${x}`);
});

test('板書: 黒板の比は 3600×1200（3:1）に固定', () => {
  const svg = renderFigure({ type: 'board', columns: [{ items: [] }] });
  assert.match(svg, /viewBox="0 0 1200 400"/);
});

test('板書: 区画が無ければ描かずに断る', () => {
  assert.match(renderFigure({ type: 'board' }), /figure-error/);
  assert.match(renderFigure({ type: 'board', columns: [] }), /figure-error/);
});

test('板書: 区画が6つ以上なら断る', () => {
  const columns = Array.from({ length: 6 }, () => ({ items: [] }));
  assert.match(renderFigure({ type: 'board', columns }), /figure-error/);
});

test('板書: 学年で文字の大きさが変わる（低学年ほど大きい）', () => {
  const size = (grade) => {
    const svg = renderFigure({ type: 'board', grade, columns: [{ items: [{ kind: 'text', text: 'あ' }] }] });
    return Number(svg.match(/font-size="([\d.]+)"/)[1]);
  };
  assert.ok(size('低学年') > size('中学年'), '低学年の文字が中学年より小さい');
  assert.ok(size('中学年') > size('高学年'), '中学年の文字が高学年より小さい');
});

test('板書: 書ききれない量は「入りません」と出す', () => {
  const packed = { type: 'board', grade: '低学年', columns: [{ items: [{ kind: 'text', text: 'あ'.repeat(300) }] }] };
  assert.match(renderFigure(packed), /入りません/);

  // 同じ文字数でも、文字が小さい高学年なら収まる
  assert.doesNotMatch(renderFigure({ ...packed, grade: '高学年' }), /入りません/);
});

test('板書: 収まる量なら警告を出さない', () => {
  const svg = renderFigure({
    type: 'board',
    grade: '低学年',
    header: '8/25 かさ',
    columns: [
      { width: 2, items: [{ kind: 'label', text: 'めあて' }, { kind: 'box', frame: 'blue', text: 'くらべよう' }] },
      { width: 3, items: [{ kind: 'label', text: 'かんがえ' }, { kind: 'bubble', text: 'コップで' }] },
      { width: 2, items: [{ kind: 'label', text: 'まとめ' }, { kind: 'box', frame: 'red', text: '1L=10dL' }] }
    ]
  });
  assert.doesNotMatch(svg, /入りません/);
  assert.doesNotMatch(svg, /figure-error/);
});

test('板書: めあては青枠、まとめは赤枠（黒板の慣習に合わせる）', () => {
  const svg = renderFigure({
    type: 'board',
    columns: [
      { items: [{ kind: 'box', frame: 'blue', text: 'めあて' }] },
      { items: [{ kind: 'box', frame: 'red', text: 'まとめ' }] }
    ]
  });
  assert.match(svg, /stroke="#1D4ED8"/);
  assert.match(svg, /stroke="#DC2626"/);
});

test('板書: 区画の中に図を置ける', () => {
  const svg = renderFigure({
    type: 'board',
    columns: [{ items: [{ kind: 'figure', spec: { type: 'container', total: 10, filled: 3 } }] }]
  });
  assert.match(svg, /aria-label="かさ 3dL"/, '入れ子の図が無い');
  assert.match(svg, /<svg x=/, '入れ子の svg になっていない');
});

test('板書: 中に置けない図（板書の入れ子）は断る', () => {
  const svg = renderFigure({
    type: 'board',
    columns: [{ items: [{ kind: 'figure', spec: { type: 'board', columns: [] } }] }]
  });
  assert.match(svg, /図を描けません/);
});

test('図の指示は JSON でも書ける', () => {
  const spec = parseFigureSpec('{"type":"board","columns":[{"items":[]}]}');
  assert.equal(spec.type, 'board');
  assert.equal(spec.columns.length, 1);
});

test('JSON が壊れていたら、読めないと言う', () => {
  const spec = parseFigureSpec('{"type":"board",');
  assert.match(renderFigure(spec), /読めません/);
});

test('板書の中の図は、印刷用CSSに潰されない（class を外す）', () => {
  const svg = renderFigure({
    type: 'board',
    columns: [{ items: [{ kind: 'figure', spec: { type: 'tape', parts: '1,2' } }] }]
  });
  // 外側の svg だけが class="figure" を持つ。入れ子側が持つと height:auto で高さ0になる
  assert.equal((svg.match(/class="figure"/g) || []).length, 1);
});

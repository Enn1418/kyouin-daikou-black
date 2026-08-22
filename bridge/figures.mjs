/**
 * 教材に入れる図を、指示（型と数）から決定的に描く。
 *
 * ドリルの問題と同じ線引きで、「どの図を、どの数で出すか」はエージェントが決め、
 * 「実際に何個描くか」はここが決める。個数の合わない図は教材として成立しないため、
 * 絵を生成させるのではなく、指示された数をそのまま図形にする。
 *
 * 出力は白黒・太線の SVG。印刷して配ることが前提なので、色に意味を持たせない。
 */

import { renderBoard } from './board.mjs';

const STROKE = '#000';
const W = 3;               // 線の太さ。細いと印刷でかすれる
const INK = `fill="none" stroke="${STROKE}" stroke-width="${W}" stroke-linecap="round"`;
const FILL = `fill="${STROKE}" stroke="none"`;

const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function svg(width, height, body, label) {
  return (
    `<svg class="figure" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" ` +
    `xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${esc(label)}">${body}</svg>`
  );
}

const text = (x, y, s, size = 22, anchor = 'middle') =>
  `<text x="${x}" y="${y}" font-size="${size}" text-anchor="${anchor}" ` +
  `font-family="BIZ UDPGothic, Meiryo, sans-serif" fill="${STROKE}">${esc(s)}</text>`;

/** "3,5,8" → [3,5,8]。空白と全角読点も区切りとして扱う。 */
function numList(value) {
  if (value === undefined || value === '') return [];
  return String(value)
    .split(/[,、\s]+/)
    .filter(Boolean)
    .map(Number)
    .filter((n) => Number.isFinite(n));
}

function strList(value) {
  if (value === undefined || value === '') return [];
  return String(value).split(/[,、]/).map((s) => s.trim()).filter(Boolean);
}

function num(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function fail(message) {
  throw Object.assign(new Error(message), { figure: true });
}

/* ------------------------------------------------------------------ 図の種類 */

/** 十マス。数の合成分解と「あといくつで10」に使う。 */
function tenframe(p) {
  const count = num(p.count, null);
  if (count === null || count < 0) fail('tenframe には count（0以上の整数）が要ります');
  const capacity = Math.max(10, Math.ceil(count / 10) * 10);
  const frames = capacity / 10;
  if (frames > 4) fail('tenframe は40までにしてください');

  const cell = 46;
  const gap = 18;
  const width = cell * 5 + W;
  const height = (cell * 2 + gap) * frames - gap + W;
  const body = [];
  let placed = 0;

  for (let f = 0; f < frames; f++) {
    const top = f * (cell * 2 + gap) + W / 2;
    body.push(`<rect x="${W / 2}" y="${top}" width="${cell * 5}" height="${cell * 2}" ${INK}/>`);
    for (let c = 1; c < 5; c++) {
      const x = W / 2 + c * cell;
      body.push(`<line x1="${x}" y1="${top}" x2="${x}" y2="${top + cell * 2}" ${INK}/>`);
    }
    body.push(`<line x1="${W / 2}" y1="${top + cell}" x2="${W / 2 + cell * 5}" y2="${top + cell}" ${INK}/>`);

    for (let r = 0; r < 2; r++) {
      for (let c = 0; c < 5; c++) {
        if (placed >= count) break;
        body.push(
          `<circle cx="${W / 2 + c * cell + cell / 2}" cy="${top + r * cell + cell / 2}" r="${cell / 2 - 9}" ${FILL}/>`
        );
        placed++;
      }
    }
  }
  return svg(width, height, body.join(''), `十マス ${count}こ`);
}

/** 具体物の代わりのドット。数える活動に使う。 */
function dots(p) {
  const count = num(p.count, null);
  if (count === null || count < 0) fail('dots には count が要ります');
  if (count > 60) fail('dots は60個までにしてください');
  const cols = Math.max(1, num(p.cols, Math.min(10, count) || 1));
  const rows = Math.max(1, Math.ceil(count / cols));
  const step = 48;
  const r = 16;
  const body = [];
  for (let i = 0; i < count; i++) {
    const cx = (i % cols) * step + step / 2;
    const cy = Math.floor(i / cols) * step + step / 2;
    body.push(
      p.shape === 'square'
        ? `<rect x="${cx - r}" y="${cy - r}" width="${r * 2}" height="${r * 2}" ${FILL}/>`
        : `<circle cx="${cx}" cy="${cy}" r="${r}" ${FILL}/>`
    );
  }
  return svg(cols * step, rows * step, body.join(''), `${count}こ`);
}

/** 数直線。marks に印、blanks に空欄の四角を置く。 */
function numberline(p) {
  const min = num(p.min, 0);
  const max = num(p.max, 10);
  if (!(max > min)) fail('numberline は max > min にしてください');
  const step = num(p.step, 1);
  if (step <= 0) fail('numberline の step は正の数にしてください');
  const ticks = Math.round((max - min) / step);
  if (ticks > 40) fail('numberline の目もりが多すぎます（40まで）');

  const pad = 40;
  const span = 60 * ticks;
  const width = span + pad * 2;
  const height = 130;
  const y = 60;
  const at = (v) => pad + ((v - min) / (max - min)) * span;

  const body = [`<line x1="${pad - 20}" y1="${y}" x2="${pad + span + 20}" y2="${y}" ${INK}/>`];
  for (let i = 0; i <= ticks; i++) {
    const v = min + i * step;
    const x = at(v);
    body.push(`<line x1="${x}" y1="${y - 12}" x2="${x}" y2="${y + 12}" ${INK}/>`);
    body.push(text(x, y + 42, Number(v.toFixed(4))));
  }
  numList(p.marks).forEach((v) => {
    const x = at(v);
    body.push(`<circle cx="${x}" cy="${y}" r="11" ${FILL}/>`);
  });
  numList(p.blanks).forEach((v) => {
    const x = at(v);
    body.push(`<rect x="${x - 22}" y="${y + 20}" width="44" height="34" fill="#fff" stroke="${STROKE}" stroke-width="${W}"/>`);
  });
  return svg(width, height, body.join(''), `数直線 ${min}から${max}`);
}

/** かさの図。ますに目もりを入れ、入っている分を塗る。 */
function container(p) {
  const total = num(p.total, 10);          // 目もりいくつ分の入れ物か（1L = 10dL）
  const filled = num(p.filled, 0);
  const unit = p.unit || 'dL';
  if (total <= 0 || total > 20) fail('container の total は1〜20にしてください');
  if (filled < 0 || filled > total) fail('container の filled は0〜total にしてください');

  const width = 200;
  const height = 300;
  const top = 30;
  const bottom = 270;
  const left = 45;
  const right = 155;
  const per = (bottom - top) / total;
  const surface = bottom - per * filled;

  const body = [];
  if (filled > 0) {
    body.push(`<rect x="${left}" y="${surface}" width="${right - left}" height="${bottom - surface}" fill="#d0d0d0" stroke="none"/>`);
    body.push(`<line x1="${left}" y1="${surface}" x2="${right}" y2="${surface}" ${INK}/>`);
  }
  // 入れ物（上は開いている）
  body.push(`<path d="M ${left} ${top} L ${left} ${bottom} L ${right} ${bottom} L ${right} ${top}" ${INK}/>`);
  for (let i = 1; i <= total; i++) {
    const y = bottom - per * i;
    const long = i === total || i % 5 === 0;
    body.push(`<line x1="${left}" y1="${y}" x2="${left + (long ? 34 : 20)}" y2="${y}" ${INK}/>`);
    if (long) body.push(text(right + 8, y + 8, `${i}${unit}`, 20, 'start'));
  }
  return svg(width + 60, height, body.join(''), `かさ ${filled}${unit}`);
}

/** アナログ時計。 */
function clock(p) {
  const hour = num(p.hour, null);
  const minute = num(p.minute, 0);
  if (hour === null) fail('clock には hour が要ります');
  if (minute < 0 || minute > 59) fail('clock の minute は0〜59にしてください');

  const size = 260;
  const c = size / 2;
  const r = c - 12;
  const body = [`<circle cx="${c}" cy="${c}" r="${r}" ${INK}/>`];

  for (let m = 0; m < 60; m++) {
    const a = (m / 60) * Math.PI * 2 - Math.PI / 2;
    const outer = r - 4;
    const inner = m % 5 === 0 ? r - 20 : r - 12;
    body.push(
      `<line x1="${c + Math.cos(a) * inner}" y1="${c + Math.sin(a) * inner}" ` +
      `x2="${c + Math.cos(a) * outer}" y2="${c + Math.sin(a) * outer}" ` +
      `stroke="${STROKE}" stroke-width="${m % 5 === 0 ? W : 1.5}" stroke-linecap="round"/>`
    );
  }
  for (let h = 1; h <= 12; h++) {
    const a = (h / 12) * Math.PI * 2 - Math.PI / 2;
    body.push(text(c + Math.cos(a) * (r - 40), c + Math.sin(a) * (r - 40) + 9, h, 24));
  }
  const ha = ((((hour % 12) + minute / 60) / 12) * Math.PI * 2) - Math.PI / 2;
  const ma = ((minute / 60) * Math.PI * 2) - Math.PI / 2;
  body.push(`<line x1="${c}" y1="${c}" x2="${c + Math.cos(ha) * (r * 0.5)}" y2="${c + Math.sin(ha) * (r * 0.5)}" stroke="${STROKE}" stroke-width="8" stroke-linecap="round"/>`);
  body.push(`<line x1="${c}" y1="${c}" x2="${c + Math.cos(ma) * (r * 0.75)}" y2="${c + Math.sin(ma) * (r * 0.75)}" stroke="${STROKE}" stroke-width="5" stroke-linecap="round"/>`);
  body.push(`<circle cx="${c}" cy="${c}" r="7" ${FILL}/>`);
  return svg(size, size, body.join(''), `時計 ${hour}時${minute}分`);
}

/** テープ図。parts の比で区切り、labels を中に書く。 */
function tape(p) {
  const parts = numList(p.parts);
  if (parts.length < 1) fail('tape には parts（例 parts: 3,5）が要ります');
  if (parts.some((v) => v <= 0)) fail('tape の parts は正の数にしてください');
  const labels = strList(p.labels);
  const sum = parts.reduce((a, b) => a + b, 0);

  const width = 620;
  const barTop = 60;
  const barHeight = 76;
  const body = [];
  let x = 10;
  parts.forEach((v, i) => {
    const w = ((width - 20) * v) / sum;
    body.push(`<rect x="${x}" y="${barTop}" width="${w}" height="${barHeight}" ${INK}/>`);
    body.push(text(x + w / 2, barTop + barHeight / 2 + 9, labels[i] !== undefined ? labels[i] : v, 24));
    x += w;
  });
  if (p.total !== undefined && p.total !== '') {
    body.push(`<line x1="10" y1="34" x2="${width - 10}" y2="34" ${INK}/>`);
    body.push(`<line x1="10" y1="34" x2="10" y2="${barTop}" ${INK}/>`);
    body.push(`<line x1="${width - 10}" y1="34" x2="${width - 10}" y2="${barTop}" ${INK}/>`);
    body.push(`<rect x="${width / 2 - 60}" y="10" width="120" height="34" fill="#fff" stroke="none"/>`);
    body.push(text(width / 2, 34, String(p.total), 24));
  }
  return svg(width, barTop + barHeight + 20, body.join(''), 'テープ図');
}

/** 分数。帯か円。 */
function fraction(p) {
  const den = num(p.denominator, null);
  const nume = num(p.numerator, 0);
  if (!den || den < 1 || den > 12) fail('fraction の denominator は1〜12にしてください');
  if (nume < 0 || nume > den) fail('fraction の numerator は0〜denominator にしてください');

  if (p.shape === 'circle') {
    const size = 240;
    const c = size / 2;
    const r = c - 12;
    const body = [];
    for (let i = 0; i < den; i++) {
      const a0 = (i / den) * Math.PI * 2 - Math.PI / 2;
      const a1 = ((i + 1) / den) * Math.PI * 2 - Math.PI / 2;
      const large = (a1 - a0) > Math.PI ? 1 : 0;
      const d = `M ${c} ${c} L ${c + Math.cos(a0) * r} ${c + Math.sin(a0) * r} ` +
        `A ${r} ${r} 0 ${large} 1 ${c + Math.cos(a1) * r} ${c + Math.sin(a1) * r} Z`;
      body.push(`<path d="${d}" fill="${i < nume ? '#c8c8c8' : '#fff'}" stroke="${STROKE}" stroke-width="${W}"/>`);
    }
    return svg(size, size, body.join(''), `${nume}/${den}`);
  }

  const width = 560;
  const height = 96;
  const cell = (width - 20) / den;
  const body = [];
  for (let i = 0; i < den; i++) {
    body.push(
      `<rect x="${10 + i * cell}" y="10" width="${cell}" height="${height - 20}" ` +
      `fill="${i < nume ? '#c8c8c8' : '#fff'}" stroke="${STROKE}" stroke-width="${W}"/>`
    );
  }
  return svg(width, height, body.join(''), `${nume}/${den}`);
}

/** お金。硬貨・紙幣を額面つきの図形で並べる。 */
function coins(p) {
  const values = numList(p.values);
  if (!values.length) fail('coins には values（例 values: 100,50,10）が要ります');
  if (values.length > 20) fail('coins は20枚までにしてください');
  const allowed = new Set([1, 5, 10, 50, 100, 500, 1000, 5000, 10000]);
  const bad = values.find((v) => !allowed.has(v));
  if (bad !== undefined) fail(`coins に使えない額面があります: ${bad}`);

  const step = 96;
  const cols = Math.min(6, values.length);
  const rows = Math.ceil(values.length / cols);
  const body = [];
  values.forEach((v, i) => {
    const cx = (i % cols) * step + step / 2;
    const cy = Math.floor(i / cols) * step + step / 2;
    if (v >= 1000) {
      body.push(`<rect x="${cx - 42}" y="${cy - 26}" width="84" height="52" ${INK}/>`);
    } else {
      body.push(`<circle cx="${cx}" cy="${cy}" r="${v >= 100 ? 38 : 32}" ${INK}/>`);
    }
    body.push(text(cx, cy + 9, `${v}円`, v >= 1000 ? 20 : 22));
  });
  return svg(cols * step, rows * step, body.join(''), 'お金');
}

/** 方眼。筆算の桁そろえや作図に使う。 */
function grid(p) {
  const rows = num(p.rows, 4);
  const cols = num(p.cols, 6);
  if (rows < 1 || cols < 1 || rows > 20 || cols > 20) fail('grid の rows / cols は1〜20にしてください');
  const cell = num(p.cell, 48);
  const body = [];
  for (let r = 0; r <= rows; r++) {
    body.push(`<line x1="${W / 2}" y1="${W / 2 + r * cell}" x2="${W / 2 + cols * cell}" y2="${W / 2 + r * cell}" ${INK}/>`);
  }
  for (let c = 0; c <= cols; c++) {
    body.push(`<line x1="${W / 2 + c * cell}" y1="${W / 2}" x2="${W / 2 + c * cell}" y2="${W / 2 + rows * cell}" ${INK}/>`);
  }
  return svg(cols * cell + W, rows * cell + W, body.join(''), `方眼 ${rows}×${cols}`);
}


/**
 * 板書計画。中身は bridge/board.mjs（分量の判定まで含むので独立させた）。
 * 区画の中に図を置けるよう、図を描く関数を渡す。
 */
function board(p) {
  const { svg } = renderBoard(p, embedFigure);
  return svg;
}

/** 板書の区画にはめ込む図。縦横比も返す（枠の高さを決めるのに要る）。 */
function embedFigure(spec) {
  const draw = FIGURES[String(spec.type || '').trim()];
  if (!draw || spec.type === 'board') return null;
  try {
    const svgText = draw(spec);
    const box = svgText.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/);
    if (!box) return null;
    return { svg: svgText, ratio: Number(box[1]) / Number(box[2]) };
  } catch {
    return null;
  }
}

const FIGURES = { tenframe, dots, numberline, container, clock, tape, fraction, coins, grid, board };

export const FIGURE_TYPES = Object.keys(FIGURES);

/**
 * `key: value` の行から図を描く。
 *
 * 未対応の種類や指示の誤りは、例外にせず枠つきの注記として返す。
 * プリント全体が消えるより、その1か所が「直してください」と分かるほうがよい。
 */
export function renderFigure(spec) {
  const type = String(spec.type || '').trim();
  if (type === '__parse_error__') {
    return note(`図の指示（JSON）が読めません: ${spec.message}`);
  }
  const draw = FIGURES[type];
  if (!draw) {
    return note(`図の種類「${type || '(未指定)'}」は使えません。使えるのは: ${FIGURE_TYPES.join(' / ')}`);
  }
  try {
    return draw(spec);
  } catch (e) {
    return note(`図を描けません: ${e.message}`);
  }
}

function note(message) {
  return `<div class="figure-error">${esc(message)}</div>`;
}

/** ```図 ブロックの中身（key: value 行）を読む。 */
export function parseFigureSpec(bodyText) {
  const raw = String(bodyText).trim();

  // 板書のように入れ子のある指示は JSON で書く。単純な図は「種類: 値」のまま。
  if (raw.startsWith('{')) {
    try {
      return JSON.parse(raw);
    } catch (e) {
      return { type: '__parse_error__', message: e.message };
    }
  }

  const spec = {};
  raw.split('\n').forEach((line) => {
    const m = line.match(/^\s*([A-Za-z_]+)\s*[:：]\s*(.*)$/);
    if (m) spec[m[1].toLowerCase()] = m[2].trim();
  });
  return spec;
}

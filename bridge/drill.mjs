/**
 * 反復ドリルの決定的な生成。
 *
 * 設計の線引き（docs/teacher-edition-design.md §8-12）:
 *   文章・構成・段階づけは LLM、数値の量産と正誤は決定的なコード。
 * LLM に計算問題を並べさせると、遅く・高く・答えを間違える。ここでは
 * 「型（出題条件）」を受け取り、条件を満たす組み合わせを列挙して選ぶ。
 *
 * 候補は棄却サンプリングではなく全列挙して絞り込む。条件が厳しくても
 * 無限ループにならず、足りなければ足りないと言えるため。
 */

/** 列挙する候補の上限。これを超える範囲指定は先頭から打ち切る。 */
const MAX_CANDIDATES = 200000;

/** seed から決まる擬似乱数（同じ seed なら同じプリントになる）。 */
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const digits = (n) => String(Math.abs(n)).split('').reverse().map(Number);

/** 繰り上がりがあるか（どこかの桁で和が10以上になるか）。 */
export function hasCarry(a, b) {
  const da = digits(a);
  const db = digits(b);
  let carry = 0;
  for (let i = 0; i < Math.max(da.length, db.length); i++) {
    const sum = (da[i] || 0) + (db[i] || 0) + carry;
    if (sum >= 10) { carry = 1; return true; }
    carry = 0;
  }
  return false;
}

/** 繰り下がりがあるか（どこかの桁で引かれる数が小さいか）。 */
export function hasBorrow(a, b) {
  const da = digits(a);
  const db = digits(b);
  let borrow = 0;
  for (let i = 0; i < da.length; i++) {
    const top = da[i] - borrow;
    const bottom = db[i] || 0;
    if (top < bottom) { borrow = 1; return true; }
    borrow = 0;
  }
  return false;
}

const OPERATORS = { add: '+', sub: '−', mul: '×', div: '÷' };

function compute(kind, a, b) {
  switch (kind) {
    case 'add': return a + b;
    case 'sub': return a - b;
    case 'mul': return a * b;
    case 'div': return a / b;
    default: throw new Error(`未知の種類です: ${kind}`);
  }
}

/**
 * 条件を満たす問題を列挙して、seed 順に count 問選ぶ。
 * 返す answer は実際に計算した値なので、定義上ずれない。
 */
export function generateDrill(spec = {}, count = 20, seed = 1) {
  const kind = spec.kind || 'add';
  if (!OPERATORS[kind]) throw Object.assign(new Error(`未知の種類です: ${kind}`), { status: 400 });

  const a = { min: 1, max: 9, ...(spec.a || {}) };
  const b = { min: 1, max: 9, ...(spec.b || {}) };
  if (a.min > a.max || b.min > b.max) {
    throw Object.assign(new Error('範囲の指定が逆になっています'), { status: 400 });
  }

  const candidates = [];
  let examined = 0;

  outer:
  for (let x = a.min; x <= a.max; x++) {
    for (let y = b.min; y <= b.max; y++) {
      if (++examined > MAX_CANDIDATES) break outer;

      if (spec.noZero && (x === 0 || y === 0)) continue;
      if (kind === 'div' && y === 0) continue;
      if (kind === 'div' && spec.exact !== false && x % y !== 0) continue;
      if (kind === 'sub' && !spec.allowNegative && x < y) continue;
      if (kind === 'mul' && Array.isArray(spec.tables) && spec.tables.length && !spec.tables.includes(y)) continue;

      if (kind === 'add' && spec.carry === true && !hasCarry(x, y)) continue;
      if (kind === 'add' && spec.carry === false && hasCarry(x, y)) continue;
      if (kind === 'sub' && spec.borrow === true && !hasBorrow(x, y)) continue;
      if (kind === 'sub' && spec.borrow === false && hasBorrow(x, y)) continue;

      const answer = compute(kind, x, y);
      if (spec.answerMax !== undefined && answer > spec.answerMax) continue;
      if (spec.answerMin !== undefined && answer < spec.answerMin) continue;

      candidates.push({ a: x, b: y, answer });
    }
  }

  // seed に従って混ぜ、先頭から取る（重複なし）
  const rng = mulberry32(seed);
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }

  const problems = candidates.slice(0, count);
  return {
    kind,
    operator: OPERATORS[kind],
    seed,
    requested: count,
    available: candidates.length,
    problems,
    // 条件が厳しすぎて足りないときは黙って埋めず、そう伝える
    shortfall: problems.length < count ? count - problems.length : 0
  };
}

/** 児童用プリント（答えは載せない）。 */
export function drillToMarkdown(result, { title, columns = 2 } = {}) {
  const lines = [`# ${title || '計算れんしゅう'}`, '', 'なまえ （　　　　　　　　　　）', ''];
  const cols = Math.max(1, Math.min(4, columns));
  const cells = result.problems.map((p, i) => `(${i + 1})　${p.a} ${result.operator} ${p.b} ＝`);

  lines.push(`|${' 　 |'.repeat(cols)}`);
  lines.push(`|${'---|'.repeat(cols)}`);
  for (let i = 0; i < cells.length; i += cols) {
    const row = cells.slice(i, i + cols);
    while (row.length < cols) row.push('');
    lines.push(`| ${row.join(' | ')} |`);
  }
  if (result.shortfall) {
    lines.push('', `[レイアウト] 条件に合う問題が ${result.problems.length} 問しか作れませんでした（要求 ${result.requested} 問）。条件をゆるめてください。`);
  }
  return lines.join('\n') + '\n';
}

/** 教員用の解答（別ファイルにする。児童用に混ぜない）。 */
export function drillAnswersToMarkdown(result, { title } = {}) {
  const lines = [`# ${title || '計算れんしゅう'}　解答`, ''];
  result.problems.forEach((p, i) => {
    lines.push(`(${i + 1}) ${p.a} ${result.operator} ${p.b} ＝ **${p.answer}**`);
  });
  lines.push('', `（seed: ${result.seed} — 同じ seed なら同じ問題が出ます）`);
  return lines.join('\n') + '\n';
}

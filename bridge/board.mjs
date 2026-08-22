/**
 * 板書計画を描く。
 *
 * 前の版は「区画に見出しを置いた帯」で、板書計画として使いものにならなかった。
 * 調べたところ、板書計画に要るのは次のものだった:
 *
 *   - 1時間の流れが1枚に残ること（途中で消さない）
 *   - 単元名・学習問題・めあて・児童の考え・まとめ・振り返り
 *   - めあては青枠、まとめは赤枠。強調は黄。赤い文字は見えにくいので使わない
 *   - 文字の大きさは学年で決まる（低学年 12cm角 / 中学年 10cm / 高学年 8cm）
 *   - 特支では、めあてカードや考えカードとして「カード化」する
 *
 * 最後の2つが、コードで引き受けるべきところ。12cm角の文字なら 1200mm の黒板に
 * 縦10行しか入らない。入りきるかどうかは数えれば分かるので、
 * 「書ききれない板書計画」を黙って出さないようにする。
 *
 * 出典（2026-08-22 に確認）:
 *   https://edulo.jp/bansyo-pointo/
 *   https://www.pref.kagawa.lg.jp/documents/14668/12-13bansyo.pdf
 *   https://www.meijitosho.co.jp/eduzine/opinion/?id=20130390
 */

/** 黒板 3600 × 1200mm を 1px = 3mm で描く。 */
export const BOARD_W = 1200;
export const BOARD_H = 400;
const MM = BOARD_W / 3600;          // mm → px

/** 学年ごとの文字の大きさ（1文字の1辺 mm）。 */
const CHAR_MM = { 低学年: 120, 中学年: 100, 高学年: 80 };
const DEFAULT_GRADE = '低学年';

const INK = '#111';
const FRAME = { blue: '#1D4ED8', red: '#DC2626', yellow: '#CA8A04', none: INK };

const PAD = 10;
const GAP = 10;

const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** 日本語は語の切れ目が無いので字数で折る。改行と「/」は明示の改行として扱う。 */
function wrap(sentence, perLine) {
  const out = [];
  // JSON に literal な \n を書いてしまうことがあるので、それも改行として扱う
  String(sentence).replace(/\\n/g, '\n').split(/[\n/｜|]/).forEach((chunk) => {
    let line = '';
    for (const ch of chunk) {
      line += ch;
      if (line.length >= perLine) { out.push(line); line = ''; }
    }
    if (line) out.push(line);
  });
  return out.length ? out : [''];
}

function textEl(x, y, s, size, opts = {}) {
  const weight = opts.bold ? ' font-weight="700"' : '';
  const anchor = opts.anchor || 'middle';
  return (
    `<text x="${x}" y="${y}" font-size="${size}" text-anchor="${anchor}"${weight} ` +
    `font-family="BIZ UDPGothic, Meiryo, sans-serif" fill="${opts.fill || INK}">${esc(s)}</text>`
  );
}

/* --------------------------------------------------------------- 部品の描画 */

/**
 * 部品ひとつを描く。高さを先に決めてから中身を置く。
 * 返り値は { height, svg }。
 */
function renderItem(item, width, font, embed, available) {
  const kind = item.kind || 'text';
  const lineH = font * 1.35;
  const inner = width - PAD * 2;

  if (kind === 'figure') {
    // 図は区画の幅いっぱいに置くが、黒板からはみ出すなら残りの高さに収める。
    // 図が大きすぎるだけで「入りません」と言われても、担任には直しようがない。
    const drawn = embed(item.spec || {});
    if (!drawn) return { height: font, svg: textEl(width / 2, font, '（図を描けません）', font * 0.7, { fill: '#DC2626' }) };
    let h = inner / drawn.ratio;
    let w = inner;
    if (available > 0 && h > available - 2) {
      h = Math.max(1, available - 2);
      w = h * drawn.ratio;
    }
    return {
      height: Math.round(h),
      svg: nestSvg(drawn.svg, (width - w) / 2, 0, Math.round(w), Math.round(h))
    };
  }

  if (kind === 'label') {
    // 区画の見出し。黒板では白チョークの見出しにあたる
    return {
      height: font * 1.2,
      svg:
        `<rect x="0" y="0" width="${width}" height="${font * 1.2}" fill="#EFEFEF" stroke="none"/>` +
        textEl(width / 2, font * 0.95, item.text || '', font * 0.85, { bold: true })
    };
  }

  const perLine = Math.max(2, Math.floor(inner / font));
  const lines = wrap(item.text || '', perLine);
  const bodyH = lines.length * lineH;

  if (kind === 'bubble') {
    // 児童の考え。カードとして丸みのある枠にし、下に小さな尻尾を付ける
    const h = bodyH + PAD * 2;
    const tail = 10;
    return {
      height: h + tail,
      svg:
        `<rect x="${PAD / 2}" y="0" width="${width - PAD}" height="${h}" rx="${h / 4}" ` +
        `fill="#fff" stroke="${INK}" stroke-width="2"/>` +
        `<path d="M ${width / 2 - 9} ${h} L ${width / 2} ${h + tail} L ${width / 2 + 9} ${h} Z" ` +
        `fill="#fff" stroke="${INK}" stroke-width="2"/>` +
        lines.map((l, i) => textEl(width / 2, PAD + font + i * lineH, l, font)).join('')
    };
  }

  if (kind === 'box' || kind === 'card') {
    const frame = FRAME[item.frame] || INK;
    const h = bodyH + PAD * 2;
    return {
      height: h,
      svg:
        `<rect x="${PAD / 2}" y="0" width="${width - PAD}" height="${h}" ` +
        `fill="#fff" stroke="${frame}" stroke-width="${kind === 'box' ? 4 : 2}"/>` +
        lines.map((l, i) => textEl(width / 2, PAD + font + i * lineH, l, font, { bold: kind === 'box' })).join('')
    };
  }

  // 素の文字
  return {
    height: bodyH,
    svg: lines.map((l, i) => textEl(width / 2, font + i * lineH, l, font)).join('')
  };
}

/**
 * 図の SVG を、指定した枠にはめ込む（入れ子の svg にする）。
 *
 * class="figure" は外す。印刷用 CSS の `.figure { height: auto }` が
 * 入れ子の svg にも効いてしまい、図が高さ0に潰れる。
 */
function nestSvg(svgText, x, y, width, height) {
  return svgText
    .replace(/\sclass="figure"/, '')
    .replace(/^<svg /, `<svg x="${x}" y="${y}" preserveAspectRatio="xMidYMid meet" `)
    .replace(/\swidth="[\d.]+"/, ` width="${width}"`)
    .replace(/\sheight="[\d.]+"/, ` height="${height}"`);
}

/* --------------------------------------------------------------- 本体 */

/**
 * @param spec  { grade, header, columns: [{ width, items: [...] }], arrows }
 * @param embed 図を描く関数。{ svg, ratio } を返すか、描けなければ null
 */
export function renderBoard(spec, embed) {
  const columns = Array.isArray(spec.columns) ? spec.columns : [];
  if (!columns.length) {
    throw Object.assign(new Error('board には columns（区画）が要ります'), { figure: true });
  }
  if (columns.length > 5) {
    throw Object.assign(new Error('board の区画は5つまでにしてください（黒板に入りません）'), { figure: true });
  }

  const grade = CHAR_MM[spec.grade] ? spec.grade : DEFAULT_GRADE;
  const font = CHAR_MM[grade] * MM;            // 1文字の大きさ（px）
  const headerH = spec.header ? font * 0.8 : 0;
  const top = PAD + headerH;
  const usable = BOARD_H - top - PAD;

  const ratio = columns.map((c) => (Number(c.width) > 0 ? Number(c.width) : 1));
  const sum = ratio.reduce((a, b) => a + b, 0);

  const body = [
    `<rect x="0" y="0" width="${BOARD_W}" height="${BOARD_H}" fill="#fff" stroke="${INK}" stroke-width="4"/>`
  ];
  if (spec.header) {
    body.push(textEl(PAD * 2, PAD + font * 0.7, spec.header, font * 0.7, { anchor: 'start' }));
    body.push(`<line x1="${PAD}" y1="${top - 4}" x2="${BOARD_W - PAD}" y2="${top - 4}" stroke="${INK}" stroke-width="1.5"/>`);
  }

  const overflow = [];
  let x = PAD;
  columns.forEach((column, ci) => {
    const w = ((BOARD_W - PAD * 2) * ratio[ci]) / sum;
    if (ci > 0) {
      body.push(`<line x1="${x}" y1="${top}" x2="${x}" y2="${BOARD_H - PAD}" stroke="#BBB" stroke-width="1.5" stroke-dasharray="7 6"/>`);
    }

    let y = top;
    (column.items || []).forEach((item) => {
      const drawn = renderItem(item, w, font, embed, top + usable - y);
      body.push(`<g transform="translate(${x}, ${y})">${drawn.svg}</g>`);
      y += drawn.height + GAP;
    });
    // 最後の部品のうしろの余白は数えない（それで溢れた扱いになるのは嘘）
    const used = Math.max(0, y - top - GAP);
    // 端数で「0mm 入りません」と言われても直しようがないので、少しの超過は見逃す
    if (used > usable + 2) overflow.push({ x, w, over: Math.round((used - usable) / MM) });
    x += w;
  });

  // 入りきらない区画は黙って出さない。どこがどれだけ溢れたかを示す
  overflow.forEach((o) => {
    body.push(
      `<rect x="${o.x}" y="${top}" width="${o.w}" height="${BOARD_H - top - PAD}" ` +
      `fill="none" stroke="#DC2626" stroke-width="4" stroke-dasharray="10 8"/>`
    );
    body.push(textEl(o.x + o.w / 2, BOARD_H - PAD - 6, `${o.over}mm 分 入りません`, font * 0.55, { fill: '#DC2626', bold: true }));
  });

  const label = `板書計画（${grade}・3600×1200mm）`;
  return {
    svg:
      `<svg class="figure" viewBox="0 0 ${BOARD_W} ${BOARD_H}" width="${BOARD_W}" height="${BOARD_H}" ` +
      `xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${esc(label)}">${body.join('')}</svg>`,
    overflow: overflow.length > 0
  };
}

export const BOARD_GRADES = Object.keys(CHAR_MM);

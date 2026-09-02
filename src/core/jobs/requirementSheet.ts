/**
 * 依頼票の検査と要約。
 *
 * 「必須項目が埋まっているか」の判定は**機械的に行う**。
 * LLM に「足りているか確かめて」と頼むと、確率的に見落として制作が始まってしまう。
 * 見落としが起きると教材が別の条件で作られ、CEO が気づくのは出てきた後になる。
 *
 * 要約（buildSheetSummary）は全部門のプロンプト先頭に同じ文面で入る。
 * 部門ごとに違う要約を作らないのは、それが「方針のぶれ」そのものだから。
 */
import { caseFolderPath } from './folderName.ts';
import { OUTPUT_FORMAT_LABEL, SHEET_FIELDS } from './types.ts';
import type { RequirementSheet, SheetField } from './types.ts';

/** その項目が「埋まっている」か。空白だけ・0・空配列は未記入として扱う。 */
export function isFilled(sheet: RequirementSheet, key: keyof RequirementSheet): boolean {
  const v = sheet[key];
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === 'number') return v > 0;
  if (typeof v === 'string') return v.trim().length > 0;
  return false;
}

/** 未記入の必須項目。空配列なら制作へ進める。 */
export function missingRequired(sheet: RequirementSheet): SheetField[] {
  return SHEET_FIELDS.filter((f) => f.required && !isFilled(sheet, f.key));
}

export function isSheetComplete(sheet: RequirementSheet): boolean {
  return missingRequired(sheet).length === 0;
}

/**
 * 不足項目を尋ねる文。
 *
 * **1項目ずつ聞かない。** 何度も往復すると CEO の負担が大きく、
 * 「聞かれるのが面倒だから適当に答える」を招く。まとめて出して一度で埋めてもらう。
 */
export function buildMissingQuestion(sheet: RequirementSheet): string {
  const missing = missingRequired(sheet);
  if (missing.length === 0) return '';
  const lines = missing.map((f, i) => `${i + 1}. ${f.label}（${f.hint}）`);
  return `制作を始める前に、${missing.length}項目だけ確認させてください。\n${lines.join('\n')}`;
}

function listOrDash(v: string[]): string {
  return v.length ? v.join('・') : '（未記入）';
}

function textOrDash(v: string): string {
  return v.trim() ? v.trim() : '（未記入）';
}

/** 長い自由記述は要約枠に収める。切るときは切ったと分かるようにする。 */
function clip(v: string, max: number): string {
  const t = v.trim().replace(/\s*\n\s*/g, ' ');
  if (!t) return '（未記入）';
  return t.length <= max ? t : `${t.slice(0, max)}…`;
}

/**
 * 全部門のプロンプト先頭に入る要約。
 *
 * 毎回のリクエストに載るので**短くする**。詳細が要る担当は依頼票の全文を
 * 教材フォルダから読める（04_案件/<案件名>/依頼票.md）。
 */
export function buildSheetSummary(sheet: RequirementSheet, jobTitle?: string): string {
  const formats = sheet.outputFormats.length
    ? sheet.outputFormats.map((f) => OUTPUT_FORMAT_LABEL[f].split('（')[0]).join('・')
    : '（未記入）';

  const lines = [
    `【この案件の条件（確定済み・勝手に変えない）】${jobTitle ? ` ${jobTitle}` : ''}`,
    `教科: ${textOrDash(sheet.subject)} ／ 学年: ${textOrDash(sheet.grade)} ／ 単元: ${textOrDash(sheet.unitName)} ／ 時数: ${sheet.hours || '（未記入）'}`,
    `参加児童: ${listOrDash(sheet.participants)}`,
    `指導したい内容: ${clip(sheet.teachingContent, 120)}`,
    `身につけさせたい力: ${clip(sheet.competencies, 120)}`,
    `児童の実態: ${clip(sheet.pupils, 120)}`,
    `希望する成果物: ${listOrDash(sheet.wantedOutputs)} ／ 出力形式: ${formats}`
  ];

  // 活動のイメージは、あれば必ず載せる。授業の絵が浮かぶかどうかがここで決まる
  if (sheet.activityImage.trim()) {
    lines.push(`やりたい活動のイメージ: ${clip(sheet.activityImage, 160)}`);
  }
  if (sheet.ict.length) lines.push(`使えるICT・教材: ${listOrDash(sheet.ict)}`);
  if (sheet.style.trim()) lines.push(`出力スタイル: ${clip(sheet.style, 80)}`);
  if (sheet.constraints.trim()) lines.push(`制約・希望: ${clip(sheet.constraints, 120)}`);

  // 教材フォルダが使えるときの保存先。ここで一度だけ決め、全部門に同じ場所を使わせる。
  // 部屋ごとにばらばらの場所へ保存すると、教材フォルダがすぐ煩雑になる
  if (jobTitle) {
    lines.push(`保存先: ${caseFolderPath(jobTitle)}/ の下（例: .../01_教材/、.../02_板書/、.../03_掲示物/）`);
  }

  lines.push(
    '条件が児童の実態と噛み合わないと判断したときは、**勝手に変えず秘書室に申し出る**。'
  );

  return lines.join('\n');
}

/** 教材フォルダに保存する依頼票（全文）。CEO が直接開いて直せる形。 */
export function buildSheetMarkdown(sheet: RequirementSheet, jobTitle: string): string {
  const rows = SHEET_FIELDS.map((f) => {
    const v = sheet[f.key];
    const shown = Array.isArray(v)
      ? listOrDash(v as string[])
      : typeof v === 'number'
        ? (v > 0 ? String(v) : '（未記入）')
        : textOrDash(String(v ?? ''));
    return `## ${f.label}${f.required ? '（必須）' : ''}\n\n${shown}\n`;
  });

  return `# 依頼票 — ${jobTitle}\n\n` +
    `この案件の条件です。**全部門がこの内容を見て作ります。**\n` +
    `直したいところがあれば、アプリの依頼票画面から直してください。\n\n` +
    rows.join('\n');
}

/** 未記入を表す書き方。書き出した雛形をそのまま読み込んでも空のままにする。 */
const BLANK_MARKS = new Set(['（未記入）', '(未記入)', '未記入', '-', '—', '']);

/**
 * 書き出した依頼票（Markdown）を読み戻す。
 *
 * CEO が「思いついたときに雛形へ書いておいて、あとから読み込む」ための入口。
 * 見出し（## ラベル）の下の行を、そのラベルの欄に入れるだけの素直な形にしてある。
 * ラベルは `SHEET_FIELDS` から引くので、**画面の項目が増えれば読み込みも自動で追随する**。
 *
 * 読めなかった見出しは黙って捨てず、呼び出し側に返して CEO に見せる。
 * 「入れたつもりが入っていない」がいちばん困るため。
 */
export function parseSheetMarkdown(text: string): {
  patch: Partial<RequirementSheet>;
  filled: string[];
  unknown: string[];
} {
  const byLabel = new Map(SHEET_FIELDS.map((f) => [f.label, f]));
  const patch: Partial<RequirementSheet> = {};
  const filled: string[] = [];
  const unknown: string[] = [];

  // 「## 見出し」で切り、次の見出しまでを値とみなす
  const sections = text.split(/^##[ \t]+/m).slice(1);

  for (const section of sections) {
    const nl = section.indexOf('\n');
    const rawLabel = (nl === -1 ? section : section.slice(0, nl)).trim();
    const body = (nl === -1 ? '' : section.slice(nl + 1)).trim();

    // 「（必須）」などの飾りを落としてから引く
    const label = rawLabel.replace(/[（(](必須|任意)[）)]\s*$/, '').trim();
    const field = byLabel.get(label);
    if (!field) {
      if (label) unknown.push(label);
      continue;
    }
    if (BLANK_MARKS.has(body)) continue;

    if (field.kind === 'list') {
      const items = body.split(/[,、，・\n]/).map((s) => s.trim()).filter(Boolean);
      if (items.length) { (patch as any)[field.key] = items; filled.push(field.label); }
    } else if (field.kind === 'number') {
      const n = parseInt(body.replace(/[^0-9]/g, ''), 10);
      if (Number.isFinite(n) && n > 0) { (patch as any)[field.key] = n; filled.push(field.label); }
    } else if (field.kind === 'formats') {
      // ラベル（「Markdown（そのまま読める）」等）でも、内部の値（md 等）でも受ける
      const wanted = body.split(/[,、，・\n]/).map((s) => s.trim()).filter(Boolean);
      const codes = (Object.keys(OUTPUT_FORMAT_LABEL) as (keyof typeof OUTPUT_FORMAT_LABEL)[])
        .filter((code) =>
          wanted.some((w) => w === code || OUTPUT_FORMAT_LABEL[code].startsWith(w.split('（')[0]))
        );
      if (codes.length) { (patch as any)[field.key] = codes; filled.push(field.label); }
    } else {
      (patch as any)[field.key] = body;
      filled.push(field.label);
    }
  }

  return { patch, filled, unknown };
}

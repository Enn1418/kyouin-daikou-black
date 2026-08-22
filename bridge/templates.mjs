/**
 * 印刷用テンプレート。
 *
 * 教材フォルダに `03_印刷テンプレート/<name>.css` があればそちらが優先される
 * （担任が自分で調整できるようにするため）。ここにあるのは既定値。
 *
 * フォントは Windows 標準搭載の BIZ UDPゴシック を第一候補にする。
 */

export const BASE_CSS = `
:root { color-scheme: light; }
* { box-sizing: border-box; }
body {
  font-family: "BIZ UDPゴシック", "BIZ UDPGothic", "UD デジタル教科書体 NP-R",
               "Yu Gothic UI", "Meiryo", sans-serif;
  font-size: 14pt;
  line-height: 1.9;
  color: #111;
  background: #fff;
  margin: 0;
  padding: 18mm 16mm;
  max-width: 210mm;
}
h1 { font-size: 20pt; margin: 0 0 12pt; }
h2 { font-size: 17pt; margin: 18pt 0 8pt; border-bottom: 2px solid #111; padding-bottom: 4pt; }
h3 { font-size: 15pt; margin: 14pt 0 6pt; }
p, li { font-size: 14pt; }
ul, ol { padding-left: 1.4em; }
li { margin: 4pt 0; }
table { border-collapse: collapse; width: 100%; margin: 10pt 0; }
th, td { border: 1.5px solid #111; padding: 6pt 8pt; font-size: 13pt; text-align: left; vertical-align: top; }
th { background: #f2f2f2; }
hr { border: none; border-top: 1.5px dashed #999; margin: 14pt 0; }
code { font-family: "BIZ UDゴシック", monospace; background: #f4f4f4; padding: 0 3px; }

/* [レイアウト] 行は教員向けの指示。印刷物には出さない。 */
.layout-note {
  font-size: 10pt;
  color: #777;
  border-left: 3px solid #ccc;
  padding-left: 8px;
  margin: 6pt 0;
}
@media print {
  .layout-note { display: none; }
  body { padding: 12mm 10mm; }
}
`;

export const TEMPLATE_CSS = {
  /** 既定。追加の装飾なし。 */
  plain: '',

  /** マス目（筆算・原稿用紙）。表を方眼に見せる。 */
  grid: `
table { table-layout: fixed; }
th, td { height: 12mm; text-align: center; vertical-align: middle; }
td:empty::after { content: ""; display: block; height: 100%; }
body { background-image: none; }
.grid-sheet { display: grid; grid-template-columns: repeat(10, 10mm); gap: 0; }
.grid-sheet div { border: 1px solid #bbb; height: 10mm; }
`,

  /** なぞり書き。強調をなぞり用の薄い文字にする。 */
  trace: `
strong { color: #c8c8c8; font-weight: 700; letter-spacing: 0.2em; }
p { letter-spacing: 0.15em; }
`,

  /** 分かち書き。文節間を広げ、1行1文を読みやすくする。 */
  spaced: `
body { line-height: 2.4; font-size: 16pt; }
p { letter-spacing: 0.08em; }
li { margin: 8pt 0; }
`,

  /** 1課題1ページ。見出しごとに改ページする。 */
  'one-task': `
h2 { page-break-before: always; }
h2:first-of-type { page-break-before: avoid; }
body { font-size: 16pt; line-height: 2.2; }
`
};

export const TEMPLATE_NAMES = Object.keys(TEMPLATE_CSS);

export function buildHtml({ title, bodyHtml, css }) {
  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>${css}</style>
</head>
<body>
${bodyHtml}
</body>
</html>
`;
}

/**
 * 最小限の Markdown → HTML 変換。
 *
 * 依存を増やさないための自前実装。教材で実際に使う記法だけを対象にする:
 * 見出し / 箇条書き / 番号つき / 表 / 強調 / 水平線 / 段落、
 * そして本文と区別するための [レイアウト] 行（印刷時は注として脇に出す）。
 */

const escapeHtml = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** 行内記法: **強調** / `コード` / □ などはそのまま。 */
function inline(text) {
  return escapeHtml(text)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');
}

function tableRow(line) {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
}

const isTableDivider = (line) => /^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(line) && line.includes('-');

export function markdownToHtml(markdown) {
  const lines = String(markdown).replace(/\r\n/g, '\n').split('\n');
  const out = [];
  let i = 0;

  const flushList = (tag, items) => {
    out.push(`<${tag}>`);
    items.forEach((it) => out.push(`<li>${inline(it)}</li>`));
    out.push(`</${tag}>`);
  };

  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) { i++; continue; }

    // [レイアウト] 指示は本文ではないので、印刷時に区別できるようにする
    if (/^\s*\[レイアウト\]/.test(line)) {
      out.push(`<p class="layout-note">${inline(line.replace(/^\s*\[レイアウト\]\s*/, ''))}</p>`);
      i++; continue;
    }

    const heading = line.match(/^(#{1,4})\s+(.*)$/);
    if (heading) {
      const level = heading[1].length;
      out.push(`<h${level}>${inline(heading[2])}</h${level}>`);
      i++; continue;
    }

    if (/^\s*(---|\*\*\*|___)\s*$/.test(line)) { out.push('<hr>'); i++; continue; }

    // 表: ヘッダ行 + 区切り行 + 本体
    if (line.includes('|') && i + 1 < lines.length && isTableDivider(lines[i + 1])) {
      const header = tableRow(line);
      i += 2;
      const body = [];
      while (i < lines.length && lines[i].includes('|') && lines[i].trim()) {
        body.push(tableRow(lines[i]));
        i++;
      }
      out.push('<table><thead><tr>');
      header.forEach((c) => out.push(`<th>${inline(c)}</th>`));
      out.push('</tr></thead><tbody>');
      body.forEach((row) => {
        out.push('<tr>');
        row.forEach((c) => out.push(`<td>${inline(c)}</td>`));
        out.push('</tr>');
      });
      out.push('</tbody></table>');
      continue;
    }

    if (/^\s*[-*]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*]\s+/, ''));
        i++;
      }
      flushList('ul', items);
      continue;
    }

    if (/^\s*\d+[.)]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+[.)]\s+/, ''));
        i++;
      }
      flushList('ol', items);
      continue;
    }

    // 段落: 空行までをまとめる
    const para = [];
    while (
      i < lines.length && lines[i].trim() &&
      !/^\s*(#{1,4}\s|[-*]\s|\d+[.)]\s|\[レイアウト\])/.test(lines[i]) &&
      !(lines[i].includes('|') && i + 1 < lines.length && isTableDivider(lines[i + 1]))
    ) {
      para.push(lines[i]);
      i++;
    }
    if (para.length) out.push(`<p>${inline(para.join('\n')).replace(/\n/g, '<br>')}</p>`);
  }

  return out.join('\n');
}

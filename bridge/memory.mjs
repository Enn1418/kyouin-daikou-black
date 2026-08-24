/**
 * 記憶（99_記憶/memory.md）への追記ルール。
 *
 * 何でも自動で溜めるのではなく、担任が差し戻したときの指摘だけを残す。
 * 同じ指摘を二度書かない、際限なく伸ばさない、の2点だけを担保する。
 * ファイルは担任が直接編集できる素の Markdown のままにしておく。
 */

/** プロンプトを圧迫しないよう、残す指摘の数に上限を設ける。 */
export const MEMORY_MAX_NOTES = 100;

/** 保存する形。改行や連続空白は1つにまとめ、箇条書き記号は落とす。 */
const clean = (line) => line.replace(/\s+/g, ' ').replace(/^[-*]\s*/, '').trim();

/**
 * 同じ指摘かどうかの判定に使う鍵。
 * 日本語では語間の空白に意味がないため、比較のときだけ空白を全て無視する
 * （「プリントは1枚に」と「プリントは 1枚に」を別物として溜めないため）。
 */
const key = (line) => clean(line).replace(/\s+/g, '');

/**
 * 既存の記憶に指摘を1件足した結果を返す（純粋関数）。
 * 追記の必要がなければ null を返す。
 */
export function mergeMemoryNote(existing, note, max = MEMORY_MAX_NOTES) {
  const line = clean(String(note || ''));
  if (!line) return null;

  const lines = String(existing || '')
    .split('\n')
    .filter((l) => l.trim());

  if (lines.some((l) => key(l) === key(line))) return null; // 同じ指摘は増やさない

  return [...lines, `- ${line}`].slice(-max).join('\n') + '\n';
}

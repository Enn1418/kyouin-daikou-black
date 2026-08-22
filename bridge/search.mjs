/**
 * フォルダ全体から語を探す。
 *
 * 参照フォルダ（Obsidian の保管庫など）は数千ファイルになる。
 * 一覧を渡して読ませるのは現実的でないので、探して、当たった箇所の前後だけ返す。
 * どのファイルを読むかは、それを見てエージェントが決める。
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';

const MAX_FILES_SCANNED = 4000;
const MAX_FILE_BYTES = 512 * 1024;
const SNIPPET_BEFORE = 40;
const SNIPPET_AFTER = 80;

/** 探す語を正規化する。日本語は大小文字が無いが、英数字は無視できるようにする。 */
const fold = (s) => String(s).toLowerCase();

/**
 * @param root      { name, path }
 * @param query     探す語。空白区切りで複数指定すると「すべて含む」
 * @param options   { extensions: Set, limit, dir }
 */
export async function searchRoot(root, query, options = {}) {
  const terms = String(query || '').trim().split(/\s+/).filter(Boolean).map(fold);
  if (!terms.length) {
    throw Object.assign(new Error('探す語が空です'), { status: 400 });
  }
  const extensions = options.extensions;
  const limit = Math.min(Math.max(Number(options.limit) || 20, 1), 50);
  const start = path.resolve(root.path, options.dir || '.');

  const hits = [];
  let scanned = 0;
  let truncated = false;

  const walk = async (dir, depth) => {
    if (hits.length >= limit || scanned >= MAX_FILES_SCANNED || depth > 8) return;
    let dirents;
    try {
      dirents = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;                       // 読めないフォルダは黙って飛ばす
    }
    for (const d of dirents) {
      if (hits.length >= limit || scanned >= MAX_FILES_SCANNED) { truncated = true; return; }
      if (d.name.startsWith('.')) continue;          // .obsidian / .git など
      const full = path.join(dir, d.name);
      if (d.isDirectory()) {
        await walk(full, depth + 1);
        continue;
      }
      if (extensions && !extensions.has(path.extname(d.name).toLowerCase())) continue;
      scanned++;
      let text;
      try {
        const st = await fs.stat(full);
        if (st.size > MAX_FILE_BYTES) continue;
        text = await fs.readFile(full, 'utf8');
      } catch {
        continue;
      }
      const folded = fold(text);
      if (!terms.every((t) => folded.includes(t))) continue;

      const at = folded.indexOf(terms[0]);
      const from = Math.max(0, at - SNIPPET_BEFORE);
      hits.push({
        root: root.name,
        path: path.relative(root.path, full).split(path.sep).join('/'),
        snippet: (from > 0 ? '…' : '') +
          text.slice(from, at + terms[0].length + SNIPPET_AFTER).replace(/\s+/g, ' ').trim() + '…'
      });
    }
  };

  await walk(start, 0);
  return { root: root.name, query, hits, scanned, truncated: truncated || hits.length >= limit };
}

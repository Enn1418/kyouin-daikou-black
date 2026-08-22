/**
 * 参照フォルダ。
 *
 * 教材フォルダのほかに、担任がすでに持っている資料（Obsidian の保管庫、
 * Google ドライブの同期フォルダなど）を**読み取り専用で**足せるようにする。
 *
 * 書き込みを許さないのは、担任が長年ためたノートを、エージェントが
 * 上書きしたり増やしたりする余地を残さないため。読むだけなら失うものがない。
 *
 *   npm run bridge -- --root "C:\\Users\\x\\kyouin" --ref "ノート=C:\\Users\\x\\Obsidian\\授業"
 */
import path from 'node:path';

export class Roots {
  /**
   * @param mainPath 教材フォルダ（唯一書き込める場所）
   * @param refs     [{ name, path }] 参照フォルダ（読み取り専用）
   */
  constructor(mainPath, refs = []) {
    this.main = { name: '教材', path: path.resolve(mainPath), writable: true };
    this.byName = new Map([[this.main.name, this.main]]);

    refs.forEach((ref, i) => {
      let name = (ref.name || path.basename(path.resolve(ref.path)) || `参照${i + 1}`).trim();
      // 名前がぶつかったら番号を足す。黙って上書きすると別のフォルダが読まれる
      let n = 2;
      const base = name;
      while (this.byName.has(name)) name = `${base}${n++}`;
      this.byName.set(name, { name, path: path.resolve(ref.path), writable: false });
    });
  }

  /** 既定は教材フォルダ。名前が指定されればそれを引く。 */
  get(name) {
    if (!name) return this.main;
    const found = this.byName.get(String(name).trim());
    if (!found) {
      throw Object.assign(
        new Error(`そのフォルダはありません: ${name}（使えるのは ${[...this.byName.keys()].join(' / ')}）`),
        { status: 400 }
      );
    }
    return found;
  }

  /** 指定フォルダの配下に解決されることを保証する。外に出るパスは例外。 */
  resolve(relative, rootName) {
    const root = this.get(rootName);
    const target = path.resolve(root.path, relative || '.');
    const rel = path.relative(root.path, target);
    if (rel.startsWith('..') || path.isAbsolute(rel)) {
      throw Object.assign(new Error(`${root.name}フォルダの外は扱えません`), { status: 403 });
    }
    return { root, target };
  }

  /** 書き込み先として使えるか。参照フォルダは常に不可。 */
  assertWritable(rootName) {
    const root = this.get(rootName);
    if (!root.writable) {
      throw Object.assign(
        new Error(`${root.name}は参照専用です。書き込みは教材フォルダにしてください`),
        { status: 403 }
      );
    }
    return root;
  }

  /** 相対パスに直す（一覧や検索結果の表示用）。 */
  relative(root, fullPath) {
    return path.relative(root.path, fullPath).split(path.sep).join('/');
  }

  list() {
    return [...this.byName.values()].map((r) => ({
      name: r.name,
      writable: r.writable,
      base: path.basename(r.path)
    }));
  }
}

/** `--ref "名前=パス"` / `--ref "パス"` を読む。 */
export function parseRefArg(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  // Windows のパスは "C:\..." のように : を含むので、= だけを区切りにする
  const eq = raw.indexOf('=');
  if (eq > 0) return { name: raw.slice(0, eq).trim(), path: raw.slice(eq + 1).trim() };
  return { name: '', path: raw };
}

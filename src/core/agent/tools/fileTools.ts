import { bridge, BridgeError } from '../../bridge/bridgeClient';

/**
 * 教材フォルダを読み書きするツール。
 *
 * ほかのツール（propose_task など）は成否の真偽値だけを返すが、
 * ここでは中身そのものをエージェントに返す必要があるため文字列を返す。
 * 失敗時も例外にせず、エージェントが次の手を選べるよう理由を文章で返す。
 */

/** 1回の読み取りでプロンプトに載せる上限。これを超えたら切り詰めて明示する。 */
const MAX_CHARS = 20000;

const fail = (e: unknown) =>
  e instanceof BridgeError ? `ERROR: ${e.message}` : `ERROR: ${e instanceof Error ? e.message : String(e)}`;

export async function listFiles(args: { dir?: string; root?: string }): Promise<string> {
  try {
    const { root, dir, entries, truncated } = await bridge.listFiles(args.dir || '.', args.root);
    if (!entries.length) return `[${root}] ${dir} は空です。`;
    const lines = entries.map((e) => (e.type === 'dir' ? `[フォルダ] ${e.path}` : `${e.path} (${e.size ?? 0} bytes)`));
    return `[${root}] ${dir} の中身:\n${lines.join('\n')}${truncated ? '\n(多すぎるため一部のみ表示)' : ''}`;
  } catch (e) {
    return fail(e);
  }
}

export async function readFile(args: { path: string; root?: string }): Promise<string> {
  if (!args?.path) return 'ERROR: path が指定されていません。';
  try {
    const { root, path, content } = await bridge.readFile(args.path, args.root);
    if (content.length > MAX_CHARS) {
      return `[${root}] ${path} の先頭 ${MAX_CHARS} 文字（全体は ${content.length} 文字）:\n${content.slice(0, MAX_CHARS)}`;
    }
    return `[${root}] ${path}:\n${content}`;
  } catch (e) {
    return fail(e);
  }
}

/**
 * フォルダ全体から語を探す。
 *
 * 参照フォルダは数千ファイルになるので、一覧を渡して読ませるのは成り立たない。
 * 当たった場所の前後だけ返し、どれを読むかはエージェントに選ばせる。
 */
export async function searchFiles(args: { query: string; root?: string; limit?: number }): Promise<string> {
  if (!args?.query) return 'ERROR: query が指定されていません。';
  try {
    const { root, hits, scanned, truncated } = await bridge.search(args.query, args.root, args.limit);
    if (!hits.length) {
      return `[${root}] 「${args.query}」は見つかりませんでした（${scanned} ファイルを見ました）。` +
        '語を変えるか、担任に資料の場所を尋ねてください。';
    }
    const lines = hits.map((h) => `${h.path}\n  ${h.snippet}`);
    return `[${root}] 「${args.query}」の検索結果 ${hits.length}件:\n${lines.join('\n')}` +
      `${truncated ? '\n(まだあります。語を絞ってください)' : ''}\n` +
      '中身が要るものは read_file で読んでください。';
  } catch (e) {
    return fail(e);
  }
}

export async function writeFile(args: {
  path: string;
  content: string;
  printTemplate?: string;
}): Promise<string> {
  if (!args?.path || typeof args.content !== 'string') {
    return 'ERROR: path と content の両方が必要です。';
  }
  try {
    const saved = await bridge.writeFile(args.path, args.content);
    let message = `保存しました: ${saved.path} (${saved.bytes} bytes)${saved.backedUp ? '（前の版は .bak に退避）' : ''}`;

    // Markdown を保存したときは、指定があれば印刷用 HTML も書き出す
    if (args.printTemplate && /\.md$/i.test(args.path)) {
      const exported = await bridge.exportHtml({
        path: args.path,
        markdown: args.content,
        template: args.printTemplate
      });
      message += `\n印刷用: ${exported.path}（テンプレート: ${exported.template}）`;
    }
    return message;
  } catch (e) {
    return fail(e);
  }
}

/**
 * 反復ドリルの生成。
 *
 * モデルは「型」（出題条件）だけを渡し、問題の量産と検算はブリッジ側の
 * 決定的なコードが行う。モデルに計算問題を並べさせると答えを間違えるため、
 * この分担は崩さない（設計 §8-12）。
 */
export async function generateDrill(args: {
  path: string;
  title?: string;
  count?: number;
  seed?: number;
  columns?: number;
  printTemplate?: string;
  spec: Record<string, unknown>;
}): Promise<string> {
  if (!args?.path || !args?.spec) return 'ERROR: path と spec が必要です。';
  try {
    const r = await bridge.generateDrill({
      path: args.path,
      title: args.title,
      count: args.count,
      seed: args.seed,
      columns: args.columns,
      template: args.printTemplate,
      spec: args.spec
    });
    const printed = r.exported.length ? `\n印刷用: ${r.exported.join(', ')}` : '';
    const short = r.shortfall
      ? `\n注意: 条件に合う問題が ${r.available} 通りしかなく、${r.count} 問だけ作りました。`
      : '';
    return `ドリルを作りました: ${r.path}（${r.count}問, seed ${r.seed}）\n解答: ${r.answerPath}${printed}${short}`;
  } catch (e) {
    return fail(e);
  }
}

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

export async function listFiles(args: { dir?: string }): Promise<string> {
  try {
    const { dir, entries, truncated } = await bridge.listFiles(args.dir || '.');
    if (!entries.length) return `${dir} は空です。`;
    const lines = entries.map((e) => (e.type === 'dir' ? `[フォルダ] ${e.path}` : `${e.path} (${e.size ?? 0} bytes)`));
    return `${dir} の中身:\n${lines.join('\n')}${truncated ? '\n(多すぎるため一部のみ表示)' : ''}`;
  } catch (e) {
    return fail(e);
  }
}

export async function readFile(args: { path: string }): Promise<string> {
  if (!args?.path) return 'ERROR: path が指定されていません。';
  try {
    const { path, content } = await bridge.readFile(args.path);
    if (content.length > MAX_CHARS) {
      return `${path} の先頭 ${MAX_CHARS} 文字（全体は ${content.length} 文字）:\n${content.slice(0, MAX_CHARS)}`;
    }
    return `${path}:\n${content}`;
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

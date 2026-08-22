#!/usr/bin/env node
/**
 * 教材フォルダのローカルブリッジ。
 *
 *   npm run bridge -- --root "D:\\kyouin"
 *
 * ブラウザで動く本体はファイルを読み書きできないため、自分の PC で
 * この小さなサーバを立てて、指定したフォルダの中だけを扱えるようにする。
 *
 * 設計上の約束（docs/teacher-edition-design.md §4）:
 *   - 127.0.0.1 にのみバインドする（LAN に出さない）
 *   - 起動時に生成したトークンを Authorization ヘッダで要求する
 *   - パスは必ず root 配下に解決されることを検証する（.. を遮断）
 *   - 拡張子はホワイトリスト。実行可能ファイルは扱わない
 *   - 削除 API は作らない（消す操作はエクスプローラで人間がやる）
 */
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { promises as fs, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { generateDrill, drillToMarkdown, drillAnswersToMarkdown } from './drill.mjs';
import { markdownToHtml } from './markdown.mjs';
import { mergeMemoryNote } from './memory.mjs';
import { scaffold } from './scaffold.mjs';
import { BASE_CSS, TEMPLATE_CSS, TEMPLATE_NAMES, buildHtml } from './templates.mjs';

const ALLOWED_EXTENSIONS = new Set(['.md', '.txt', '.csv', '.json', '.html']);
const MAX_READ_BYTES = 1024 * 1024;      // 1MB
const MAX_WRITE_BYTES = 1024 * 1024;
const MAX_ENTRIES = 500;
const MEMORY_PATH = '99_記憶/memory.md';
const TEMPLATE_DIR = '03_印刷テンプレート';

function parseArgs(argv) {
  const args = { root: process.cwd(), port: 5174, token: process.env.KYOUIN_BRIDGE_TOKEN || '' };
  for (let i = 0; i < argv.length; i++) {
    const next = () => argv[++i];
    if (argv[i] === '--root') args.root = next();
    else if (argv[i] === '--port') args.port = Number(next());
    else if (argv[i] === '--token') args.token = next();
    else if (argv[i] === '--init') args.init = true;
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
const ROOT = path.resolve(args.root);
const TOKEN_FILE = '.bridge-token';

/**
 * トークンを教材フォルダの中に持たせる。
 *
 * 起動のたびに作り直すと、担任は再起動のたびにアプリの設定を貼り直すことになる。
 * 実際それで詰まったので、一度作ったものを使い回す。ドット始まりなので一覧にも出ず、
 * 拡張子ホワイトリストにも当たらないため、ブリッジ越しには読めない。
 * `--token` か環境変数が指定されていればそちらが優先。
 */
function resolveToken(explicit) {
  if (explicit) return explicit;
  const file = path.join(ROOT, TOKEN_FILE);
  try {
    if (existsSync(file)) {
      const saved = readFileSync(file, 'utf8').trim();
      if (/^[0-9a-f]{32}$/.test(saved)) return saved;
    }
  } catch {
    // 読めなければ作り直す
  }
  const token = randomBytes(16).toString('hex');
  try {
    mkdirSync(ROOT, { recursive: true });
    writeFileSync(file, token + '\n', { mode: 0o600 });
  } catch {
    // 書けなくても今回の起動では使える（次回また変わる）
  }
  return token;
}

const TOKEN = resolveToken(args.token);

/** root 配下に解決されることを保証する。外に出るパスは例外。 */
function safeResolve(relative) {
  const target = path.resolve(ROOT, relative || '.');
  const rel = path.relative(ROOT, target);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw Object.assign(new Error('教材フォルダの外は扱えません'), { status: 403 });
  }
  return target;
}

function assertAllowedExtension(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    throw Object.assign(
      new Error(`扱えない拡張子です: ${ext || '(なし)'}（${[...ALLOWED_EXTENSIONS].join(' ')} のみ）`),
      { status: 400 }
    );
  }
}

/** localhost からのアクセスだけを許可する（別オリジンのページから叩かれないように）。 */
function corsHeaders(origin) {
  const ok = !origin || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
  if (!ok) return null;
  return {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Methods': 'GET,PUT,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization,Content-Type',
    'Access-Control-Max-Age': '600',
    Vary: 'Origin'
  };
}

const json = (res, status, body, headers = {}) => {
  const payload = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...headers });
  res.end(payload);
};

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_WRITE_BYTES) throw Object.assign(new Error('本文が大きすぎます'), { status: 413 });
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw Object.assign(new Error('JSON として読めません'), { status: 400 });
  }
}

async function listFiles(dir) {
  const target = safeResolve(dir);
  const dirents = await fs.readdir(target, { withFileTypes: true });
  const entries = [];
  for (const d of dirents.slice(0, MAX_ENTRIES)) {
    if (d.name.startsWith('.')) continue;
    const full = path.join(target, d.name);
    const rel = path.relative(ROOT, full).split(path.sep).join('/');
    if (d.isDirectory()) {
      entries.push({ name: d.name, path: rel, type: 'dir' });
    } else if (ALLOWED_EXTENSIONS.has(path.extname(d.name).toLowerCase())) {
      const st = await fs.stat(full);
      entries.push({ name: d.name, path: rel, type: 'file', size: st.size, mtime: st.mtime.toISOString() });
    }
  }
  entries.sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name, 'ja') : a.type === 'dir' ? -1 : 1));
  return { dir: dir || '.', entries, truncated: dirents.length > MAX_ENTRIES };
}

async function readFile(relative) {
  const target = safeResolve(relative);
  assertAllowedExtension(target);
  const st = await fs.stat(target);
  if (st.size > MAX_READ_BYTES) {
    throw Object.assign(new Error('ファイルが大きすぎます（1MBまで）'), { status: 413 });
  }
  const content = await fs.readFile(target, 'utf8');
  // メモ帳や PowerShell が付ける BOM を落とす。担任が手で作ったファイルでも
  // 先頭に見えない文字が残らないようにする。
  return { path: relative, content: content.replace(/^\uFEFF/, '') };
}

async function writeFile(relative, content) {
  const target = safeResolve(relative);
  assertAllowedExtension(target);
  await fs.mkdir(path.dirname(target), { recursive: true });

  // 上書き前に必ず .bak を残す（バックアップの代わりではないが、事故を1段階戻せる）
  let backedUp = false;
  try {
    await fs.copyFile(target, `${target}.bak`);
    backedUp = true;
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
  }

  await fs.writeFile(target, content, 'utf8');
  return { path: relative, bytes: Buffer.byteLength(content, 'utf8'), backedUp };
}

/** テンプレートは教材フォルダ側のものを優先し、無ければ組み込みを使う。 */
async function resolveCss(template) {
  const name = TEMPLATE_CSS[template] !== undefined ? template : 'plain';
  try {
    const custom = await fs.readFile(safeResolve(`${TEMPLATE_DIR}/${name}.css`), 'utf8');
    return { css: `${BASE_CSS}\n${custom}`, source: `${TEMPLATE_DIR}/${name}.css` };
  } catch {
    return { css: `${BASE_CSS}\n${TEMPLATE_CSS[name]}`, source: 'built-in' };
  }
}

async function exportHtml({ path: relative, title, markdown, template }) {
  const { css, source } = await resolveCss(template);
  const htmlPath = relative.replace(/\.md$/i, '') + '.html';
  const html = buildHtml({
    title: title || path.basename(htmlPath),
    bodyHtml: markdownToHtml(markdown),
    css
  });
  const target = safeResolve(htmlPath);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, html, 'utf8');
  return { path: htmlPath, template: template || 'plain', cssSource: source };
}

/**
 * 反復ドリルの生成。LLM に問題を並べさせず、型（出題条件）から決定的に作る。
 * 児童用と教員用の解答は別ファイルにする（プリントに答えを載せないため）。
 */
async function generateDrillFiles(body) {
  if (!body.path || !/\.md$/i.test(body.path)) {
    throw Object.assign(new Error('path（.md）が必要です'), { status: 400 });
  }
  const seed = Number.isFinite(body.seed) ? body.seed : Math.floor(Math.random() * 1e9);
  const result = generateDrill(body.spec || {}, body.count || 20, seed);

  // 条件に合う問題が1問も無いとき、空のプリントを書いても害しかない
  if (!result.problems.length) {
    throw Object.assign(
      new Error('条件に合う問題が1問もありません。範囲を広げるか、条件（繰り上がり・答えの上限など）をゆるめてください'),
      { status: 400 }
    );
  }

  const sheet = drillToMarkdown(result, { title: body.title, columns: body.columns });
  const written = [await writeFile(body.path, sheet)];
  const exported = [];
  if (body.template) {
    exported.push(await exportHtml({ path: body.path, title: body.title, markdown: sheet, template: body.template }));
  }

  let answerPath = null;
  if (body.answerKey !== false) {
    answerPath = body.path.replace(/\.md$/i, '_解答.md');
    const answers = drillAnswersToMarkdown(result, { title: body.title });
    written.push(await writeFile(answerPath, answers));
  }

  return {
    path: body.path,
    answerPath,
    seed,
    count: result.problems.length,
    requested: result.requested,
    available: result.available,
    shortfall: result.shortfall,
    exported: exported.map((e) => e.path),
    written: written.map((w) => w.path)
  };
}

const server = createServer(async (req, res) => {
  const headers = corsHeaders(req.headers.origin);
  if (!headers) return json(res, 403, { error: 'このオリジンからは利用できません' });

  if (req.method === 'OPTIONS') {
    res.writeHead(204, headers);
    return res.end();
  }

  const url = new URL(req.url, 'http://localhost');

  // /health だけは認証不要（アプリ側が接続状態を確かめるため）
  if (url.pathname === '/health') {
    return json(res, 200, { ok: true, root: path.basename(ROOT), templates: TEMPLATE_NAMES }, headers);
  }

  const auth = req.headers.authorization || '';
  if (auth !== `Bearer ${TOKEN}`) {
    return json(res, 401, { error: 'トークンが違います。ブリッジ起動時に表示されたトークンをアプリに貼ってください' }, headers);
  }

  try {
    if (req.method === 'GET' && url.pathname === '/files') {
      return json(res, 200, await listFiles(url.searchParams.get('dir') || '.'), headers);
    }
    if (req.method === 'GET' && url.pathname === '/file') {
      const p = url.searchParams.get('path');
      if (!p) throw Object.assign(new Error('path が必要です'), { status: 400 });
      return json(res, 200, await readFile(p), headers);
    }
    if (req.method === 'PUT' && url.pathname === '/file') {
      const p = url.searchParams.get('path');
      if (!p) throw Object.assign(new Error('path が必要です'), { status: 400 });
      const body = await readBody(req);
      if (typeof body.content !== 'string') throw Object.assign(new Error('content が必要です'), { status: 400 });
      return json(res, 200, await writeFile(p, body.content), headers);
    }
    if (req.method === 'GET' && url.pathname === '/memory') {
      try {
        return json(res, 200, await readFile(MEMORY_PATH), headers);
      } catch (e) {
        if (e.code === 'ENOENT') return json(res, 200, { path: MEMORY_PATH, content: '' }, headers);
        throw e;
      }
    }
    if (req.method === 'PUT' && url.pathname === '/memory') {
      const body = await readBody(req);
      if (typeof body.content !== 'string') throw Object.assign(new Error('content が必要です'), { status: 400 });
      return json(res, 200, await writeFile(MEMORY_PATH, body.content), headers);
    }
    // 差し戻しの指摘を1件だけ足す（重複と際限ない肥大は bridge 側で抑える）
    if (req.method === 'POST' && url.pathname === '/memory/note') {
      const body = await readBody(req);
      if (typeof body.note !== 'string') throw Object.assign(new Error('note が必要です'), { status: 400 });

      let current = '';
      try {
        current = (await readFile(MEMORY_PATH)).content;
      } catch (e) {
        if (e.code !== 'ENOENT') throw e;
      }

      const next = mergeMemoryNote(current, body.note);
      if (next === null) return json(res, 200, { path: MEMORY_PATH, content: current, appended: false }, headers);

      await writeFile(MEMORY_PATH, next);
      return json(res, 200, { path: MEMORY_PATH, content: next, appended: true }, headers);
    }
    if (req.method === 'POST' && url.pathname === '/generate/drill') {
      return json(res, 200, await generateDrillFiles(await readBody(req)), headers);
    }
    if (req.method === 'POST' && url.pathname === '/export') {
      const body = await readBody(req);
      if (!body.path || typeof body.markdown !== 'string') {
        throw Object.assign(new Error('path と markdown が必要です'), { status: 400 });
      }
      return json(res, 200, await exportHtml(body), headers);
    }
    return json(res, 404, { error: 'そのようなエンドポイントはありません' }, headers);
  } catch (e) {
    const status = e.status || (e.code === 'ENOENT' ? 404 : 500);
    const message = e.code === 'ENOENT' ? 'ファイルまたはフォルダがありません' : e.message;
    return json(res, status, { error: message }, headers);
  }
});

server.listen(args.port, '127.0.0.1', async () => {
  // フォルダがまだ無い（または空）なら、雛形を用意してから始める。
  // Windows の拡張子と文字コードの罠を担任に踏ませないため。
  let created = [];
  try {
    ({ created } = await scaffold(ROOT, { force: args.init }));
  } catch (e) {
    console.error(`  教材フォルダを用意できませんでした: ${e.message}`);
  }

  console.log('');
  console.log('  教材フォルダ ブリッジを起動しました');
  console.log(`  フォルダ : ${ROOT}`);
  if (created.length) {
    console.log('');
    console.log('  雛形を作りました:');
    created.forEach((c) => console.log(`    ${c}`));
    console.log('    → 00_共通/学級の実態.md を実際の学級に合わせて書き換えてください');
  }
  console.log(`  URL      : http://localhost:${args.port}`);
  console.log(`  トークン : ${TOKEN}`);
  console.log('');
  console.log('  アプリの設定画面に URL とトークンを貼ってください。');
  console.log('  停止するには Ctrl+C。');
  console.log('');
});

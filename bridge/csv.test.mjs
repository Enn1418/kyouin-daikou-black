/**
 * CSV の書き出し。
 *
 * 担任が CSV を選ぶ理由は「Excel で開いて、そのまま書き込んで使える」こと。
 * ところが Excel は .csv に BOM が無いと日本語を Shift-JIS だと思い込み、
 * **中身が全部文字化けする。** 化けた時点でこの形式は使いものにならないので、
 * 書き出し側で BOM を付ける。ここが外れると、担任は開いた瞬間に諦める。
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const PORT = 5312;
const TOKEN = 'test-token';

async function startBridge(root) {
  const proc = spawn('node', ['bridge/server.mjs', '--root', root, '--port', String(PORT), '--token', TOKEN], {
    cwd: process.cwd(),
    stdio: 'ignore'
  });
  for (let i = 0; i < 50; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/health`);
      if (res.ok) return proc;
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  proc.kill();
  throw new Error('ブリッジが起動しませんでした');
}

const put = (p, content) =>
  fetch(`http://127.0.0.1:${PORT}/file?path=${encodeURIComponent(p)}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ content })
  }).then((r) => r.json());

const get = (p) =>
  fetch(`http://127.0.0.1:${PORT}/file?path=${encodeURIComponent(p)}`, {
    headers: { Authorization: `Bearer ${TOKEN}` }
  }).then((r) => r.json());

test('CSV には BOM が付く（Excel で日本語が化けないように）', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'kyouin-csv-'));
  const proc = await startBridge(root);
  t.after(() => proc.kill());

  const body = '児童,めあて,評価\nA児,1Lと1dLが分かる,\n';
  await put('01_教材/評価記録.csv', body);

  const raw = await fs.readFile(path.join(root, '01_教材/評価記録.csv'), 'utf8');
  assert.ok(raw.startsWith('﻿'), 'CSV の先頭に BOM が無い');
  assert.equal(raw, `﻿${body}`, 'BOM 以外は渡した内容そのまま');
});

test('CSV 以外には BOM を付けない', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'kyouin-csv-'));
  const proc = await startBridge(root);
  t.after(() => proc.kill());

  await put('01_教材/略案.md', '# かさ\n');
  const raw = await fs.readFile(path.join(root, '01_教材/略案.md'), 'utf8');
  assert.equal(raw, '# かさ\n');
});

test('二重に BOM を付けない', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'kyouin-csv-'));
  const proc = await startBridge(root);
  t.after(() => proc.kill());

  await put('a.csv', '﻿児童,評価\n');
  const raw = await fs.readFile(path.join(root, 'a.csv'), 'utf8');
  assert.equal(raw, '﻿児童,評価\n');
  assert.ok(!raw.slice(1).startsWith('﻿'));
});

test('書いた CSV を読み戻すと、BOM は見えない', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'kyouin-csv-'));
  const proc = await startBridge(root);
  t.after(() => proc.kill());

  const body = '児童,めあて\nB児,水のかさをくらべる\n';
  await put('b.csv', body);

  // 読み取り側は BOM を落とすので、アプリから見た内容は書いたときと同じ
  const back = await get('b.csv');
  assert.equal(back.content, body);
});

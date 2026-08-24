/**
 * ファイル読み取りの細かい振る舞い。
 *
 * 担任が手で作ったファイル（メモ帳・PowerShell）は先頭に BOM が付くことがある。
 * それが本文の一部として扱われると、プロンプトの先頭に見えない文字が混ざる。
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const PORT = 5311;
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

const get = (p) =>
  fetch(`http://127.0.0.1:${PORT}/file?path=${encodeURIComponent(p)}`, {
    headers: { Authorization: `Bearer ${TOKEN}` }
  }).then((r) => r.json());

test('BOM 付きのファイルでも先頭に見えない文字が残らない', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'kyouin-bom-'));
  await fs.writeFile(path.join(root, 'メモ帳で作った.md'), '﻿# 学級の実態\n', 'utf8');
  await fs.writeFile(path.join(root, '普通.md'), '# 学級の実態\n', 'utf8');

  const proc = await startBridge(root);
  t.after(() => proc.kill());

  const withBom = await get('メモ帳で作った.md');
  assert.equal(withBom.content, '# 学級の実態\n');
  assert.ok(!withBom.content.startsWith('﻿'));

  const plain = await get('普通.md');
  assert.equal(plain.content, '# 学級の実態\n');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import os from 'node:os';

import { Roots, parseRefArg } from './roots.mjs';
import { searchRoot } from './search.mjs';

const tmp = () => fs.mkdtemp(path.join(os.tmpdir(), 'roots-'));

test('教材フォルダは書ける。参照フォルダは書けない', () => {
  const roots = new Roots('/tmp/kyouin', [{ name: 'ノート', path: '/tmp/vault' }]);
  assert.equal(roots.get().name, '教材');
  assert.equal(roots.get('教材').writable, true);
  assert.equal(roots.get('ノート').writable, false);
  assert.doesNotThrow(() => roots.assertWritable());
  assert.throws(() => roots.assertWritable('ノート'), /参照専用/);
});

test('参照フォルダの外には出られない', () => {
  const roots = new Roots('/tmp/kyouin', [{ name: 'ノート', path: '/tmp/vault' }]);
  assert.throws(() => roots.resolve('../../etc/passwd', 'ノート'), /外は扱えません/);
  assert.throws(() => roots.resolve('/etc/passwd', 'ノート'), /外は扱えません/);
  assert.equal(roots.resolve('授業/算数.md', 'ノート').target, '/tmp/vault/授業/算数.md');
});

test('知らないフォルダ名は、使える名前を添えて断る', () => {
  const roots = new Roots('/tmp/kyouin', [{ name: 'ノート', path: '/tmp/vault' }]);
  assert.throws(() => roots.get('そんなの'), /教材 \/ ノート/);
});

test('名前がぶつかったら番号を足す（別のフォルダを黙って読ませない）', () => {
  const roots = new Roots('/tmp/kyouin', [
    { name: 'ノート', path: '/tmp/a' },
    { name: 'ノート', path: '/tmp/b' }
  ]);
  assert.equal(roots.get('ノート').path, '/tmp/a');
  assert.equal(roots.get('ノート2').path, '/tmp/b');
});

test('名前を省いたらフォルダ名を使う', () => {
  const roots = new Roots('/tmp/kyouin', [{ name: '', path: '/tmp/授業ノート' }]);
  assert.equal(roots.get('授業ノート').writable, false);
});

test('--ref の書き方: 名前つきと、パスだけ', () => {
  assert.deepEqual(parseRefArg('ノート=C:\\Users\\x\\Obsidian'), { name: 'ノート', path: 'C:\\Users\\x\\Obsidian' });
  assert.deepEqual(parseRefArg('C:\\Users\\x\\Obsidian'), { name: '', path: 'C:\\Users\\x\\Obsidian' });
  assert.equal(parseRefArg('  '), null);
});

test('検索: 当たったファイルと前後の文が返る', async () => {
  const dir = await tmp();
  await fs.mkdir(path.join(dir, '授業'), { recursive: true });
  await fs.writeFile(path.join(dir, '授業/かさ.md'), '# かさ\n\n1Lますを使った実践。うつしかえが有効。\n', 'utf8');
  await fs.writeFile(path.join(dir, '授業/分数.md'), '# 分数\n\nテープ図から入る。\n', 'utf8');

  const root = { name: 'ノート', path: dir };
  const found = await searchRoot(root, 'うつしかえ', { extensions: new Set(['.md']) });
  assert.equal(found.hits.length, 1);
  assert.equal(found.hits[0].path, '授業/かさ.md');
  assert.match(found.hits[0].snippet, /うつしかえ/);
});

test('検索: 語を複数書いたら、すべて含むものだけ', async () => {
  const dir = await tmp();
  await fs.writeFile(path.join(dir, 'a.md'), 'かさ と 水のうつしかえ\n', 'utf8');
  await fs.writeFile(path.join(dir, 'b.md'), 'かさ だけ\n', 'utf8');
  const found = await searchRoot({ name: 'x', path: dir }, 'かさ うつしかえ', { extensions: new Set(['.md']) });
  assert.deepEqual(found.hits.map((h) => h.path), ['a.md']);
});

test('検索: 隠しフォルダ（.obsidian など）は見ない', async () => {
  const dir = await tmp();
  await fs.mkdir(path.join(dir, '.obsidian'), { recursive: true });
  await fs.writeFile(path.join(dir, '.obsidian/workspace.json'), 'かさ', 'utf8');
  const found = await searchRoot({ name: 'x', path: dir }, 'かさ', { extensions: new Set(['.md', '.json']) });
  assert.equal(found.hits.length, 0);
});

test('検索: 語が空なら断る', async () => {
  const dir = await tmp();
  await assert.rejects(() => searchRoot({ name: 'x', path: dir }, '   '), /探す語が空/);
});

test('検索: 扱えない拡張子は開かない', async () => {
  const dir = await tmp();
  await fs.writeFile(path.join(dir, 'a.pdf'), 'かさ', 'utf8');
  const found = await searchRoot({ name: 'x', path: dir }, 'かさ', { extensions: new Set(['.md']) });
  assert.equal(found.hits.length, 0);
  assert.equal(found.scanned, 0);
});

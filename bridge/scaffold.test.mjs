/**
 * 雛形づくりのテスト。
 *
 * ここが壊れると、担任が既に作った教材を勝手に混ぜたり、
 * 書きかけの実態記述を上書きしたりしうる。「触らない」ことのほうが重要。
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { scaffold } from './scaffold.mjs';

const tmp = async () => fs.mkdtemp(path.join(os.tmpdir(), 'kyouin-'));

test('フォルダが無いときは作る', async () => {
  const base = await tmp();
  const root = path.join(base, 'まだない');

  const { created, skipped } = await scaffold(root);
  assert.equal(skipped, false);
  assert.ok(created.includes('00_共通/学級の実態.md'));
  assert.ok(created.includes('99_記憶/memory.md'));

  const profile = await fs.readFile(path.join(root, '00_共通/学級の実態.md'), 'utf8');
  assert.ok(profile.includes('A児'));
  assert.ok(profile.includes('氏名は書きません'));
});

test('日本語が UTF-8 で書かれている（メモ帳の文字化けを避けるため）', async () => {
  const root = path.join(await tmp(), 'x');
  await scaffold(root);
  const raw = await fs.readFile(path.join(root, '00_共通/学級の実態.md'));
  assert.equal(raw.toString('utf8').includes('学級の実態'), true);
  // UTF-8 の「学」は E5 AD A6
  assert.ok(raw.includes(Buffer.from('学', 'utf8')));
});

test('空でないフォルダには何もしない', async () => {
  const root = await tmp();
  await fs.writeFile(path.join(root, '担任のメモ.md'), 'さわらないで', 'utf8');

  const { created, skipped } = await scaffold(root);
  assert.equal(skipped, true);
  assert.deepEqual(created, []);

  const entries = await fs.readdir(root);
  assert.deepEqual(entries, ['担任のメモ.md']);
});

test('--init でも既存ファイルは上書きしない', async () => {
  const root = await tmp();
  await fs.mkdir(path.join(root, '00_共通'), { recursive: true });
  await fs.writeFile(path.join(root, '00_共通/学級の実態.md'), '# 手で書いた実態\n', 'utf8');

  const { created } = await scaffold(root, { force: true });
  assert.ok(!created.includes('00_共通/学級の実態.md'));

  const kept = await fs.readFile(path.join(root, '00_共通/学級の実態.md'), 'utf8');
  assert.equal(kept, '# 手で書いた実態\n');   // 中身がそのまま
  assert.ok(created.includes('99_記憶/memory.md'));   // 足りないものは足される
});

test('二度実行しても増えない', async () => {
  const root = path.join(await tmp(), 'y');
  await scaffold(root);
  const { created } = await scaffold(root, { force: true });
  assert.deepEqual(created, []);
});

test('自立活動の一次資料は空の雛形として置かれる（推測で埋めない）', async () => {
  const root = path.join(await tmp(), 'z');
  await scaffold(root);
  const jiritsu = await fs.readFile(path.join(root, '00_共通/自立活動_区分項目.md'), 'utf8');
  assert.ok(jiritsu.includes('告示の本文をここに貼り付けて'));
  assert.ok(!jiritsu.includes('健康の保持'));   // 区分名を書いておかない
});

test('学級の実態の雛形に、架空の児童像を書かない', async () => {
  const root = path.join(await tmp(), 'w');
  await scaffold(root);
  const profile = await fs.readFile(path.join(root, '00_共通/学級の実態.md'), 'utf8');

  // 実在しそうな実態が雛形に入っていると、担任が書き換える前に教材へ流れ込む。
  // 実際にそれが起きたので、学年も到達度も空欄で出す。
  assert.match(profile, /未記入/);
  assert.doesNotMatch(profile, /（\d年）/);
  assert.doesNotMatch(profile, /相当/);
  assert.doesNotMatch(profile, /九九/);
  assert.match(profile, /- 学年:\s*$/m, '欄は空のまま置く');
});

test('評価の根拠は既定（当該学年）を書いた雛形として置かれる', async () => {
  const root = path.join(await tmp(), 'v');
  await scaffold(root);
  const basis = await fs.readFile(path.join(root, '00_共通/評価の根拠.md'), 'utf8');
  assert.match(basis, /当該学年/);
  assert.match(basis, /特別支援学校/);
  assert.match(basis, /記憶からは書きません/);

  // 条文そのものは同梱しない（記憶から書いたものが根拠になってしまう）
  const cos = await fs.readFile(path.join(root, '00_共通/学習指導要領/README.md'), 'utf8');
  assert.match(cos, /貼り付けて/);
  assert.doesNotMatch(cos, /第[1-6]学年の目標/);
});

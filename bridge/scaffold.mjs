/**
 * 教材フォルダの雛形づくり。
 *
 * Windows で担任が手作業でこれを用意しようとすると、確実に2つの罠を踏む:
 *   1. 拡張子が既定で隠れているため「学級の実態.md」が実は .md.txt になる
 *   2. メモ帳の文字コードが UTF-8 でないと、日本語が文字化けして読めない
 * どちらもブリッジ側で作れば起きない。
 *
 * 既にあるファイルは絶対に上書きしない。空でないフォルダには手を出さない。
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';

/** 作るフォルダ。教材はここに溜まっていく。 */
const DIRS = [
  '00_共通',
  '00_共通/書式',
  '01_教材/国語',
  '01_教材/算数',
  '01_教材/自立活動',
  '02_個別',
  '03_印刷テンプレート',
  '99_記憶'
];

const CLASS_PROFILE = `# 学級の実態

児童は匿名のID（A児・B児…）で書きます。**氏名は書きません。**
氏名との対応は、このフォルダの外（紙か別の場所）で管理してください。

エージェントは毎回このファイルを読みます。ここを書き換えるだけで、
出てくる教材の難易度と支援の入り方が変わります。

## A児（1年）
- 国語: ひらがな清音は読める。拗音・促音が不安定。書くのは視写まで
- 算数: 10までの数唱と1対1対応。合成分解は5まで
- 集中: 10分。切り替えに予告が要る
- 有効な支援: 具体物、写真カード、1ページ1課題

## B児（3年）
- 国語: 2年相当。音読は流暢だが内容理解の設問で崩れる
- 算数: 繰り上がりのあるたし算。九九は2・5の段
- 特性: 見通しが持てないと不安が高まる。タイマー提示が有効

## C児（5年）
- 国語: 4年相当。漢字の書字に困難。読みは学年相当
- 算数: 小数の意味理解の入り口。筆算の桁ずれが多い
- 有効な支援: マス目つきの筆算用紙、ルビ

<!-- 実際の学級に合わせて書き換えてください。人数分だけ増やせます。 -->
`;

const MEMORY = `# この学級での約束

差し戻したときの指摘がここに溜まります。エージェントは毎回これに従います。
手で書き足したり消したりしても構いません。

`;

const JIRITSU = `# 自立活動の区分・項目

**このファイルは空のままにしないでください。**

自立活動の区分と項目は、告示の本文をここに貼り付けてください。
エージェントは「このファイルに書かれている記述だけ」を根拠に紐づけます。
空のままだと、区分名を推測で書かずに「要確認」と返します（そういう作りにしてあります）。

`;

const FILES = [
  ['00_共通/学級の実態.md', CLASS_PROFILE],
  ['00_共通/自立活動_区分項目.md', JIRITSU],
  ['99_記憶/memory.md', MEMORY]
];

/** フォルダが存在しないか、中身が空か。 */
async function isEmptyOrMissing(root) {
  try {
    const entries = await fs.readdir(root);
    return entries.filter((e) => !e.startsWith('.')).length === 0;
  } catch (e) {
    if (e.code === 'ENOENT') return true;
    throw e;
  }
}

/**
 * 雛形を用意する。
 * 既に使われているフォルダ（空でない）には何もしない — 担任の作ったものを勝手に混ぜないため。
 * 戻り値は作ったものの一覧（何もしなければ空）。
 */
export async function scaffold(root, { force = false } = {}) {
  if (!force && !(await isEmptyOrMissing(root))) return { created: [], skipped: true };

  const created = [];
  await fs.mkdir(root, { recursive: true });

  for (const dir of DIRS) {
    const target = path.join(root, dir);
    try {
      await fs.access(target);
    } catch {
      await fs.mkdir(target, { recursive: true });
      created.push(`${dir}/`);
    }
  }

  for (const [rel, content] of FILES) {
    const target = path.join(root, rel);
    try {
      await fs.access(target);   // あるものは触らない
    } catch {
      await fs.writeFile(target, content, 'utf8');   // 必ず UTF-8 で書く
      created.push(rel);
    }
  }

  return { created, skipped: false };
}

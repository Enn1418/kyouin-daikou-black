/**
 * 案件名から、Windows で安全に使えるフォルダ名を作る。
 *
 * 案件タイトルは日本語の自由記述（教科名・単元名から自動生成）なので、
 * そのままフォルダ名にすると Windows で使えない文字（\ / : * ? " < > |）や、
 * 末尾のピリオド・空白（Windows は無視するが混乱のもと）が混ざりうる。
 * ここで一度だけ正規化し、フォルダ作成側（write_file の path）と
 * 表示側（S14 の「保存先」表示）が食い違わないようにする。
 */
const UNSAFE = /[\\/:*?"<>|]/g;

export function caseFolderName(title: string): string {
  const cleaned = title
    .trim()
    .replace(UNSAFE, '_')
    .replace(/\s+/g, ' ')
    .replace(/[.\s]+$/, ''); // 末尾のピリオド・空白（Windows 側で無視され混乱のもと）

  const safe = cleaned || '無題の案件';
  // 長すぎる案件名でパスが壊れないよう、フォルダ名としては程よい長さに切る
  return safe.length > 60 ? `${safe.slice(0, 60)}…` : safe;
}

/** 案件の保存先フォルダ（教材フォルダからの相対パス）。 */
export function caseFolderPath(title: string): string {
  return `04_案件/${caseFolderName(title)}`;
}

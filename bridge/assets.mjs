/**
 * 職員室の絵（部屋の背景・担当の似顔絵）を教材フォルダに置くための取り決め。
 *
 * 文書用の読み書き（/file）は拡張子のホワイトリストで守っているので、そこに PNG を
 * 通すわけにはいかない。かわりに、置き場所も名前もこちらで決めてしまう専用の口を作る。
 * 担任が渡せるのは「種類」と「id」だけなので、フォルダの外や別の拡張子には書けない。
 *
 * 生成した絵をブラウザの中に貯めない理由:
 *   1枚10円ほどかかるので、履歴を消しただけで作り直しになるのは高くつく。
 *   ファイルとして残っていれば、発表資料やおたよりにもそのまま使える。
 */

/**
 * 種類ごとの置き場所。ここに無い種類は受け付けない。
 *
 * `style-sample` は絵柄の見本。2枚目以降を描くときにこれを参照として渡すので、
 * 41人ぶんの画風がばらけずに済む。1枚だけなので id は 'default' 固定で使う。
 */
const KINDS = {
  'room-bg': '90_職員室/背景',
  'agent-face': '90_職員室/顔',
  'agent-body': '90_職員室/全身',
  'style-sample': '90_職員室/見本'
};

/** 部屋や担当の id はコードが決めた英数字。念のためここでも形を確かめる。 */
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const bad = (message) => Object.assign(new Error(message), { status: 400 });

export const ASSET_KINDS = Object.keys(KINDS);

/** 種類の置き場所（フォルダ）を返す。 */
export function assetDirectory(kind) {
  const dir = KINDS[kind];
  if (!dir) throw bad(`扱えない種類です: ${kind || '(なし)'}（${ASSET_KINDS.join(' ')} のみ）`);
  return dir;
}

/** 種類と id から、教材フォルダ内の相対パスを組み立てる。 */
export function assetRelativePath(kind, id) {
  const dir = assetDirectory(kind);
  if (!ID_PATTERN.test(id || '')) throw bad('id は英数字と - _ だけで、64文字までです');
  return `${dir}/${id}.png`;
}

/** data URL を PNG のバイト列にする。PNG 以外は受け取らない。 */
export function decodePngDataUrl(dataUrl) {
  const match = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || '').replace(/\s/g, ''));
  if (!match) throw bad('PNG の data URL（data:image/png;base64,...）が必要です');

  const buffer = Buffer.from(match[1], 'base64');
  // 拡張子だけ PNG で中身が別物、という取り違えを防ぐ
  if (buffer.length < 8 || !buffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw bad('PNG として読めません');
  }
  return buffer;
}

export function encodePngDataUrl(buffer) {
  return `data:image/png;base64,${buffer.toString('base64')}`;
}

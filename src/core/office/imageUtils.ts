/**
 * 生成した絵をファイルに置ける形に揃える。
 *
 * モデルが返す形式は保証されていない一方、教材フォルダに置くのは PNG だけにしてある
 * （拡張子ごとの分岐を増やさないため）。ついでに長辺を抑えて、フォルダが重くなるのも防ぐ。
 */

/** 受け取った絵を PNG にし、長辺が maxSize を超えていれば縮める。 */
export async function normalizeToPng(source: string, maxSize = 1280): Promise<string> {
  const image = new Image();
  image.src = source;
  await image.decode();

  const scale = Math.min(1, maxSize / Math.max(image.width, image.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('この環境では絵を変換できません');
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

  return canvas.toDataURL('image/png');
}

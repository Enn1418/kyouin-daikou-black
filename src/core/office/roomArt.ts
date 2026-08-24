import { GeminiProvider } from '../llm/providers/GeminiProvider';
import { DEFAULT_MODELS } from '../llm/constants';
import { bridge } from '../bridge/bridgeClient';

import { normalizeToPng } from './imageUtils';

import type { AgenticSystem } from '../../data/agents';

/**
 * 部屋の背景の絵。
 *
 * フロア図は毎日開く画面なので、部屋ごとの雰囲気があると楽しい。
 * ただし主役は進捗の文字なので、絵は薄く敷くだけにして、生成の指示でも
 * 「中央は空ける」「文字を描かない」を必ず入れている。
 *
 * 文字を描かせないのは docs/floor-plan.md §6 の線引きどおり。
 * 画像モデルに日本語を描かせると、読めない字が並んだ絵ができあがる。
 *
 * 描いた絵は教材フォルダに残す（90_職員室/背景/）。1枚10円ほどかかるので、
 * ブラウザの履歴を消しただけで作り直しになる置き方は避ける。
 */

/** どの部屋にも効かせる様式。ここを揃えないと、部屋ごとに絵柄がばらける。 */
const STYLE =
  'やわらかい水彩絵の具で描いた、上から見下ろした小さな部屋。' +
  '淡いパステルの色づかい、輪郭はやさしく、白い余白を多めに取る。' +
  '絵本の挿絵のような、あたたかく穏やかな雰囲気。写真のようにはしない。' +
  '文字・数字・記号・ロゴは一切描かない。人物や顔も描かない。' +
  '画面の中央は物を置かずに空けておく（この上に文字を重ねるため）。';

/** 部屋ごとに置いてほしいもの。仕事の中身がひと目で伝わる道具を選ぶ。 */
const ROOM_SCENES: Record<string, string> = {
  'sec-office': '受付のカウンター、積まれた書類の束、電話、観葉植物。',
  'sn-unit-design': '大きな机いっぱいに広げた計画の紙、付箋、方眼のノート、鉛筆立て。',
  'sn-multi-tier': '3つの小さな机が並び、それぞれに違う教具（積み木、絵カード、ノート）が置いてある。',
  'sn-japanese': '本棚にならんだ絵本、原稿用紙、鉛筆と消しゴム、読書用の小さな椅子。',
  'sn-math': '数のブロック、そろばん、定規と分度器、丸いおはじきの入った小箱。',
  'sn-jiritsu': 'やわらかいマット、バランスボール、絵カードの入ったかご、ゆったりした空間。',
  'sn-board': '教室の大きな黒板（何も書かれていない）、チョークの箱、黒板消し、教卓。',
  'sn-visual': '絵カードの束、色鉛筆とマーカー、ラミネートした紙、小さな作業台。',
  'sn-koho': '掲示板、切り抜いた色紙、はさみとのり、カメラ、丸めたポスター。',
  'qa-office': '確認用の紙の束、虫めがね、はんこと朱肉、整理された棚。'
};

/** 知らない部屋でも「職員室らしい絵」が出るようにしておく。 */
const FALLBACK_SCENE = '木の机と椅子、本棚、観葉植物、窓からの柔らかい光。';

export function buildRoomPrompt(room: AgenticSystem): string {
  return `${STYLE}\n部屋の様子: ${ROOM_SCENES[room.id] || FALLBACK_SCENE}`;
}

/** 教材フォルダに描いてある背景を読む。まだ無ければ null（描いていないだけなので静かに諦める）。 */
export async function loadRoomBackground(roomId: string): Promise<string | null> {
  try {
    const { dataUrl } = await bridge.readAsset('room-bg', roomId);
    return dataUrl;
  } catch {
    return null;
  }
}

/**
 * 部屋の背景を1枚描いて、教材フォルダに保存する。
 * 保存に失敗しても描いた絵は返す（その場では見えるが、次に開くと消える）。
 */
export async function generateRoomBackground(
  room: AgenticSystem,
  geminiApiKey: string
): Promise<string> {
  if (!geminiApiKey) throw new Error('Gemini の API キーが設定されていません（右上の鍵のボタン）');

  const provider = new GeminiProvider(geminiApiKey);
  const { data } = await provider.generateImage(
    buildRoomPrompt(room),
    DEFAULT_MODELS.image,
    undefined,
    { aspectRatio: '16:9', imageSize: '1K' }
  );
  if (!data) throw new Error('絵が返ってきませんでした。もう一度お試しください');

  const dataUrl = await normalizeToPng(`data:image/png;base64,${data}`);
  await bridge.writeAsset('room-bg', room.id, dataUrl);
  return dataUrl;
}

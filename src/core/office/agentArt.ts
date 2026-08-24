import { GeminiProvider } from '../llm/providers/GeminiProvider';
import { DEFAULT_MODELS } from '../llm/constants';
import { bridge, AssetKind } from '../bridge/bridgeClient';
import { AGENT_PROFILES, MISSING_PROFILE } from '../../data/agentProfiles';

import { normalizeToPng } from './imageUtils';

import type { AgentNode } from '../../data/agents';

/**
 * 担当ひとりずつの絵。
 *
 * 3Dの職員室では、全員が**同じモデルを担当の色で塗り分けて**動いている
 * （`public/models/character.glb` を色だけ変えて並べている）。紹介ページの絵もその姿に揃える。
 * 別人が並んでいるように見えると、3Dで見かけたあの子と結びつかない。
 *
 * したがって**形と色は全員そろえ、個性は服と持ち物だけで出す**（`AGENT_PROFILES.outfit`）。
 * これは見た目の統一のためだけでなく、人物の絵を41枚生成するときに出やすい
 * 性別・年齢の偏りを、そもそも作らずに済ませるためでもある。
 *
 * 絵柄をそろえる仕掛け:
 *   1枚ずつ独立に生成すると41人の画風がばらける。そこで最初に描いた1枚を
 *   「見本」として保存し、2枚目以降はそれを参照画像として渡す。
 *   完全には揃わないが、担任の求めた「ある程度似ていればよい」には届く。
 */

export type Shot = 'face' | 'body';

/** 全員に共通の姿。3Dのキャラの形をそのまま言葉にしたもの。 */
const FORM =
  'やわらかい3DCGのマスコット人形。丸い頭と体がひと続きになった、だるまのようにずんぐりした形。' +
  '手足は短くて丸く、指は描かない。鼻・耳・髪の毛は無い。' +
  '目は小さな白い楕円の中に黒い丸、口は小さな笑み。' +
  'つやのある粘土かソフトビニールのような質感で、やわらかい光が当たっている。' +
  '実在の人物には似せない。';

const SHOT_RULES: Record<Shot, string> = {
  face: '正方形の画面に、胸から上を正面から。顔がはっきり分かる大きさにする。',
  body: '縦長の画面に、全身を正面から。足元まで入れる。'
};

const SHOT_ASPECT: Record<Shot, string> = { face: '1:1', body: '3:4' };

const SHOT_KIND: Record<Shot, AssetKind> = { face: 'agent-face', body: 'agent-body' };

/** 見本は1枚しか持たないので id は固定。 */
const SAMPLE_ID = 'default';

export function buildAgentPrompt(agent: AgentNode, shot: Shot): string {
  const profile = AGENT_PROFILES[agent.id] || MISSING_PROFILE;
  return [
    FORM,
    `体の色は ${agent.color} の一色にする。`,
    `身につけているもの: ${profile.outfit}。服と持ち物だけで個性を出し、体の形は変えない。`,
    SHOT_RULES[shot],
    '背景は真っ白。影は足元に薄く落とすだけ。文字・数字・ロゴは描かない。'
  ].join('\n');
}

/** 保存してある絵を読む。まだ無ければ null（描いていないだけなので静かに諦める）。 */
async function readAsset(kind: AssetKind, id: string): Promise<string | null> {
  try {
    const { dataUrl } = await bridge.readAsset(kind, id);
    return dataUrl;
  } catch {
    return null;
  }
}

export const loadAgentArt = (agentId: string, shot: Shot) => readAsset(SHOT_KIND[shot], agentId);
export const loadStyleSample = () => readAsset('style-sample', SAMPLE_ID);

/**
 * 1枚描いて保存する。
 *
 * `reference` に見本を渡すと、その絵柄に寄せて描かれる。渡さないときは
 * この1枚自体が見本の候補になる（担任が見て決める）。
 */
export async function generateAgentArt(
  agent: AgentNode,
  shot: Shot,
  geminiApiKey: string,
  reference?: string | null
): Promise<string> {
  if (!geminiApiKey) throw new Error('Gemini の API キーが設定されていません（右上の鍵のボタン）');

  const provider = new GeminiProvider(geminiApiKey);
  const { data } = await provider.generateImage(
    buildAgentPrompt(agent, shot),
    DEFAULT_MODELS.image,
    undefined,
    { aspectRatio: SHOT_ASPECT[shot], imageSize: '1K' },
    reference ? [reference] : undefined
  );
  if (!data) throw new Error('絵が返ってきませんでした。もう一度お試しください');

  const dataUrl = await normalizeToPng(`data:image/png;base64,${data}`);
  await bridge.writeAsset(SHOT_KIND[shot], agent.id, dataUrl);
  return dataUrl;
}

/** 顔と全身を続けて描く。全身を先に描き、その絵に合わせて顔を描くと、服が食い違いにくい。 */
export async function generateAgentPair(
  agent: AgentNode,
  geminiApiKey: string,
  reference?: string | null
): Promise<{ face: string; body: string }> {
  const body = await generateAgentArt(agent, 'body', geminiApiKey, reference);
  const face = await generateAgentArt(agent, 'face', geminiApiKey, body);
  return { face, body };
}

/** この絵を、これから描く全員の見本にする。 */
export async function saveStyleSample(dataUrl: string): Promise<void> {
  await bridge.writeAsset('style-sample', SAMPLE_ID, dataUrl);
}

/**
 * フロア図の「段」。
 *
 * 担任の仕事は 受付 → 設計 → 制作 → 仕上げ → 点検 → 発信 と流れていく。
 * 部屋はこのどれかに属し、フロア図はそれを上から下へ並べて矢印でつなぐ。
 *
 * 部屋に座標ではなく段を持たせるのは、部屋を増やしても並べ直さずに済むようにするため
 * （docs/floor-plan.md §3「位置は手で決めない」を保つ）。
 */

export type FloorStage = '受付' | '設計' | '制作' | '仕上げ' | '点検' | '発信';

export interface FloorStageInfo {
  id: FloorStage;
  /** 段の見出しに添える短い説明。担任が流れを思い出せる程度の一言にする。 */
  note: string;
  /** 段の床の色。部屋の色とぶつからないよう、ごく淡い色にとどめる。 */
  tint: string;
}

/** 並ぶ順。フロア図はこの配列の順に上から下へ描く。 */
export const FLOOR_STAGES: FloorStageInfo[] = [
  { id: '受付', note: 'やりたいことを整理する', tint: '#FDE9D9' },
  { id: '設計', note: '単元の骨組みをつくる', tint: '#E8EAFD' },
  { id: '制作', note: '教材そのものをつくる', tint: '#DFF0FB' },
  { id: '仕上げ', note: '見せ方をととのえる', tint: '#E3F6E8' },
  { id: '点検', note: '出す前に確かめる', tint: '#FBE7EF' },
  { id: '発信', note: '外に出す', tint: '#FDF3D6' }
];

/**
 * 段が書かれていない部屋の置き場所。
 *
 * 新しい部屋を足したときに段の指定を忘れても、フロア図から消えずに
 * 「制作」に現れる。黙って居なくなるより、違う段に出ているほうが気づける。
 */
export const DEFAULT_STAGE: FloorStage = '制作';

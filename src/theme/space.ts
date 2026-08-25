import type { CSSProperties } from 'react';

/**
 * 職員室の「バーチャル空間」らしい暗い背景。
 *
 * 淡い背景に白いカードを置いていたが、担任から
 * 「枠がぼやけて見分けにくい」との指摘（2026-08-24）。**明るい背景の上の白は輪郭が立たない。**
 * 暗くすると、同じカードのまま輪郭だけがはっきりする。色を足すのではなく、下地を引く方向で直す。
 *
 * 画像を貼らずに CSS だけで作っているのは、生成画像だと担任の環境で
 * 鍵が無いときに出せず、拡大したときにぼやけるため。線は何倍に伸ばしても細いまま。
 */

/** 回路の線。タイルなので、どれだけ下にスクロールしても途切れない。 */
const CIRCUIT_TILE = encodeURIComponent(
  `<svg xmlns='http://www.w3.org/2000/svg' width='180' height='180'>
    <g fill='none' stroke='#38BDF8' stroke-width='1.1' opacity='0.55'>
      <path d='M0 46 H64 V0'/>
      <path d='M180 132 H112 V180'/>
      <path d='M44 180 V118 H96'/>
      <path d='M132 0 V58 H180'/>
      <path d='M0 132 H26'/>
      <path d='M156 96 H180'/>
    </g>
    <g fill='#22D3EE' opacity='0.8'>
      <circle cx='64' cy='46' r='2.6'/>
      <circle cx='112' cy='132' r='2.6'/>
      <circle cx='96' cy='118' r='2.6'/>
      <circle cx='132' cy='58' r='2.6'/>
    </g>
  </svg>`.replace(/\s+/g, ' ')
);

/** 画面の下地。奥に光があり、手前に向かって暗くなる。 */
export const SPACE_BACKGROUND: CSSProperties = {
  backgroundColor: '#060B18',
  backgroundImage: [
    // 奥のひかり
    'radial-gradient(120% 62% at 50% -8%, rgba(34,211,238,0.20), transparent 62%)',
    'radial-gradient(80% 40% at 50% 100%, rgba(139,92,246,0.16), transparent 70%)',
    // 回路
    `url("data:image/svg+xml,${CIRCUIT_TILE}")`
  ].join(', '),
  backgroundSize: '100% 100%, 100% 100%, 180px 180px',
  backgroundAttachment: 'local, local, local'
};

/** カードの縁を光らせるための、部屋の色を混ぜた枠線。 */
export const glowBorder = (color: string) => `0 0 0 1px ${color}55, 0 18px 40px -18px ${color}66`;

/** 段の床。暗い下地の上なので、色は「淡く敷く」ではなく「うっすら光らせる」。 */
export const stageFloor = (tint: string): CSSProperties => ({
  background: `linear-gradient(180deg, ${tint}40 0%, ${tint}12 100%)`,
  border: `1px solid ${tint}40`,
  boxShadow: `inset 0 1px 0 rgba(255,255,255,0.12), 0 0 44px -14px ${tint}`
});

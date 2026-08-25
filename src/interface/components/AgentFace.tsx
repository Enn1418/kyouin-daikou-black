import React from 'react';

/**
 * 担当の顔。状態がそのまま表情になる。
 *
 * 表情を画像にしないのは、状態が4通り × 人が40人で160枚要るから。
 * 図形で描けば、状態が変わった瞬間にそのまま切り替わるし、増員しても足りなくならない。
 * 「その子らしさ」（髪型や服）のほうは生成した絵に任せ、`portrait` を渡せば顔ごと差し替わる。
 *
 * 色は部屋や担当の色をそのまま使うが、線は必ず濃い灰色にしてある。
 * 担当の色は自由に決められるので、色の上に色を乗せると読めなくなることがある。
 */

export type FaceStatus = 'idle' | 'working' | 'talking' | 'moving' | 'on_hold';

interface AgentFaceProps {
  color: string;
  status?: FaceStatus;
  size?: number;
  /** 生成した似顔絵（data URL）。あればこちらを丸く切り抜いて出す。 */
  portrait?: string | null;
  /**
   * 似顔絵がすでに顔のアップで描かれているとき true。
   *
   * 担当41人の絵は「胸から上」なので、丸に収めると頭が小さく、服や持ち物のほうが
   * 目立ってしまう。だから既定では頭に寄せて切り取る。
   * ところが担任は2頭身で描かれていて元から顔が画面いっぱいにあり、
   * 同じだけ寄せると耳とあごが切れる。**構図が違うものに同じ切り取りは使えない。**
   */
  portraitIsCloseUp?: boolean;
  title?: string;
}

const INK = '#3F3F46';

/** 眉。状態によって傾きが変わる。内側が下がると真剣、上がると困り顔。 */
const BROWS: Partial<Record<FaceStatus, { left: string; right: string }>> = {
  working: { left: 'M12.5 15.6 L18.6 17.6', right: 'M31.5 15.6 L25.4 17.6' },
  on_hold: { left: 'M12.5 17.8 L18.6 15.4', right: 'M31.5 17.8 L25.4 15.4' }
};

const AgentFace: React.FC<AgentFaceProps> = ({ color, status = 'idle', size = 44, portrait, portraitIsCloseUp, title }) => {
  const clipId = React.useId();
  const brows = BROWS[status];

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 44 44"
      role="img"
      aria-label={title}
      className="shrink-0 overflow-visible"
    >
      {title && <title>{title}</title>}

      <defs>
        <clipPath id={clipId}>
          <circle cx="22" cy="22" r="19" />
        </clipPath>
      </defs>

      {/* 顔の下地。白に色を薄く重ねるので、どんな担当色でも線が読める */}
      <circle cx="22" cy="22" r="19" fill="#FFFFFF" />
      <circle cx="22" cy="22" r="19" fill={color} opacity="0.2" />

      {portrait ? (
        /* 似顔絵は「胸から上」で描かれているので、そのまま丸に収めると頭が小さく、
           服や持ち物のほうが目立ってしまう。約1.9倍に寄せて、頭が丸の中心に来るようにする。
           41人とも同じ構図で描かれているので、決め打ちの寄せ方で揃う。 */
        <image
          href={portrait}
          {...(portraitIsCloseUp
            ? { x: 3, y: 3, width: 38, height: 38 }      // すでに顔のアップ。そのまま収める
            : { x: -14, y: -1, width: 72, height: 72 })} // 胸から上。約1.9倍に寄せて頭を中心へ
          clipPath={`url(#${clipId})`}
          preserveAspectRatio="xMidYMid slice"
        />
      ) : (
        <>
          {/* ほっぺ。これがあるだけで、ぐっとやわらかくなる */}
          <circle cx="12.5" cy="26" r="3.4" fill="#FB7185" opacity="0.32" />
          <circle cx="31.5" cy="26" r="3.4" fill="#FB7185" opacity="0.32" />

          {brows && (
            <g stroke={INK} strokeWidth="1.8" strokeLinecap="round" fill="none">
              <path d={brows.left} />
              <path d={brows.right} />
            </g>
          )}

          {status === 'moving' ? (
            /* 移動中は目を閉じて、機嫌よく歩いている顔にする */
            <g stroke={INK} strokeWidth="1.9" strokeLinecap="round" fill="none">
              <path d="M13.4 21.2 Q16.2 18.6 19 21.2" />
              <path d="M25 21.2 Q27.8 18.6 30.6 21.2" />
            </g>
          ) : (
            <g fill={INK}>
              <circle cx="16.2" cy="21" r="2.4" />
              <circle cx="27.8" cy="21" r="2.4" />
            </g>
          )}

          {status === 'talking' ? (
            <ellipse cx="22" cy="29" rx="3.2" ry="3.8" fill={INK} />
          ) : status === 'working' ? (
            <path d="M18.4 29.4 H25.6" stroke={INK} strokeWidth="1.9" strokeLinecap="round" fill="none" />
          ) : status === 'on_hold' ? (
            <path d="M17.6 31 Q22 26.6 26.4 31" stroke={INK} strokeWidth="1.9" strokeLinecap="round" fill="none" />
          ) : (
            <path d="M16.6 27.2 Q22 33 27.4 27.2" stroke={INK} strokeWidth="1.9" strokeLinecap="round" fill="none" />
          )}

          {/* 作業中のあせ。動かすことで「今まさに手が動いている」ことが伝わる */}
          {status === 'working' && (
            <path
              d="M35.4 9.6 q2.6 3.9 0 5.4 q-2.6 -1.5 0 -5.4"
              fill="#38BDF8"
              className="animate-pulse"
            />
          )}
        </>
      )}

      {/* 輪郭は最後に描く。似顔絵を入れたときも縁が残って、部屋の色と揃う */}
      <circle cx="22" cy="22" r="19" fill="none" stroke={color} strokeWidth="2.4" />
    </svg>
  );
};

export default AgentFace;

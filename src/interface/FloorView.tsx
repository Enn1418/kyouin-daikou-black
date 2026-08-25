import React from 'react';
import { ArrowRight, ArrowUp, ChevronDown, ChevronRight, FolderOpen, Loader2, Sparkles, UserCheck } from 'lucide-react';

import { AGENTIC_SETS, AgenticSystem, USER_ID } from '../data/agents';
import { DEFAULT_STAGE, FLOOR_STAGES } from '../data/floorStages';
import { loadDrawnFaces } from '../core/office/agentArt';
import { generateRoomBackground, loadDrawnBackgrounds } from '../core/office/roomArt';
import { EMPTY_ROOM, RoomState as RoomData, useCoreStore } from '../integration/store/coreStore';
import { useBridgeStore } from '../integration/store/bridgeStore';
import { useTeamStore } from '../integration/store/teamStore';
import { agentStatusKey, useUiStore } from '../integration/store/uiStore';
import { USER_COLOR } from '../theme/brand';
import { SPACE_BACKGROUND, stageFloor } from '../theme/space';
import AgentFace, { FaceStatus } from './components/AgentFace';

/**
 * 職員室のフロア図。
 *
 * 全部屋を1画面に俯瞰し、**仕事が流れる順に上から下へ**並べる。
 * 担任 → 受付 → 設計 → 制作 → 仕上げ → 点検 → 発信 → 保管。
 * どこで何が行われているかに加えて「次はどこへ渡るのか」まで見えるようにするため。
 *
 * 部屋の位置は手で決めない。各部屋が持つ `stage` から並ぶので、
 * 部屋を増やしても並べ直さずに済む（docs/floor-plan.md §3）。
 *
 * 段どうしの矢印は**案内図**であって、実際の受け渡しの線ではない。
 * 部屋は独立して動くので、次の部屋へ渡すのは担任の判断のまま変えていない。
 */

type RoomActivity = '未使用' | '待機' | '作業中' | '承認待ち' | '完了';

interface RoomState {
  activity: RoomActivity;
  done: number;
  total: number;
  awaiting: number;
  note: string;
}

const ACTIVITY_LOOK: Record<RoomActivity, { chip: string; dot: string }> = {
  未使用: { chip: 'bg-zinc-100 text-zinc-400', dot: 'bg-zinc-300' },
  待機: { chip: 'bg-zinc-100 text-zinc-500', dot: 'bg-zinc-400' },
  作業中: { chip: 'bg-sky-100 text-sky-700', dot: 'bg-sky-500' },
  承認待ち: { chip: 'bg-amber-100 text-amber-800', dot: 'bg-amber-500' },
  完了: { chip: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500' }
};

const AGENT_LABEL: Record<FaceStatus, { text: string; className: string }> = {
  working: { text: '作業中', className: 'text-sky-600' },
  talking: { text: '相談中', className: 'text-violet-600' },
  moving: { text: '移動中', className: 'text-zinc-500' },
  on_hold: { text: '保留', className: 'text-amber-600' },
  idle: { text: '待機', className: 'text-zinc-400' }
};

/** まとめ役から担当へ枝分かれする線。人数が変わっても等間隔に分かれる。 */
const Branch: React.FC<{ count: number; color: string }> = ({ count, color }) => {
  if (count < 1) return null;
  const xs = Array.from({ length: count }, (_, i) => (300 * (i + 0.5)) / count);
  return (
    <svg viewBox="0 0 300 24" preserveAspectRatio="none" className="w-full h-5" aria-hidden>
      <g stroke={color} strokeWidth="2" fill="none" strokeLinecap="round" opacity="0.55">
        <path d="M150 0 V9" />
        {count > 1 && <path d={`M${xs[0]} 9 H${xs[xs.length - 1]}`} />}
        {xs.map((x) => (
          <path key={x} d={`M${x} 9 V22`} />
        ))}
      </g>
    </svg>
  );
};

/** 段と段のあいだの矢印。仕事がここから次へ流れる、という案内。 */
const StageArrow: React.FC = () => (
  <div className="flex flex-col items-center py-1" aria-hidden>
    <span className="w-0.5 h-6 rounded-full bg-cyan-400/50 shadow-[0_0_8px_rgba(34,211,238,0.6)]" />
    <span className="w-0 h-0 border-x-[7px] border-x-transparent border-t-[9px] border-t-cyan-400/60" />
  </div>
);

const FloorView: React.FC = () => {
  const { selectedAgentSetId, customSystems, setActiveTeam } = useTeamStore();
  const rooms = useCoreStore((s) => s.rooms);
  const setViewMode = useCoreStore((s) => s.setViewMode);
  const agentStatuses = useUiStore((s) => s.agentStatuses);
  const geminiApiKey = useUiStore((s) => s.llmConfig.geminiApiKey);
  const bridgeStatus = useBridgeStore((s) => s.status);
  const rootName = useBridgeStore((s) => s.rootName);

  const [showAnnex, setShowAnnex] = React.useState(false);
  const [backgrounds, setBackgrounds] = React.useState<Record<string, string>>({});
  const [faces, setFaces] = React.useState<Record<string, string>>({});
  const [drawing, setDrawing] = React.useState<Record<string, boolean>>({});
  const [artError, setArtError] = React.useState<string | null>(null);

  // 自作チームも部屋として並べる（重複は id で寄せる）。
  // 毎日使う特支の部屋が主。もとから入っている英語のチームは「別棟」に畳む。
  const { main, annex } = React.useMemo(() => {
    const byId = new Map<string, AgenticSystem>();
    [...AGENTIC_SETS, ...customSystems].forEach((s) => byId.set(s.id, s));
    const all = [...byId.values()];
    return {
      main: all.filter((s) => s.teamType === '特別支援'),
      annex: all.filter((s) => s.teamType !== '特別支援')
    };
  }, [customSystems]);

  /** 段ごとに部屋を仕分ける。段が書かれていない部屋も消えないよう既定の段に入れる。 */
  const byStage = React.useMemo(() => {
    const map = new Map<string, AgenticSystem[]>();
    FLOOR_STAGES.forEach((s) => map.set(s.id, []));
    main.forEach((room) => {
      const stage = room.stage && map.has(room.stage) ? room.stage : DEFAULT_STAGE;
      map.get(stage)!.push(room);
    });
    return map;
  }, [main]);

  // 描いてある背景を読み込む。教材フォルダに繋がっていないときは何もしない
  React.useEffect(() => {
    if (bridgeStatus !== 'connected') return;
    let alive = true;
    loadDrawnBackgrounds(main.map((room) => room.id)).then((found) => {
      if (!alive) return;
      // いま描いたばかりのものを、読み込み結果で上書きしない
      setBackgrounds((prev) => ({ ...found, ...prev }));
    });
    return () => { alive = false; };
  }, [bridgeStatus, main]);

  // 図鑑で描いた似顔絵があれば、机の上の顔もそれに差し替える。
  // 3Dで見かけたあの子とフロア図の丸が結びつかないと、図鑑を作った意味が薄い
  React.useEffect(() => {
    if (bridgeStatus !== 'connected') return;
    let alive = true;
    // 担任も1人として数える（フロア図の先頭に居るので、そこにも絵を出す）
    const everyone = main.flatMap((r) => [r.leadAgent, ...(r.leadAgent.subagents ?? [])]);
    loadDrawnFaces([USER_ID, ...everyone.map((a) => a.id)]).then((found) => {
      if (alive) setFaces(found);
    });
    return () => { alive = false; };
  }, [bridgeStatus, main]);

  const canDraw = bridgeStatus === 'connected' && !!geminiApiKey;
  const drawReason = !geminiApiKey
    ? '背景を描くには Gemini のキーが要ります（右上の鍵のボタン）'
    : bridgeStatus !== 'connected'
      ? '背景を描くには教材フォルダの接続が要ります（絵の保存先になるため）'
      : '';

  const draw = async (room: AgenticSystem) => {
    if (!canDraw || drawing[room.id]) return;
    setArtError(null);
    setDrawing((d) => ({ ...d, [room.id]: true }));
    try {
      const dataUrl = await generateRoomBackground(room, geminiApiKey);
      setBackgrounds((b) => ({ ...b, [room.id]: dataUrl }));
    } catch (e) {
      setArtError(e instanceof Error ? e.message : '背景を描けませんでした');
    } finally {
      setDrawing((d) => ({ ...d, [room.id]: false }));
    }
  };

  /** まだ描いていない部屋だけ、順番に描く。一斉に投げるとキーの制限に当たりやすい。 */
  const drawMissing = async () => {
    for (const room of main) {
      if (!backgrounds[room.id]) await draw(room);
    }
  };

  const missingCount = main.filter((r) => !backgrounds[r.id]).length;

  // 部屋ごとの実状態。すべての部屋が同時に動くので、全部屋ぶん読む
  const stateOf = (room: AgenticSystem): RoomState => {
    const data: RoomData = rooms[room.id] ?? EMPTY_ROOM;
    const total = data.tasks.length;
    if (total === 0 && data.phase === 'idle') {
      return { activity: '未使用', done: 0, total: 0, awaiting: 0, note: '' };
    }
    const done = data.tasks.filter((t) => t.status === 'done').length;
    const awaiting = data.tasks.filter((t) => t.status === 'on_hold' && t.requiresUserApproval).length;

    let activity: RoomActivity = '待機';
    if (awaiting > 0) activity = '承認待ち';
    else if (data.phase === 'working') activity = '作業中';
    else if (data.phase === 'done') activity = '完了';

    const lastAction = data.actionLog.length ? data.actionLog[data.actionLog.length - 1] : null;
    return { activity, done, total, awaiting, note: lastAction ? lastAction.action : '' };
  };

  const renderRoom = (room: AgenticSystem) => {
    const state = stateOf(room);
    const isActive = room.id === selectedAgentSetId;
    const look = ACTIVITY_LOOK[state.activity];
    const lead = room.leadAgent;
    const subs = lead.subagents ?? [];
    const background = backgrounds[room.id];
    const isDrawing = !!drawing[room.id];

    const faceOf = (index: number): FaceStatus =>
      (agentStatuses[agentStatusKey(room.id, index)] as FaceStatus) || 'idle';

    return (
      <section
        key={room.id}
        onClick={() => setActiveTeam(room.id)}
        className={`relative w-[310px] shrink-0 rounded-[28px] overflow-hidden cursor-pointer bg-white transition-all
          ${isActive
            ? 'shadow-[0_20px_50px_-16px_rgba(0,0,0,0.8)] ring-[3px] ring-offset-2 ring-offset-[#0B1224] -translate-y-0.5'
            : 'shadow-[0_16px_34px_-14px_rgba(0,0,0,0.75)] hover:-translate-y-0.5'}`}
        style={isActive ? ({ ['--tw-ring-color' as any]: room.color }) : undefined}
      >
        {/* 描いた背景。文字が主役なので、薄く敷いた上に白をかぶせる */}
        {background && (
          <>
            <div
              className="absolute inset-0 bg-cover bg-center"
              style={{ backgroundImage: `url(${background})` }}
              aria-hidden
            />
            <div className="absolute inset-0 bg-white/[0.72]" aria-hidden />
          </>
        )}

        <div className="relative">
          {/* 部屋の名札 */}
          <header className="flex items-center gap-2 px-4 py-3" style={{ backgroundColor: room.color }}>
            <span className="w-2.5 h-2.5 rounded-full bg-white/70" />
            <h3 className="text-sm font-black text-white flex-1 truncate">{room.teamName}</h3>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${look.chip}`}>
              {state.activity}
            </span>
          </header>

          {/* 承認のはんこ。担任が動かないと進まない唯一の状態なので、外から見えるところに出す */}
          {state.awaiting > 0 && (
            <span className="absolute right-3 top-12 -rotate-12 rounded-full border-2 border-rose-400 bg-white/95 px-2.5 py-1 text-[10px] font-black text-rose-500 shadow-sm">
              承認 {state.awaiting}
            </span>
          )}

          {/* 部屋の中。まとめ役から担当へ枝が分かれ、できたらまとめ役に戻る */}
          <div className="px-3 pt-3 pb-2">
            <div className="flex justify-center">
              <div
                className="flex items-center gap-2 rounded-2xl bg-white/90 border px-3 py-1.5 shadow-sm"
                style={{ borderColor: `${room.color}66` }}
              >
                <AgentFace color={lead.color} status={faceOf(lead.index)} portrait={faces[lead.id]} size={34} title={lead.name} />
                <span className="min-w-0">
                  <span className="block text-[11px] font-black text-darkDelegation leading-tight truncate">
                    {lead.name}
                  </span>
                  <span className="block text-[9px] font-bold text-zinc-400 leading-tight">まとめ役</span>
                </span>
              </div>
            </div>

            <Branch count={subs.length} color={room.color} />

            <div className="flex items-start justify-center gap-1.5">
              {subs.map((sub) => {
                const status = faceOf(sub.index);
                const label = AGENT_LABEL[status];
                return (
                  <div key={sub.id} className="flex-1 min-w-0 flex flex-col items-center gap-1">
                    <AgentFace color={sub.color} status={status} portrait={faces[sub.id]} size={38} title={sub.name} />
                    <span className="block w-full text-[9.5px] font-bold text-darkDelegation leading-tight text-center break-words">
                      {sub.name}
                    </span>
                    <span className={`block text-[9px] font-medium leading-none ${label.className}`}>
                      {status === 'working' && <Loader2 size={8} className="inline mr-0.5 animate-spin" />}
                      {label.text}
                    </span>
                  </div>
                );
              })}
            </div>

            {subs.length > 0 && (
              <p className="mt-2 flex items-center justify-center gap-1 text-[9px] font-bold text-zinc-400">
                <ArrowUp size={10} /> できたら、まとめ役が検査します
              </p>
            )}
          </div>

          {/* 進み具合 */}
          <footer className="px-4 py-3 border-t border-zinc-100/80 bg-white/70">
            {state.total > 0 ? (
              <>
                <div className="flex items-center justify-between text-[10px] font-bold text-zinc-500 mb-1.5">
                  <span>{state.done} / {state.total} 件</span>
                  {state.awaiting > 0 && (
                    <span className="flex items-center gap-1 text-amber-700">
                      <UserCheck size={11} /> {state.awaiting}件 見てください
                    </span>
                  )}
                </div>
                <div className="h-2 rounded-full bg-zinc-100 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${Math.round((state.done / state.total) * 100)}%`,
                      backgroundColor: room.color
                    }}
                  />
                </div>
                {state.note && <p className="mt-2 text-[10px] text-zinc-400 truncate">{state.note}</p>}
              </>
            ) : (
              <p className="text-[10px] text-zinc-400">
                {isActive ? 'まだ仕事がありません。中に入って話しかけてください。' : 'この部屋はまだ使っていません。'}
              </p>
            )}

            <div className="mt-3 flex items-center gap-2">
              {isActive && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setViewMode('simulation'); }}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-2xl bg-darkDelegation text-white text-[10px] font-black tracking-wider cursor-pointer hover:bg-black transition-colors"
                >
                  この部屋に入る <ArrowRight size={12} />
                </button>
              )}
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); draw(room); }}
                disabled={!canDraw || isDrawing}
                title={canDraw ? (background ? 'この部屋の背景を描き直す' : 'この部屋の背景を描く') : drawReason}
                className={`flex items-center justify-center gap-1 rounded-2xl py-2 text-[10px] font-black transition-colors
                  ${isActive ? 'px-3' : 'flex-1'}
                  ${canDraw && !isDrawing
                    ? 'bg-zinc-100 text-zinc-500 hover:text-darkDelegation cursor-pointer'
                    : 'bg-zinc-50 text-zinc-300 cursor-not-allowed'}`}
              >
                {isDrawing ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                {!isActive && (isDrawing ? '描いています' : background ? '背景を描き直す' : '背景を描く')}
              </button>
            </div>
          </footer>
        </div>
      </section>
    );
  };

  return (
    <div className="flex-1 min-h-0 overflow-auto p-6" style={SPACE_BACKGROUND} translate="no">
      <div className="mx-auto max-w-[1500px]">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-lg font-black text-white">職員室フロア</h1>
            <p className="text-[11px] text-slate-400 mt-0.5">
              上から下へ、仕事が流れる順に並んでいます。部屋をクリックすると今の担当になり、中に入ると3Dの職員室に切り替わります。
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-3 text-[10px] font-bold text-slate-400">
              {(['作業中', '承認待ち', '完了', '待機'] as RoomActivity[]).map((a) => (
                <span key={a} className="flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${ACTIVITY_LOOK[a].dot}`} />
                  {a}
                </span>
              ))}
            </div>
            {missingCount > 0 && (
              <button
                type="button"
                onClick={drawMissing}
                disabled={!canDraw}
                title={canDraw ? `まだ背景の無い ${missingCount} 部屋を描きます（1部屋あたり約10円）` : drawReason}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-2xl text-[10px] font-black transition-colors border border-white/10
                  ${canDraw
                    ? 'bg-white/10 text-slate-200 hover:bg-white/20 cursor-pointer'
                    : 'bg-white/5 text-slate-500 cursor-not-allowed'}`}
              >
                <Sparkles size={12} /> 背景をまとめて描く（{missingCount}部屋）
              </button>
            )}
          </div>
        </div>

        {artError && (
          <div className="mb-4 rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-[11px] font-medium text-rose-600">
            {artError}
          </div>
        )}

        {/* 起点は担任。ここから仕事が始まる */}
        <div className="flex flex-col items-center">
          <div className="flex items-center gap-2 rounded-[24px] bg-white px-5 py-3 shadow-[0_10px_26px_-18px_rgba(0,0,0,0.45)]">
            <AgentFace color={USER_COLOR} portrait={faces[USER_ID]} size={46} title="担任" />
            <span>
              <span className="block text-[12px] font-black text-darkDelegation leading-tight">担任（あなた）</span>
              <span className="block text-[10px] font-bold text-zinc-400 leading-tight">やりたいことを持ちこむ</span>
            </span>
          </div>
        </div>

        {FLOOR_STAGES.map((stage, i) => {
          const roomsInStage = byStage.get(stage.id) ?? [];
          if (!roomsInStage.length) return null;
          return (
            <React.Fragment key={stage.id}>
              <StageArrow />
              {/* 段ごとの床。淡く色を敷くと、どこからどこまでが同じ段か遠目でも分かる */}
              <div className="mx-auto w-fit max-w-full rounded-[36px] px-6 py-5" style={stageFloor(stage.tint)}>
                <div className="mb-4 flex items-center gap-2">
                  <span className="flex items-center justify-center w-6 h-6 rounded-full bg-white text-darkDelegation text-[11px] font-black shadow-sm">
                    {i + 1}
                  </span>
                  <span className="text-[13px] font-black text-white">{stage.id}</span>
                  <span className="text-[10px] font-bold text-slate-400">{stage.note}</span>
                </div>
                <div className="flex flex-wrap items-start justify-center gap-4">
                  {roomsInStage.map(renderRoom)}
                </div>
              </div>
            </React.Fragment>
          );
        })}

        <StageArrow />

        {/* 行き着く先。ここに残るから、来年も使える */}
        <div className="flex flex-col items-center">
          <div className="flex items-center gap-2 rounded-[24px] bg-white px-5 py-3 shadow-[0_10px_26px_-18px_rgba(0,0,0,0.45)]">
            <span className="flex items-center justify-center w-9 h-9 rounded-full bg-amber-50 text-amber-500">
              <FolderOpen size={18} />
            </span>
            <span>
              <span className="block text-[12px] font-black text-darkDelegation leading-tight">教材フォルダに保管</span>
              <span className="block text-[10px] font-bold text-zinc-400 leading-tight">
                {bridgeStatus === 'connected' ? rootName ?? '接続中' : '未接続（右上のフォルダから設定）'}
              </span>
            </span>
          </div>
        </div>

        {/* 別棟。元からある英語のチーム。畳んでおく */}
        {annex.length > 0 && (
          <div className="mt-10">
            <button
              type="button"
              onClick={() => setShowAnnex((v) => !v)}
              className="flex items-center gap-2 text-[11px] font-black text-slate-400 hover:text-white cursor-pointer"
            >
              {showAnnex ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              別棟（もとから入っているチーム {annex.length}）
            </button>
            {showAnnex && (
              <div className="mt-4 grid gap-5 [grid-template-columns:repeat(auto-fill,minmax(330px,1fr))]">
                {annex.map((room) => {
                  const isActive = room.id === selectedAgentSetId;
                  return (
                    <section
                      key={room.id}
                      onClick={() => setActiveTeam(room.id)}
                      className={`rounded-[24px] overflow-hidden bg-white cursor-pointer transition-all
                        ${isActive ? 'shadow-lg ring-2 ring-zinc-300' : 'shadow-sm opacity-70 hover:opacity-100'}`}
                    >
                      <header className="flex items-center gap-2 px-4 py-2.5" style={{ backgroundColor: room.color }}>
                        <h3 className="text-xs font-black text-white flex-1 truncate">{room.teamName}</h3>
                      </header>
                      <p className="px-4 py-3 text-[10px] text-zinc-500 leading-relaxed">{room.teamDescription}</p>
                    </section>
                  );
                })}
              </div>
            )}
          </div>
        )}

        <p className="mt-8 text-[10px] text-slate-500 leading-relaxed">
          矢印は仕事の流れの案内です。部屋は同時に動き、別の部屋に入っても前の部屋の仕事は続きます。
          成果物を次の部屋へ渡すのは、担任の判断で行ってください。
        </p>
      </div>
    </div>
  );
};

export default FloorView;

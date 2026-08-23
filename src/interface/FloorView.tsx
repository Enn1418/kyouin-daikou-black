import React from 'react';
import { ArrowRight, ChevronDown, ChevronRight, Loader2, UserCheck } from 'lucide-react';

import { AGENTIC_SETS, AgenticSystem, getAllAgents } from '../data/agents';
import { EMPTY_ROOM, RoomState as RoomData, useCoreStore } from '../integration/store/coreStore';
import { useTeamStore } from '../integration/store/teamStore';
import { agentStatusKey, useUiStore } from '../integration/store/uiStore';

/**
 * 職員室のフロア図。
 *
 * 3D の職員室は「1部屋ずつ切り替えて入る」形で、担任からは
 * 「毎回切り替えないといけないのが煩わしい」「どこで何が行われているか分からない」。
 * そこで、**全部屋を1画面に俯瞰する**見え方を主にする。
 *
 * 部屋は `AGENTIC_SETS` から自動で並ぶので、チームを足せば部屋が増える。
 * 位置を手で決めないのは、今後増やしていく前提だから。
 *
 * 状態は部屋ごとに分かれている（coreStore.rooms）。部屋は同時に動き、
 * ここは全部屋の実状態をそのまま映す。
 */

type RoomActivity = '未使用' | '待機' | '作業中' | '承認待ち' | '完了';

interface RoomState {
  activity: RoomActivity;
  done: number;
  total: number;
  awaiting: number;
  note: string;
}

const ACTIVITY_LOOK: Record<RoomActivity, { chip: string; dot: string; label: string }> = {
  未使用: { chip: 'bg-zinc-100 text-zinc-400', dot: 'bg-zinc-300', label: '未使用' },
  待機: { chip: 'bg-zinc-100 text-zinc-500', dot: 'bg-zinc-400', label: '待機' },
  作業中: { chip: 'bg-sky-100 text-sky-700', dot: 'bg-sky-500', label: '作業中' },
  承認待ち: { chip: 'bg-amber-100 text-amber-800', dot: 'bg-amber-500', label: '承認待ち' },
  完了: { chip: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500', label: '完了' }
};

/** 担当の様子。3D の中の状態をそのまま机の上に出す。 */
const AGENT_LOOK: Record<string, { text: string; className: string }> = {
  working: { text: '作業中', className: 'text-sky-600' },
  talking: { text: '相談中', className: 'text-violet-600' },
  moving: { text: '移動中', className: 'text-zinc-500' },
  on_hold: { text: '保留', className: 'text-amber-600' },
  idle: { text: '待機', className: 'text-zinc-400' }
};

const FloorView: React.FC = () => {
  const { selectedAgentSetId, customSystems, setActiveTeam } = useTeamStore();
  const rooms = useCoreStore((s) => s.rooms);
  const setViewMode = useCoreStore((s) => s.setViewMode);
  const agentStatuses = useUiStore((s) => s.agentStatuses);

  const [showAnnex, setShowAnnex] = React.useState(false);

  // 自作チームも部屋として並べる（重複は id で寄せる）。
  // 毎日使う特支の部屋と、それ以外（元からある英語のチーム）は棟を分ける。
  // 全部同じ密度で並べると、探すのに目が要る。
  const { main, annex } = React.useMemo(() => {
    const byId = new Map<string, AgenticSystem>();
    [...AGENTIC_SETS, ...customSystems].forEach((s) => byId.set(s.id, s));
    const all = [...byId.values()];
    return {
      main: all.filter((s) => s.teamType === '特別支援'),
      annex: all.filter((s) => s.teamType !== '特別支援')
    };
  }, [customSystems]);

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

  return (
    <div className="flex-1 min-h-0 overflow-auto bg-[#EEF1F4] p-6" translate="no">
      {/* 廊下。部屋はこの上に並ぶ */}
      <div className="mx-auto max-w-[1500px]">
        <div className="mb-5 flex items-end justify-between">
          <div>
            <h1 className="text-lg font-black text-darkDelegation">職員室フロア</h1>
            <p className="text-[11px] text-zinc-500 mt-0.5">
              部屋をクリックすると、その部屋が今の担当になります。中に入ると3Dの職員室に切り替わります。
            </p>
          </div>
          <div className="flex items-center gap-3 text-[10px] font-bold text-zinc-500">
            {(['作業中', '承認待ち', '完了', '待機'] as RoomActivity[]).map((a) => (
              <span key={a} className="flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full ${ACTIVITY_LOOK[a].dot}`} />
                {a}
              </span>
            ))}
          </div>
        </div>

        <div className="grid gap-5 [grid-template-columns:repeat(auto-fill,minmax(330px,1fr))]">
          {main.map((room) => {
            const agents = getAllAgents(room);
            const state = stateOf(room);
            const isActive = room.id === selectedAgentSetId;
            const look = ACTIVITY_LOOK[state.activity];

            return (
              <section
                key={room.id}
                onClick={() => setActiveTeam(room.id)}
                className={`text-left rounded-2xl overflow-hidden transition-all cursor-pointer bg-white
                  ${isActive
                    ? 'shadow-lg ring-2 ring-offset-2 ring-offset-[#EEF1F4]'
                    : 'shadow-sm hover:shadow-md opacity-80 hover:opacity-100'}`}
                style={isActive ? ({ ['--tw-ring-color' as any]: room.color }) : undefined}
              >
                {/* 部屋の名札 */}
                <header className="flex items-center gap-2 px-4 py-3" style={{ backgroundColor: room.color }}>
                  <span className="w-2.5 h-2.5 rounded-full bg-white/70" />
                  <h2 className="text-sm font-black text-white flex-1 truncate">{room.teamName}</h2>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${look.chip}`}>
                    {look.label}
                  </span>
                </header>

                {/* 部屋の中。床はその部屋の色でうっすら塗る（どの部屋か一目で分かるように） */}
                <div
                  className="p-3"
                  style={{
                    background: `repeating-linear-gradient(45deg, ${room.color}0A, ${room.color}0A 10px, ${room.color}17 10px, ${room.color}17 20px)`
                  }}
                >
                  {/* 備品。間取り図なので上から見た記号で置く: ホワイトボード・本棚・観葉植物 */}
                  <div className="flex items-end gap-2 mb-2 px-0.5">
                    <div
                      className="h-2.5 flex-1 rounded-sm bg-white border"
                      style={{ borderColor: `${room.color}88` }}
                      title="ホワイトボード"
                    />
                    <div className="flex items-end gap-[2px]" title="本棚">
                      {[10, 7, 9, 6].map((h, i) => (
                        <span
                          key={i}
                          className="w-1 rounded-[1px]"
                          style={{ height: `${h}px`, backgroundColor: room.color, opacity: 0.45 + (i % 2) * 0.25 }}
                        />
                      ))}
                    </div>
                    <span className="w-3 h-3 rounded-full bg-emerald-500/80 ring-2 ring-emerald-200" title="観葉植物" />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {agents.map((agent) => {
                      const status = agentStatuses[agentStatusKey(room.id, agent.index)] || 'idle';
                      const look = AGENT_LOOK[status] || AGENT_LOOK.idle;
                      const isLead = agent.index === 1;
                      return (
                        <div
                          key={agent.id}
                          className={`rounded-xl bg-white px-2.5 py-2 flex items-center gap-2 border
                            ${isLead ? 'border-zinc-300 col-span-2' : 'border-zinc-100'}`}
                          style={{ borderTop: `3px solid ${agent.color}` }}
                        >
                          <span
                            className="w-7 h-7 rounded-full shrink-0 flex items-center justify-center text-[11px] font-black text-white"
                            style={{ backgroundColor: agent.color }}
                          >
                            {agent.name.slice(0, 1)}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-[11px] font-bold text-darkDelegation leading-tight">
                              {agent.name}
                            </span>
                            <span className={`block text-[10px] font-medium ${look.className}`}>
                              {status === 'working' && (
                                <Loader2 size={9} className="inline mr-1 animate-spin" />
                              )}
                              {look.text}
                            </span>
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* 進み具合 */}
                <footer className="px-4 py-3 border-t border-zinc-100">
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
                      <div className="h-1.5 rounded-full bg-zinc-100 overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${Math.round((state.done / state.total) * 100)}%`,
                            backgroundColor: room.color
                          }}
                        />
                      </div>
                      {state.note && (
                        <p className="mt-2 text-[10px] text-zinc-400 truncate">{state.note}</p>
                      )}
                    </>
                  ) : (
                    <p className="text-[10px] text-zinc-400">
                      {isActive ? 'まだ仕事がありません。中に入って話しかけてください。' : 'この部屋はまだ使っていません。'}
                    </p>
                  )}

                  {isActive && (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setViewMode('simulation'); }}
                      className="mt-3 w-full flex items-center justify-center gap-1.5 py-2 rounded-xl bg-darkDelegation text-white text-[10px] font-black tracking-wider cursor-pointer"
                    >
                      この部屋に入る <ArrowRight size={12} />
                    </button>
                  )}
                </footer>
              </section>
            );
          })}
        </div>

        {/* 別棟。元からある英語のチーム。畳んでおく */}
        {annex.length > 0 && (
          <div className="mt-8">
            <button
              type="button"
              onClick={() => setShowAnnex((v) => !v)}
              className="flex items-center gap-2 text-[11px] font-black text-zinc-500 hover:text-darkDelegation cursor-pointer"
            >
              {showAnnex ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              別棟（もとから入っているチーム {annex.length}）
            </button>
            {showAnnex && (
              <div className="mt-4 grid gap-5 [grid-template-columns:repeat(auto-fill,minmax(330px,1fr))]">
                {annex.map((room) => {
                  const agents = getAllAgents(room);
                  const isActive = room.id === selectedAgentSetId;
                  return (
                    <section
                      key={room.id}
                      onClick={() => setActiveTeam(room.id)}
                      className={`rounded-2xl overflow-hidden bg-white cursor-pointer transition-all
                        ${isActive ? 'shadow-lg ring-2 ring-zinc-300' : 'shadow-sm opacity-70 hover:opacity-100'}`}
                    >
                      <header className="flex items-center gap-2 px-4 py-2.5" style={{ backgroundColor: room.color }}>
                        <h2 className="text-xs font-black text-white flex-1 truncate">{room.teamName}</h2>
                        <span className="text-[10px] font-bold text-white/80">{agents.length}人</span>
                      </header>
                      <p className="px-4 py-3 text-[10px] text-zinc-500 leading-relaxed">{room.teamDescription}</p>
                    </section>
                  );
                })}
              </div>
            )}
          </div>
        )}

        <p className="mt-8 text-[10px] text-zinc-400 leading-relaxed">
          部屋は同時に動きます。別の部屋に入っても、前の部屋の仕事は続きます。
          仕事の中身（承認・差し戻し）は、その部屋に入ってから行ってください。
        </p>
      </div>
    </div>
  );
};

export default FloorView;

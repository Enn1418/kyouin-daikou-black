import React from 'react';
import { Loader2, Sparkles, X } from 'lucide-react';

import { AGENTIC_SETS, AgenticSystem, AgentNode, USER_ID } from '../data/agents';
import { AGENT_PROFILES, MISSING_PROFILE } from '../data/agentProfiles';
import { DEFAULT_STAGE, FLOOR_STAGES } from '../data/floorStages';
import { generateAgentPair, loadAgentArt, loadDrawnFaces, loadStyleSample, saveStyleSample } from '../core/office/agentArt';
import { useBridgeStore } from '../integration/store/bridgeStore';
import { useTeamStore } from '../integration/store/teamStore';
import { useUiStore } from '../integration/store/uiStore';
import { USER_COLOR } from '../theme/brand';
import { SPACE_BACKGROUND } from '../theme/space';
import AgentFace from './components/AgentFace';

/**
 * 担当図鑑。どの部屋に誰がいて、何をする子なのかを一覧にする。
 *
 * 部屋の中にいる担当は、話しかけないと何をする子か分からない。
 * 「この仕事は誰に頼めばいいのか」を思い出すための索引として、全員を一度に並べる。
 *
 * 一覧は顔、開いたら全身。絵が無いうちは図形の顔が出るので、
 * 1枚も描いていなくてもページとして成立する。
 */

/** 1人につき顔と全身の2枚。1枚 $0.067 ≒ 10円。 */
const YEN_PER_PERSON = 20;

interface Art { face?: string; body?: string }

/**
 * 担任も1人として並べる。
 *
 * 職員室で唯一の人間だが、フロア図でも3Dでも他の担当と同じ場所に居る。
 * 図鑑にだけ居ないと「自分の絵はどこで描くのか」が分からなくなるので、
 * 部屋を1つ持っている形にして、同じ導線に乗せる。
 */
const TEACHER_ROOM = {
  id: 'teacher',
  teamName: 'あなた',
  teamType: '特別支援',
  teamDescription: '',
  color: USER_COLOR,
  outputType: 'text',
  outputModel: '',
  user: { index: 0, model: 'Human' },
  leadAgent: {
    id: USER_ID,
    index: 0,
    name: '担任（あなた）',
    description: '',
    color: USER_COLOR,
    model: 'Human'
  }
} as AgenticSystem;

const CharacterBook: React.FC = () => {
  const customSystems = useTeamStore((s) => s.customSystems);
  const geminiApiKey = useUiStore((s) => s.llmConfig.geminiApiKey);
  const bridgeStatus = useBridgeStore((s) => s.status);

  const [art, setArt] = React.useState<Record<string, Art>>({});
  const [sample, setSample] = React.useState<string | null>(null);
  const [openId, setOpenId] = React.useState<string | null>(null);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [progress, setProgress] = React.useState<{ done: number; total: number } | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const rooms = React.useMemo(() => {
    const byId = new Map<string, AgenticSystem>();
    [...AGENTIC_SETS, ...customSystems].forEach((s) => byId.set(s.id, s));
    const all = [...byId.values()].filter((s) => s.teamType === '特別支援');
    // フロア図と同じ順（仕事が流れる順）に並べる。並びが違うと探し直しになる
    const order = new Map(FLOOR_STAGES.map((s, i) => [s.id, i]));
    const sorted = all.sort(
      (a, b) => (order.get(a.stage ?? DEFAULT_STAGE) ?? 99) - (order.get(b.stage ?? DEFAULT_STAGE) ?? 99)
    );
    // 仕事は担任から始まるので、先頭に置く
    return [TEACHER_ROOM, ...sorted];
  }, [customSystems]);

  /** 見出しの人数は部屋の担当だけを数える（担任は職員ではないため）。 */
  const roomCount = rooms.length - 1;

  const agentsOf = (room: AgenticSystem): AgentNode[] => [room.leadAgent, ...(room.leadAgent.subagents ?? [])];
  const everyone = React.useMemo(
    () => rooms.flatMap((room) => agentsOf(room).map((agent) => ({ room, agent }))),
    [rooms]
  );

  // 一覧に出すのは顔だけ読み込む。全身は開いたときに読む（人数ぶん一度に読むと重い）
  React.useEffect(() => {
    if (bridgeStatus !== 'connected') return;
    let alive = true;
    (async () => {
      const faces = await loadDrawnFaces(everyone.map(({ agent }) => agent.id));
      const found = await loadStyleSample();
      if (!alive) return;
      setArt((prev) => {
        const next = { ...prev };
        Object.entries(faces).forEach(([id, face]) => { next[id] = { ...next[id], face }; });
        return next;
      });
      setSample(found);
    })();
    return () => { alive = false; };
  }, [bridgeStatus, everyone]);

  const canDraw = bridgeStatus === 'connected' && !!geminiApiKey;
  const reason = !geminiApiKey
    ? '絵を描くには Gemini のキーが要ります（右上の鍵のボタン）'
    : bridgeStatus !== 'connected'
      ? '絵を描くには教材フォルダの接続が要ります（絵の保存先になるため）'
      : '';

  /** 1人を描く。見本があれば、その絵柄に寄せて描く。 */
  const drawOne = async (agent: AgentNode, useSample = true): Promise<string | null> => {
    setBusyId(agent.id);
    setError(null);
    try {
      const pair = await generateAgentPair(agent, geminiApiKey, useSample ? sample : null);
      setArt((a) => ({ ...a, [agent.id]: pair }));
      return pair.body;
    } catch (e) {
      setError(e instanceof Error ? e.message : '絵を描けませんでした');
      return null;
    } finally {
      setBusyId(null);
    }
  };

  /** 見本を1枚描く。気に入るまでここを繰り返せば、41人ぶん描き直さずに済む。 */
  const drawSample = async () => {
    const first = everyone[0];
    if (!canDraw || !first) return;
    const body = await drawOne(first.agent, false);
    if (!body) return;
    await saveStyleSample(body);
    setSample(body);
    setOpenId(first.agent.id);
  };

  const undrawn = everyone.filter(({ agent }) => !art[agent.id]?.face);

  /** まだ描いていない人を、見本に寄せて順に描く。一斉に投げるとキーの制限に当たりやすい。 */
  const drawRest = async () => {
    if (!canDraw) return;
    const targets = [...undrawn];
    for (let i = 0; i < targets.length; i++) {
      setProgress({ done: i, total: targets.length });
      const ok = await drawOne(targets[i].agent);
      if (!ok) break;                            // 失敗したら止める。残りも同じ理由で失敗する
    }
    setProgress(null);
  };

  const opened = openId ? everyone.find(({ agent }) => agent.id === openId) : null;

  // 開いたときに全身を読む。一覧では読んでいないので、ここで初めて要る
  React.useEffect(() => {
    if (!opened || bridgeStatus !== 'connected') return;
    const id = opened.agent.id;
    if (art[id]?.body) return;
    let alive = true;
    loadAgentArt(id, 'body').then((body) => {
      if (alive && body) setArt((a) => ({ ...a, [id]: { ...a[id], body } }));
    });
    return () => { alive = false; };
  }, [opened, bridgeStatus, art]);

  return (
    <div className="flex-1 min-h-0 overflow-auto p-6" style={SPACE_BACKGROUND} translate="no">
      <div className="mx-auto max-w-[1500px]">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-lg font-black text-white">担当図鑑</h1>
            <p className="text-[11px] text-slate-400 mt-0.5">
              担任（あなた）と、{roomCount}部屋・{everyone.length - 1}人。
              この仕事は誰に頼めばいいか迷ったときに開いてください。名前をクリックすると、その子の詳しい紹介が出ます。
            </p>
          </div>

          <div className="flex items-center gap-2">
            {progress ? (
              <span className="flex items-center gap-2 px-4 py-2 rounded-2xl bg-white/10 border border-white/10 text-[11px] font-black text-slate-200">
                <Loader2 size={13} className="animate-spin" />
                {progress.done + 1} / {progress.total} 人目を描いています
              </span>
            ) : !sample ? (
              <button
                type="button"
                onClick={drawSample}
                disabled={!canDraw || !!busyId}
                title={canDraw ? '' : reason}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-2xl text-[11px] font-black transition-all
                  ${canDraw && !busyId
                    ? 'bg-cyan-400 text-[#06121F] hover:bg-cyan-300 cursor-pointer shadow-[0_0_24px_-4px_rgba(34,211,238,0.8)]'
                    : 'bg-white/5 border border-white/10 text-slate-500 cursor-not-allowed'}`}
              >
                {busyId ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
                まず見本を1枚描く（約{YEN_PER_PERSON}円）
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={drawSample}
                  disabled={!canDraw || !!busyId}
                  title={canDraw ? '見本を描き直します。以降はこの絵柄に寄ります' : reason}
                  className={`px-3 py-2 rounded-2xl text-[10px] font-black transition-colors border border-white/10
                    ${canDraw && !busyId ? 'bg-white/10 text-slate-200 hover:bg-white/20 cursor-pointer' : 'bg-white/5 text-slate-500 cursor-not-allowed'}`}
                >
                  見本を描き直す
                </button>
                {undrawn.length > 0 && (
                  <button
                    type="button"
                    onClick={drawRest}
                    disabled={!canDraw || !!busyId}
                    title={canDraw ? `見本の絵柄で ${undrawn.length} 人ぶん描きます` : reason}
                    className={`flex items-center gap-1.5 px-4 py-2 rounded-2xl text-[11px] font-black transition-all
                      ${canDraw && !busyId
                        ? 'bg-cyan-400 text-[#06121F] hover:bg-cyan-300 cursor-pointer shadow-[0_0_24px_-4px_rgba(34,211,238,0.8)]'
                        : 'bg-white/5 border border-white/10 text-slate-500 cursor-not-allowed'}`}
                  >
                    <Sparkles size={13} />
                    残り{undrawn.length}人を描く（約{undrawn.length * YEN_PER_PERSON}円）
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {!sample && (
          <div className="mb-5 rounded-2xl border border-amber-300/30 bg-amber-400/10 px-4 py-3 text-[11px] font-medium text-amber-200 leading-relaxed">
            絵はまだ1枚もありません。<strong>先に見本を1枚だけ描いて、絵柄を決めてください。</strong>
            気に入らなければ描き直せます（1回 約{YEN_PER_PERSON}円）。決まったあとで残りをまとめて描くと、全員の絵柄が揃います。
          </div>
        )}

        {error && (
          <div className="mb-5 rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-[11px] font-medium text-rose-600">
            {error}
          </div>
        )}

        <div className="space-y-8">
          {rooms.map((room) => (
            <section key={room.id}>
              <div className="mb-3 flex items-center gap-2">
                <span
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: room.color, boxShadow: `0 0 10px ${room.color}` }}
                />
                <h2 className="text-[13px] font-black text-white">{room.teamName}</h2>
                <span className="text-[10px] font-bold text-slate-400">{agentsOf(room).length}人</span>
              </div>

              <div className="flex flex-wrap gap-3">
                {agentsOf(room).map((agent) => {
                  const profile = AGENT_PROFILES[agent.id] || MISSING_PROFILE;
                  // 担任は index 0、まとめ役は 1、それ以外が担当
                  const role = agent.index === 0 ? '担任' : agent.index === 1 ? 'まとめ役' : '担当';
                  return (
                    <button
                      key={agent.id}
                      type="button"
                      onClick={() => setOpenId(agent.id)}
                      className="w-[230px] text-left rounded-[24px] bg-white p-4 shadow-[0_16px_34px_-14px_rgba(0,0,0,0.75)] hover:-translate-y-0.5 transition-all cursor-pointer"
                    >
                      <div className="flex items-center gap-2.5">
                        {/* 担任だけ少し大きく。色では見分けきれないので、大きさも手がかりにする */}
                        <AgentFace
                          color={agent.color}
                          portrait={art[agent.id]?.face}
                          size={agent.index === 0 ? 58 : 46}
                          portraitIsCloseUp={agent.index === 0}
                          title={agent.name}
                        />
                        <span className="min-w-0">
                          <span className="block text-[12px] font-black text-darkDelegation leading-tight break-words">
                            {agent.name}
                          </span>
                          <span className="block text-[9px] font-black text-zinc-400 leading-tight mt-0.5">
                            {role}
                          </span>
                        </span>
                      </div>
                      {/* 担当の色は自由に決められる（淡い色もある）ので、文字は必ず濃い灰色。
                          色は文字ではなく、横の帯で示す */}
                      <p className="mt-2.5 flex items-start gap-1.5 text-[11px] font-bold leading-snug text-zinc-600">
                        <span
                          className="mt-[3px] w-1 h-3.5 rounded-full shrink-0"
                          style={{ backgroundColor: agent.color }}
                        />
                        {profile.tagline}
                      </p>
                      {busyId === agent.id && (
                        <p className="mt-2 flex items-center gap-1 text-[9px] font-black text-zinc-400">
                          <Loader2 size={9} className="animate-spin" /> 描いています
                        </p>
                      )}
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </div>

      {/* 開いたところ。全身の絵と紹介文を大きく出す */}
      {opened && (
        <div className="fixed inset-0 z-100 flex items-center justify-center p-6 pointer-events-auto">
          <div onClick={() => setOpenId(null)} className="absolute inset-0 bg-[#060B18]/70 backdrop-blur-xl" />
          <div className="relative w-full max-w-lg bg-white rounded-[40px] shadow-[0_32px_64px_-12px_rgba(0,0,0,0.1)] p-8 border border-zinc-100">
            <button
              onClick={() => setOpenId(null)}
              className="absolute top-6 right-6 text-zinc-300 hover:text-zinc-600 transition-colors cursor-pointer"
            >
              <X size={18} />
            </button>

            <div className="flex gap-5">
              <div
                className="w-[150px] shrink-0 rounded-[28px] overflow-hidden flex items-end justify-center"
                style={{ backgroundColor: `${opened.agent.color}1A` }}
              >
                {art[opened.agent.id]?.body ? (
                  <img
                    src={art[opened.agent.id]!.body}
                    alt={opened.agent.name}
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <div className="py-10">
                    <AgentFace color={opened.agent.color} portrait={art[opened.agent.id]?.face} portraitIsCloseUp={opened.agent.index === 0} size={92} />
                  </div>
                )}
              </div>

              <div className="min-w-0 flex-1">
                <span className="text-[10px] font-black text-zinc-400">{opened.room.teamName}</span>
                <h2 className="text-xl font-black text-darkDelegation tracking-tight leading-tight mt-0.5">
                  {opened.agent.name}
                </h2>
                <p className="mt-1.5 flex items-center gap-1.5 text-[12px] font-black text-zinc-700">
                  <span
                    className="w-1.5 h-4 rounded-full shrink-0"
                    style={{ backgroundColor: opened.agent.color }}
                  />
                  {(AGENT_PROFILES[opened.agent.id] || MISSING_PROFILE).tagline}
                </p>
                <p className="mt-3 text-[12px] text-zinc-600 leading-relaxed">
                  {(AGENT_PROFILES[opened.agent.id] || MISSING_PROFILE).bio}
                </p>

                <button
                  type="button"
                  onClick={() => drawOne(opened.agent)}
                  disabled={!canDraw || !!busyId}
                  title={canDraw ? '' : reason}
                  className={`mt-5 flex items-center gap-1.5 px-4 py-2.5 rounded-2xl text-[10px] font-black transition-colors
                    ${canDraw && !busyId
                      ? 'bg-zinc-100 text-zinc-600 hover:text-darkDelegation cursor-pointer'
                      : 'bg-zinc-50 text-zinc-300 cursor-not-allowed'}`}
                >
                  {busyId === opened.agent.id ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                  {art[opened.agent.id]?.body ? 'この子を描き直す' : 'この子を描く'}
                  <span className="font-bold text-zinc-400">（約{YEN_PER_PERSON}円）</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CharacterBook;

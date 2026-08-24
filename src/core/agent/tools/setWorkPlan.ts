import { AGENTIC_SETS, getAgentSet } from '../../../data/agents';
import { useJobStore } from '../../../integration/store/jobStore';
import { useTeamStore } from '../../../integration/store/teamStore';
import { renderBlueprintHtml, renderProposalHtml } from '../../jobs/documents';
import type { RoomInfo } from '../../jobs/documents';
import type { PlanStep } from '../../jobs/types';
import { normalizePlan, validatePlan } from '../../workflow/validatePlan';
import { AgentActionContext } from '../ToolRegistry';

/**
 * 段取りの登録。タスク設計担当（秘書室）だけが使う。
 *
 * **出された段取りをそのまま信じない。** 実在しない部門を指す、依存が循環している、
 * 依頼票の成果物が抜けている——どれも通してしまうと、案件が途中で止まるか、
 * 頼んだものが出てこないまま完了する。検査に落ちたら理由を返して作り直させる。
 *
 * 検査を通ったら、構成案とシステム設計図を組み立てて**承認待ち①で止める**。
 * ここから先は CEO が「実行」を選ぶまで進まない。
 */

interface Args {
  steps: {
    id: string;
    roomId: string;
    title: string;
    brief?: string;
    dependsOn?: string[];
    parallelGroup?: number;
    doneCondition: string;
    startCondition?: string;
  }[];
}

/** 設計図に載せる部門の一覧。チーム定義から組み立てる。 */
function roomInfos(): RoomInfo[] {
  const custom = useTeamStore.getState().customSystems;
  const all = [...AGENTIC_SETS, ...custom];
  const byId = new Map(all.map((s) => [s.id, s]));

  return [...byId.values()].map((sys) => {
    const flat: { name: string; role: string }[] = [];
    const walk = (node: any) => {
      flat.push({ name: node.name, role: firstSentence(node.description) });
      (node.subagents ?? []).forEach(walk);
    };
    walk(sys.leadAgent);
    return { id: sys.id, name: sys.teamName, color: sys.color, agents: flat };
  });
}

/** 役割説明は長いので、設計図では最初の一文だけ見せる。 */
function firstSentence(desc: string): string {
  const t = desc.replace(/^あなたは/, '').split(/。/)[0];
  return t.length > 90 ? `${t.slice(0, 90)}…` : t;
}

export function setWorkPlan(agent: AgentActionContext, args: Args): string {
  const { jobs, activeJobId } = useJobStore.getState();
  const job = activeJobId ? jobs[activeJobId] : null;

  if (!job) {
    return '登録できません: いま選ばれている案件がありません。CEO に案件を作ってもらってください。';
  }
  if (!job.sheetLockedAt) {
    return '登録できません: 依頼票がまだ確定していません。先に不足項目を CEO に尋ねてください。';
  }

  const rooms = roomInfos();
  const draft = {
    steps: (args.steps ?? []).map(
      (s) =>
        ({
          id: s.id,
          roomId: s.roomId,
          title: s.title,
          brief: s.brief ?? '',
          dependsOn: s.dependsOn ?? [],
          parallelGroup: s.parallelGroup ?? 0,
          startCondition: s.startCondition ?? '',
          doneCondition: s.doneCondition,
          status: 'pending',
          reworkCount: 0
        }) as PlanStep
    )
  };

  // 秘書室と品質管理室は「作る部門」ではないので、段取りの割り当て先から外す
  const assignable = rooms
    .map((r) => r.id)
    .filter((id) => id !== 'sec-office' && id !== 'qa-office');

  const problems = validatePlan(draft, { knownRoomIds: assignable, sheet: job.sheet });
  if (problems.length > 0) {
    return (
      '段取りを登録できませんでした。次を直してから、もう一度 set_work_plan を呼んでください。\n' +
      problems.map((p, i) => `${i + 1}. ${p.message}`).join('\n')
    );
  }

  const plan = normalizePlan(draft);
  const store = useJobStore.getState();
  store.setPlan(job.id, plan);

  // 検査を通った段取りで2枚の書類を組み立て、承認待ちで止める
  const withPlan = { ...job, plan };
  store.setDocuments(job.id, renderProposalHtml(withPlan), renderBlueprintHtml(withPlan, rooms));
  store.setStatus(job.id, '承認待ち①');
  store.addEvent(job.id, agent.roomId, `段取りを登録（${plan.steps.length}工程）。CEO の承認待ちにしました`);

  const groups = new Set(plan.steps.map((s) => s.parallelGroup)).size;
  return (
    `段取りを登録しました（${plan.steps.length}工程／${groups}段階）。\n` +
    '単元構成案とシステム設計図を作り、**承認待ちにしました**。\n' +
    'CEO が「実行」を選ぶまで制作は始まりません。CEO に確認を促してください。'
  );
}

/** 段取りを作れる担当か。タスク設計担当と、その部門のリードだけ。 */
export function canSetWorkPlan(agentId?: string): boolean {
  return agentId === 'sec-planner' || agentId === 'sec-chief';
}

/** 使える部門のID一覧（プロンプトに載せる用）。 */
export function assignableRoomList(): string {
  const custom = useTeamStore.getState().customSystems;
  return [...AGENTIC_SETS, ...custom]
    .filter((s) => s.teamType === '特別支援' && s.id !== 'sec-office' && s.id !== 'qa-office')
    .map((s) => `${s.id}（${s.teamName}）`)
    .join('、');
}

/** 単体テスト用に外へ出す（チームストアに触らない純粋部分）。 */
export const __test = { firstSentence, getAgentSet };

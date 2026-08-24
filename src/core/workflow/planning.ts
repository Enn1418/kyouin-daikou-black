/**
 * ワークフローの判断。**副作用を持たない純粋な関数だけを置く。**
 *
 * なぜ司会をAIにしないか（docs/system-redesign.md §3.1）:
 * LLM に順序管理をさせると、確率的に工程を飛ばす。品質管理を通さず完了にする、
 * 差し戻しを延々と繰り返す、同じ部屋を二重に起動する——これらは「たまに」起きるので
 * テストで捕まえにくく、CEO が気づいたときには成果物が出てしまっている。
 *
 * このリポジトリはすでに、ドリルの数値・図の個数・板書の寸法を決定的なコードに寄せている。
 * 司会も同じ理由でコードに寄せる。ここが純粋関数なら、挙動をテストで固定できる。
 */
import type { Job, PlanStep, WorkPlan } from '../jobs/types.ts';

/** 何回差し戻しても基準に届かないときに CEO へ上げるまでの回数。 */
export const MAX_REWORK = 2;

export type EngineDecision =
  | { kind: 'start'; stepId: string; roomId: string }
  | { kind: 'toQa'; stepId: string }
  | { kind: 'rework'; stepId: string; sendBackTo: string; reason: string }
  | { kind: 'escalate'; stepId: string; reason: string }
  | { kind: 'allDone' }
  | { kind: 'halt'; reason: string };

/** 動かし終わった扱いにする状態。依存の判定に使う。 */
const SETTLED: PlanStep['status'][] = ['done', 'skipped'];

/**
 * その部屋を占有している状態。二重起動を防ぐための判定。
 *
 * `rework`（差し戻された）は**入れない**。差し戻しはこれから作り直すもので、
 * まだ動いてはいない。占有扱いにすると「起動もできず空きもしない」状態になり、
 * その部屋の工程が永久に止まる。
 */
const OCCUPYING: PlanStep['status'][] = ['running', 'qa'];

/** これから起動できる状態。差し戻しは作り直しなので、ここに入る。 */
const STARTABLE: PlanStep['status'][] = ['pending', 'ready', 'rework'];

export function isSettled(step: PlanStep): boolean {
  return SETTLED.includes(step.status);
}

/** 依存する工程がすべて片付いているか。 */
export function dependenciesMet(step: PlanStep, plan: WorkPlan): boolean {
  return step.dependsOn.every((id) => {
    const dep = plan.steps.find((s) => s.id === id);
    // 存在しない依存は「満たせない」扱いにする。黙って進めると、
    // 段取りの書き間違いが成果物の欠落として現れる
    return dep ? isSettled(dep) : false;
  });
}

/** その部屋がいま別の工程で埋まっているか。 */
export function roomBusy(roomId: string, plan: WorkPlan, exceptStepId?: string): boolean {
  return plan.steps.some(
    (s) => s.roomId === roomId && s.id !== exceptStepId && OCCUPYING.includes(s.status)
  );
}

/**
 * 依存先が error で、もう満たされる見込みが無い工程。
 * これを放置すると、その工程は永久に pending のまま残り、案件が終わらない。
 */
export function isStranded(step: PlanStep, plan: WorkPlan): boolean {
  if (isSettled(step) || step.status === 'error') return false;
  return step.dependsOn.some((id) => {
    const dep = plan.steps.find((s) => s.id === id);
    return !dep || dep.status === 'error';
  });
}

export interface EngineContext {
  /** 予算を超えていないか。超えていれば全部止める。 */
  spentUsd: number;
  budgetUsd: number;
}

/**
 * いま取るべき行動を返す。**この関数は状態を変えない。**
 *
 * 呼び出し側（WorkflowEngine）が実際の起動や記録を行う。
 * 判断と実行を分けておくと、判断だけをテストで固定できる。
 */
export function decideNextActions(plan: WorkPlan, ctx: EngineContext): EngineDecision[] {
  // 予算の歯止めは何より先。走っているものを増やさない
  if (ctx.budgetUsd > 0 && ctx.spentUsd >= ctx.budgetUsd) {
    return [{ kind: 'halt', reason: `上限額 $${ctx.budgetUsd} に達しました（使用 $${ctx.spentUsd.toFixed(2)}）` }];
  }

  const decisions: EngineDecision[] = [];

  // 依存先が失敗して動けなくなった工程は、黙って残さず CEO に上げる
  plan.steps.filter((s) => isStranded(s, plan)).forEach((s) => {
    decisions.push({
      kind: 'escalate',
      stepId: s.id,
      reason: '先に終わっているはずの工程が失敗したため、この工程は始められません'
    });
  });

  // 起動できる工程。**同じ部屋を二重に起動しない**（埋まっていれば次の tick で拾う）
  const claimed = new Set<string>();
  plan.steps
    .filter((s) => STARTABLE.includes(s.status))
    .filter((s) => dependenciesMet(s, plan))
    .filter((s) => !isStranded(s, plan))
    .forEach((s) => {
      if (roomBusy(s.roomId, plan, s.id) || claimed.has(s.roomId)) return;
      claimed.add(s.roomId);
      decisions.push({ kind: 'start', stepId: s.id, roomId: s.roomId });
    });

  if (plan.steps.length > 0 && plan.steps.every(isSettled)) {
    decisions.push({ kind: 'allDone' });
  }

  return decisions;
}

/**
 * 品質管理の判定を受けて、次にどうするか。
 *
 * **合格でも不合格でも、決めるのはここ（制御層）で、品質管理室ではない。**
 * 品質管理室が自分で「完了」にできてしまうと、監査の独立性が崩れる
 * （docs/system-redesign.md §4.8）。
 */
export function decideAfterQa(
  step: PlanStep,
  verdict: '合格' | '不合格',
  sendBackTo: string | undefined,
  reason: string
): EngineDecision {
  if (verdict === '合格') return { kind: 'toQa', stepId: step.id };

  if (step.reworkCount >= MAX_REWORK) {
    return {
      kind: 'escalate',
      stepId: step.id,
      reason: `${step.reworkCount + 1}回直しても品質基準に届きません。基準を下げるか、方針を変えるかの判断をお願いします。（直近の理由: ${reason}）`
    };
  }

  return { kind: 'rework', stepId: step.id, sendBackTo: sendBackTo || step.roomId, reason };
}

/** 進み具合（画面表示用）。 */
export function planProgress(plan: WorkPlan | undefined): { done: number; total: number; running: number } {
  if (!plan) return { done: 0, total: 0, running: 0 };
  return {
    done: plan.steps.filter(isSettled).length,
    total: plan.steps.length,
    running: plan.steps.filter((s) => OCCUPYING.includes(s.status)).length
  };
}

/**
 * 最終成果物を出してよいか（docs/system-redesign.md §3.6）。
 * ここを緩めると「検査を通っていないものが出る」ので、条件は全部そろって初めて true。
 */
export function canDeliver(job: Job): { ok: boolean; missing: string[] } {
  const missing: string[] = [];
  const steps = job.plan?.steps ?? [];

  if (steps.length === 0) missing.push('段取りがありません');

  const unfinished = steps.filter((s) => !isSettled(s));
  if (unfinished.length > 0) {
    missing.push(`終わっていない工程が${unfinished.length}件あります`);
  }

  // 完了した工程には、必ず品質管理の合格記録があること
  const doneSteps = steps.filter((s) => s.status === 'done');
  const passed = new Set(
    job.qaReports.filter((r) => r.verdict === '合格').map((r) => r.stepId)
  );
  const unchecked = doneSteps.filter((s) => !passed.has(s.id));
  if (unchecked.length > 0) {
    missing.push(`品質管理を通っていない工程が${unchecked.length}件あります`);
  }

  // 依頼票に書いた成果物がそろっているか
  const wanted = job.sheet.wantedOutputs;
  const titles = job.deliverables.map((d) => d.title).join(' ');
  const notMade = wanted.filter((w) => !titles.includes(w));
  if (notMade.length > 0) {
    missing.push(`依頼した成果物が未作成です: ${notMade.join('、')}`);
  }

  return { ok: missing.length === 0, missing };
}

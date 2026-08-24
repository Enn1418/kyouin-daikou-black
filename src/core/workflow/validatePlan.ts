/**
 * 段取りの検査。**純粋関数。**
 *
 * タスク設計担当（LLM）が出した段取りをそのまま信じない。
 * 実在しない部門を指す、依存が循環している、依頼票にある成果物が抜けている——
 * どれも「たまに」起きるが、通してしまうと案件が途中で止まるか、
 * 頼んだものが出てこないまま完了する。**気づくのは CEO が待たされた後になる。**
 *
 * ここで弾いて、理由を添えて作り直させる。
 */
import type { PlanStep, RequirementSheet, WorkPlan } from '../jobs/types.ts';

export interface PlanProblem {
  stepId?: string;
  message: string;
}

/** 循環参照を探す。あると、その工程は永久に始まらない。 */
function findCycles(steps: PlanStep[]): string[] {
  const byId = new Map(steps.map((s) => [s.id, s]));
  const state = new Map<string, 'visiting' | 'done'>();
  const cyclic: string[] = [];

  const walk = (id: string): boolean => {
    const st = state.get(id);
    if (st === 'done') return false;
    if (st === 'visiting') return true;

    state.set(id, 'visiting');
    const step = byId.get(id);
    const hit = (step?.dependsOn ?? []).some((d) => byId.has(d) && walk(d));
    state.set(id, 'done');
    if (hit && !cyclic.includes(id)) cyclic.push(id);
    return hit;
  };

  steps.forEach((s) => walk(s.id));
  return cyclic;
}

export interface ValidateOptions {
  /** 実在する部門のID。ここに無い部門を指す段取りは通さない。 */
  knownRoomIds: string[];
  sheet: RequirementSheet;
}

export function validatePlan(plan: WorkPlan, opts: ValidateOptions): PlanProblem[] {
  const problems: PlanProblem[] = [];
  const { steps } = plan;

  if (steps.length === 0) {
    problems.push({ message: '工程が1つもありません。' });
    return problems;
  }

  const ids = new Set<string>();
  const known = new Set(opts.knownRoomIds);

  steps.forEach((s) => {
    if (!s.id?.trim()) {
      problems.push({ message: '工程にIDがありません。' });
      return;
    }
    if (ids.has(s.id)) {
      problems.push({ stepId: s.id, message: `工程IDが重複しています: ${s.id}` });
    }
    ids.add(s.id);

    if (!known.has(s.roomId)) {
      problems.push({
        stepId: s.id,
        message: `「${s.roomId}」という部門はありません。使える部門: ${opts.knownRoomIds.join('、')}`
      });
    }
    if (!s.title?.trim()) {
      problems.push({ stepId: s.id, message: `工程「${s.id}」に、何を出すか(title)が書かれていません。` });
    }
    if (!s.doneCondition?.trim()) {
      problems.push({
        stepId: s.id,
        message: `工程「${s.title || s.id}」に、終わったと言える条件(doneCondition)がありません。品質管理の基準になるので必ず書いてください。`
      });
    }
  });

  // 存在しない工程への依存
  steps.forEach((s) => {
    (s.dependsOn ?? []).forEach((d) => {
      if (!ids.has(d)) {
        problems.push({
          stepId: s.id,
          message: `工程「${s.title || s.id}」が、存在しない工程「${d}」を待っています。`
        });
      }
    });
  });

  findCycles(steps).forEach((id) => {
    problems.push({ stepId: id, message: `工程「${id}」の依存が循環しています。永久に始まりません。` });
  });

  // 依頼票にある成果物が段取りに出てこない＝頼んだものが出てこない
  const titles = steps.map((s) => s.title).join(' ');
  const missing = opts.sheet.wantedOutputs.filter((w) => w.trim() && !titles.includes(w.trim()));
  if (missing.length) {
    problems.push({
      message: `依頼された成果物が段取りにありません: ${missing.join('、')}。工程を足してください。`
    });
  }

  return problems;
}

/** 検査を通った段取りを、動かせる形（status/reworkCount つき）に整える。 */
export function normalizePlan(plan: WorkPlan): WorkPlan {
  return {
    steps: plan.steps.map((s) => ({
      ...s,
      dependsOn: s.dependsOn ?? [],
      parallelGroup: Number.isFinite(s.parallelGroup) ? s.parallelGroup : 0,
      startCondition: s.startCondition ?? '',
      status: 'pending',
      reworkCount: 0
    }))
  };
}

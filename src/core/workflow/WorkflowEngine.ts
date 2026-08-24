/**
 * ワークフロー制御層。
 *
 * 判断そのものは `planning.ts`（純粋関数）にあり、ここは**実行だけ**を行う。
 * 分けている理由は、判断をテストで固定できるようにするため
 * （docs/system-redesign.md §3.1）。
 *
 * この層が守る約束:
 *   1. CEO が承認①で「実行」を選ぶまで、制作の工程を1つも起動しない
 *   2. 同じ部屋を二重に起動しない
 *   3. 品質管理を通っていない工程を完了にしない
 *   4. 上限額を超えたら止める
 *
 * どれも「AI に気をつけてもらう」ではなく、コードで通れなくしてある。
 */
import { getRoom, useCoreStore } from '../../integration/store/coreStore';
import { useJobStore } from '../../integration/store/jobStore';
import { roomManager } from '../rooms/RoomManager';
import { buildSheetSummary, isSheetComplete } from '../jobs/requirementSheet';
import { canDeliver, decideAfterQa, decideNextActions } from './planning';
import type { Job, JobStatus, PlanStep } from '../jobs/types';

/** 制作の工程を動かしてよい状態。ここに無い状態では1つも起動しない。 */
const RUNNING_STATES: JobStatus[] = ['調査', '単元分析', '制作'];

class WorkflowEngineImpl {
  private timer: number | null = null;
  /** 起動済みの工程。tick が重なっても二重に投げないための覚え書き。 */
  private launched = new Set<string>();

  /** 案件を監視しはじめる。アプリの起動時に1回だけ呼ぶ。 */
  public start(intervalMs = 4000) {
    if (this.timer !== null) return;
    this.timer = window.setInterval(() => this.tick(), intervalMs);
  }

  public stop() {
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
  }

  /** いまの案件を1回だけ進める。副作用はすべてここに集める。 */
  public tick() {
    const { jobs, activeJobId } = useJobStore.getState();
    const job = activeJobId ? jobs[activeJobId] : null;
    if (!job || !job.plan) return;

    // 承認①より前、または承認待ち・完了・中止のあいだは何も起動しない。
    // **ここが「実行を選ぶまで作らない」の実体。**
    if (!RUNNING_STATES.includes(job.status)) return;

    const store = useJobStore.getState();
    const decisions = decideNextActions(job.plan, {
      spentUsd: job.spentUsd,
      budgetUsd: job.budgetUsd
    });

    for (const d of decisions) {
      switch (d.kind) {
        case 'halt':
          store.setStatus(job.id, '承認待ち②');
          store.addEvent(job.id, 'control', `停止: ${d.reason}`);
          return;

        case 'escalate':
          store.patchStep(job.id, d.stepId, { status: 'error', note: d.reason });
          store.setStatus(job.id, '承認待ち②');
          store.addEvent(job.id, 'control', `CEOへ: ${d.reason}`);
          return;

        case 'start':
          this.launch(job, d.stepId);
          break;

        case 'allDone':
          store.setStatus(job.id, '統合');
          store.addEvent(job.id, 'control', 'すべての工程が終わりました');
          break;

        default:
          break;
      }
    }
  }

  /**
   * 工程を起動する。部屋のシミュレーションに依頼文を渡す。
   *
   * 依頼票そのものは PromptBuilder が全部門に差し込むので、
   * ここで渡すのは「この部屋がこの案件で何をするか」だけでよい。
   */
  private launch(job: Job, stepId: string) {
    const step = job.plan?.steps.find((s) => s.id === stepId);
    if (!step) return;

    const key = `${job.id}:${stepId}`;
    if (this.launched.has(key)) return;

    // 部屋がまだ前の仕事を抱えていたら、次の tick で拾う（取りこぼさない）
    const room = getRoom(step.roomId);
    if (room.phase === 'working') return;

    this.launched.add(key);
    const store = useJobStore.getState();

    roomManager.ensure(step.roomId);
    useCoreStore.getState().startProject(this.briefFor(job, step), step.roomId);

    store.patchStep(job.id, stepId, { status: 'running', startedAt: Date.now() });
    store.addEvent(job.id, 'control', `${step.roomId} に「${step.title}」を発注`);
  }

  /** 部屋に渡す依頼文。完了条件を必ず添える（何をもって終わりかを部屋が知るため）。 */
  private briefFor(job: Job, step: PlanStep): string {
    const lines = [step.brief.trim(), '', `【この工程で出すもの】${step.title}`];
    if (step.doneCondition.trim()) {
      lines.push(`【終わったと言える条件】${step.doneCondition.trim()}`);
    }
    if (step.status === 'rework' && step.note) {
      lines.push('', `【差し戻し】前回はここが基準に届きませんでした: ${step.note}`);
    }
    return lines.filter((l) => l !== undefined).join('\n');
  }

  /**
   * 部屋が成果物を出したときに呼ぶ（`deliver_project` から）。
   * 完了にはせず、**必ず品質管理へ回す**。
   */
  public reportStepDelivered(roomId: string, title: string, path?: string) {
    const { jobs, activeJobId } = useJobStore.getState();
    const job = activeJobId ? jobs[activeJobId] : null;
    if (!job?.plan) return;

    const step = job.plan.steps.find((s) => s.roomId === roomId && s.status === 'running');
    if (!step) return;

    const store = useJobStore.getState();
    store.patchStep(job.id, step.id, { status: 'qa', doneAt: Date.now() });
    store.addDeliverable(job.id, { roomId, stepId: step.id, title, path });
    store.addEvent(job.id, roomId, `「${step.title}」を提出（品質管理へ）`);
    this.launched.delete(`${job.id}:${step.id}`);
  }

  /**
   * 品質管理の判定を反映する。
   *
   * **合否を出すのは品質管理室、次にどうするかを決めるのはここ。**
   * 品質管理室が自分で完了にできると、監査の独立性が崩れる。
   */
  public applyQaVerdict(
    stepId: string,
    verdict: '合格' | '不合格',
    reason: string,
    sendBackTo?: string,
    checks: { item: string; ok: boolean; note: string }[] = []
  ) {
    const { jobs, activeJobId } = useJobStore.getState();
    const job = activeJobId ? jobs[activeJobId] : null;
    const step = job?.plan?.steps.find((s) => s.id === stepId);
    if (!job || !step) return;

    const store = useJobStore.getState();
    store.addQaReport(job.id, { stepId, verdict, checks, reason, sendBackTo });

    const decision = decideAfterQa(step, verdict, sendBackTo, reason);
    if (decision.kind === 'toQa') {
      store.patchStep(job.id, stepId, { status: 'done' });
      return;
    }
    if (decision.kind === 'rework') {
      // rework のまま置く。planning 側でこれは「起動できる」扱いなので、
      // 次の tick で作り直しが始まる（差し戻し中だと画面にも出せる）
      store.patchStep(job.id, stepId, {
        status: 'rework',
        reworkCount: step.reworkCount + 1,
        note: decision.reason,
        roomId: decision.sendBackTo
      });
      this.launched.delete(`${job.id}:${stepId}`);
      return;
    }
    if (decision.kind === 'escalate') {
      store.patchStep(job.id, stepId, { status: 'error', note: decision.reason });
      store.setStatus(job.id, '承認待ち②');
      store.addEvent(job.id, 'control', `CEOへ: ${decision.reason}`);
    }
  }

  /** CEO が承認①で選んだ結果を反映する。 */
  public applyGateOne(choice: '実行' | '修正' | '中止', comment?: string) {
    const { jobs, activeJobId } = useJobStore.getState();
    const job = activeJobId ? jobs[activeJobId] : null;
    if (!job) return;

    const store = useJobStore.getState();
    store.addApproval(job.id, { gate: '承認待ち①', choice, comment });

    if (choice === '実行') store.setStatus(job.id, '制作');
    else if (choice === '修正') store.setStatus(job.id, '構成案作成');
    else store.setStatus(job.id, '中止');
  }

  /**
   * 制作を始められるか。依頼票が確定していないうちは始めない。
   * 「AIが聞き忘れて条件の足りないまま作り始める」を、ここでも止める。
   */
  public canStartJob(job: Job): { ok: boolean; reason?: string } {
    if (!job.sheetLockedAt) return { ok: false, reason: '依頼票がまだ確定していません' };
    if (!isSheetComplete(job.sheet)) return { ok: false, reason: '依頼票に未記入の必須項目があります' };
    return { ok: true };
  }

  /** 最終成果物を出してよいか（§3.6 の5条件）。 */
  public deliveryCheck(job: Job) {
    return canDeliver(job);
  }

  /** 部門に渡している依頼票の文面（設計図の表示に使う）。 */
  public sheetSummaryFor(job: Job): string {
    return buildSheetSummary(job.sheet, job.title);
  }
}

export const workflowEngine = new WorkflowEngineImpl();

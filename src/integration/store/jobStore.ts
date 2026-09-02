/**
 * 案件（依頼）のストア。
 *
 * 部屋の状態（coreStore.rooms）より上位にある。
 * 部屋は「いま何をしているか」を持ち、案件は「何のために作っているか」を持つ。
 *
 * 永続化する。CEO は日をまたいで単元を準備するので、
 * ブラウザを閉じたら依頼票が消える作りだと使いものにならない。
 */
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import {
  Approval,
  DEFAULT_BUDGET_USD,
  Deliverable,
  EMPTY_SHEET,
  Job,
  JobEvent,
  JobStatus,
  QaReport,
  RequirementSheet,
  UnitAnalysis,
  WorkPlan
} from '../../core/jobs/types';

const uid = () => Math.random().toString(36).slice(2, 10);

interface JobStoreState {
  jobs: Record<string, Job>;
  /** いま画面が見ている案件。部屋の担当とは別（部屋は案件をまたいで使える）。 */
  activeJobId: string | null;

  createJob: (title: string, sheet?: Partial<RequirementSheet>) => string;
  setActiveJob: (id: string | null) => void;
  deleteJob: (id: string) => void;

  updateSheet: (id: string, patch: Partial<RequirementSheet>) => void;
  lockSheet: (id: string) => void;

  setStatus: (id: string, status: JobStatus) => void;
  setUnit: (id: string, unit: UnitAnalysis) => void;
  setPlan: (id: string, plan: WorkPlan) => void;
  patchStep: (id: string, stepId: string, patch: Partial<WorkPlan['steps'][number]>) => void;
  setDocuments: (id: string, proposalHtml: string, blueprintHtml: string) => void;

  addApproval: (id: string, approval: Omit<Approval, 'at'>) => void;
  addDeliverable: (id: string, d: Omit<Deliverable, 'id' | 'at'>) => void;
  addQaReport: (id: string, r: Omit<QaReport, 'id' | 'checkedAt'>) => void;
  addEvent: (id: string, actor: string, what: string) => void;
  addSpend: (id: string, usd: number) => void;
  setBudget: (id: string, usd: number) => void;
}

function patchJob(
  set: (fn: (s: JobStoreState) => Partial<JobStoreState>) => void,
  id: string,
  fn: (job: Job) => Partial<Job>
) {
  set((s) => {
    const job = s.jobs[id];
    if (!job) return {};
    return { jobs: { ...s.jobs, [id]: { ...job, ...fn(job), updatedAt: Date.now() } } };
  });
}

export const useJobStore = create<JobStoreState>()(
  persist(
    (set, get) => ({
      jobs: {},
      activeJobId: null,

      createJob: (title, sheet) => {
        const id = uid();
        const now = Date.now();
        const job: Job = {
          id,
          title: title.trim() || '新しい案件',
          status: '受付',
          sheet: { ...EMPTY_SHEET, ...sheet },
          approvals: [],
          deliverables: [],
          qaReports: [],
          events: [{ id: uid(), at: now, actor: 'CEO', what: '依頼を出した' }],
          budgetUsd: DEFAULT_BUDGET_USD,
          spentUsd: 0,
          createdAt: now,
          updatedAt: now
        };
        set((s) => ({ jobs: { ...s.jobs, [id]: job }, activeJobId: id }));
        return id;
      },

      setActiveJob: (id) => set({ activeJobId: id }),

      deleteJob: (id) =>
        set((s) => {
          const { [id]: _gone, ...rest } = s.jobs;
          return { jobs: rest, activeJobId: s.activeJobId === id ? null : s.activeJobId };
        }),

      updateSheet: (id, patch) =>
        patchJob(set, id, (job) => ({ sheet: { ...job.sheet, ...patch } })),

      // 依頼票を確定する。ここから先、条件は全部門の共有物になる。
      // 名前を付けずに始めた案件は、ここで単元名から名前を取る（一覧で見分けられるように）。
      lockSheet: (id) =>
        patchJob(set, id, (job) => {
          const unit = job.sheet.unitName.trim();
          const subject = job.sheet.subject.trim();
          const auto = unit ? (subject ? `${subject} ${unit}` : unit) : job.title;
          return {
            title: job.title === '新しい案件' ? auto : job.title,
            sheetLockedAt: Date.now(),
            events: [...job.events, { id: uid(), at: Date.now(), actor: 'CEO', what: '依頼票を確定した' }]
          };
        }),

      setStatus: (id, status) =>
        patchJob(set, id, (job) => ({
          status,
          events: [...job.events, { id: uid(), at: Date.now(), actor: 'control', what: `状態: ${status}` }]
        })),

      setUnit: (id, unit) => patchJob(set, id, () => ({ unit })),
      setPlan: (id, plan) => patchJob(set, id, () => ({ plan })),

      patchStep: (id, stepId, patch) =>
        patchJob(set, id, (job) => {
          if (!job.plan) return {};
          return {
            plan: {
              steps: job.plan.steps.map((st) => (st.id === stepId ? { ...st, ...patch } : st))
            }
          };
        }),

      setDocuments: (id, proposalHtml, blueprintHtml) =>
        patchJob(set, id, () => ({ proposalHtml, blueprintHtml })),

      addApproval: (id, approval) =>
        patchJob(set, id, (job) => ({
          approvals: [...job.approvals, { ...approval, at: Date.now() }],
          events: [
            ...job.events,
            { id: uid(), at: Date.now(), actor: 'CEO', what: `${approval.gate}: ${approval.choice}` }
          ]
        })),

      addDeliverable: (id, d) =>
        patchJob(set, id, (job) => ({
          deliverables: [...job.deliverables, { ...d, id: uid(), at: Date.now() }]
        })),

      // 品質管理の記録は積むだけ。**合格で上書きしない**（不合格の履歴が消えると監査にならない）
      addQaReport: (id, r) =>
        patchJob(set, id, (job) => ({
          qaReports: [...job.qaReports, { ...r, id: uid(), checkedAt: Date.now() }],
          events: [
            ...job.events,
            { id: uid(), at: Date.now(), actor: 'qa-office', what: `品質管理: ${r.verdict}（${r.stepId}）` }
          ]
        })),

      addEvent: (id, actor, what) =>
        patchJob(set, id, (job) => ({
          events: [...job.events, { id: uid(), at: Date.now(), actor, what } as JobEvent]
        })),

      addSpend: (id, usd) =>
        patchJob(set, id, (job) => ({ spentUsd: job.spentUsd + usd })),

      setBudget: (id, usd) => patchJob(set, id, () => ({ budgetUsd: Math.max(0, usd) }))
    }),
    {
      name: 'kyouin-jobs',
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ jobs: s.jobs, activeJobId: s.activeJobId }) as any
    }
  )
);

/** レンダー外から読む用。 */
export function getActiveJob(): Job | null {
  const { jobs, activeJobId } = useJobStore.getState();
  return activeJobId ? jobs[activeJobId] ?? null : null;
}

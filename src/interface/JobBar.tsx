import React from 'react';
import { AlertCircle, ChevronDown, ClipboardList, Lock, Plus } from 'lucide-react';

import { missingRequired } from '../core/jobs/requirementSheet';
import { useJobStore } from '../integration/store/jobStore';
import ApprovalGateModal from './ApprovalGateModal';
import JobSheetModal from './JobSheetModal';

/**
 * ヘッダーの「いまの案件」バー。
 *
 * どの画面にいても、何のために作っているかが見えるようにする。
 * 案件を選んでいないときは、これまでどおり部屋に直接頼める（制御層は関与しない）。
 * 「明日の1枚だけ」のために案件を作らされるのは負担なので、そこは残す。
 */
const JobBar: React.FC = () => {
  const { jobs, activeJobId, setActiveJob, createJob } = useJobStore();
  const [open, setOpen] = React.useState(false);
  const [sheetJobId, setSheetJobId] = React.useState<string | null>(null);
  const [gateJobId, setGateJobId] = React.useState<string | null>(null);

  const job = activeJobId ? jobs[activeJobId] : null;
  const list = Object.values(jobs).sort((a, b) => b.updatedAt - a.updatedAt);
  const missing = job ? missingRequired(job.sheet) : [];
  // CEO が手を動かさないと進まない唯一の状態。バーの外から見えるところに出す
  const awaiting = job?.status === '承認待ち①' || job?.status === '承認待ち②';

  const startNew = () => {
    const id = createJob('新しい案件');
    setOpen(false);
    setSheetJobId(id);
  };

  return (
    <>
      <div className="relative flex items-center gap-2" translate="no">
        {awaiting && (
          <button
            onClick={() => setGateJobId(job!.id)}
            className="flex items-center gap-1.5 h-9 px-3 rounded-lg bg-amber-500 text-white text-[11px] font-black cursor-pointer active:scale-95 shadow-sm"
            title="CEOの承認を待っています"
          >
            <AlertCircle size={13} /> 承認をお願いします
          </button>
        )}
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-2 h-9 px-3 rounded-lg border border-zinc-200 bg-white hover:border-zinc-300 transition-colors cursor-pointer max-w-[280px]"
          title="いま作っている案件"
        >
          <ClipboardList size={14} className="text-zinc-400 shrink-0" />
          <span className="text-[11px] font-bold text-darkDelegation truncate">
            {job ? job.title : '案件を選ぶ'}
          </span>
          {job && job.sheetLockedAt && (
            <Lock size={11} className="text-emerald-500 shrink-0" />
          )}
          {job && !job.sheetLockedAt && missing.length > 0 && (
            <span className="flex items-center gap-1 text-[9px] font-black text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded shrink-0">
              <AlertCircle size={9} /> あと{missing.length}
            </span>
          )}
          <ChevronDown size={12} className="text-zinc-300 shrink-0" />
        </button>

        {open && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
            <div className="absolute left-0 top-11 z-50 w-[320px] bg-white rounded-2xl shadow-lg border border-zinc-100 p-2">
              <button
                onClick={startNew}
                className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-[11px] font-black text-darkDelegation hover:bg-zinc-50 transition-colors cursor-pointer"
              >
                <Plus size={13} /> 新しい案件をはじめる
              </button>

              {list.length > 0 && <div className="h-px bg-zinc-100 my-1.5" />}

              <div className="max-h-[320px] overflow-y-auto flex flex-col">
                {list.map((j) => {
                  const jm = missingRequired(j.sheet);
                  return (
                    <button
                      key={j.id}
                      onClick={() => { setActiveJob(j.id); setOpen(false); }}
                      className={`text-left px-3 py-2.5 rounded-xl transition-colors cursor-pointer
                        ${j.id === activeJobId ? 'bg-zinc-50' : 'hover:bg-zinc-50'}`}
                    >
                      <span className="flex items-center gap-2">
                        <span className="text-[11px] font-bold text-darkDelegation truncate flex-1">{j.title}</span>
                        <span className="text-[9px] font-black text-zinc-400 shrink-0">{j.status}</span>
                      </span>
                      <span className="block text-[10px] text-zinc-400 mt-0.5 truncate">
                        {j.sheet.subject || '教科未記入'}
                        {j.sheet.unitName ? ` ／ ${j.sheet.unitName}` : ''}
                        {j.sheetLockedAt ? ' ／ 確定済み' : jm.length ? ` ／ 未記入 ${jm.length}` : ' ／ 未確定'}
                      </span>
                    </button>
                  );
                })}
              </div>

              {job && (
                <>
                  <div className="h-px bg-zinc-100 my-1.5" />
                  <button
                    onClick={() => { setSheetJobId(job.id); setOpen(false); }}
                    className="w-full text-left px-3 py-2.5 rounded-xl text-[11px] font-black text-darkDelegation hover:bg-zinc-50 transition-colors cursor-pointer"
                  >
                    依頼票を開く
                  </button>
                  <button
                    onClick={() => { setActiveJob(null); setOpen(false); }}
                    className="w-full text-left px-3 py-2.5 rounded-xl text-[11px] font-medium text-zinc-500 hover:bg-zinc-50 transition-colors cursor-pointer"
                  >
                    案件を離れる（部屋に直接頼む）
                  </button>
                </>
              )}
            </div>
          </>
        )}
      </div>

      {sheetJobId && (
        <JobSheetModal jobId={sheetJobId} onClose={() => setSheetJobId(null)} />
      )}

      {gateJobId && (
        <ApprovalGateModal jobId={gateJobId} onClose={() => setGateJobId(null)} />
      )}
    </>
  );
};

export default JobBar;

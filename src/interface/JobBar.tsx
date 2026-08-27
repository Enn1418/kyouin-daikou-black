import React from 'react';
import { AlertCircle, Ban, ChevronDown, ClipboardList, Lock, Plus, RotateCcw, Trash2 } from 'lucide-react';

import { missingRequired } from '../core/jobs/requirementSheet';
import { roomManager } from '../core/rooms/RoomManager';
import { useJobStore } from '../integration/store/jobStore';
import type { Job, JobStatus } from '../core/jobs/types';
import ApprovalGateModal from './ApprovalGateModal';
import JobSheetModal from './JobSheetModal';

/** 状態の色。ひと目で「動いている／止まっている／手を待っている」が分かるようにする。 */
const STATUS_LOOK: Record<JobStatus, string> = {
  受付: 'bg-zinc-100 text-zinc-500',
  要件確認: 'bg-zinc-100 text-zinc-500',
  調査: 'bg-sky-100 text-sky-700',
  単元分析: 'bg-sky-100 text-sky-700',
  構成案作成: 'bg-sky-100 text-sky-700',
  '承認待ち①': 'bg-amber-100 text-amber-800',
  制作: 'bg-sky-100 text-sky-700',
  統合: 'bg-sky-100 text-sky-700',
  '承認待ち②': 'bg-amber-100 text-amber-800',
  完了: 'bg-emerald-100 text-emerald-700',
  中止: 'bg-rose-100 text-rose-600'
};

/** もう動かない状態。ここに居る案件には「中止」ボタンを出さない。 */
const FINISHED: JobStatus[] = ['完了', '中止'];

/**
 * 中止した案件を再開したとき、どの状態に戻すか。
 *
 * 中止前の状態は保存していないので、記録から復元する:
 * 段取りがあって CEO が一度「実行」を選んでいれば制作から、
 * それ以外は受付から（秘書室が依頼票の続きを拾う）。
 */
function resumeStatus(job: Job): JobStatus {
  if (job.plan && job.approvals.some((a) => a.choice === '実行')) return '制作';
  return '受付';
}

/**
 * ヘッダーの「いまの案件」バー。
 *
 * どの画面にいても、何のために作っているかが見えるようにする。
 * 案件を選んでいないときは、これまでどおり部屋に直接頼める（制御層は関与しない）。
 * 「明日の1枚だけ」のために案件を作らされるのは負担なので、そこは残す。
 */
const JobBar: React.FC = () => {
  const { jobs, activeJobId, setActiveJob, createJob, deleteJob, setStatus, addEvent } = useJobStore();
  const [open, setOpen] = React.useState(false);
  const [sheetJobId, setSheetJobId] = React.useState<string | null>(null);
  const [gateJobId, setGateJobId] = React.useState<string | null>(null);
  // 削除は2段階。1回目で行が「本当に削除？」に変わり、2回目で消える。
  // 依頼票ごと消えて戻せないので、うっかり1クリックでは消えないようにする
  const [confirmDeleteId, setConfirmDeleteId] = React.useState<string | null>(null);

  const cancelJob = (j: Job) => {
    setStatus(j.id, '中止');
    addEvent(j.id, 'CEO', '案件を中止した');
  };

  const resumeJob = (j: Job) => {
    const next = resumeStatus(j);
    setStatus(j.id, next);
    addEvent(j.id, 'CEO', `案件を再開した（${next}から）`);
    setActiveJob(j.id);
    // 制作からの再開は制御層の見回りが拾う。受付からの再開は秘書室を起こす
    if (next === '受付') {
      roomManager.notifyLead(
        'sec-office',
        `CEO が案件「${j.title}」を再開しました。依頼票の状態を確認し、` +
        '不足があればまとめて尋ね、埋まっていれば確定して段取りへ進めてください。'
      );
    }
  };

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

              <div className="max-h-[360px] overflow-y-auto flex flex-col">
                {list.map((j) => {
                  const jm = missingRequired(j.sheet);
                  const isActive = j.id === activeJobId;

                  // 削除の確認中は、行そのものを確認に置き換える（別ダイアログを重ねない）
                  if (confirmDeleteId === j.id) {
                    return (
                      <div key={j.id} className="px-3 py-2.5 rounded-xl bg-rose-50 flex items-center gap-2">
                        <span className="text-[11px] font-bold text-rose-700 truncate flex-1">
                          「{j.title}」を削除？ 依頼票も経緯も消えて、元に戻せません。
                        </span>
                        <button
                          onClick={() => { deleteJob(j.id); setConfirmDeleteId(null); }}
                          className="px-2.5 py-1.5 rounded-lg bg-rose-600 text-white text-[10px] font-black cursor-pointer shrink-0"
                        >
                          削除する
                        </button>
                        <button
                          onClick={() => setConfirmDeleteId(null)}
                          className="px-2.5 py-1.5 rounded-lg border border-zinc-200 text-[10px] font-bold text-zinc-500 cursor-pointer shrink-0"
                        >
                          やめる
                        </button>
                      </div>
                    );
                  }

                  return (
                    <div
                      key={j.id}
                      className={`group flex items-center gap-1 rounded-xl transition-colors
                        ${isActive ? 'bg-emerald-50/60' : 'hover:bg-zinc-50'}`}
                    >
                      <button
                        onClick={() => { setActiveJob(j.id); setOpen(false); }}
                        className="text-left px-3 py-2.5 flex-1 min-w-0 cursor-pointer"
                        title={isActive ? 'いま呼び出している案件' : 'この案件を呼び出す'}
                      >
                        <span className="flex items-center gap-2">
                          {isActive && (
                            <span className="flex items-center gap-1 text-[9px] font-black text-emerald-700 shrink-0">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                              呼び出し中
                            </span>
                          )}
                          <span className="text-[11px] font-bold text-darkDelegation truncate flex-1">{j.title}</span>
                          <span className={`text-[9px] font-black px-1.5 py-0.5 rounded shrink-0 ${STATUS_LOOK[j.status]}`}>
                            {j.status}
                          </span>
                        </span>
                        <span className="block text-[10px] text-zinc-400 mt-0.5 truncate">
                          {j.sheet.subject || '教科未記入'}
                          {j.sheet.unitName ? ` ／ ${j.sheet.unitName}` : ''}
                          {j.sheetLockedAt ? ' ／ 確定済み' : jm.length ? ` ／ 未記入 ${jm.length}` : ' ／ 未確定'}
                        </span>
                      </button>

                      {/* 中止／再開／削除。行のクリック（呼び出し）と混ざらないよう右端に分ける */}
                      <span className="flex items-center gap-0.5 pr-2 shrink-0">
                        {j.status === '中止' ? (
                          <button
                            onClick={(e) => { e.stopPropagation(); resumeJob(j); setOpen(false); }}
                            title="この案件を再開する"
                            className="p-1.5 rounded-lg text-zinc-400 hover:text-emerald-600 hover:bg-emerald-50 transition-colors cursor-pointer"
                          >
                            <RotateCcw size={13} />
                          </button>
                        ) : !FINISHED.includes(j.status) ? (
                          <button
                            onClick={(e) => { e.stopPropagation(); cancelJob(j); }}
                            title="中止する（記録は残る。あとで再開できる）"
                            className="p-1.5 rounded-lg text-zinc-400 hover:text-amber-600 hover:bg-amber-50 transition-colors cursor-pointer"
                          >
                            <Ban size={13} />
                          </button>
                        ) : null}
                        <button
                          onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(j.id); }}
                          title="削除する（元に戻せない）"
                          className="p-1.5 rounded-lg text-zinc-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                        >
                          <Trash2 size={13} />
                        </button>
                      </span>
                    </div>
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
                  {!FINISHED.includes(job.status) && (
                    <button
                      onClick={() => {
                        // 止まって見えるときの復帰ボタン。秘書長に現状を確認させて続きを打たせる
                        roomManager.notifyLead(
                          'sec-office',
                          `CEO が案件「${job.title}」の続きを求めています。案件の状態と依頼票を確認し、` +
                          '不足があればまとめて尋ね、確定済みで段取りが未登録なら set_work_plan で登録し、' +
                          '承認待ちなら CEO に承認を促してください。'
                        );
                        addEvent(job.id, 'CEO', '続きを促した');
                        setOpen(false);
                      }}
                      className="w-full text-left px-3 py-2.5 rounded-xl text-[11px] font-black text-darkDelegation hover:bg-zinc-50 transition-colors cursor-pointer"
                      title="進んでいないように見えるとき、秘書室に現状確認と次の一手を促します"
                    >
                      続きを促す（秘書室へ）
                    </button>
                  )}
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

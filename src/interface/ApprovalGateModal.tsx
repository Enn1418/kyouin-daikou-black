import React from 'react';
import { Ban, Check, FileText, Network, PencilLine, X } from 'lucide-react';

import { workflowEngine } from '../core/workflow/WorkflowEngine';
import { useJobStore } from '../integration/store/jobStore';

/**
 * 承認①の画面。
 *
 * 単元構成案とシステム設計図の2枚を出し、**ここで処理を完全に止める**。
 * CEO が「実行」を選ぶまで、指導案も教材も掲示物も1つも作らない
 * （docs/system-redesign.md §5.2）。
 *
 * 止めているのは制御層のプログラムであって、AI の自制ではない。
 * この画面を閉じても、承認しない限り制作は始まらない。
 */

interface Props {
  jobId: string;
  onClose: () => void;
}

const ApprovalGateModal: React.FC<Props> = ({ jobId, onClose }) => {
  const job = useJobStore((s) => s.jobs[jobId]);
  const [tab, setTab] = React.useState<'proposal' | 'blueprint'>('proposal');
  const [comment, setComment] = React.useState('');
  const [confirmingCancel, setConfirmingCancel] = React.useState(false);

  if (!job) return null;

  const html = tab === 'proposal' ? job.proposalHtml : job.blueprintHtml;

  const choose = (choice: '実行' | '修正' | '中止') => {
    workflowEngine.applyGateOne(choice, comment.trim() || undefined);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4" translate="no">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden">
        <header className="px-6 py-4 border-b border-zinc-100 shrink-0">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h2 className="text-base font-black text-darkDelegation truncate">
                承認 — {job.title}
              </h2>
              <p className="text-[11px] text-zinc-500 mt-0.5">
                内容を確かめてください。<b>「実行」を選ぶまで、成果物は1つも作りません。</b>
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-zinc-400 hover:text-darkDelegation transition-colors shrink-0 cursor-pointer"
              title="あとで決める（制作は始まりません）"
            >
              <X size={18} />
            </button>
          </div>

          <div className="flex gap-1 mt-3">
            <button
              onClick={() => setTab('proposal')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-black transition-colors cursor-pointer
                ${tab === 'proposal' ? 'bg-darkDelegation text-white' : 'text-zinc-500 hover:bg-zinc-50'}`}
            >
              <FileText size={12} /> 単元構成案
            </button>
            <button
              onClick={() => setTab('blueprint')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-black transition-colors cursor-pointer
                ${tab === 'blueprint' ? 'bg-darkDelegation text-white' : 'text-zinc-500 hover:bg-zinc-50'}`}
            >
              <Network size={12} /> システム設計図
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto bg-zinc-50">
          {html ? (
            <iframe
              title={tab === 'proposal' ? '単元構成案' : 'システム設計図'}
              srcDoc={html}
              sandbox=""
              className="w-full h-full min-h-[52vh] bg-white border-0"
            />
          ) : (
            <p className="p-8 text-center text-[12px] text-zinc-400">
              {tab === 'proposal' ? '単元構成案' : 'システム設計図'}はまだできていません。
            </p>
          )}
        </div>

        <footer className="px-6 py-4 border-t border-zinc-100 shrink-0 flex flex-col gap-3">
          <input
            type="text"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="直したいところがあれば書いてください（「修正」を選んだときに反映されます）"
            className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-[12px] text-darkDelegation focus:outline-none focus:border-indigo-400"
          />

          <div className="flex items-center justify-between gap-3 flex-wrap">
            {confirmingCancel ? (
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-rose-700">この案件を中止しますか。</span>
                <button
                  onClick={() => choose('中止')}
                  className="px-3 py-1.5 rounded-lg bg-rose-600 text-white text-[11px] font-black cursor-pointer"
                >
                  中止する
                </button>
                <button
                  onClick={() => setConfirmingCancel(false)}
                  className="px-3 py-1.5 rounded-lg border border-zinc-200 text-[11px] font-bold text-zinc-500 cursor-pointer"
                >
                  やめる
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmingCancel(true)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-bold text-zinc-500 hover:text-rose-600 transition-colors cursor-pointer"
              >
                <Ban size={13} /> 中止
              </button>
            )}

            <div className="flex items-center gap-2">
              <button
                onClick={() => choose('修正')}
                disabled={!comment.trim()}
                title={comment.trim() ? '' : '直したいところを書いてから押してください'}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-xl border text-[11px] font-black transition-all
                  ${comment.trim()
                    ? 'border-zinc-200 text-darkDelegation hover:border-zinc-300 cursor-pointer'
                    : 'border-zinc-100 text-zinc-300 cursor-not-allowed'}`}
              >
                <PencilLine size={13} /> 修正して出し直す
              </button>
              <button
                onClick={() => choose('実行')}
                className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-darkDelegation text-white text-[11px] font-black cursor-pointer active:scale-95"
              >
                <Check size={13} /> この内容で実行する
              </button>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
};

export default ApprovalGateModal;

import React from 'react';
import { AlertCircle, Check, Lock, X } from 'lucide-react';

import {
  OUTPUT_FORMAT_LABEL,
  OutputFormat,
  RequirementSheet,
  SHEET_FIELDS,
  SheetField
} from '../core/jobs/types';
import { isFilled, missingRequired } from '../core/jobs/requirementSheet';
import { useJobStore } from '../integration/store/jobStore';

/**
 * 依頼票の入力画面。
 *
 * 制作前にここが埋まっていないと、制御層が制作へ進ませない。
 * 「AIが聞き忘れて、条件の足りないまま教材が出てくる」を止めるための関門。
 *
 * 必須の判定は `missingRequired`（機械的な検査）だけを見る。
 * 画面が独自に「これは埋まっている扱い」を持つと、検査とずれる。
 */

const FORMATS: OutputFormat[] = ['md', 'print-html', 'image', 'bundle'];

const toList = (v: string): string[] =>
  v.split(/[,、，]/).map((s) => s.trim()).filter(Boolean);

interface Props {
  jobId: string;
  onClose: () => void;
}

const JobSheetModal: React.FC<Props> = ({ jobId, onClose }) => {
  const job = useJobStore((s) => s.jobs[jobId]);
  const { updateSheet, lockSheet, setBudget } = useJobStore();

  if (!job) return null;

  const missing = missingRequired(job.sheet);
  const locked = !!job.sheetLockedAt;

  const set = (key: keyof RequirementSheet, value: any) =>
    updateSheet(jobId, { [key]: value } as Partial<RequirementSheet>);

  const renderField = (f: SheetField) => {
    const v = job.sheet[f.key];
    const filled = isFilled(job.sheet, f.key);
    const showWarning = f.required && !filled;

    const base =
      'w-full rounded-xl border px-3 py-2 text-sm text-darkDelegation bg-white transition-colors ' +
      'focus:outline-none focus:border-indigo-400 disabled:bg-zinc-50 disabled:text-zinc-500 ' +
      (showWarning ? 'border-amber-300' : 'border-zinc-200');

    return (
      <div key={f.key} className="flex flex-col gap-1.5">
        <label className="flex items-center gap-2 text-[11px] font-black text-darkDelegation">
          {f.label}
          {f.required && (
            <span className={`text-[9px] font-black px-1.5 py-0.5 rounded ${
              filled ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-700'
            }`}>
              {filled ? '入力済み' : '必須'}
            </span>
          )}
        </label>
        <span className="text-[10px] text-zinc-400 leading-snug">{f.hint}</span>

        {f.kind === 'multiline' && (
          <textarea
            value={String(v ?? '')}
            disabled={locked}
            onChange={(e) => set(f.key, e.target.value)}
            rows={2}
            className={`${base} resize-y leading-relaxed`}
          />
        )}

        {f.kind === 'text' && (
          <input
            type="text"
            value={String(v ?? '')}
            disabled={locked}
            onChange={(e) => set(f.key, e.target.value)}
            className={base}
          />
        )}

        {f.kind === 'number' && (
          <input
            type="number"
            min={0}
            value={Number(v) || ''}
            disabled={locked}
            onChange={(e) => set(f.key, Number(e.target.value) || 0)}
            className={`${base} w-28`}
          />
        )}

        {f.kind === 'list' && (
          <input
            type="text"
            value={(v as string[]).join('、')}
            disabled={locked}
            onChange={(e) => set(f.key, toList(e.target.value))}
            placeholder="読点（、）で区切って書いてください"
            className={base}
          />
        )}

        {f.kind === 'formats' && (
          <div className="flex flex-wrap gap-2">
            {FORMATS.map((fmt) => {
              const on = job.sheet.outputFormats.includes(fmt);
              return (
                <button
                  key={fmt}
                  type="button"
                  disabled={locked}
                  onClick={() =>
                    set(
                      'outputFormats',
                      on
                        ? job.sheet.outputFormats.filter((x) => x !== fmt)
                        : [...job.sheet.outputFormats, fmt]
                    )
                  }
                  className={`px-3 py-1.5 rounded-lg text-[11px] font-bold border transition-all cursor-pointer disabled:cursor-default
                    ${on
                      ? 'bg-darkDelegation text-white border-transparent'
                      : 'bg-white text-zinc-500 border-zinc-200 hover:border-zinc-300'}`}
                >
                  {OUTPUT_FORMAT_LABEL[fmt]}
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" translate="no">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[88vh] flex flex-col overflow-hidden">
        <header className="px-6 py-4 border-b border-zinc-100 flex items-start justify-between gap-4 shrink-0">
          <div className="min-w-0">
            <h2 className="text-base font-black text-darkDelegation truncate">依頼票 — {job.title}</h2>
            <p className="text-[11px] text-zinc-500 mt-0.5">
              ここで決めた条件を、すべての部門が同じ文面で見ます。途中で方針がぶれないようにするためです。
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-darkDelegation transition-colors shrink-0 cursor-pointer"
          >
            <X size={18} />
          </button>
        </header>

        {locked && (
          <div className="mx-6 mt-4 flex items-start gap-2 px-3 py-2.5 rounded-xl bg-emerald-50 text-emerald-800 text-[11px] leading-relaxed">
            <Lock size={13} className="mt-0.5 shrink-0" />
            <span>
              この依頼票は確定済みです。全部門がこの条件で作ります。
              直したいときは、いったん確定を解除してください。
            </span>
          </div>
        )}

        {!locked && missing.length > 0 && (
          <div className="mx-6 mt-4 flex items-start gap-2 px-3 py-2.5 rounded-xl bg-amber-50 text-amber-800 text-[11px] leading-relaxed">
            <AlertCircle size={13} className="mt-0.5 shrink-0" />
            <span>
              あと <b>{missing.length}項目</b>で確定できます — {missing.map((f) => f.label).join('、')}
            </span>
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-6 py-5 flex flex-col gap-5">
          {SHEET_FIELDS.map(renderField)}

          <div className="flex flex-col gap-1.5 pt-2 border-t border-zinc-100">
            <label className="text-[11px] font-black text-darkDelegation">この案件の上限額</label>
            <span className="text-[10px] text-zinc-400 leading-snug">
              ここを超えたら、制作を止めて確認します。部門が多いので、歯止めを置いています。
            </span>
            <div className="flex items-center gap-2">
              <span className="text-sm text-zinc-500">$</span>
              <input
                type="number"
                min={0}
                step={0.5}
                value={job.budgetUsd}
                onChange={(e) => setBudget(jobId, Number(e.target.value) || 0)}
                className="w-28 rounded-xl border border-zinc-200 px-3 py-2 text-sm text-darkDelegation focus:outline-none focus:border-indigo-400"
              />
              <span className="text-[10px] text-zinc-400">
                使用済み ${job.spentUsd.toFixed(3)}
              </span>
            </div>
          </div>
        </div>

        <footer className="px-6 py-4 border-t border-zinc-100 flex items-center justify-between gap-3 shrink-0">
          <span className="text-[10px] text-zinc-400">
            {locked
              ? '確定済み。制作に進めます。'
              : missing.length > 0
                ? '必須項目が埋まるまで、制作は始まりません。'
                : 'すべて埋まりました。確定できます。'}
          </span>
          {locked ? (
            <button
              onClick={() => useJobStore.setState((s) => ({
                jobs: { ...s.jobs, [jobId]: { ...s.jobs[jobId], sheetLockedAt: undefined } }
              }))}
              className="px-4 py-2 rounded-xl border border-zinc-200 text-[11px] font-black text-zinc-500 hover:text-darkDelegation transition-colors cursor-pointer"
            >
              確定を解除して直す
            </button>
          ) : (
            <button
              onClick={() => { lockSheet(jobId); onClose(); }}
              disabled={missing.length > 0}
              className={`flex items-center gap-1.5 px-5 py-2 rounded-xl text-[11px] font-black transition-all
                ${missing.length > 0
                  ? 'bg-zinc-100 text-zinc-400 cursor-not-allowed'
                  : 'bg-darkDelegation text-white cursor-pointer active:scale-95'}`}
            >
              <Check size={13} /> この条件で確定する
            </button>
          )}
        </footer>
      </div>
    </div>
  );
};

export default JobSheetModal;

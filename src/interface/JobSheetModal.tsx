import React from 'react';
import { AlertCircle, Check, Download, Lock, Upload, X } from 'lucide-react';

import {
  OUTPUT_FORMAT_LABEL,
  OutputFormat,
  RequirementSheet,
  SHEET_FIELDS,
  SheetField
} from '../core/jobs/types';
import { buildSheetMarkdown, isFilled, missingRequired, parseSheetMarkdown } from '../core/jobs/requirementSheet';
import { roomManager } from '../core/rooms/RoomManager';
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

  // CEO がこの画面で書き換えたか。書き換えたまま閉じたら秘書室に知らせる。
  // 部屋は依頼票の変化を自分では見ていないので、知らせないと止まったままになる
  const editedRef = React.useRef(false);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const [notice, setNotice] = React.useState<string | null>(null);

  /**
   * 読点で区切る欄の、打っている途中の文字列。
   *
   * 以前は1文字打つたびに配列へ変換していたので、「、」を打った瞬間に
   * 区切りとして消費されて画面から消え、**読点そのものを入力できなかった**
   * （CEO の指摘、2026-08-27）。打っている間はそのままの文字列を保ち、
   * 欄から離れたときに配列へ直す。
   */
  const [draft, setDraft] = React.useState<Record<string, string>>({});

  if (!job) return null;

  const missing = missingRequired(job.sheet);
  const locked = !!job.sheetLockedAt;

  const set = (key: keyof RequirementSheet, value: any) => {
    editedRef.current = true;
    updateSheet(jobId, { [key]: value } as Partial<RequirementSheet>);
  };

  /** 打ちかけの欄を確定する。閉じる前・確定前に必ず通す（打った内容を捨てないため）。 */
  const flushDrafts = () => {
    Object.entries(draft).forEach(([key, raw]) => {
      set(key as keyof RequirementSheet, toList(raw));
    });
    setDraft({});
  };

  /**
   * いまの内容を雛形として書き出す。
   *
   * 「思いついたときに書いておいて、あとから読み込む」ための持ち出し口。
   * 空の依頼票から書き出せば、そのまま白紙の雛形になる。
   */
  const exportTemplate = () => {
    flushDrafts();
    const md = buildSheetMarkdown(
      useJobStore.getState().jobs[jobId].sheet,
      job.title
    );
    const url = URL.createObjectURL(new Blob([md], { type: 'text/markdown;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `依頼票_${job.title.replace(/[\\/:*?"<>|]/g, '_')}.md`;
    a.click();
    URL.revokeObjectURL(url);
    setNotice('雛形を書き出しました。書き足してから読み込めます。');
  };

  /** 書いておいた雛形を読み込む。読めた欄と、読めなかった見出しの両方を伝える。 */
  const importTemplate = async (file: File) => {
    try {
      const { patch, filled, unknown } = parseSheetMarkdown(await file.text());
      if (filled.length === 0) {
        setNotice(
          '読み込める項目がありませんでした。「## 教科」のように、' +
          '項目名を ## の見出しにして、その下に内容を書いてください。'
        );
        return;
      }
      editedRef.current = true;
      updateSheet(jobId, patch);
      setDraft({});
      setNotice(
        `${filled.length}項目を読み込みました（${filled.join('、')}）。` +
        (unknown.length ? ` 読めなかった見出し: ${unknown.join('、')}` : '')
      );
    } catch {
      setNotice('ファイルを読めませんでした。文字化けしていないか確かめてください。');
    }
  };

  /** 閉じるときに、書き換えがあれば秘書室のまとめ役に続きを促す。 */
  const closeAndNotify = () => {
    flushDrafts();
    if (editedRef.current && !useJobStore.getState().jobs[jobId]?.sheetLockedAt) {
      roomManager.notifyLead(
        'sec-office',
        'CEO が画面から依頼票を書き足しました。依頼票の現状を確認し、' +
        '不足が残っていればまとめて尋ね、すべて埋まっていれば内容を CEO に確認して ' +
        'lock_requirement_sheet で確定し、段取りへ進めてください。'
      );
    }
    onClose();
  };

  /** 確定して閉じる。秘書室に「段取りへ進め」と知らせる。 */
  const lockAndNotify = () => {
    flushDrafts();
    lockSheet(jobId);
    roomManager.notifyLead(
      'sec-office',
      'CEO が画面から依頼票を確定しました。タスク設計担当に段取りを作らせ、' +
      'set_work_plan で登録してください。登録できたら CEO に承認を促してください。'
    );
    onClose();
  };

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
            value={draft[f.key] ?? (v as string[]).join('、')}
            disabled={locked}
            onChange={(e) => {
              editedRef.current = true;
              setDraft((d) => ({ ...d, [f.key]: e.target.value }));
            }}
            onBlur={() => {
              const raw = draft[f.key];
              if (raw === undefined) return;
              set(f.key, toList(raw));
              setDraft(({ [f.key]: _done, ...rest }) => rest);
            }}
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
            onClick={closeAndNotify}
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

        {/* 雛形の持ち出し口。前もって書いておいた依頼票を、ここから流し込める */}
        {!locked && (
          <div className="mx-6 mt-4 flex flex-wrap items-center gap-2">
            <button
              onClick={() => fileRef.current?.click()}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-zinc-200 text-[11px] font-black text-darkDelegation hover:border-zinc-300 transition-colors cursor-pointer"
              title="前もって書いておいた依頼票（.md / .txt）を読み込みます"
            >
              <Upload size={13} /> ファイルから読み込む
            </button>
            <button
              onClick={exportTemplate}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-zinc-200 text-[11px] font-bold text-zinc-500 hover:text-darkDelegation hover:border-zinc-300 transition-colors cursor-pointer"
              title="いまの内容を雛形として保存します。白紙のまま押せば白紙の雛形になります"
            >
              <Download size={13} /> 雛形を書き出す
            </button>
            <span className="text-[10px] text-zinc-400">
              思いついたときに雛形へ書いておけば、ここから流し込めます
            </span>
            <input
              ref={fileRef}
              type="file"
              accept=".md,.txt,.markdown,text/plain,text/markdown"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void importTemplate(f);
                e.target.value = '';    // 同じファイルをもう一度選べるようにする
              }}
            />
          </div>
        )}

        {notice && (
          <div className="mx-6 mt-3 px-3 py-2.5 rounded-xl bg-sky-50 text-sky-900 text-[11px] leading-relaxed">
            {notice}
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
              onClick={lockAndNotify}
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

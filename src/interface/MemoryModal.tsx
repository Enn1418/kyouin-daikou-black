import { Check, Loader2, RefreshCw, X } from 'lucide-react';
import React, { useState } from 'react';
import { bridge, BridgeError } from '../core/bridge/bridgeClient';
import { useBridgeStore } from '../integration/store/bridgeStore';

interface MemoryModalProps {
  onClose: () => void;
}

/**
 * 教材フォルダの 99_記憶/memory.md を見る・直すモーダル。
 *
 * 差し戻しの指摘は自動で溜まっていくが（bridge/memory.mjs）、
 * 担任が直接読んで手で整理したいこともあるため、素の Markdown をそのまま編集できるようにする。
 * 保存すると bridge 側の memory.md をまるごと上書きする。
 */
const MemoryModal: React.FC<MemoryModalProps> = ({ onClose }) => {
  const memory = useBridgeStore((s) => s.memory);
  const setMemory = useBridgeStore((s) => s.setMemory);
  const [content, setContent] = useState(memory);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);
  const [isReloading, setIsReloading] = useState(false);

  const isDirty = content !== memory;

  // フォルダ側で直接編集された可能性があるので、開いた後でも読み直せるようにする
  const handleReload = async () => {
    setIsReloading(true);
    setError(null);
    try {
      const { content: fresh } = await bridge.readMemory();
      setMemory(fresh);
      setContent(fresh);
    } catch (e) {
      setError(e instanceof BridgeError ? e.message : '読み直せませんでした');
    } finally {
      setIsReloading(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);
    try {
      await bridge.writeMemory(content);
      setMemory(content);
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 1500);
    } catch (e) {
      setError(e instanceof BridgeError ? e.message : '保存できませんでした');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-100 flex items-center justify-center p-6 pointer-events-auto overflow-hidden">
      <div onClick={onClose} className="absolute inset-0 bg-white/60 backdrop-blur-xl" />
      <div className="relative w-full max-w-2xl bg-white rounded-[40px] shadow-[0_32px_64px_-12px_rgba(0,0,0,0.1)] p-8 md:p-10 border border-zinc-100">
        <button
          onClick={onClose}
          className="absolute top-6 right-6 text-zinc-300 hover:text-zinc-600 transition-colors cursor-pointer"
        >
          <X size={18} />
        </button>

        <div translate="no">
          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-3xl font-black text-darkDelegation tracking-tight">記憶</h2>
              <button
                type="button"
                onClick={handleReload}
                disabled={isReloading}
                title="教材フォルダの memory.md を読み直す"
                className="flex items-center gap-1 text-[9px] font-black uppercase tracking-wider text-zinc-400 hover:text-darkDelegation transition-colors cursor-pointer disabled:opacity-40"
              >
                <RefreshCw size={12} className={isReloading ? 'animate-spin' : ''} /> 読み直す
              </button>
            </div>
            <p className="text-zinc-400 text-sm font-medium leading-relaxed max-w-[420px]">
              担任が差し戻したときの指摘が溜まる場所（<code className="font-mono">99_記憶/memory.md</code>）。
              エージェントは毎回これを読んでから作業する。ここで直接読んだり、書き足したり、古い指摘を消したりできる。
            </p>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-100 rounded-2xl">
              <p className="text-[11px] font-medium text-red-600 leading-tight">{error}</p>
            </div>
          )}

          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="まだ指摘はありません。"
            rows={14}
            className="w-full bg-zinc-50 border border-zinc-100 rounded-3xl px-5 py-4 text-sm text-darkDelegation font-mono placeholder:text-zinc-300 placeholder:font-sans focus:outline-none focus:border-zinc-200 transition-all shadow-sm resize-none"
          />

          <div className="flex items-center justify-between mt-6">
            <span className="text-[10px] font-black uppercase tracking-widest text-zinc-300">
              {isDirty ? '未保存の変更があります' : ' '}
            </span>
            <button
              onClick={handleSave}
              disabled={!isDirty || isSaving}
              className="flex items-center gap-2 px-12 py-4 bg-darkDelegation text-white rounded-[24px] text-xs font-black uppercase tracking-[0.2em] hover:bg-black transition-all active:scale-95 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed shadow-xl shadow-black/10"
            >
              {isSaving ? (
                <Loader2 size={14} strokeWidth={3} className="animate-spin" />
              ) : justSaved ? (
                <Check size={14} strokeWidth={3} />
              ) : null}
              {justSaved ? '保存しました' : '保存'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MemoryModal;

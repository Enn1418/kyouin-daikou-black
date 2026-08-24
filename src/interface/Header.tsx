import { BookOpen, FolderOpen, Info, KeyRound, LayoutGrid, Maximize2, Palette, Settings } from 'lucide-react';
import React, { useState } from 'react';
import packageJson from '../../package.json';
import { OFFICE_THEMES, useAppearanceStore } from '../integration/store/appearanceStore';
import { useBridgeStore } from '../integration/store/bridgeStore';
import { useCoreStore } from '../integration/store/coreStore';
import { useUiStore } from '../integration/store/uiStore';
import BYOKModal from './BYOKModal';
import InfoModal from './InfoModal';
import JobBar from './JobBar';
import MemoryModal from './MemoryModal';

const version = packageJson.version;

const Header: React.FC = () => {
  const { llmConfig, isBYOKOpen, setBYOKOpen } = useUiStore();
  const { setViewMode, viewMode } = useCoreStore();
  const [isInfoOpen, setIsInfoOpen] = useState(false);
  const [isPaletteOpen, setIsPaletteOpen] = useState(false);
  const [isMemoryOpen, setIsMemoryOpen] = useState(false);
  const { themeId, setThemeId } = useAppearanceStore();
  const hasKey = !!llmConfig.apiKey;

  // 教材フォルダの接続状態。繋がっていないとエージェントにファイル操作の道具が渡らないので、
  // 押さなくても分かるところに出しておく。
  const { status: bridgeStatus, rootName, lastError } = useBridgeStore();
  const bridgeLook =
    bridgeStatus === 'connected'
      ? { color: 'text-emerald-500 hover:text-emerald-600', dot: 'bg-emerald-400', title: `教材フォルダ: ${rootName ?? '接続中'}` }
      : bridgeStatus === 'checking'
        ? { color: 'text-amber-500', dot: 'bg-amber-400', title: '教材フォルダ: 接続を確認しています' }
        : bridgeStatus === 'error'
          ? { color: 'text-rose-500 hover:text-rose-600', dot: 'bg-rose-400', title: `教材フォルダ: 接続できません（${lastError ?? ''}）` }
          : { color: '', dot: '', title: '教材フォルダ: 未設定' };

  const handleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
    }
  };

  return (
    <header className="h-14 border-b border-zinc-100 flex items-center justify-between px-6 bg-white shrink-0 relative z-40">
      {/* Left: Project Title */}
      <div className="flex items-center min-w-0">
        <div
          className="h-10 flex items-center px-4 rounded-xl bg-darkDelegation shrink-0"
          aria-label="教員代行努ブラック"
        >
          <span className="text-white font-black text-sm tracking-tight whitespace-nowrap">
            教員代行努ブラック
          </span>
        </div>

        <div className="flex items-center gap-3 self-start mt-3 ml-2 min-w-0">
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={() => setIsInfoOpen(true)}
              className="text-zinc-300 hover:text-zinc-500 transition-colors cursor-pointer"
            >
              <Info size={14} strokeWidth={2} />
            </button>
            <span className="text-[10px] font-medium text-zinc-400 font-mono">v{version}</span>
          </div>

          <div className="flex items-center gap-3 min-w-0">
            <a
              href="https://x.com/arturitu"
              target="_blank"
              rel="noopener"
              className="text-[10px] font-medium text-zinc-400 hover:text-darkDelegation transition-colors truncate"
            >
              @arturitu
            </a>
            <a
              href="https://github.com/arturitu/the-delegation"
              target="_blank"
              rel="noopener"
              className="text-zinc-300 hover:text-darkDelegation transition-colors shrink-0"
              title="View on GitHub"
            >
              <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"></path></svg>
            </a>
          </div>
        </div>
      </div>

      {/* Right: Global Controls */}
      <div className="flex items-center gap-3">

        {/* いま作っている案件。どの画面にいても見えるようにする */}
        <JobBar />

        <div className="w-px h-4 bg-zinc-200" />

        {/* フロア図と3Dの切り替え。フロア図が既定 */}
        <button
          onClick={() => setViewMode(viewMode === 'floor' ? 'simulation' : 'floor')}
          className={`flex items-center gap-2 px-3 py-1 rounded-lg transition-all active:scale-95 cursor-pointer h-9 shrink-0 border
            ${viewMode === 'floor'
              ? 'bg-white border-zinc-200 text-darkDelegation shadow-sm'
              : 'bg-darkDelegation border-transparent text-white shadow-lg shadow-black/10'}`}
          title={viewMode === 'floor' ? '3Dの職員室へ' : 'フロア図（全部屋）へ'}
        >
          <LayoutGrid size={14} />
          <span className="text-[10px] font-black uppercase tracking-wider ml-1 hidden sm:inline">
            {viewMode === 'floor' ? '3Dへ' : 'フロア図'}
          </span>
        </button>

        <button
          onClick={() => setViewMode('design')}
          className="flex items-center gap-2 px-3 py-1 bg-darkDelegation hover:bg-darkDelegation text-white rounded-lg transition-all shadow-lg shadow-black/10 active:scale-95 cursor-pointer h-9 shrink-0 ml-1"
          title="Manage Teams"
        >
          <Settings size={14} className="group-hover:rotate-45 transition-transform" />
          <span className="text-[10px] font-black uppercase tracking-wider ml-1 hidden sm:inline">Manage Teams</span>
        </button>

        <div className="w-px h-4 bg-zinc-200" />

        <div className="flex items-center gap-2">
          <button
            onClick={handleFullscreen}
            className="text-zinc-400 hover:text-darkDelegation transition-colors p-1"
            title="Fullscreen Browser"
          >
            <Maximize2 size={16} />
          </button>
          {/* 職員室の背景色。長く見る画面なので、まぶしさは担任が決められるほうがよい */}
          <div className="relative" translate="no">
            <button
              onClick={() => setIsPaletteOpen((v) => !v)}
              className="text-zinc-400 hover:text-darkDelegation transition-colors p-1"
              title="職員室の色"
            >
              <Palette size={16} />
            </button>
            {isPaletteOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setIsPaletteOpen(false)} />
                <div className="absolute right-0 top-8 z-50 bg-white rounded-2xl shadow-lg border border-zinc-100 p-3 flex gap-2">
                  {OFFICE_THEMES.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => { setThemeId(t.id); setIsPaletteOpen(false); }}
                      title={t.name}
                      className={`w-7 h-7 rounded-full border-2 transition-all cursor-pointer ${
                        themeId === t.id ? 'border-darkDelegation scale-110' : 'border-zinc-200 hover:border-zinc-400'
                      }`}
                      style={{ backgroundColor: t.background }}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
          <button
            onClick={() => setBYOKOpen(true)}
            className={`relative text-zinc-400 hover:text-darkDelegation transition-colors p-1 ${bridgeLook.color}`}
            title={bridgeLook.title}
          >
            <FolderOpen size={16} />
            {bridgeLook.dot && (
              <span className={`absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full ${bridgeLook.dot}`} />
            )}
          </button>
          <button
            onClick={() => bridgeStatus === 'connected' ? setIsMemoryOpen(true) : setBYOKOpen(true)}
            className={`relative text-zinc-400 hover:text-darkDelegation transition-colors p-1 ${bridgeStatus !== 'connected' ? 'opacity-30' : ''}`}
            title={bridgeStatus === 'connected' ? '記憶（memory.md）を見る・直す' : '記憶: 先に教材フォルダを接続してください'}
          >
            <BookOpen size={16} />
          </button>
          <button
            onClick={() => setBYOKOpen(true)}
            className="relative text-zinc-400 hover:text-darkDelegation transition-colors p-1"
            title="API Key (BYOK)"
          >
            <KeyRound size={16} className={hasKey ? 'text-emerald-500 hover:text-emerald-600' : ''} />
            {hasKey && (
              <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-emerald-400" />
            )}
          </button>
        </div>
      </div>

      {isInfoOpen && (
        <InfoModal key="info-modal" onClose={() => setIsInfoOpen(false)} />
      )}

      {isBYOKOpen && (
        <BYOKModal key="byok-modal" onClose={() => setBYOKOpen(false)} />
      )}

      {isMemoryOpen && (
        <MemoryModal key="memory-modal" onClose={() => setIsMemoryOpen(false)} />
      )}
    </header>
  );
};

export default Header;

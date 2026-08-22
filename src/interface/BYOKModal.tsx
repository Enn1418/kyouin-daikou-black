import { Check, Eye, EyeOff, FolderOpen, Loader2, Trash2, X } from 'lucide-react';
import React, { useState } from 'react';
import { useUiStore } from '../integration/store/uiStore';
import { useBridgeStore } from '../integration/store/bridgeStore';
import { checkBridge } from '../core/bridge/bridgeClient';
import { DEFAULT_MODELS } from '../core/llm/constants';

interface BYOKModalProps {
  onClose: () => void;
}

const STORAGE_KEY = 'byok-config';

const BYOKModal: React.FC<BYOKModalProps> = ({ onClose }) => {
  const { llmConfig, setLlmConfig, byokError } = useUiStore();

  const [apiKey, setApiKey] = useState<string>(llmConfig.apiKey || '');
  const [geminiApiKey, setGeminiApiKey] = useState<string>(llmConfig.geminiApiKey || '');
  const [showKey, setShowKey] = useState(false);
  const [showGeminiKey, setShowGeminiKey] = useState(false);
  const [isErrorExpanded, setIsErrorExpanded] = useState(false);

  // 教材フォルダのローカルブリッジ（任意。未起動でもアプリは動く）
  const { url: bridgeUrl, token: bridgeToken, status: bridgeStatus, rootName, lastError, setConfig } = useBridgeStore();
  const [bridgeUrlInput, setBridgeUrlInput] = useState<string>(bridgeUrl);
  const [bridgeTokenInput, setBridgeTokenInput] = useState<string>(bridgeToken);

  const handleBridgeCheck = async () => {
    setConfig({ url: bridgeUrlInput.trim(), token: bridgeTokenInput.trim() });
    await checkBridge();
  };

  const handleSave = () => {
    const config = {
      apiKey: apiKey.trim(),
      geminiApiKey: geminiApiKey.trim(),
      model: llmConfig.model || DEFAULT_MODELS.text,
    };
    setLlmConfig(config);
    setConfig({ url: bridgeUrlInput.trim(), token: bridgeTokenInput.trim() });
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    } catch (e) {
      console.error('Failed to save BYOK config', e);
    }
    onClose();
  };

  const handleClear = () => {
    const emptyConfig = {
      apiKey: '',
      geminiApiKey: '',
      model: llmConfig.model || DEFAULT_MODELS.text,
    };
    setApiKey('');
    setGeminiApiKey('');
    setLlmConfig(emptyConfig);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(emptyConfig));
    } catch (e) {
      console.error('Failed to clear BYOK config', e);
    }
  };

  const isSaved = !!llmConfig.apiKey || !!llmConfig.geminiApiKey;

  return (
    <div className="fixed inset-0 z-100 flex items-center justify-center p-6 pointer-events-auto overflow-hidden">
      <div
        onClick={onClose}
        className="absolute inset-0 bg-white/60 backdrop-blur-xl"
      />
      <div
        className="relative w-full max-w-md bg-white rounded-[40px] shadow-[0_32px_64px_-12px_rgba(0,0,0,0.1)] p-8 md:p-10 border border-zinc-100"
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-6 right-6 text-zinc-300 hover:text-zinc-600 transition-colors cursor-pointer"
        >
          <X size={18} />
        </button>

        <div className="max-w-md mx-auto">
          {/* Header */}
          <div className="mb-6">
            <h2 className="text-3xl font-black text-darkDelegation tracking-tight mb-2">
              API Keys
            </h2>
            <p className="text-zinc-400 text-sm font-medium leading-relaxed max-w-[280px]">
              Your keys are stored locally and never leave your browser.
            </p>
          </div>

          {/* Error Message */}
          {byokError && (() => {
            const isLongError = byokError.length > 120;
            const displayError = isErrorExpanded || !isLongError ? byokError : byokError.slice(0, 110) + '...';

            return (
              <div className="mb-6 p-3 bg-red-50 border border-red-100 rounded-2xl flex items-start gap-2 animate-in fade-in slide-in-from-top-2">
                <div className="mt-0.5 text-red-500 shrink-0">
                  <X size={14} strokeWidth={3} className="rotate-45" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-black uppercase tracking-wider text-red-500 mb-0.5">API Error</p>
                  <div className={`${isErrorExpanded ? 'max-h-48' : 'max-h-24'} overflow-y-auto pr-1`}>
                    <p className="text-[11px] font-medium text-red-600 leading-tight break-words whitespace-pre-wrap">
                      {displayError}
                    </p>
                    {isLongError && (
                      <button
                        onClick={() => setIsErrorExpanded(!isErrorExpanded)}
                        className="mt-1 text-[9px] font-black uppercase tracking-widest text-red-500 hover:text-red-700 transition-colors cursor-pointer"
                      >
                        {isErrorExpanded ? 'Show Less' : 'Show More'}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Claude API Key input */}
          <div className="mb-8">
            <div className="flex items-center justify-between mb-4 ml-1">
              <label className="text-[11px] font-black uppercase tracking-[0.2em] text-zinc-300">
                Claude API Key
              </label>
              <a
                href="https://console.anthropic.com/settings/keys"
                target="_blank"
                rel="noopener"
                className="text-[9px] font-black uppercase tracking-wider text-blue-500 hover:text-blue-700 transition-colors"
              >
                Get key
              </a>
            </div>
            <p className="text-zinc-400 text-[11px] font-medium leading-relaxed mb-3 ml-1">
              Powers agent reasoning and chat for every team. Required.
            </p>
            <div className="relative group">
              <input
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-ant-..."
                className="w-full bg-zinc-50 border border-zinc-100 rounded-3xl px-6 py-4 pr-14 text-sm text-darkDelegation font-mono placeholder:text-zinc-300 placeholder:font-sans focus:outline-none focus:border-zinc-200 transition-all shadow-sm group-hover:shadow-md"
              />
              <button
                type="button"
                onClick={() => setShowKey(v => !v)}
                className="absolute right-5 top-1/2 -translate-y-1/2 text-zinc-200 hover:text-zinc-400 transition-colors cursor-pointer"
              >
                {showKey ? <EyeOff size={20} strokeWidth={2.5} /> : <Eye size={20} strokeWidth={2.5} />}
              </button>
            </div>
          </div>

          {/* Gemini API Key input */}
          <div className="mb-10">
            <div className="flex items-center justify-between mb-4 ml-1">
              <label className="text-[11px] font-black uppercase tracking-[0.2em] text-zinc-300">
                Gemini API Key
              </label>
              <a
                href="https://aistudio.google.com/app/apikey"
                target="_blank"
                rel="noopener"
                className="text-[9px] font-black uppercase tracking-wider text-emerald-600 hover:text-emerald-700 transition-colors"
              >
                Get key
              </a>
            </div>
            <p className="text-zinc-400 text-[11px] font-medium leading-relaxed mb-3 ml-1">
              Used only for image, music, and video generation (Nano Banana Lab, Lyria Factory, Veo Studio).
            </p>
            <div className="relative group">
              <input
                type={showGeminiKey ? 'text' : 'password'}
                value={geminiApiKey}
                onChange={(e) => setGeminiApiKey(e.target.value)}
                placeholder="Paste your Gemini API key here"
                className="w-full bg-zinc-50 border border-zinc-100 rounded-3xl px-6 py-4 pr-14 text-sm text-darkDelegation font-mono placeholder:text-zinc-300 placeholder:font-sans focus:outline-none focus:border-zinc-200 transition-all shadow-sm group-hover:shadow-md"
              />
              <button
                type="button"
                onClick={() => setShowGeminiKey(v => !v)}
                className="absolute right-5 top-1/2 -translate-y-1/2 text-zinc-200 hover:text-zinc-400 transition-colors cursor-pointer"
              >
                {showGeminiKey ? <EyeOff size={20} strokeWidth={2.5} /> : <Eye size={20} strokeWidth={2.5} />}
              </button>
            </div>
          </div>

          {/* 教材フォルダ（ローカルブリッジ） */}
          <div className="mb-10">
            <div className="flex items-center justify-between mb-4 ml-1">
              <label className="text-[11px] font-black uppercase tracking-[0.2em] text-zinc-300">
                教材フォルダ（任意）
              </label>
              {bridgeStatus === 'connected' && (
                <span className="flex items-center gap-1 text-[9px] font-black uppercase tracking-wider text-emerald-600">
                  <Check size={12} strokeWidth={3} /> {rootName}
                </span>
              )}
            </div>
            <p className="text-zinc-400 text-[11px] font-medium leading-relaxed mb-3 ml-1">
              自分の PC で <code className="font-mono">npm run bridge -- --root "教材フォルダ"</code> を起動すると、
              エージェントが去年の教材や学級の実態を読み、成果物をフォルダに保存できます。未起動でもアプリは動きます。
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                value={bridgeUrlInput}
                onChange={(e) => setBridgeUrlInput(e.target.value)}
                placeholder="http://localhost:5174"
                className="w-1/2 bg-zinc-50 border border-zinc-100 rounded-3xl px-5 py-4 text-sm text-darkDelegation font-mono placeholder:text-zinc-300 placeholder:font-sans focus:outline-none focus:border-zinc-200 transition-all shadow-sm"
              />
              <input
                type="text"
                value={bridgeTokenInput}
                onChange={(e) => setBridgeTokenInput(e.target.value)}
                placeholder="起動時に表示されるトークン"
                className="w-1/2 bg-zinc-50 border border-zinc-100 rounded-3xl px-5 py-4 text-sm text-darkDelegation font-mono placeholder:text-zinc-300 placeholder:font-sans focus:outline-none focus:border-zinc-200 transition-all shadow-sm"
              />
            </div>
            <button
              type="button"
              onClick={handleBridgeCheck}
              disabled={bridgeStatus === 'checking' || !bridgeUrlInput.trim() || !bridgeTokenInput.trim()}
              className="mt-3 flex items-center gap-2 px-6 py-3 rounded-2xl bg-zinc-50 border border-zinc-100 text-[10px] font-black uppercase tracking-widest text-zinc-500 hover:text-darkDelegation hover:border-zinc-200 transition-all cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
            >
              {bridgeStatus === 'checking'
                ? <Loader2 size={14} strokeWidth={3} className="animate-spin" />
                : <FolderOpen size={14} strokeWidth={3} />}
              接続を確認
            </button>
            {bridgeStatus === 'error' && lastError && (
              <p className="mt-2 ml-1 text-[10px] font-medium leading-relaxed text-red-500">{lastError}</p>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between">
            <button
              onClick={handleClear}
              disabled={!isSaved && !apiKey && !geminiApiKey}
              className="flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-zinc-400 hover:text-red-400 transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed group"
            >
              <div className="p-2 rounded-xl group-hover:bg-red-50 transition-colors">
                <Trash2 size={16} strokeWidth={2.5} />
              </div>
              Clear
            </button>

            <button
              onClick={handleSave}
              disabled={!apiKey.trim()}
              className="px-12 py-4 bg-darkDelegation text-white rounded-[24px] text-xs font-black uppercase tracking-[0.2em] hover:bg-black transition-all active:scale-95 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed disabled:active:scale-100 shadow-xl shadow-black/10"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BYOKModal;

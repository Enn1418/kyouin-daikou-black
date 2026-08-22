import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export type BridgeStatus = 'unknown' | 'checking' | 'connected' | 'error';

interface BridgeState {
  /** ローカルブリッジの URL。既定はブリッジ側の既定ポート。 */
  url: string;
  /** ブリッジ起動時に表示されるトークン。 */
  token: string;
  status: BridgeStatus;
  /** 接続できたときの教材フォルダ名（表示用）。 */
  rootName: string | null;
  lastError: string | null;
  /**
   * 教材フォルダの 99_記憶/memory.md の内容。
   * 実体はフォルダ側にあるので localStorage には持たない（接続時に読み直す）。
   */
  memory: string;

  setConfig: (config: { url?: string; token?: string }) => void;
  setMemory: (memory: string) => void;
  setStatus: (status: BridgeStatus, detail?: { rootName?: string | null; error?: string | null }) => void;
  reset: () => void;
}

export const DEFAULT_BRIDGE_URL = 'http://localhost:5174';

export const useBridgeStore = create<BridgeState>()(
  persist(
    (set) => ({
      url: DEFAULT_BRIDGE_URL,
      token: '',
      status: 'unknown',
      rootName: null,
      lastError: null,
      memory: '',

      setConfig: (config) =>
        set((s) => ({
          url: config.url !== undefined ? config.url : s.url,
          token: config.token !== undefined ? config.token : s.token,
          status: 'unknown',
          lastError: null
        })),

      setMemory: (memory) => set({ memory }),

      setStatus: (status, detail) =>
        set((s) => ({
          status,
          rootName: detail?.rootName !== undefined ? detail.rootName : s.rootName,
          lastError: detail?.error !== undefined ? detail.error : s.lastError
        })),

      reset: () =>
        set({ url: DEFAULT_BRIDGE_URL, token: '', status: 'unknown', rootName: null, lastError: null, memory: '' })
    }),
    {
      name: 'bridge-storage',
      storage: createJSONStorage(() => localStorage),
      // 接続状態は起動のたびに確かめ直す
      partialize: (s) => ({ url: s.url, token: s.token }) as any
    }
  )
);

/** React の外（エージェント側）から現在の設定を読む。 */
export function getBridgeConfig() {
  const { url, token, status } = useBridgeStore.getState();
  return { url, token, status };
}

/** 蓄積された記憶。React の外（プロンプト構築）から読む。 */
export function getBridgeMemory() {
  return useBridgeStore.getState().memory;
}

/** ブリッジが使える状態か（ツール定義を出すかどうかの判定に使う）。 */
export function isBridgeConnected() {
  return useBridgeStore.getState().status === 'connected';
}

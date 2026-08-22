import { useBridgeStore, getBridgeConfig } from '../../integration/store/bridgeStore';

/**
 * ローカルブリッジ（bridge/server.mjs）のクライアント。
 *
 * ブラウザからは教材フォルダを直接触れないため、自分の PC で動いている
 * ブリッジ越しに読み書きする。ブリッジが起動していない場合は接続エラーになるだけで、
 * アプリ本体は通常どおり動く（ファイル機能だけが使えない）。
 */

export interface FileEntry {
  name: string;
  path: string;
  type: 'file' | 'dir';
  size?: number;
  mtime?: string;
}

export class BridgeError extends Error {}

async function request<T>(
  method: 'GET' | 'PUT' | 'POST',
  endpoint: string,
  options: { query?: Record<string, string>; body?: unknown } = {}
): Promise<T> {
  const { url, token } = getBridgeConfig();
  if (!url) throw new BridgeError('ブリッジの URL が設定されていません');

  const target = new URL(endpoint, url);
  Object.entries(options.query || {}).forEach(([k, v]) => target.searchParams.set(k, v));

  let res: Response;
  try {
    res = await fetch(target.toString(), {
      method,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {})
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined
    });
  } catch {
    throw new BridgeError(
      'ブリッジに接続できません。`npm run bridge -- --root "教材フォルダ"` で起動しているか確認してください'
    );
  }

  const payload = await res.json().catch(() => ({}));
  if (!res.ok) throw new BridgeError((payload as any).error || `ブリッジがエラーを返しました (${res.status})`);
  return payload as T;
}

/** 教材フォルダの記憶を読み込む。接続確認のたびに読み直す。 */
export async function loadMemory(): Promise<string> {
  try {
    const { content } = await bridge.readMemory();
    useBridgeStore.getState().setMemory(content);
    return content;
  } catch {
    // 記憶が読めなくても本体の動作は止めない
    useBridgeStore.getState().setMemory('');
    return '';
  }
}

/**
 * 差し戻しの指摘を記憶に追記する。
 *
 * 自動で何でも溜めるのではなく、担任が「直して」と言ったことだけを残す。
 * 同じ指摘を二度書かないことと上限の管理はブリッジ側で行う（bridge/memory.mjs）。
 */
export async function appendMemoryNote(note: string): Promise<void> {
  if (!note?.trim()) return;
  try {
    const { content } = await bridge.appendMemoryNote(note);
    useBridgeStore.getState().setMemory(content);
  } catch (e) {
    // 記憶の追記に失敗しても差し戻し自体は成立させる
    console.warn('[bridge] 記憶に追記できませんでした', e);
  }
}

/** 接続確認。副作用として store の状態を更新する。 */
export async function checkBridge(): Promise<boolean> {
  const { setStatus } = useBridgeStore.getState();
  setStatus('checking');
  try {
    const health = await request<{ ok: boolean; root: string }>('GET', '/health');
    // /health は認証不要なので、トークンが正しいかは実際の読み取りで確かめる
    await request<unknown>('GET', '/files', { query: { dir: '.' } });
    setStatus('connected', { rootName: health.root, error: null });
    await loadMemory();
    return true;
  } catch (e) {
    setStatus('error', { error: e instanceof Error ? e.message : String(e), rootName: null });
    return false;
  }
}

export const bridge = {
  listFiles: (dir: string) =>
    request<{ dir: string; entries: FileEntry[]; truncated: boolean }>('GET', '/files', { query: { dir } }),

  readFile: (path: string) =>
    request<{ path: string; content: string }>('GET', '/file', { query: { path } }),

  writeFile: (path: string, content: string) =>
    request<{ path: string; bytes: number; backedUp: boolean }>('PUT', '/file', {
      query: { path },
      body: { content }
    }),

  readMemory: () => request<{ path: string; content: string }>('GET', '/memory'),

  writeMemory: (content: string) =>
    request<{ path: string; bytes: number }>('PUT', '/memory', { body: { content } }),

  appendMemoryNote: (note: string) =>
    request<{ path: string; content: string; appended: boolean }>('POST', '/memory/note', { body: { note } }),

  exportHtml: (params: { path: string; title?: string; markdown: string; template?: string }) =>
    request<{ path: string; template: string }>('POST', '/export', { body: params }),

  /**
   * 反復ドリルの生成。問題そのものはモデルではなくブリッジ側が作る
   * （数値の量産と検算は決定的なコードの仕事 — 設計 §8-12）。
   */
  generateDrill: (params: {
    path: string;
    title?: string;
    count?: number;
    seed?: number;
    columns?: number;
    template?: string;
    answerKey?: boolean;
    spec: Record<string, unknown>;
  }) =>
    request<{
      path: string;
      answerPath: string | null;
      seed: number;
      count: number;
      requested: number;
      available: number;
      shortfall: number;
      exported: string[];
    }>('POST', '/generate/drill', { body: params })
};

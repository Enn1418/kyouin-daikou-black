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

/** 接続確認。副作用として store の状態を更新する。 */
export async function checkBridge(): Promise<boolean> {
  const { setStatus } = useBridgeStore.getState();
  setStatus('checking');
  try {
    const health = await request<{ ok: boolean; root: string }>('GET', '/health');
    // /health は認証不要なので、トークンが正しいかは実際の読み取りで確かめる
    await request<unknown>('GET', '/files', { query: { dir: '.' } });
    setStatus('connected', { rootName: health.root, error: null });
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

  exportHtml: (params: { path: string; title?: string; markdown: string; template?: string }) =>
    request<{ path: string; template: string }>('POST', '/export', { body: params })
};

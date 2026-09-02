import React from 'react';

interface State {
  error: Error | null;
}

/**
 * 画面が真っ白になるのを防ぐ。
 *
 * React はレンダリング中の例外を捕まえないと DOM ごと消すので、担任には
 * 「白い画面」しか見えず、原因も分からない。ここで受け止めて、何が起きたかと
 * 次にどうすればいいかを日本語で出す。
 */
export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[app] 画面の描画に失敗しました', error, info);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="w-screen h-screen flex items-center justify-center bg-white p-8" translate="no">
        <div className="max-w-xl">
          <h1 className="text-lg font-black text-darkDelegation mb-3">画面の表示に失敗しました</h1>
          <p className="text-sm text-zinc-500 leading-relaxed mb-4">
            F5 で読み込み直すと直ることがあります。何度も起きる場合は、
            ブラウザの<strong>自動翻訳が有効になっていないか</strong>を確認してください
            （翻訳がページの文字を書き換えると、この画面になります）。
          </p>
          <pre className="text-[11px] font-mono text-zinc-400 bg-zinc-50 rounded-2xl p-4 whitespace-pre-wrap break-words">
            {error.message}
          </pre>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 px-6 py-3 rounded-2xl bg-darkDelegation text-white text-[11px] font-black tracking-widest cursor-pointer"
          >
            読み込み直す
          </button>
        </div>
      </div>
    );
  }
}

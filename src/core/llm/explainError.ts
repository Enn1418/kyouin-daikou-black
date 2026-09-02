/**
 * API のエラーを、担任が読んで動ける日本語にする。
 *
 * これまでは受け取った文字列をそのまま画面に出していた。実際に出たのはこれ:
 *
 *   400 {"type":"error","error":{"type":"invalid_request_error","message":"You have
 *   reached your specified API usage limits. You will regain access on 2026-09-01
 *   at 00:00 UTC."},"request_id":"req_011CeSenVy5yPaYeB2yPjrKQ"}
 *
 * 英語で、JSON で、しかも大事な日付が UTC。**何が起きたのかも、次に何をすれば
 * よいのかも読み取れない。** 担任は開発者ではないので、ここで意味と対処に変える
 * （担任の指摘、2026-08-27）。
 *
 * 原文は捨てずに残す。問い合わせや調査では原文が要るため。
 */

export interface ExplainedError {
  /** 何が起きたか。1行で。 */
  title: string;
  /** 次に何をすればよいか。 */
  advice: string;
  /** 受け取ったままの文字列。折りたたんで出す。 */
  raw: string;
  /**
   * 担任が手を打つまで、待っても直らないか。
   *
   * 上限・残高・キーの誤りは、何度呼び直しても同じ結果になる。
   * 部屋は数秒ごとに動こうとするので、放っておくと**失敗し続けて画面が塞がる**。
   * これが true のときは、部屋を止めて待つ。
   */
  blocking: boolean;
}

/**
 * UTC の日時を日本時間の言い方にする（例: 9月1日（火）09:00）。
 *
 * 9時間ずらしてから UTC の読み出しを使う。動かしている端末の時間帯に左右されず、
 * どの環境でも同じ答えになる。
 */
function toJapanTime(iso: string): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;

  const jst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  const weekday = ['日', '月', '火', '水', '木', '金', '土'][jst.getUTCDay()];
  const hh = String(jst.getUTCHours()).padStart(2, '0');
  const mm = String(jst.getUTCMinutes()).padStart(2, '0');

  return `${jst.getUTCMonth() + 1}月${jst.getUTCDate()}日（${weekday}）${hh}:${mm}`;
}

/** 使用上限のメッセージから復帰日時を拾って、日本時間に直した一文にする。 */
function usageLimitAdvice(raw: string): string {
  const m = /regain access on (\d{4}-\d{2}-\d{2})[^\d]+(\d{2}:\d{2})/.exec(raw);
  const when = m ? toJapanTime(`${m[1]}T${m[2]}:00Z`) : null;

  return [
    when
      ? `日本時間の ${when} を過ぎると、自動でまた使えるようになります。`
      : '月が変わると、自動でまた使えるようになります。',
    'すぐ再開したいときは、Anthropic のコンソール（console.anthropic.com）の',
    'Settings → Limits で、月の上限額を上げてください。',
    '同じ画面で今月いくら使ったかも見られます。上げた分は請求に乗るので、金額を見てから決めてください。',
    '※ 依頼票の「この案件の上限額」とは別のものです。そちらを変えても解消しません。'
  ].join('\n');
}

/**
 * エラーを読み解く。心当たりのない形のものは、原文をそのまま見せる
 * （知ったかぶりで違う対処を案内するより、原文のほうが役に立つ）。
 */
export function explainApiError(raw: string): ExplainedError {
  const text = String(raw ?? '');
  const lower = text.toLowerCase();

  if (/usage limits?/i.test(text) && /regain access|reached/i.test(text)) {
    return {
      title: 'Claude API の利用上限に達しました',
      advice: usageLimitAdvice(text),
      raw: text,
      blocking: true
    };
  }

  if (lower.includes('credit balance is too low') || lower.includes('insufficient')) {
    return {
      title: 'Claude API の残高が足りません',
      advice:
        'コンソール（console.anthropic.com）の Billing で残高を足すと再開できます。\n' +
        '画像生成（Gemini）は別のキーなので、そちらは動きます。',
      raw: text,
      blocking: true
    };
  }

  if (/rate limit/i.test(text) || text.includes('429')) {
    return {
      title: '短い時間に呼びすぎました（一時的な制限）',
      advice:
        '1〜2分ほど待ってから、もう一度お試しください。\n' +
        '何度も続くときは、同時に動かしている部屋を減らすと落ち着きます。',
      raw: text,
      blocking: false
    };
  }

  if (/authentication|invalid x-api-key|unauthorized/i.test(text) || text.includes('401')) {
    return {
      title: 'API キーが受け付けられませんでした',
      advice:
        'キーの貼り間違い（前後の空白・途中で切れている）がないか確かめてください。\n' +
        'コンソールでキーを作り直して、貼り直すのが確実です。',
      raw: text,
      blocking: true
    };
  }

  if (/permission|forbidden/i.test(text) || text.includes('403')) {
    return {
      title: 'このキーでは使えない操作です',
      advice:
        'キーに権限が足りないか、別のワークスペースのキーの可能性があります。\n' +
        'コンソールで、このキーが使えるモデルと権限を確かめてください。',
      raw: text,
      blocking: true
    };
  }

  if (/overloaded/i.test(text) || text.includes('529') || text.includes('503')) {
    return {
      title: 'Claude 側が混み合っています',
      advice: 'しばらく待ってから、もう一度お試しください。こちらの設定に問題はありません。',
      raw: text,
      blocking: false
    };
  }

  if (/gemini api key is required/i.test(text)) {
    return {
      title: '画像を作るには Gemini のキーが要ります',
      advice: 'この画面の「GEMINI API KEY」の欄に貼って、保存してください。',
      raw: text,
      blocking: true
    };
  }

  if (/claude api key is required/i.test(text)) {
    return {
      title: 'Claude の API キーが設定されていません',
      advice: 'この画面の「CLAUDE API KEY」の欄に貼って、保存してください。',
      raw: text,
      blocking: true
    };
  }

  if (/failed to fetch|networkerror|load failed/i.test(text)) {
    return {
      title: '通信できませんでした',
      advice:
        'ネットワークの接続を確かめてから、もう一度お試しください。\n' +
        '学校の回線では、接続がふさがれていることもあります。',
      raw: text,
      blocking: false
    };
  }

  return {
    title: 'エラーが起きました',
    advice: '下の原文に手がかりがあります。分からないときは、この文をそのまま伝えてください。',
    raw: text,
    blocking: false
  };
}

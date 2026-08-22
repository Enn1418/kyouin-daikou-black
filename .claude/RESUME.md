# 現在地 — 教員向け（特別支援学級）エージェント職員室

このファイルは SessionStart フックが読み上げます。**作業を進めたら、このファイルも更新してください。**

## 何を作っているか

私用 Windows PC で、特別支援学級（全学年・全教科／重点は算数・国語・自立活動）の教員本人が
一人で使うための教材作成エージェント。児童の個人情報は入力しない前提（匿名ID A児・B児…で運用）。

- 設計: `docs/teacher-edition-design.md`
- 実際の使い方（分刻み）: `docs/teacher-edition-workflow.md`
- ブランチ: `claude/teacher-focused-design-kv19k9` / PR #1

## 完了済み（P0）

- `src/data/teacherAgents.ts` — 特支向け4チーム（同時異教材室・国語教材室・算数教材室・自立活動室）
  各チームはリード1＋サブ3。サブは `claude-haiku-4-5`、リードは既定モデル
- `src/core/agent/PromptBuilder.ts` — `teamType === '特別支援'` のときだけ効く規約
  （日本語・匿名ID・自立活動の区分は一次資料のみ・評価は「下書き」明記・教科書本文の複製禁止）
  あわせて特支チームのみ `complete_task` / `deliver_project` の100語制限を解除
- `src/data/agents.ts` — 既存定義を `BASE_SETS` に改名し `AGENTIC_SETS` に合流（既存チームは無変更）
- `npm run lint` / `npm run build` 通過

## 完了済み（P1：ローカルブリッジ）

- `bridge/server.mjs` — 教材フォルダのブリッジ。127.0.0.1 のみ、トークン認証、root 配下限定、
  拡張子ホワイトリスト、上書き時 `.bak`、削除 API なし。`/health` `/files` `/file` `/memory` `/export`
- `bridge/markdown.mjs` `bridge/templates.mjs` — 依存なしの Markdown→HTML と印刷テンプレート
  （plain / grid / trace / spaced / one-task、BIZ UDPゴシック指定）。
  教材フォルダ側に `03_印刷テンプレート/<名前>.css` があればそちらが優先
- `src/core/bridge/bridgeClient.ts` / `src/integration/store/bridgeStore.ts` — 接続設定と接続確認
- `src/core/agent/tools/fileTools.ts` — `list_files` / `read_file` / `write_file`
  （ブリッジ接続時のみツール定義に載る。read は全フェーズ、write は working のみ）
- `ToolRegistry.process` が文字列も返せるようになり、`AgentBrain` がそれを tool_result に渡す
- `BYOKModal` に「教材フォルダ（任意）」欄と接続確認ボタン
- 起動: `npm run bridge -- --root "D:\kyouin"` → 表示された URL とトークンをアプリの設定に貼る

## 完了済み（ドリル生成）

- `bridge/drill.mjs` — 出題条件（型）から決定的に問題を作る。全列挙して絞り込むので、
  条件が厳しくても無限ループにならず、足りなければ足りないと言う。seed が同じなら同じプリント
- `POST /generate/drill` — 児童用プリントと教員用解答を**別ファイル**で書き出す。印刷用HTMLも同時に可。
  条件に合う問題が0問ならファイルを作らず断る
- エージェント用ツール `generate_drill`。プロンプト S10 で「計算問題を自分で並べない」を明示
- `bridge/drill.test.mjs` — `npm test`（node:test、依存なし）。答えの正しさ・条件遵守・
  重複なし・再現性・児童用に答えが載らないことを固定。11件

## 完了済み（長期記憶）

- `bridge/memory.mjs` + `POST /memory/note` — 差し戻しの指摘を1件足す。同じ指摘は増やさない
  （日本語では語間の空白に意味がないので、比較時のみ空白を無視）。上限100件で古いほうから落とす
- `coreStore.rejectTask` から `appendMemoryNote` を投げっぱなしで呼ぶ（失敗しても差し戻しは成立）
- `checkBridge` 成功時に `/memory` を読み、`PromptBuilder` が
  「この学級での約束」としてプロンプト先頭付近に載せる（末尾4000字まで）
- `bridge/memory.test.mjs` — 7件。重複排除・空入力・改行の畳み込み・上限・担任の手書き見出しの保全

## 次にやること（未着手・どれを選ぶかは担任＝ユーザーの判断）

1. **実地確認** — `.env` に `VITE_ANTHROPIC_API_KEY` を入れて `npm run dev`、
   「特支・同時異教材室」で1回動かし、3段階の出力の質とフォルダ保存を見る
2. **小さな修正** — 既定チームを特支にする（`DEFAULT_AGENTIC_SET_ID` が実在しない `'single-agent'`）、
   `NpcAgentDriver` の円状配置が `MAX_AGENTS` 分割のため9エージェントのチームでアバターが重なる問題
3. **UI で記憶を見る／直す** — 現状 memory.md は担任がエクスプローラで開いて編集する前提

## 注意（設計上の線引き）

- 反復ドリルの問題は LLM に量産させない。型（出題条件）だけ作らせ、数値と検算は決定的なコードで
- 氏名との対応表は教材フォルダに置かない。置いた時点で「個人情報を入れない」前提が崩れる

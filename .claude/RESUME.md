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

## 次にやること（未着手・どれを選ぶかは担任＝ユーザーの判断）

1. **実地確認** — `.env` に `VITE_ANTHROPIC_API_KEY` を入れて `npm run dev`、
   「特支・同時異教材室」で1回動かし、3段階の出力の質を見る
2. **P1: ローカルブリッジ** — `bridge/server.mjs`（localhost:5174、ルート配下限定、トークン認証）と
   ファイル系ツール3本（`list_files` / `read_file` / `write_file`）。教材フォルダの読み書きが可能になる
3. **小さな修正** — 既定チームを特支にする（`DEFAULT_AGENTIC_SET_ID` が実在しない `'single-agent'`）、
   `NpcAgentDriver` の円状配置が `MAX_AGENTS` 分割のため9エージェントのチームでアバターが重なる問題

## 注意（設計上の線引き）

- 反復ドリルの問題は LLM に量産させない。型（出題条件）だけ作らせ、数値と検算は決定的なコードで
- 氏名との対応表は教材フォルダに置かない。置いた時点で「個人情報を入れない」前提が崩れる

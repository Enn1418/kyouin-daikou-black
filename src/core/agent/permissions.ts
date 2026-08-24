/**
 * 誰がどの道具を使えるか。**依存を持たない純粋な定義。**
 *
 * 一か所にまとめてある理由は2つ。
 *   1. 権限は設計の核心で、散らばると「誰が何をできるのか」が誰にも分からなくなる
 *   2. ここが正しいことをテストで固定したい（ストアを読む関数の中にあると確かめにくい）
 *
 * 権限の考え方（docs/system-redesign.md）:
 *   ・案件と依頼票は**秘書室の窓口だけ**。作る部門が勝手に条件を決めない
 *   ・段取りは**秘書室だけ**。作る側が順序を決めると統括が意味を失う
 *   ・品質管理の判定は**品質管理室長だけ**。作った側が自分を合格にできてはいけない
 */

/** 案件を作り、依頼票を埋め、確定できる担当。 */
export const JOB_MANAGERS = ['sec-chief', 'sec-intake'] as const;

/** 段取りを登録できる担当。 */
export const PLAN_AUTHORS = ['sec-planner', 'sec-chief'] as const;

/** 品質管理の合否を出せる担当。 */
export const QA_JUDGES = ['qa-chief'] as const;

/**
 * 「最終成果物を1つ届けて終わる」形に当てはまらないリード。
 *
 * エンジン側に、部屋の内部タスクが全部終わると自動でリードへ
 * 「deliver_project を使え」と促す仕組みがある（AgentBrain.concludeProject、
 * 通常の制作部屋を前提にした固定文面）。秘書室・品質管理室は制作部屋ではなく、
 * 本来の完了アクションは set_work_plan／submit_qa_verdict であって deliver_project ではない。
 *
 * ここに入れておくと、
 *   ①ツール一覧から deliver_project を外す（誤って呼べないようにする）
 *   ②concludeProject の文面を、その部屋に合ったものに差し替える
 * の両方に使われる。**deliver_project を呼ぶと部屋の phase が 'done' になり心拍が止まる**
 * ので、ここに入れ忘れると「秘書室に話しかけると、そこで進行が止まって見える」不具合が起きる
 * （2026-08-24 に実際に発生し、これが直接の原因だった）。
 */
export const ORCHESTRATION_LEADS = ['sec-chief', 'qa-chief'] as const;

const has = (list: readonly string[], id?: string) => !!id && list.includes(id);

export const canManageJob = (agentId?: string) => has(JOB_MANAGERS, agentId);
export const canSetWorkPlan = (agentId?: string) => has(PLAN_AUTHORS, agentId);
export const canSubmitQaVerdict = (agentId?: string) => has(QA_JUDGES, agentId);
export const isOrchestrationLead = (agentId?: string) => has(ORCHESTRATION_LEADS, agentId);

/**
 * 秘書室・品質管理室に属する担当か（`sec-`／`qa-` の接頭辞で判定）。
 *
 * 教材フォルダの読み書き（学級の実態を読む、教材を保存する、ドリルを作る等）は、
 * 実際に教材を作る部屋の仕事であって、統括・監査の部屋の仕事ではない。
 * ここに入る担当には教材フォルダ関連のツールを渡さない（`ToolRegistry`）し、
 * プロンプトにも読む指示を書かない（`PromptBuilder`）。
 *
 * 渡してしまうと、依頼を受けた直後に「まず実態を読む」という指示に機械的に従い、
 * 教材フォルダに繋がっていない・繋がりが切れているときに、その接続エラーが
 * そのままチャットに表示されて CEO を混乱させる（2026-08-24 に実際に発生）。
 */
export const isOrchestrationRoom = (agentId?: string) =>
  !!agentId && (agentId.startsWith('sec-') || agentId.startsWith('qa-'));

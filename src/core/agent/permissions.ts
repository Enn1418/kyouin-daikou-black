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

const has = (list: readonly string[], id?: string) => !!id && list.includes(id);

export const canManageJob = (agentId?: string) => has(JOB_MANAGERS, agentId);
export const canSetWorkPlan = (agentId?: string) => has(PLAN_AUTHORS, agentId);
export const canSubmitQaVerdict = (agentId?: string) => has(QA_JUDGES, agentId);

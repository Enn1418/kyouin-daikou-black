/**
 * 案件（依頼1件）の型。
 *
 * これまで仕事の単位は「部屋」で、部屋は自分の依頼文しか知らなかった。
 * そのため部屋を移るたびに CEO が構想を伝え直すことになり、
 * 部屋どうしの成果物が噛み合わなかった（docs/system-redesign.md §0）。
 *
 * 案件は部屋の上位にある入れ物で、確定した条件（依頼票）を全部門が同じ文面で見る。
 * 途中で方針がぶれないのは、全員が同じ1つの文字列を読んでいるため。
 */

/** 出力形式。印刷用HTMLは教材フォルダ接続時のみ実際に書き出せる。 */
export type OutputFormat = 'md' | 'print-html' | 'image' | 'bundle';

export const OUTPUT_FORMAT_LABEL: Record<OutputFormat, string> = {
  md: 'Markdown（そのまま読める）',
  'print-html': '印刷用HTML（そのまま印刷できる）',
  image: '画像（掲示物・絵カード）',
  bundle: '一式（上をまとめて）'
};

/**
 * 依頼票。制作を始める前にここが埋まっていること。
 *
 * `REQUIRED_FIELDS` の項目が空のままだと、制御層が制作へ進ませない。
 * 「AIが聞き忘れる」を防ぐため、充足の判定は機械的に行う（LLMに任せない）。
 */
export interface RequirementSheet {
  subject: string;          // 教科
  grade: string;            // 学年（「1〜4年」のような複数学年可）
  unitName: string;         // 単元名
  teachingContent: string;  // 指導したい内容
  competencies: string;     // 児童に身につけさせたい力
  hours: number;            // 授業時数
  pupils: string;           // 児童の実態（匿名IDのみ。既定は教材フォルダの実態ファイル）
  participants: string[];   // この単元に参加する児童（匿名ID）
  ict: string[];            // 使用できるICT機器・教材
  wantedOutputs: string[];  // 希望する成果物
  outputFormats: OutputFormat[];
  style: string;            // 出力スタイル（詳しい指導案 / 略案 / 児童用のみ 等）
  constraints: string;      // その他の制約・希望
  dueDate?: string;
}

/** 依頼票の項目1つぶんの説明。入力画面と、不足を尋ねる質問文の両方で使う。 */
export interface SheetField {
  key: keyof RequirementSheet;
  label: string;
  required: boolean;
  hint: string;
  kind: 'text' | 'multiline' | 'number' | 'list' | 'formats';
}

/**
 * 依頼票の定義。**表示順と必須の判定はここだけを見る。**
 * 画面・検証・質問文が別々の定義を持つと、必ずどこかがずれる。
 */
export const SHEET_FIELDS: SheetField[] = [
  { key: 'subject', label: '教科', required: true, kind: 'text', hint: '例: 算数' },
  { key: 'grade', label: '学年', required: true, kind: 'text', hint: '例: 1〜4年（特支なので複数学年でよい）' },
  { key: 'unitName', label: '単元名', required: true, kind: 'text', hint: '例: かさ（LとdL）' },
  { key: 'teachingContent', label: '指導したい内容', required: true, kind: 'multiline', hint: '何を分かってほしいか。1〜3行' },
  { key: 'competencies', label: '身につけさせたい力', required: true, kind: 'multiline', hint: '知識・技能／思考・判断・表現／学びに向かう力のどれでも' },
  { key: 'hours', label: '授業時数', required: true, kind: 'number', hint: '単元全体で何時間か' },
  { key: 'pupils', label: '児童の実態', required: true, kind: 'multiline', hint: '匿名ID（A児・B児…）で。教材フォルダを繋いでいれば「実態ファイルによる」でよい' },
  { key: 'participants', label: '参加する児童', required: true, kind: 'list', hint: '例: A児, B児, D児（全員でなくてよい）' },
  { key: 'wantedOutputs', label: '希望する成果物', required: true, kind: 'list', hint: '例: 略案, 3段階のプリント, 板書計画, 絵カード' },
  { key: 'outputFormats', label: '出力形式', required: true, kind: 'formats', hint: '複数選べる' },
  { key: 'ict', label: '使えるICT機器・教材', required: false, kind: 'list', hint: '例: 大型提示装置, タブレット1人1台' },
  { key: 'style', label: '出力スタイル', required: false, kind: 'text', hint: '例: 略案でよい／詳しい指導案がほしい' },
  { key: 'constraints', label: 'その他の制約・希望', required: false, kind: 'multiline', hint: '例: 45分・裏面なし・この教具は使えない' }
];

export const EMPTY_SHEET: RequirementSheet = {
  subject: '', grade: '', unitName: '', teachingContent: '', competencies: '',
  hours: 0, pupils: '', participants: [], ict: [], wantedOutputs: [],
  outputFormats: [], style: '', constraints: ''
};

/** 案件の状態。制御層だけがこれを進める（docs/system-redesign.md §3.2）。 */
export type JobStatus =
  | '受付'
  | '要件確認'
  | '調査'
  | '単元分析'
  | '構成案作成'
  | '承認待ち①'
  | '制作'
  | '統合'
  | '承認待ち②'
  | '完了'
  | '中止';

/** 工程1つ。秘書室が作り、制御層が動かす。 */
export interface PlanStep {
  id: string;
  roomId: string;
  title: string;
  brief: string;
  dependsOn: string[];
  parallelGroup: number;
  startCondition: string;
  doneCondition: string;
  status: 'pending' | 'ready' | 'running' | 'qa' | 'rework' | 'done' | 'skipped' | 'error' | 'blocked';
  reworkCount: number;
  note?: string;
  startedAt?: number;
  doneAt?: number;
}

export interface WorkPlan {
  steps: PlanStep[];
}

/** 単元分析（単元設計室の成果）。 */
export interface UnitAnalysis {
  value: string;              // 単元の本質的価値
  curriculumLink: string;     // 学習指導要領との関連（出典つき）
  competencies: string;       // 育成を目指す資質・能力
  goal: string;               // 単元目標
  rubric: string;             // 評価規準（冒頭に「下書き」）
  predictedDifficulties: string;
  support: string;
  process: string;            // 単元全体の学習過程
  hourOutlines: { hour: number; outline: string }[];
  wording: { medate?: string; matome?: string };  // 全部門で揃える言い回し
  sources: { title: string; url: string; note?: string }[];
  unresolved: string[];       // 未確定事項
}

export interface Deliverable {
  id: string;
  roomId: string;
  stepId?: string;
  title: string;
  path?: string;
  hour?: number;
  at: number;
}

export type QaVerdict = '合格' | '不合格';

export interface QaReport {
  id: string;
  stepId: string;
  verdict: QaVerdict;
  checks: { item: string; ok: boolean; note: string }[];
  reason: string;
  sendBackTo?: string;
  checkedAt: number;
}

export interface Approval {
  gate: '承認待ち①' | '承認待ち②';
  choice: '実行' | '修正' | '中止';
  comment?: string;
  at: number;
}

export interface JobEvent {
  id: string;
  at: number;
  actor: string;         // 'CEO' | roomId | 'control'
  what: string;
}

export interface Job {
  id: string;
  title: string;
  status: JobStatus;
  sheet: RequirementSheet;
  sheetLockedAt?: number;
  unit?: UnitAnalysis;
  plan?: WorkPlan;
  proposalHtml?: string;
  blueprintHtml?: string;
  approvals: Approval[];
  deliverables: Deliverable[];
  qaReports: QaReport[];
  events: JobEvent[];
  /** 案件ごとの上限額（ドル）。超えたら制御層が止めて CEO に確認する。 */
  budgetUsd: number;
  spentUsd: number;
  createdAt: number;
  updatedAt: number;
}

/**
 * 依頼ごとの上限額の既定。CEO の承認により設定（docs/system-redesign.md §12）。
 * $2 では単元まるごと（20時間分）の案件が途中で止まりやすかったため、
 * $5 に引き上げた（CEO の判断、2026-08-27）。依頼票の画面から案件ごとに変えられる。
 */
export const DEFAULT_BUDGET_USD = 5;

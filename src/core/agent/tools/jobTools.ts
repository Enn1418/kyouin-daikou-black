import { useJobStore } from '../../../integration/store/jobStore';
import { buildMissingQuestion, missingRequired } from '../../jobs/requirementSheet';
import type { OutputFormat, RequirementSheet } from '../../jobs/types';
import { AgentActionContext } from '../ToolRegistry';

/**
 * 案件と依頼票を、会話の中で作る道具。秘書室だけが使う。
 *
 * **なぜ必要か（実地でつまずいた点）:**
 * CEO は秘書室に「小3わり算導入・全4時間・対象D児F児」と話しかける。それが自然な入口。
 * ところが案件を作る手段をエージェントに渡していなかったので、秘書長は
 * 「CEO が画面から案件を作ってください」と突き返すしかなかった。
 * 秘書室の役割は「依頼を受け付け、目的と条件を整理し、不足を確認する」ことなので、
 * ここができないと秘書室が秘書室でなくなる。
 *
 * **推測で埋めない。** 過去に、雛形の架空の児童がそのまま教材へ流れ込む事故を起こしている。
 * 書き込むのは CEO が実際に言ったことだけ。足りない欄は空のままにして尋ねる。
 */

/** 会話から受け取れる依頼票の項目。数値・配列はここで型を整える。 */
interface SheetArgs {
  subject?: string;
  grade?: string;
  unitName?: string;
  teachingContent?: string;
  competencies?: string;
  hours?: number;
  pupils?: string;
  participants?: string[];
  ict?: string[];
  wantedOutputs?: string[];
  outputFormats?: string[];
  style?: string;
  constraints?: string;
}

const FORMATS: OutputFormat[] = ['md', 'print-html', 'image', 'bundle'];

/** 与えられた項目だけを取り出す。触れられていない欄は書き換えない。 */
function toPatch(a: SheetArgs): Partial<RequirementSheet> {
  const p: Partial<RequirementSheet> = {};
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
  const list = (v: unknown) =>
    Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean) : undefined;

  const s = str(a.subject); if (s) p.subject = s;
  const g = str(a.grade); if (g) p.grade = g;
  const u = str(a.unitName); if (u) p.unitName = u;
  const t = str(a.teachingContent); if (t) p.teachingContent = t;
  const c = str(a.competencies); if (c) p.competencies = c;
  const pu = str(a.pupils); if (pu) p.pupils = pu;
  const st = str(a.style); if (st) p.style = st;
  const co = str(a.constraints); if (co) p.constraints = co;

  if (typeof a.hours === 'number' && a.hours > 0) p.hours = Math.floor(a.hours);

  const pa = list(a.participants); if (pa?.length) p.participants = pa;
  const ic = list(a.ict); if (ic?.length) p.ict = ic;
  const wo = list(a.wantedOutputs); if (wo?.length) p.wantedOutputs = wo;

  const of = list(a.outputFormats)?.filter((x): x is OutputFormat =>
    FORMATS.includes(x as OutputFormat)
  );
  if (of?.length) p.outputFormats = of;

  return p;
}

/** 残っている項目を伝える文。埋まっていれば確定を促す。 */
function statusLine(sheet: RequirementSheet): string {
  const missing = missingRequired(sheet);
  if (missing.length === 0) {
    return '必須項目がすべて埋まりました。内容を CEO に読み上げて確認し、' +
      'よければ lock_requirement_sheet で確定してください。';
  }
  return buildMissingQuestion(sheet) +
    '\n（この文をそのまま CEO に伝えてください。1項目ずつ聞かないこと）';
}

export function createJob(agent: AgentActionContext, args: { title?: string } & SheetArgs): string {
  const store = useJobStore.getState();
  const active = store.activeJobId ? store.jobs[store.activeJobId] : null;

  // 作りかけの案件があるのに新しく作ると、CEO の答えが二つに散らばる
  if (active && !active.sheetLockedAt) {
    return `新しく作りませんでした: いま「${active.title}」の依頼票が作りかけです。` +
      'そちらを update_requirement_sheet で埋めてください。' +
      '別の依頼であることが確かなら、その旨を CEO に確認してください。\n' +
      statusLine(active.sheet);
  }

  const patch = toPatch(args);
  const title = (args.title ?? '').trim() || '新しい案件';
  const id = store.createJob(title, patch);
  const job = useJobStore.getState().jobs[id];

  store.addEvent(id, agent.roomId, '会話から案件を作成');

  return `案件「${job.title}」を作りました。\n${statusLine(job.sheet)}`;
}

export function updateRequirementSheet(agent: AgentActionContext, args: SheetArgs): string {
  const store = useJobStore.getState();
  const job = store.activeJobId ? store.jobs[store.activeJobId] : null;

  if (!job) {
    return '書き込めません: まだ案件がありません。先に create_job で案件を作ってください。';
  }
  if (job.sheetLockedAt) {
    return `書き込めません: 「${job.title}」の依頼票は確定済みです。` +
      '条件を変えるには CEO の指示が必要です。CEO に確認してください。';
  }

  const patch = toPatch(args);
  if (Object.keys(patch).length === 0) {
    return '書き込む内容がありませんでした。CEO が実際に言った内容だけを渡してください（推測で埋めない）。';
  }

  store.updateSheet(job.id, patch);
  const updated = useJobStore.getState().jobs[job.id];
  const wrote = Object.keys(patch).length;

  return `依頼票に${wrote}項目を書き込みました。\n${statusLine(updated.sheet)}`;
}

export function lockRequirementSheet(agent: AgentActionContext, _args: unknown): string {
  const store = useJobStore.getState();
  const job = store.activeJobId ? store.jobs[store.activeJobId] : null;

  if (!job) return '確定できません: 案件がありません。';
  if (job.sheetLockedAt) return `「${job.title}」の依頼票はすでに確定済みです。段取りに進んでください。`;

  // 必須が埋まっているかは機械が判定する。ここを緩めると、
  // 条件の足りないまま制作が始まり、CEO が気づくのは教材が出てきた後になる
  const missing = missingRequired(job.sheet);
  if (missing.length > 0) {
    return `確定できません。まだ${missing.length}項目足りません。\n${buildMissingQuestion(job.sheet)}`;
  }

  store.lockSheet(job.id);
  store.addEvent(job.id, agent.roomId, '依頼票を確定（会話から）');
  const locked = useJobStore.getState().jobs[job.id];

  return `依頼票を確定しました（案件名「${locked.title}」）。\n` +
    'この条件が全部門に渡ります。次はタスク設計担当に段取りを作らせ、set_work_plan で登録してください。';
}


/**
 * 依頼票の項目のスキーマ。create_job と update_requirement_sheet で共用する。
 * 説明文に「推測で埋めない」を書いておく — ここが実際にモデルが読む場所。
 */
const SHEET_PROPS = {
  subject: { type: 'string', description: '教科（例: 算数）' },
  grade: { type: 'string', description: '学年（例: 3年、1〜4年）' },
  unitName: { type: 'string', description: '単元名（例: わり算の導入）' },
  teachingContent: { type: 'string', description: '指導したい内容' },
  competencies: { type: 'string', description: '児童に身につけさせたい力' },
  hours: { type: 'integer', description: '授業時数（単元全体）' },
  pupils: { type: 'string', description: '児童の実態。匿名IDのみ。氏名は書かない' },
  participants: {
    type: 'array', items: { type: 'string' },
    description: 'この単元に参加する児童の匿名ID（例: ["D児","F児"]）'
  },
  ict: { type: 'array', items: { type: 'string' }, description: '使えるICT機器・教材' },
  wantedOutputs: {
    type: 'array', items: { type: 'string' },
    description: '希望する成果物（例: ["略案","3段階のプリント"]）'
  },
  outputFormats: {
    type: 'array',
    items: { type: 'string', enum: ['md', 'print-html', 'image', 'bundle'] },
    description: '出力形式'
  },
  style: { type: 'string', description: '出力スタイル（略案でよい／詳しい指導案がほしい 等）' },
  constraints: { type: 'string', description: 'その他の制約・希望' }
} as const;

const NO_GUESS =
  '**CEO が実際に言ったことだけを渡すこと。推測で欄を埋めてはいけない。**' +
  '言われていない欄は渡さず、空のままにして CEO に尋ねる。';

export function jobToolDefinitions(): any[] {
  return [
    {
      type: 'function',
      function: {
        name: 'create_job',
        description:
          'CEO の依頼から案件を作る。**CEO が依頼してきたら、まずこれを呼ぶ。**' +
          '画面から作ってもらう必要はない。分かっている条件はそのまま渡してよい。' +
          NO_GUESS,
        parameters: {
          type: 'object',
          properties: {
            title: { type: 'string', description: '案件名。省略すると単元名から付く' },
            ...SHEET_PROPS
          }
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'update_requirement_sheet',
        description:
          '依頼票に書き込む。CEO が不足項目に答えたら、その内容をここで反映する。' +
          '触れていない欄は書き換わらない。' + NO_GUESS,
        parameters: { type: 'object', properties: { ...SHEET_PROPS } }
      }
    },
    {
      type: 'function',
      function: {
        name: 'lock_requirement_sheet',
        description:
          '依頼票を確定する。必須項目が全部埋まっているときだけ成功する。' +
          '**確定する前に、内容を CEO に読み上げて確認すること。**' +
          '確定すると、この条件が全部門に渡る。',
        parameters: { type: 'object', properties: {} }
      }
    }
  ];
}

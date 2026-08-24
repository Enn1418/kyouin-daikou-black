import { useJobStore } from '../../../integration/store/jobStore';
import { workflowEngine } from '../../workflow/WorkflowEngine';
import { AgentActionContext } from '../ToolRegistry';

/**
 * 品質管理の判定を出す。品質管理室長だけが使う。
 *
 * **判定を出すのは品質管理室、次にどうするかを決めるのは制御層。**
 * ここでは合否を記録するだけで、工程を完了にしたり差し戻したりはしない。
 * それをこのツールにやらせると、監査が自分の判定を自分で執行することになり、
 * 独立性が崩れる（docs/system-redesign.md §4.8）。
 */

interface Args {
  stepId: string;
  verdict: '合格' | '不合格';
  reason: string;
  sendBackTo?: string;
  checks?: { item: string; ok: boolean; note?: string }[];
}

export function submitQaVerdict(agent: AgentActionContext, args: Args): string {
  const { jobs, activeJobId } = useJobStore.getState();
  const job = activeJobId ? jobs[activeJobId] : null;

  if (!job?.plan) return '判定できません: いま進行中の案件がありません。';

  // 検査待ちの工程だけを対象にする。終わったものを後から覆せないようにする
  const target =
    job.plan.steps.find((s) => s.id === args.stepId && s.status === 'qa') ??
    job.plan.steps.find((s) => s.status === 'qa');

  if (!target) {
    return '判定できません: いま検査待ちの工程がありません。成果物が提出されてから判定してください。';
  }

  const verdict = args.verdict === '合格' ? '合格' : '不合格';
  const reason = (args.reason ?? '').trim();

  // 不合格は理由が要る。理由の無い差し戻しは、作る側が何を直せばよいか分からない
  if (verdict === '不合格' && reason.length < 10) {
    return '判定できません: 不合格にするときは、どこが基準に届かないのかを具体的に書いてください（10文字以上）。';
  }
  // 合格でも、何を見たかは残す。「問題なし」だけの記録は監査にならない
  if (verdict === '合格' && reason.length === 0) {
    return '判定できません: 合格のときも、何を確かめた結果かを書いてください。';
  }

  const checks = (args.checks ?? []).map((c) => ({
    item: String(c.item ?? '').slice(0, 60),
    ok: !!c.ok,
    note: String(c.note ?? '').slice(0, 400)
  }));

  workflowEngine.applyQaVerdict(target.id, verdict, reason, args.sendBackTo, checks);

  return verdict === '合格'
    ? `「${target.title}」を合格にしました。次の工程へ進みます。`
    : `「${target.title}」を不合格にし、${args.sendBackTo ?? target.roomId} へ差し戻しました。` +
      '直したものは、もう一度ここで検査します。';
}


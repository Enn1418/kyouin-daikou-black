import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MAX_REWORK,
  canDeliver,
  decideAfterQa,
  decideNextActions,
  dependenciesMet,
  isStranded,
  planProgress,
  roomBusy
} from './planning.ts';
import { EMPTY_SHEET } from '../jobs/types.ts';
import type { Job, PlanStep, WorkPlan } from '../jobs/types.ts';

function step(id: string, roomId: string, over: Partial<PlanStep> = {}): PlanStep {
  return {
    id, roomId, title: id, brief: '',
    dependsOn: [], parallelGroup: 0,
    startCondition: '', doneCondition: '',
    status: 'pending', reworkCount: 0,
    ...over
  };
}

const plan = (steps: PlanStep[]): WorkPlan => ({ steps });
const ctx = { spentUsd: 0, budgetUsd: 2 };

test('依存が無い工程は起動できる', () => {
  const p = plan([step('a', 'room-1')]);
  const d = decideNextActions(p, ctx);
  assert.deepEqual(d, [{ kind: 'start', stepId: 'a', roomId: 'room-1' }]);
});

test('依存が終わるまで起動しない', () => {
  const p = plan([step('a', 'r1'), step('b', 'r2', { dependsOn: ['a'] })]);
  const d = decideNextActions(p, ctx);
  assert.deepEqual(d.map((x) => x.kind === 'start' && x.stepId), ['a']);
});

test('依存が終われば次が動く', () => {
  const p = plan([step('a', 'r1', { status: 'done' }), step('b', 'r2', { dependsOn: ['a'] })]);
  const d = decideNextActions(p, ctx);
  assert.deepEqual(d.map((x) => x.kind === 'start' && x.stepId), ['b']);
});

test('skipped も「片付いた」として扱う', () => {
  const p = plan([step('a', 'r1', { status: 'skipped' }), step('b', 'r2', { dependsOn: ['a'] })]);
  assert.equal(dependenciesMet(p.steps[1], p), true);
});

test('別々の部屋なら同時に起動する（並列）', () => {
  const p = plan([step('a', 'r1'), step('b', 'r2'), step('c', 'r3')]);
  const d = decideNextActions(p, ctx).filter((x) => x.kind === 'start');
  assert.equal(d.length, 3);
});

test('同じ部屋は二重に起動しない', () => {
  const p = plan([step('a', 'r1'), step('b', 'r1')]);
  const d = decideNextActions(p, ctx).filter((x) => x.kind === 'start');
  assert.equal(d.length, 1, '同じ部屋の工程が2つ同時に走ってはいけない');
});

test('部屋が作業中なら、その部屋の次の工程は待つ', () => {
  const p = plan([step('a', 'r1', { status: 'running' }), step('b', 'r1')]);
  assert.equal(roomBusy('r1', p, 'b'), true);
  const d = decideNextActions(p, ctx).filter((x) => x.kind === 'start');
  assert.equal(d.length, 0);
});

test('品質管理待ちの工程も、その部屋は埋まっている扱い', () => {
  const p = plan([step('a', 'r1', { status: 'qa' }), step('b', 'r1')]);
  assert.equal(roomBusy('r1', p, 'b'), true);
});

test('差し戻された工程は作り直せる（占有したまま止まらない）', () => {
  const p = plan([step('a', 'r1', { status: 'rework', reworkCount: 1 })]);
  assert.equal(roomBusy('r1', p, 'a'), false, '差し戻しを占有扱いにすると永久に止まる');
  const d = decideNextActions(p, ctx);
  assert.deepEqual(d, [{ kind: 'start', stepId: 'a', roomId: 'r1' }]);
});

test('存在しない依存は満たされない（段取りの書き間違いを黙って通さない）', () => {
  const p = plan([step('b', 'r2', { dependsOn: ['どこにもない'] })]);
  assert.equal(dependenciesMet(p.steps[0], p), false);
  const d = decideNextActions(p, ctx);
  assert.equal(d.some((x) => x.kind === 'start'), false);
});

test('依存先が失敗したら、待ち続けずCEOに上げる', () => {
  const p = plan([step('a', 'r1', { status: 'error' }), step('b', 'r2', { dependsOn: ['a'] })]);
  assert.equal(isStranded(p.steps[1], p), true);
  const d = decideNextActions(p, ctx);
  const esc = d.find((x) => x.kind === 'escalate');
  assert.ok(esc, '止まったまま放置してはいけない');
  assert.equal(d.some((x) => x.kind === 'start'), false);
});

test('全部終われば完了を返す', () => {
  const p = plan([step('a', 'r1', { status: 'done' }), step('b', 'r2', { status: 'skipped' })]);
  assert.equal(decideNextActions(p, ctx).some((x) => x.kind === 'allDone'), true);
});

test('空の段取りを完了扱いにしない', () => {
  assert.equal(decideNextActions(plan([]), ctx).some((x) => x.kind === 'allDone'), false);
});

test('上限額に達したら、ほかは何もせず止める', () => {
  const p = plan([step('a', 'r1'), step('b', 'r2')]);
  const d = decideNextActions(p, { spentUsd: 2, budgetUsd: 2 });
  assert.equal(d.length, 1);
  assert.equal(d[0].kind, 'halt');
});

test('上限額0は「上限なし」として扱う', () => {
  const p = plan([step('a', 'r1')]);
  const d = decideNextActions(p, { spentUsd: 99, budgetUsd: 0 });
  assert.equal(d.some((x) => x.kind === 'halt'), false);
});

test('不合格は差し戻し。回数を超えたらCEOに上げる', () => {
  const s = step('a', 'r1', { status: 'qa', reworkCount: 0 });
  const first = decideAfterQa(s, '不合格', 'r1', '出典がない');
  assert.equal(first.kind, 'rework');

  const limit = step('a', 'r1', { status: 'qa', reworkCount: MAX_REWORK });
  const over = decideAfterQa(limit, '不合格', 'r1', '出典がない');
  assert.equal(over.kind, 'escalate');
  assert.match(over.kind === 'escalate' ? over.reason : '', /判断をお願いします/);
});

test('差し戻し先が指定されていなければ、作った部屋へ戻す', () => {
  const s = step('a', 'r1', { status: 'qa' });
  const d = decideAfterQa(s, '不合格', undefined, '理由');
  assert.equal(d.kind === 'rework' && d.sendBackTo, 'r1');
});

test('進み具合を数える', () => {
  const p = plan([
    step('a', 'r1', { status: 'done' }),
    step('b', 'r2', { status: 'running' }),
    step('c', 'r3')
  ]);
  assert.deepEqual(planProgress(p), { done: 1, total: 3, running: 1 });
});

// ---- 最終成果物を出してよいかの判定 ----

function job(over: Partial<Job> = {}): Job {
  return {
    id: 'j1', title: 'テスト', status: '制作',
    sheet: { ...EMPTY_SHEET, wantedOutputs: ['略案'] },
    approvals: [], deliverables: [], qaReports: [], events: [],
    budgetUsd: 2, spentUsd: 0, createdAt: 0, updatedAt: 0,
    ...over
  };
}

test('段取りが無ければ出せない', () => {
  assert.equal(canDeliver(job()).ok, false);
});

test('終わっていない工程があれば出せない', () => {
  const j = job({ plan: plan([step('a', 'r1', { status: 'running' })]) });
  assert.match(canDeliver(j).missing.join(), /終わっていない工程/);
});

test('品質管理を通っていない完了工程があれば出せない', () => {
  const j = job({
    plan: plan([step('a', 'r1', { status: 'done' })]),
    deliverables: [{ id: 'd1', roomId: 'r1', title: '略案', at: 0 }]
  });
  assert.equal(canDeliver(j).ok, false);
  assert.match(canDeliver(j).missing.join(), /品質管理を通っていない/);
});

test('不合格の記録があっても、合格が無ければ出せない', () => {
  const j = job({
    plan: plan([step('a', 'r1', { status: 'done' })]),
    deliverables: [{ id: 'd1', roomId: 'r1', title: '略案', at: 0 }],
    qaReports: [{ id: 'q1', stepId: 'a', verdict: '不合格', checks: [], reason: 'だめ', checkedAt: 0 }]
  });
  assert.equal(canDeliver(j).ok, false);
});

test('依頼した成果物が欠けていれば出せない', () => {
  const j = job({
    sheet: { ...EMPTY_SHEET, wantedOutputs: ['略案', '板書計画'] },
    plan: plan([step('a', 'r1', { status: 'done' })]),
    deliverables: [{ id: 'd1', roomId: 'r1', title: '略案', at: 0 }],
    qaReports: [{ id: 'q1', stepId: 'a', verdict: '合格', checks: [], reason: '', checkedAt: 0 }]
  });
  assert.equal(canDeliver(j).ok, false);
  assert.match(canDeliver(j).missing.join(), /板書計画/);
});

test('全部そろって初めて出せる', () => {
  const j = job({
    plan: plan([step('a', 'r1', { status: 'done' })]),
    deliverables: [{ id: 'd1', roomId: 'r1', title: '略案', at: 0 }],
    qaReports: [{ id: 'q1', stepId: 'a', verdict: '合格', checks: [], reason: '', checkedAt: 0 }]
  });
  assert.deepEqual(canDeliver(j), { ok: true, missing: [] });
});

// ---- 通しの動き（提出→検査→合格／差し戻し）----

/**
 * 制御層の動きを、純粋関数だけでなぞる小さな模擬。
 * ストアには触らず、状態遷移の順序だけを確かめる。
 */
function runScenario(steps: PlanStep[], qa: (s: PlanStep) => '合格' | '不合格') {
  const p = plan(steps.map((s) => ({ ...s })));
  const order: string[] = [];
  let guard = 0;

  while (guard++ < 60) {
    const decisions = decideNextActions(p, ctx);
    const escalated = decisions.find((d) => d.kind === 'escalate');
    if (escalated) return { order, escalated: escalated.stepId, plan: p };
    if (decisions.some((d) => d.kind === 'allDone')) return { order, escalated: null, plan: p };

    const starts = decisions.filter((d) => d.kind === 'start');
    if (starts.length === 0) return { order, escalated: null, plan: p };

    for (const d of starts) {
      if (d.kind !== 'start') continue;
      const st = p.steps.find((x) => x.id === d.stepId)!;
      order.push(st.id);
      st.status = 'qa'; // 部屋が提出した＝必ず検査へ回る

      const verdict = qa(st);
      const next = decideAfterQa(st, verdict, undefined, 'テスト');
      if (next.kind === 'toQa') st.status = 'done';
      else if (next.kind === 'rework') { st.status = 'rework'; st.reworkCount += 1; }
      else if (next.kind === 'escalate') { st.status = 'error'; }
    }
  }
  throw new Error('終わらない（無限ループ）');
}

test('通し: 依存どおりの順に進み、全部合格すれば完了する', () => {
  const r = runScenario(
    [
      step('a', 'r1'),
      step('b', 'r2', { dependsOn: ['a'] }),
      step('c', 'r3', { dependsOn: ['a'] })
    ],
    () => '合格'
  );
  assert.equal(r.order[0], 'a', 'a より先に b や c が動いてはいけない');
  assert.deepEqual([...r.order].sort(), ['a', 'b', 'c']);
  assert.equal(r.plan.steps.every((s) => s.status === 'done'), true);
});

test('通し: 検査を通らずに done になる工程はない', () => {
  const r = runScenario([step('a', 'r1'), step('b', 'r2')], () => '合格');
  // 模擬では qa を経由してしか done にしていない。念のため状態を確かめる
  assert.equal(r.plan.steps.every((s) => s.status === 'done'), true);
});

test('通し: 不合格が続くと、無限に繰り返さずCEOへ上がる', () => {
  const r = runScenario([step('a', 'r1')], () => '不合格');
  assert.equal(r.plan.steps[0].status, 'error');
  assert.ok(r.plan.steps[0].reworkCount <= MAX_REWORK + 1);
});

test('通し: 一度差し戻されても、直れば完了する', () => {
  let n = 0;
  const r = runScenario([step('a', 'r1')], () => (++n === 1 ? '不合格' : '合格'));
  assert.equal(r.plan.steps[0].status, 'done');
  assert.equal(r.plan.steps[0].reworkCount, 1, '差し戻しの回数が残る');
  assert.deepEqual(r.order, ['a', 'a'], '同じ工程が作り直される');
});

test('通し: 途中で失敗した工程の後続は、待ち続けずCEOへ上がる', () => {
  const r = runScenario(
    [step('a', 'r1'), step('b', 'r2', { dependsOn: ['a'] })],
    (s) => (s.id === 'a' ? '不合格' : '合格')
  );
  assert.ok(r.escalated, '止まったまま放置してはいけない');
});

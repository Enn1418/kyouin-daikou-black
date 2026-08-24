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

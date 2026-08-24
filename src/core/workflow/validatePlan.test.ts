import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizePlan, validatePlan } from './validatePlan.ts';
import { EMPTY_SHEET } from '../jobs/types.ts';
import type { PlanStep, RequirementSheet, WorkPlan } from '../jobs/types.ts';

const sheet: RequirementSheet = { ...EMPTY_SHEET, wantedOutputs: ['略案'] };
const rooms = ['sn-board', 'sn-visual', 'sn-unit-design'];
const opts = { knownRoomIds: rooms, sheet };

function step(id: string, roomId: string, over: Partial<PlanStep> = {}): PlanStep {
  return {
    id, roomId, title: '略案', brief: '',
    dependsOn: [], parallelGroup: 0,
    startCondition: '', doneCondition: '1枚にまとまっていること',
    status: 'pending', reworkCount: 0,
    ...over
  };
}
const plan = (steps: PlanStep[]): WorkPlan => ({ steps });

test('まっとうな段取りは通る', () => {
  assert.deepEqual(validatePlan(plan([step('s1', 'sn-board')]), opts), []);
});

test('工程が空なら断る', () => {
  const p = validatePlan(plan([]), opts);
  assert.equal(p.length, 1);
  assert.match(p[0].message, /工程が1つもありません/);
});

test('実在しない部門は断り、使える部門を示す', () => {
  const p = validatePlan(plan([step('s1', 'そんな部屋')]), opts);
  const hit = p.find((x) => /という部門はありません/.test(x.message));
  assert.ok(hit);
  assert.match(hit!.message, /sn-board/);
});

test('工程IDの重複を断る', () => {
  const p = validatePlan(plan([step('s1', 'sn-board'), step('s1', 'sn-visual')]), opts);
  assert.ok(p.some((x) => /重複/.test(x.message)));
});

test('存在しない工程への依存を断る（永久に始まらないため）', () => {
  const p = validatePlan(plan([step('s1', 'sn-board', { dependsOn: ['ない'] })]), opts);
  assert.ok(p.some((x) => /存在しない工程/.test(x.message)));
});

test('循環した依存を断る', () => {
  const p = validatePlan(
    plan([
      step('a', 'sn-board', { dependsOn: ['b'] }),
      step('b', 'sn-visual', { dependsOn: ['a'] })
    ]),
    opts
  );
  assert.ok(p.some((x) => /循環/.test(x.message)));
});

test('長い循環も見つける', () => {
  const p = validatePlan(
    plan([
      step('a', 'sn-board', { dependsOn: ['c'] }),
      step('b', 'sn-visual', { dependsOn: ['a'] }),
      step('c', 'sn-unit-design', { dependsOn: ['b'] })
    ]),
    opts
  );
  assert.ok(p.some((x) => /循環/.test(x.message)));
});

test('循環でない合流は通す', () => {
  const p = validatePlan(
    plan([
      step('a', 'sn-board'),
      step('b', 'sn-visual', { dependsOn: ['a'] }),
      step('c', 'sn-unit-design', { dependsOn: ['a', 'b'] })
    ]),
    opts
  );
  assert.deepEqual(p, []);
});

test('完了条件が無ければ断る（品質管理の基準になるため）', () => {
  const p = validatePlan(plan([step('s1', 'sn-board', { doneCondition: '  ' })]), opts);
  assert.ok(p.some((x) => /終わったと言える条件/.test(x.message)));
});

test('依頼された成果物が段取りに無ければ断る', () => {
  const p = validatePlan(
    plan([step('s1', 'sn-board', { title: '板書計画' })]),
    { knownRoomIds: rooms, sheet: { ...EMPTY_SHEET, wantedOutputs: ['略案', '絵カード'] } }
  );
  const hit = p.find((x) => /依頼された成果物が段取りにありません/.test(x.message));
  assert.ok(hit);
  assert.match(hit!.message, /略案/);
  assert.match(hit!.message, /絵カード/);
});

test('整えると、動かせる状態になる', () => {
  const raw = { steps: [{ ...step('s1', 'sn-board'), status: 'done', reworkCount: 9 } as PlanStep] };
  const n = normalizePlan(raw);
  assert.equal(n.steps[0].status, 'pending');
  assert.equal(n.steps[0].reworkCount, 0);
});

test('整えるときに、欠けた項目を既定値で埋める', () => {
  const raw = { steps: [{ id: 's1', roomId: 'sn-board', title: '略案', brief: '', doneCondition: 'x' } as any] };
  const n = normalizePlan(raw);
  assert.deepEqual(n.steps[0].dependsOn, []);
  assert.equal(n.steps[0].parallelGroup, 0);
});

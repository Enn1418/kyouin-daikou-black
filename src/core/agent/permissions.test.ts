import test from 'node:test';
import assert from 'node:assert/strict';

import {
  JOB_MANAGERS,
  PLAN_AUTHORS,
  QA_JUDGES,
  canManageJob,
  canSetWorkPlan,
  canSubmitQaVerdict
} from './permissions.ts';

/** 作る側の代表。この人たちに統括の権限が漏れていないかを見る。 */
const PRODUCERS = [
  'sn-unit-lead', 'sn-board-lead', 'sn-visual-director', 'sn-math-lead',
  'sn-jp-lead', 'sn-ja-lead', 'sn-koho-lead', 'sn-lesson-designer',
  'sn-tier-a', 'sn-board-figure'
];

test('案件と依頼票を扱えるのは秘書室の窓口だけ', () => {
  assert.equal(canManageJob('sec-chief'), true);
  assert.equal(canManageJob('sec-intake'), true);
  PRODUCERS.forEach((id) =>
    assert.equal(canManageJob(id), false, `${id} が案件を作れてはいけない`)
  );
});

test('段取りを登録できるのは秘書室だけ', () => {
  assert.equal(canSetWorkPlan('sec-planner'), true);
  assert.equal(canSetWorkPlan('sec-chief'), true);
  PRODUCERS.forEach((id) =>
    assert.equal(canSetWorkPlan(id), false, `${id} が順序を決めてはいけない`)
  );
});

test('品質管理の合否を出せるのは室長だけ', () => {
  assert.equal(canSubmitQaVerdict('qa-chief'), true);
  // 検査した本人（3名）も判定は出せない。判定は室長がまとめて出す
  ['qa-facts', 'qa-consistency', 'qa-rights'].forEach((id) =>
    assert.equal(canSubmitQaVerdict(id), false, `${id} が判定を出してはいけない`)
  );
  PRODUCERS.forEach((id) =>
    assert.equal(canSubmitQaVerdict(id), false, `${id} が自分の仕事を合格にできてはいけない`)
  );
});

test('作る部門が、統括の権限をひとつも持たない', () => {
  PRODUCERS.forEach((id) => {
    assert.equal(
      canManageJob(id) || canSetWorkPlan(id) || canSubmitQaVerdict(id),
      false,
      `${id} に統括の権限が漏れている`
    );
  });
});

test('品質管理室は、案件も段取りも触れない（監査に徹する）', () => {
  ['qa-chief', 'qa-facts'].forEach((id) => {
    assert.equal(canManageJob(id), false);
    assert.equal(canSetWorkPlan(id), false);
  });
});

test('秘書室は、品質管理の判定を出せない（自分の段取りを自分で合格にしない）', () => {
  [...JOB_MANAGERS, ...PLAN_AUTHORS].forEach((id) =>
    assert.equal(canSubmitQaVerdict(id), false, `${id} が判定を出せてはいけない`)
  );
});

test('担当IDが無いときは、何の権限も与えない', () => {
  assert.equal(canManageJob(undefined), false);
  assert.equal(canSetWorkPlan(''), false);
  assert.equal(canSubmitQaVerdict(undefined), false);
});

test('権限の一覧が空になっていない（消し忘れの検出）', () => {
  assert.ok(JOB_MANAGERS.length > 0);
  assert.ok(PLAN_AUTHORS.length > 0);
  assert.ok(QA_JUDGES.length > 0);
});

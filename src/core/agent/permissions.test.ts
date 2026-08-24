import test from 'node:test';
import assert from 'node:assert/strict';

import {
  JOB_MANAGERS,
  ORCHESTRATION_LEADS,
  PLAN_AUTHORS,
  QA_JUDGES,
  canManageJob,
  canSetWorkPlan,
  canSubmitQaVerdict,
  isOrchestrationLead
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

/**
 * 2026-08-24 に実際に起きた不具合の回帰確認。
 *
 * 秘書室・品質管理室のリードに deliver_project を渡していたため、部屋の内部タスクが
 * 全部終わると、エンジンが「deliver_project を使え」と促し、リードがそれに従って
 * 部屋を完了（phase: 'done'）にしてしまい、心拍が止まって進行が止まって見えた。
 * set_work_plan（秘書室の本来の完了アクション）が一度も呼ばれなかった。
 */
test('秘書長と品質管理室長は、成果物を1つ届けて終わる部屋のリードではない', () => {
  assert.equal(isOrchestrationLead('sec-chief'), true);
  assert.equal(isOrchestrationLead('qa-chief'), true);
});

test('制作部屋のリードは、deliver_project を渡すべき対象のまま', () => {
  ['sn-unit-lead', 'sn-board-lead', 'sn-visual-director', 'sn-koho-lead'].forEach((id) =>
    assert.equal(isOrchestrationLead(id), false, `${id} は制作部屋のリードなので deliver_project が要る`)
  );
});

test('秘書長・品質管理室長は、案件や段取りの権限を持ちつつ deliver_project 対象ではない', () => {
  ORCHESTRATION_LEADS.forEach((id) => {
    assert.equal(isOrchestrationLead(id), true);
  });
  // 秘書長は案件と段取りの両方に権限がある。品質管理室長はどちらも持たない（判定だけ）
  assert.equal(canManageJob('sec-chief') || canSetWorkPlan('sec-chief'), true);
  assert.equal(canManageJob('qa-chief') || canSetWorkPlan('qa-chief'), false);
});

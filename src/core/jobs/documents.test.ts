import test from 'node:test';
import assert from 'node:assert/strict';

import { renderBlueprintHtml, renderProposalHtml } from './documents.ts';
import type { RoomInfo } from './documents.ts';
import { EMPTY_SHEET } from './types.ts';
import type { Job, PlanStep } from './types.ts';

const rooms: RoomInfo[] = [
  { id: 'sn-board', name: '特支・板書室', color: '#F59E0B', agents: [{ name: '板書デザイナー', role: '板書1枚を作る' }] },
  { id: 'sn-visual', name: '特支・視覚教材室', color: '#FACC15', agents: [{ name: 'ディレクター', role: '絵カードを作る' }] }
];

function step(id: string, roomId: string, over: Partial<PlanStep> = {}): PlanStep {
  return {
    id, roomId, title: '略案', brief: '',
    dependsOn: [], parallelGroup: 0,
    startCondition: '', doneCondition: '1枚に収まっていること',
    status: 'pending', reworkCount: 0, ...over
  };
}

function job(over: Partial<Job> = {}): Job {
  return {
    id: 'j1', title: '算数 かさ（LとdL）', status: '構成案作成',
    sheet: {
      ...EMPTY_SHEET,
      subject: '算数', grade: '1〜4年', unitName: 'かさ（LとdL）',
      hours: 6, participants: ['A児', 'B児'], wantedOutputs: ['略案'],
      outputFormats: ['print-html']
    },
    approvals: [], deliverables: [], qaReports: [], events: [],
    budgetUsd: 2, spentUsd: 0, createdAt: Date.now(), updatedAt: Date.now(),
    ...over
  };
}

// ---- 単元構成案 ----

test('構成案は依頼票の内容を載せる', () => {
  const h = renderProposalHtml(job());
  assert.match(h, /算数/);
  assert.match(h, /かさ（LとdL）/);
  assert.match(h, /A児・B児/);
  assert.match(h, /6時間/);
});

test('単元分析がまだ無い項目は「未確定」と出す（もっともらしく埋めない）', () => {
  const h = renderProposalHtml(job());
  assert.match(h, /未確定/);
  assert.match(h, /参照した資料がまだありません/);
});

test('評価規準には必ず「下書き」と書く', () => {
  const h = renderProposalHtml(job({
    unit: {
      value: '', curriculumLink: '', competencies: '', goal: '',
      rubric: 'おおむね満足できる姿', predictedDifficulties: '', support: '',
      process: '', hourOutlines: [], wording: {}, sources: [], unresolved: []
    }
  }));
  assert.match(h, /下書きです/);
});

test('未確定事項があれば一覧で出す', () => {
  const h = renderProposalHtml(job({
    unit: {
      value: '', curriculumLink: '', competencies: '', goal: '', rubric: '',
      predictedDifficulties: '', support: '', process: '', hourOutlines: [],
      wording: {}, sources: [], unresolved: ['1Lますが人数分あるか未確認']
    }
  }));
  assert.match(h, /1Lますが人数分あるか未確認/);
});

test('HTMLを壊す文字はエスケープする', () => {
  const h = renderProposalHtml(job({
    sheet: { ...EMPTY_SHEET, unitName: '<script>alert(1)</script>', wantedOutputs: [], outputFormats: [] }
  }));
  assert.ok(!h.includes('<script>alert(1)</script>'), '生のscriptタグが混ざってはいけない');
  assert.match(h, /&lt;script&gt;/);
});

// ---- システム設計図 ----

test('設計図はCEO・秘書室・制御層・品質管理室の役割を示す', () => {
  const h = renderBlueprintHtml(job(), rooms);
  assert.match(h, /CEO/);
  assert.match(h, /秘書室/);
  assert.match(h, /ワークフロー制御層/);
  assert.match(h, /品質管理室/);
  assert.match(h, /AIではありません/);
});

test('設計図は工程と担当部門を並べ、同時に動くものを示す', () => {
  const h = renderBlueprintHtml(
    job({
      plan: {
        steps: [
          step('s1', 'sn-board', { title: '板書計画', parallelGroup: 0 }),
          step('s2', 'sn-visual', { title: '絵カード', parallelGroup: 0 }),
          step('s3', 'sn-board', { title: '略案', parallelGroup: 1, dependsOn: ['s1'] })
        ]
      }
    }),
    rooms
  );
  assert.match(h, /特支・板書室/);
  assert.match(h, /特支・視覚教材室/);
  assert.match(h, /2部門が同時に動きます/);
  assert.match(h, /工程 2/);
});

test('設計図は承認地点と差し戻し先を示す', () => {
  const h = renderBlueprintHtml(job({ plan: { steps: [step('s1', 'sn-board')] } }), rooms);
  assert.match(h, /承認①/);
  assert.match(h, /承認②/);
  assert.match(h, /1つも作りません/);
  assert.match(h, /差し戻し/);
});

test('設計図は上限額を示す', () => {
  const h = renderBlueprintHtml(job({ budgetUsd: 3, plan: { steps: [step('s1', 'sn-board')] } }), rooms);
  assert.match(h, /\$3/);
});

test('段取りが無ければ、あるふりをしない', () => {
  const h = renderBlueprintHtml(job(), rooms);
  assert.match(h, /段取りがまだ作られていません/);
});

test('知らない部門を指していたら、設計図でもそう言う', () => {
  const h = renderBlueprintHtml(
    job({ plan: { steps: [step('s1', 'どこか')] } }),
    rooms
  );
  assert.match(h, /この部門が見つかりません/);
});

test('完了条件が空の工程は「未設定」と出す', () => {
  const h = renderBlueprintHtml(
    job({ plan: { steps: [step('s1', 'sn-board', { doneCondition: '' })] } }),
    rooms
  );
  assert.match(h, /未設定/);
});

test('両方の書類が単体で開けるHTMLになっている', () => {
  for (const h of [renderProposalHtml(job()), renderBlueprintHtml(job(), rooms)]) {
    assert.match(h, /^<!doctype html>/);
    assert.match(h, /<html lang="ja">/);
    assert.match(h, /<\/html>$/);
    assert.ok(!h.includes('<script'), '書類にスクリプトを入れない');
  }
});

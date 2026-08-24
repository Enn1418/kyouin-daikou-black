/**
 * 承認①で CEO に見せる2枚の書類を組み立てる。
 *
 *   ① 単元構成案   — 何を作るのか
 *   ② システム設計図 — どの部門の誰が、何を根拠に、どの順で処理するのか
 *
 * **どちらも決定的に組み立てる。** LLM に HTML を書かせない。
 * 承認の材料が生成のたびに揺れると、CEO は何を承認したのか分からなくなる。
 * 中身（単元分析・段取り）はエージェントが作るが、見せ方はここで固定する。
 *
 * 設計図を出すのは、システム内部をブラックボックスにしないため
 * （docs/system-redesign.md §5.1）。
 */
import { OUTPUT_FORMAT_LABEL } from './types.ts';
import type { Job, PlanStep, WorkPlan } from './types.ts';

/** 部門の表示名を引くための最小限の情報。呼び出し側が渡す（データ層に依存しないため）。 */
export interface RoomInfo {
  id: string;
  name: string;
  color: string;
  agents: { name: string; role: string }[];
}

const esc = (s: unknown): string =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/** 未記入を隠さない。空欄は空欄として見せる（もっともらしく埋めない）。 */
const orTbd = (s: string | undefined, label = '未確定'): string =>
  s && s.trim() ? esc(s) : `<span class="tbd">${label}</span>`;

const BASE_CSS = `
:root { color-scheme: light; }
* { box-sizing: border-box; }
body {
  margin: 0; padding: 28px 32px 56px;
  font-family: "BIZ UDPゴシック", "BIZ UDPGothic", "UD デジタル教科書体 NP-R",
               "Hiragino Sans", "Yu Gothic UI", sans-serif;
  font-size: 14px; line-height: 1.85; color: #1a1a20; background: #fff;
}
h1 { font-size: 21px; margin: 0 0 4px; line-height: 1.4; }
h2 {
  font-size: 15px; margin: 30px 0 8px; padding-bottom: 5px;
  border-bottom: 2px solid #1a1a20;
}
h3 { font-size: 13px; margin: 18px 0 4px; }
p { margin: 8px 0; }
.sub { color: #666; font-size: 12px; margin: 0 0 18px; }
.tbd { color: #a33a06; font-weight: bold; }
table { border-collapse: collapse; width: 100%; margin: 10px 0; font-size: 12.5px; }
th, td { border: 1px solid #ccc; padding: 7px 9px; text-align: left; vertical-align: top; }
th { background: #f2f2f5; font-weight: bold; white-space: nowrap; }
ul, ol { margin: 8px 0; padding-left: 1.4em; }
li { margin: 3px 0; }
.box { border: 1px solid #ccc; border-left: 4px solid #1a1a20; padding: 10px 14px; margin: 12px 0; }
.box.warn { border-left-color: #a33a06; background: #fdf6f0; }
.box.gate { border-left-color: #a34a06; background: #fbeee0; }
.chip {
  display: inline-block; font-size: 11px; font-weight: bold;
  padding: 1px 7px; border-radius: 3px; border: 1px solid #999; margin-right: 4px;
}
.lane { border: 1px solid #ccc; margin: 10px 0; }
.lane > .lane-head {
  padding: 6px 12px; font-weight: bold; font-size: 12.5px;
  background: #f2f2f5; border-bottom: 1px solid #ccc;
}
.lane > .lane-body { padding: 4px 12px 10px; }
.step { padding: 7px 0; border-bottom: 1px dashed #ddd; font-size: 12.5px; }
.step:last-child { border-bottom: none; }
.step .t { font-weight: bold; }
.step .io { color: #555; display: block; }
footer { margin-top: 36px; padding-top: 12px; border-top: 1px solid #ddd; font-size: 11px; color: #777; }
@media print { body { padding: 0; font-size: 12px; } h2 { page-break-after: avoid; } .lane, table { page-break-inside: avoid; } }
`;

function page(title: string, body: string): string {
  return `<!doctype html>
<html lang="ja"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><style>${BASE_CSS}</style></head>
<body>${body}
<footer>教員代行努ブラック — この書類は承認のために自動で組み立てられたものです。内容の確定は CEO の承認をもって行われます。</footer>
</body></html>`;
}

const fmtDate = (t: number) => {
  const d = new Date(t);
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
};

/* ------------------------------------------------------------------ */
/* ① 単元構成案                                                        */
/* ------------------------------------------------------------------ */

export function renderProposalHtml(job: Job): string {
  const s = job.sheet;
  const u = job.unit;

  const formats = s.outputFormats.map((f) => OUTPUT_FORMAT_LABEL[f]).join('、') || '未記入';

  const hourRows = (u?.hourOutlines ?? []).length
    ? u!.hourOutlines
        .map((h) => `<tr><td>${esc(h.hour)}</td><td>${esc(h.outline)}</td></tr>`)
        .join('')
    : `<tr><td colspan="2"><span class="tbd">各時間の概要はまだ作られていません</span></td></tr>`;

  const sources = (u?.sources ?? []).length
    ? `<ul>${u!.sources
        .map(
          (x) =>
            `<li>${esc(x.title)} — <a href="${esc(x.url)}">${esc(x.url)}</a>${
              x.note ? `（${esc(x.note)}）` : ''
            }</li>`
        )
        .join('')}</ul>`
    : `<p class="tbd">参照した資料がまだありません。図書館の調査が済んでいない可能性があります。</p>`;

  const unresolved = (u?.unresolved ?? []).length
    ? `<div class="box warn"><h3>未確定事項</h3><ul>${u!.unresolved
        .map((x) => `<li>${esc(x)}</li>`)
        .join('')}</ul></div>`
    : `<div class="box"><h3>未確定事項</h3><p>ありません。</p></div>`;

  return page(
    `単元構成案 — ${job.title}`,
    `
<h1>単元構成案 — ${esc(job.title)}</h1>
<p class="sub">${fmtDate(job.createdAt)} 依頼 ／ この案は承認前です。CEO が「実行」を選ぶまで、成果物は作られません。</p>

<h2>1. 依頼内容と目的</h2>
<table>
  <tr><th>教科</th><td>${orTbd(s.subject)}</td><th>学年</th><td>${orTbd(s.grade)}</td></tr>
  <tr><th>単元名</th><td>${orTbd(s.unitName)}</td><th>授業時数</th><td>${s.hours > 0 ? esc(s.hours) + '時間' : '<span class="tbd">未記入</span>'}</td></tr>
  <tr><th>参加する児童</th><td colspan="3">${s.participants.length ? esc(s.participants.join('・')) : '<span class="tbd">未記入</span>'}</td></tr>
</table>
<h3>指導したい内容</h3><p>${orTbd(s.teachingContent, '未記入')}</p>
<h3>身につけさせたい力（依頼時）</h3><p>${orTbd(s.competencies, '未記入')}</p>

<h2>2. 前提条件</h2>
<table>
  <tr><th>使えるICT・教材</th><td>${s.ict.length ? esc(s.ict.join('、')) : 'とくに指定なし'}</td></tr>
  <tr><th>出力スタイル</th><td>${s.style.trim() ? esc(s.style) : 'とくに指定なし'}</td></tr>
  <tr><th>制約・希望</th><td>${s.constraints.trim() ? esc(s.constraints) : 'とくに指定なし'}</td></tr>
  <tr><th>児童の実態</th><td>${orTbd(s.pupils, '未記入')}</td></tr>
</table>

<h2>3. 単元の価値</h2>
<p>${orTbd(u?.value)}</p>

<h2>4. 学習指導要領との関連</h2>
<p>${orTbd(u?.curriculumLink)}</p>

<h2>5. 育成を目指す資質・能力</h2>
<p>${orTbd(u?.competencies)}</p>

<h2>6. 単元目標</h2>
<p>${orTbd(u?.goal)}</p>

<h2>7. 評価規準</h2>
<div class="box warn"><p><b>下書きです。</b>確定した評価規準ではありません。CEO が確認し、必要に応じて直してください。</p></div>
<p>${orTbd(u?.rubric)}</p>

<h2>8. 予想されるつまずきと必要な支援</h2>
<h3>予想されるつまずき</h3><p>${orTbd(u?.predictedDifficulties)}</p>
<h3>必要な支援</h3><p>${orTbd(u?.support)}</p>

<h2>9. 単元全体の学習過程</h2>
<p>${orTbd(u?.process)}</p>
<table><tr><th style="width:5em">時間</th><th>その時間の概要</th></tr>${hourRows}</table>
${
  u?.wording?.medate || u?.wording?.matome
    ? `<p><span class="chip">全部門で揃える言い回し</span>
        めあて「${esc(u.wording.medate ?? '')}」／まとめ「${esc(u.wording.matome ?? '')}」</p>`
    : ''
}

<h2>10. 制作予定の成果物</h2>
${
  s.wantedOutputs.length
    ? `<ul>${s.wantedOutputs.map((w) => `<li>${esc(w)}</li>`).join('')}</ul>`
    : '<p class="tbd">未記入</p>'
}
<p>出力形式: ${esc(formats)}</p>

<h2>11. 参照した情報と出典</h2>
${sources}

<h2>12. 未確定事項</h2>
${unresolved}
`
  );
}

/* ------------------------------------------------------------------ */
/* ② システム設計図                                                    */
/* ------------------------------------------------------------------ */

/** 並列で動く工程をまとめる。同じ番号は同時に走る。 */
function groupByParallel(plan: WorkPlan): { group: number; steps: PlanStep[] }[] {
  const map = new Map<number, PlanStep[]>();
  plan.steps.forEach((s) => {
    const arr = map.get(s.parallelGroup) ?? [];
    arr.push(s);
    map.set(s.parallelGroup, arr);
  });
  return [...map.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([group, steps]) => ({ group, steps }));
}

export function renderBlueprintHtml(job: Job, rooms: RoomInfo[]): string {
  const byId = new Map(rooms.map((r) => [r.id, r]));
  const roomName = (id: string) => byId.get(id)?.name ?? id;

  const plan = job.plan;
  const groups = plan ? groupByParallel(plan) : [];
  const usedRoomIds = [...new Set(plan?.steps.map((s) => s.roomId) ?? [])];

  const lanes = groups.length
    ? groups
        .map(
          (g) => `
<div class="lane">
  <div class="lane-head">
    工程 ${g.group + 1}
    ${g.steps.length > 1 ? `<span class="chip">${g.steps.length}部門が同時に動きます</span>` : ''}
  </div>
  <div class="lane-body">
    ${g.steps
      .map(
        (s) => `<div class="step">
          <span class="t">${esc(roomName(s.roomId))} — ${esc(s.title)}</span>
          <span class="io">入力: ${
            s.dependsOn.length
              ? esc(s.dependsOn.map((d) => plan!.steps.find((x) => x.id === d)?.title ?? d).join('、'))
              : '依頼票と、図書館・書庫の調査結果'
          }</span>
          <span class="io">出力: ${esc(s.title)}</span>
          <span class="io">終わったと言える条件: ${s.doneCondition.trim() ? esc(s.doneCondition) : '<span class="tbd">未設定</span>'}</span>
          <span class="io">出したあと: 品質管理室が検査 → 合格なら次へ／不合格は ${esc(roomName(s.roomId))} へ差し戻し</span>
        </div>`
      )
      .join('')}
  </div>
</div>`
        )
        .join('')
    : '<p class="tbd">段取りがまだ作られていません。</p>';

  const roster = usedRoomIds.length
    ? usedRoomIds
        .map((id) => {
          const r = byId.get(id);
          if (!r) return `<tr><td>${esc(id)}</td><td colspan="2" class="tbd">この部門が見つかりません</td></tr>`;
          return r.agents
            .map(
              (a, i) =>
                `<tr>${i === 0 ? `<th rowspan="${r.agents.length}">${esc(r.name)}</th>` : ''}` +
                `<td>${esc(a.name)}</td><td>${esc(a.role)}</td></tr>`
            )
            .join('');
        })
        .join('')
    : '<tr><td colspan="3" class="tbd">まだ部門が決まっていません</td></tr>';

  return page(
    `システム設計図 — ${job.title}`,
    `
<h1>システム設計図 — ${esc(job.title)}</h1>
<p class="sub">この依頼を、どの部門の誰が、何を根拠に、どの順で処理するのかを示したものです。</p>

<h2>1. 統括</h2>
<table>
  <tr><th>CEO</th><td>依頼・全体方針の決定・重要な判断・最終承認</td></tr>
  <tr><th>秘書室</th><td>要件の確定・タスク分解・割り当て・進捗管理・部門間の調整・成果物の取りまとめ</td></tr>
  <tr><th>ワークフロー制御層</th><td>処理順序・並列・条件分岐・承認待ち・差し戻し・エラー処理（決定的なプログラム。AIではありません）</td></tr>
  <tr><th>品質管理室</th><td>制作部門から独立して検査します。自分の判定を自分で承認することはできません</td></tr>
</table>

<h2>2. この依頼で動く部門と担当</h2>
<table><tr><th style="width:12em">部門</th><th style="width:12em">担当</th><th>役割</th></tr>${roster}</table>

<h2>3. 処理の順序と並列</h2>
<p>同じ工程番号のものは<b>同時に動きます</b>。番号が進むのは、前の工程の成果を使うためです。</p>
${lanes}

<h2>4. 根拠にする情報</h2>
<ul>
  <li><b>依頼票</b> — CEO が確定した条件。全部門が同じ文面を見ます</li>
  <li><b>図書館</b> — 学習指導要領・解説、公的資料、実践事例。<b>出典URLを書けない情報は使いません</b></li>
  <li><b>書庫</b> — 過去に作った教材、CEO の好み、採用・却下の理由。児童個人の情報は入っていません</li>
  <li><b>教材フォルダ</b> — 学級の実態、一次資料、これまでの教材</li>
</ul>

<h2>5. 品質管理を行うタイミング</h2>
<p>上の<b>すべての工程</b>で、成果物が出るたびに検査します。検査するのは次の項目です。</p>
<ul>
  <li>事実関係の正確性／情報源の信頼性／学習指導要領および解説との整合</li>
  <li>単元目標・評価規準・学習活動の整合／教材間の矛盾／発達段階への適合</li>
  <li>著作権・引用・ライセンス／個人情報と安全性／日本語表現の明確さ</li>
  <li>依頼票の条件を満たしているか／授業で実際に使える具体性があるか</li>
</ul>
<p>不合格のときは、作った部門へ差し戻します。<b>直したものは必ずもう一度検査を通ります。</b>
3回直しても基準に届かないときは、CEO に判断をお願いします。</p>

<h2>6. CEO の承認が必要な地点</h2>
<div class="box gate">
  <p><b>承認① — いまここです。</b>この設計図と単元構成案を見て、実行／修正／中止を選んでください。
  <b>「実行」を選ぶまで、指導案も教材も掲示物も1つも作りません。</b></p>
</div>
<div class="box gate">
  <p><b>承認② — 完成したとき。</b>すべての工程が品質管理に合格し、依頼した成果物がそろって初めて出てきます。
  品質管理の指摘一覧と、残った未確定事項も一緒に見られます。</p>
</div>

<h2>7. 問題が起きたときの戻り先</h2>
<table>
  <tr><th>品質管理で不合格</th><td>作った部門へ差し戻し。3回で CEO に判断を依頼</td></tr>
  <tr><th>情報が足りない</th><td>その工程だけ止めて秘書室へ質問。<b>ほかの工程は止めません</b></td></tr>
  <tr><th>出典が見つからない</th><td>「見つかりませんでした」と記録して進みます。作り話はしません</td></tr>
  <tr><th>先の工程が失敗</th><td>待ち続けず CEO に上げます</td></tr>
  <tr><th>上限額に達した</th><td>その時点で全部止めて、CEO に確認します（上限 $${esc(job.budgetUsd)}）</td></tr>
</table>

<h2>8. 完成までの流れ</h2>
<p>調査 → 単元分析 → <b>承認①</b> → 制作（上の工程を順に、同じ番号は同時に）→ 品質管理 →
統合（秘書室が用語と書式を揃えます）→ <b>承認②</b> → 完了</p>
`
  );
}

import { AgentNode, AGENTIC_SETS } from '../../data/agents';
import { getBridgeMemory, isBridgeConnected } from '../../integration/store/bridgeStore';
import { useCoreStore } from '../../integration/store/coreStore';
import { useTeamStore } from '../../integration/store/teamStore';

export class PromptBuilder {
  /**
   * Builds the system prompt for an agent based on their role and current project context.
   */
  public static buildSystemPrompt(agent: AgentNode, phase: string, brief: string, allAgents: any[]): string {
    const isLead = agent.index === 1;
    const team = allAgents
      .map((a: any) => `[${a.data.index}] ${a.data.name}`)
      .join(', ');

    const objectives = {
      idle: isLead ? 'Chat with [0] to define brief, then set_user_brief.' : 'Wait for Lead to start.',
      working: isLead ? 'Manage board. deliver_project when all Done.' : 'Complete tasks.',
      done: 'Project finished.'
    };

    const tasks = useCoreStore.getState().tasks;
    const board = tasks.length > 0
      ? tasks.map(t => {
          const agentName = allAgents.find((a: any) => a.data.index === t.assignedAgentId)?.data?.name || `Agent ${t.assignedAgentId}`;
          
          const feedbackStr = t.reviewComments 
            ? `\n   >> USER FEEDBACK / REVISION REQUESTED: "${t.reviewComments}"` 
            : '';
            
          const outputStr = (t.status === 'done' && t.output)
            ? `\n   >> FINAL APPROVED WORK:\n   """\n   ${t.output}\n   """` 
            : '';

          return `* [${t.status.toUpperCase()}] ${t.title} (Owner: ${agentName})${feedbackStr}${outputStr}`;
        }).join('\n\n')
      : 'Empty';

    const selectedTeamId = useTeamStore.getState().selectedAgentSetId;
    const activeTeam = useTeamStore.getState().customSystems.find(s => s.id === selectedTeamId) 
      || AGENTIC_SETS.find(s => s.id === selectedTeamId);
      
    const referenceImages = useCoreStore.getState().referenceImages;
    const hasImages = referenceImages.length > 0 && (activeTeam?.outputType === 'image' || activeTeam?.outputType === 'video');
    
    let modelLimitInfo = '';
    if (activeTeam?.outputType === 'video') {
      if (activeTeam.outputModel?.includes('lite')) {
        modelLimitInfo = ` Note: The current model (${activeTeam.outputModel}) supports only 1 reference image for animation.`;
      } else {
        modelLimitInfo = ` Note: The current model (${activeTeam.outputModel}) supports up to 3 reference images for style and content guidance.`;
      }
    }

    const imageInstruction = hasImages
      ? `\n6. REFERENCE IMAGES: The user has provided ${referenceImages.length} reference image(s). You MUST use these as a visual guide for the project's style, mood, and content. Your team should analyze these to ensure the final ${activeTeam?.outputType} aligns with the inspiration.${modelLimitInfo}`
      : '';

    const outputInstruction = activeTeam?.outputType !== 'text' 
      ? `\n4. TEAM OUTPUT: ${activeTeam?.outputType?.toUpperCase()}. Your 'deliver_project' output MUST be a highly detailed PROMPT for a ${activeTeam?.outputType} generator model (${activeTeam?.outputModel}).
CRITICAL: You MUST synthesize all subagent findings, research results, and any user feedback into this final prompt. DO NOT just repeat your initial brief.
The generation model expects a SINGLE prompt to produce a SINGLE ${activeTeam?.outputType}. Be precise.`
      : '';

    // 特別支援学級向けチームだけに効く規約（docs/teacher-edition-design.md §6・§10）。
    // 他チーム（英語のクリエイティブ系）の挙動は変えない。
    const isSpecialNeeds = activeTeam?.teamType === '特別支援';
    const specialNeedsRules = isSpecialNeeds
      ? `
SPECIAL NEEDS RULES (このチームでは以下が最優先):
S1. 出力はすべて日本語。児童は匿名ID（A児・B児…）で指す。氏名・住所・生年月日等が入力されても成果物には書かず、IDに置き換える。
S2. 実態が与えられていない児童について、実態を推測で書かない。「実態の提示が必要」と明示する。
S3. 自立活動の区分名・項目名は、担任が与えた一次資料の記述だけを根拠にする。資料が無ければ「区分・項目は要確認」と書く。記憶から区分名を書かない。
S4. 個別の指導計画・評価・所見にあたる文章は、必ず冒頭に「下書き」と明記する。断定的な評価語と児童間の比較は書かない。
S5. 教科書本文・市販教材の本文をそのまま複製しない。担任が本文を用意する前提で設問と支援を作るか、著作権の切れた作品を使う。
S6. 教材本文には前置き・後書き・自己言及を書かない。プリントとしてそのまま印刷できる中身だけを書く。
S7. 不確かな内容は「要確認」と明示する。もっともらしく埋めない。${
          isBridgeConnected()
            ? `
S8. 教材フォルダが使える。依頼を受けたら、まず read_file で 00_共通/学級の実態.md を読む。
    一次資料・去年の教材も read_file で読み、推測で補わない。実態が空欄なら、その欄だけ担任に尋ねる。
S9. 完成した教材は write_file で教材フォルダに保存する。印刷用テンプレートも指定する
    （マス目=grid、なぞり書き=trace、分かち書き=spaced、1課題1ページ=one-task）。
S10. 反復練習の計算問題を自分で並べない。generate_drill に出題条件（型）を渡す。
     答えを間違えないためであり、これは守ること。`
            : `
S8. 教材フォルダは接続されていない。ファイルの読み書きはできない。
    実態が必要なら、担任に直接尋ねる。そのとき「教材フォルダを接続すると実態を読める」と一言添える。`
        }`
      : '';

    // 教材本文は100語では収まらないため、特支チームでは systemic output の長さ制限を外す。
    const lengthRule = isSpecialNeeds
      ? '1. チャットは30語以内。タスクのタイトルと説明は100語以内。ただし complete_task / deliver_project の教材本文には長さ制限を設けない（必要な分量を書く）。前置き・後書き・自己申告（「作成しました」等）は書かない。'
      : "1. MAX 30 WORDS for chat. Systemic outputs ('complete_task', 'deliver_project', and the task titles/descriptions you create) MUST be under 100 WORDS. NO conversational filler, intros, outros, or self-attribution (\"I have done...\"). Focus exclusively on core data and synthesis.";

    // 教材フォルダに溜まった記憶（過去の差し戻しの指摘）。
    // 長くなりすぎたら新しいほうを残す。
    const memory = getBridgeMemory().trim();
    const memoryBlock = memory
      ? `\nこの学級での約束（過去の差し戻しから。毎回これに従う）:\n${memory.slice(-4000)}\n`
      : '';

    const pendingReviews = tasks.filter(t => t.assignedAgentId === agent.index && t.reviewComments);
    const reviewContext = pendingReviews.length > 0
      ? `\nREVISION REQUESTED:\n${pendingReviews.map(t => `- [${t.title}] Feedback: ${t.reviewComments}`).join('\n')}`
      : '';

    return `ID: ${agent.name}. Role: ${agent.description}. Phase: ${phase}.
${brief ? `Brief: ${brief}` : ''}${memoryBlock}${reviewContext}
Team: User (0), ${team}
KANBAN:
${board}
RULES:
${lengthRule}
2. Tools only in WORKING (except set_user_brief in IDLE).
3. QUALITY: If your node has 'Human-in-the-loop' enabled, your 'complete_task' result will be reviewed by the user before completion. 
4. NO META-TALK: Avoid "I have finished X", "Here is the result". Use the tool payload for content and Chat for conversation only.${outputInstruction}${imageInstruction}
5. LANGUAGE: You MUST generate all systemic outputs (tasks, 'complete_task' results, and 'deliver_project' prompts) in the same language as the 'Brief' or the user's interaction. If the project description is in Spanish, EVERYTHING you generate must be in Spanish.
Goal: ${objectives[phase as keyof typeof objectives] || ''}${specialNeedsRules}`;
  }
}

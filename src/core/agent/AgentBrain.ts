import { LLMMessage } from '../llm/types';
import { GeminiProvider } from '../llm/providers/GeminiProvider';
import { ClaudeProvider } from '../llm/providers/ClaudeProvider';
import { useUiStore } from '../../integration/store/uiStore';
import { getRoom, useCoreStore } from '../../integration/store/coreStore';
import { useTeamStore } from '../../integration/store/teamStore';
import { ToolRegistry } from './ToolRegistry';
import { PromptBuilder } from './PromptBuilder';
import { AgentNode, getAgentSet } from '../../data/agents';

export interface BrainHost {
  data: AgentNode;
  /** この脳が属する部屋。部屋を跨いで同じ番号の担当が居るため、必ず持つ。 */
  roomId: string;
  simulation: {
    getAllAgents: () => any[];
    processScheduledTasks: () => void;
  };
  getCurrentTaskId: () => string | null;
}

export interface ThinkOptions {
  isChat?: boolean;
  tools?: any[];
  silent?: boolean;
}

export class AgentBrain {
  private history: LLMMessage[] = [];
  public isThinking: boolean = false;

  /**
   * 道具を使ったら「続きを考える」回数の上限。
   *
   * 以前は道具を1回実行したらそこで終わりだった。すると、秘書長が依頼票に
   * 書き込んだ（道具だけ呼んだ）ターンは「Working on it...」を残して止まり、
   * 道具の結果（「全部埋まりました。確定してください」）を誰も読まない。
   * 部屋は作業中のまま永久に止まる——CEO が実地で踏んだ不具合（2026-08-27）。
   *
   * 上限を設けるのは、暴走したときの課金を止めるため。上限に達したら
   * そのターンは打ち切られるが、履歴は残るので次の呼びかけで続きから動ける。
   */
  private static readonly MAX_TOOL_ROUNDS = 4;

  /**
   * これを呼んだらターンの仕事が完結する道具。続きを考えない。
   * deliver_project は最終出力の生成に進み、set_user_brief は仕事の開始そのもの、
   * submit_qa_verdict は判定の提出で完結する。
   */
  private static readonly TERMINAL_TOOLS = new Set([
    'deliver_project',
    'set_user_brief',
    'submit_qa_verdict'
  ]);

  constructor(private readonly host: BrainHost) {
    this.refreshFromStore();
  }

  public async think(prompt: string, options: ThinkOptions = {}): Promise<{ text: string, toolCalls: any[] }> {
    if (this.isThinking) return { text: '', toolCalls: [] };
    this.isThinking = true;

    try {
      this.refreshFromStore();
      const rid = this.host.roomId;
      const store = useCoreStore.getState();
      const llmConfig = useUiStore.getState().llmConfig;
      if (!llmConfig.apiKey) throw new Error('Claude API key is required');
      const provider = new ClaudeProvider(llmConfig.apiKey);
      const model = this.host.data.model || llmConfig.model;
      // チームは「画面で選ばれているもの」ではなく、自分の部屋のもの。
      // 画面が別の部屋を見ていても、この脳は自分の部屋の仕事を続ける。
      const activeTeam = getAgentSet(rid, useTeamStore.getState().customSystems);

      const hasVisionSupport = activeTeam?.outputType === 'image' || activeTeam?.outputType === 'video';

      // 1. Manage Message History
      if (!options.isChat) {
        const userMsg: LLMMessage = {
          role: 'user',
          content: prompt,
          metadata: options.silent ? { internal: true } : undefined
        };

        // Attach reference images if VISION is supported for this project type
        if (hasVisionSupport && getRoom(rid).referenceImages.length > 0) {
          userMsg.images = getRoom(rid).referenceImages;
        }

        this.history.push(userMsg);
        this.syncToStore();
      }

      let lastText = '';
      let lastToolCalls: any[] = [];

      // 道具 → 結果 → 続きを考える、を言葉で締めるまで繰り返す（上限つき）。
      for (let round = 0; round < AgentBrain.MAX_TOOL_ROUNDS; round++) {
        const room = getRoom(rid);

        // 2. Prepare context
        // 窓は20件。続きを考えるたびに道具の結果が積まれるので、
        // 10件だと1ターンの途中で CEO の依頼文が窓から落ちる
        let messages: LLMMessage[] = this.history.slice(-20);
        // Never let a truncated window start with an orphaned tool_result
        // (its matching tool_use would have been cut off).
        while (messages.length > 0 && messages[0].role === 'tool') {
          messages = messages.slice(1);
        }

        // In chat mode, ensure the latest user message also carries images if it's the brief phase
        if (options.isChat && hasVisionSupport && room.referenceImages.length > 0) {
          messages = messages.map((m, idx) => {
            if (idx === messages.length - 1 && m.role === 'user') {
              return { ...m, images: room.referenceImages };
            }
            return m;
          });
        }
        const allAgents = this.host.simulation.getAllAgents();
        const systemPrompt = PromptBuilder.buildSystemPrompt(this.host.data, room.phase, room.userBrief, allAgents, rid);
        const toolDefs = options.tools || ToolRegistry.getDefinitions(this.host.data.index, room.phase, this.host.data.subagents?.length || 0, this.host.data.id);

        // 3. Log and Execute LLM Call
        store.addRequestLog({
          agentIndex: this.host.data.index,
          agentName: this.host.data.name,
          systemInstruction: systemPrompt,
          contents: messages,
          systemTools: toolDefs,
          taskId: this.host.getCurrentTaskId() || undefined
        }, rid);

        const response = await provider.generateCompletion(
          messages,
          toolDefs,
          systemPrompt,
          model
        );

        // 4. Log Response
        store.addResponseLog({
          agentIndex: this.host.data.index,
          agentName: this.host.data.name,
          content: response.content || '',
          tool_calls: response.tool_calls,
          usage: response.usage,
          raw: response.raw,
          taskId: this.host.getCurrentTaskId() || undefined
        }, rid);

        // 5. Parse Tool Calls
        const text = response.content || '';
        const toolCalls = response.tool_calls?.map(tc => {
          try {
            return { id: tc.id, name: tc.function.name, args: JSON.parse(tc.function.arguments) };
          } catch (e) {
            console.error('[AgentBrain] Failed to parse tool arguments', tc.function.arguments);
            return null;
          }
        }).filter(Boolean) as any[] || [];

        lastText = text;
        lastToolCalls = toolCalls;

        const isRefusal = response.finishReason === 'refusal';
        const isTerminal = toolCalls.some(tc => AgentBrain.TERMINAL_TOOLS.has(tc.name));
        const willContinue =
          toolCalls.length > 0 && !isTerminal && !isRefusal && round < AgentBrain.MAX_TOOL_ROUNDS - 1;

        // 6. Final Message Construction
        const isInternalTrigger = options.silent;
        const hasToolCallsOnly = !text && toolCalls.length > 0;
        const isBrief = toolCalls.some(tc => tc.name === 'set_user_brief');
        let finalContent = text;

        if (isRefusal) {
          finalContent = 'ERROR: The model declined to respond to this request. Please rephrase and try again.';
          console.warn(`[AgentBrain:${this.host.data.name}] Refusal detected.`);
        } else if (hasToolCallsOnly && !isInternalTrigger) {
          finalContent = isBrief
            ? "Project brief set. Let's begin!"
            : 'Working on it...';
        } else if (!text && toolCalls.length === 0 && !isInternalTrigger) {
          finalContent = '...';
        }

        // UI/UX handling for chat auto-closing
        if (options.isChat && isBrief) {
          setTimeout(() => {
            if (useUiStore.getState().isChatting) useUiStore.getState().setChatting(false);
            useUiStore.getState().setSelectedNpc(null);
          }, 3000);
        }

        // 続きを考える途中の「Working on it...」はチャットに出さない。
        // 最後に言葉で締めた返事だけが CEO に見える（途中経過が3つ並ぶと会話にならない）
        const isInternalMessage = isInternalTrigger || (hasToolCallsOnly && willContinue);
        this.history.push({
          role: 'assistant',
          content: finalContent,
          tool_calls: response.tool_calls,
          metadata: isInternalMessage ? { internal: true } : undefined
        });
        this.syncToStore();

        // 7. Process Actions (Tools)
        // Every tool_use block sent to Claude must be answered with a matching
        // tool_result in the next message, or the next API call is rejected.
        //
        // **tool_result は internal にする。** ここで internal を付けないと、
        // ファイル読み書きの生の中身やブリッジのエラー文字列が、
        // エージェント本人の発言のように見えるままチャットに出てしまう
        // （2026-08-24、CEO が「ERROR: ブリッジに接続できません…」を秘書長の発言として見た不具合）。
        for (const tc of toolCalls) {
          // File tools resolve to a string (the folder listing, the file body, a
          // save confirmation); the store-mutating tools stay synchronous booleans.
          const handled = await ToolRegistry.process(this.host as any, tc);
          this.history.push({
            role: 'tool',
            name: tc.id,
            content: typeof handled === 'string' ? handled : handled ? 'OK' : 'Tool call was not handled.',
            metadata: { internal: true }
          });
          if (tc.name === 'deliver_project' && handled) {
            this.handleFinalAssetGeneration(tc.args.output);
          }
        }
        if (toolCalls.length > 0) this.syncToStore();

        if (!willContinue) break;
      }

      return { text: lastText, toolCalls: lastToolCalls };
    } catch (error) {
      console.error(`[AgentBrain:${this.host.data.name}] Logic error:`, error);
      const errMsg = error instanceof Error ? error.message : String(error);
      useUiStore.getState().setBYOKOpen(true, errMsg);
      throw error;
    } finally {
      this.isThinking = false;
      this.host.simulation.processScheduledTasks();
    }
  }

  /** Autonomous Intent: Start the project strategy. */
  public async spark() {
    return this.think('Start the project by proposing initial tasks.', { silent: true });
  }

  /** Autonomous Intent: Work on a specific task. */
  public async executeTask(taskId: string) {
    return this.think(`Proceed with task: ${taskId}`, { silent: true });
  }

  /**
   * Autonomous Intent: 部屋の内部タスクが全部終わったときに呼ばれる。
   *
   * 秘書室・品質管理室は「1つの成果物を届けて終わる」制作部屋ではないので、
   * deliver_project を促す文面をそのまま送らない（ツール自体も渡していないが、
   * 文面だけ食い違っていると「使えないはずの道具を使え」と言われて混乱するため）。
   * その部屋の実際の完了アクションを名指しで伝える。
   */
  public async concludeProject() {
    const id = this.host.data.id;

    if (id === 'sec-chief') {
      return this.think(
        'このタスクは終わりましたが、案件全体はまだ終わっていません。案件の状態を確認してください。' +
        '依頼票が未確定なら、不足を CEO に尋ねてください。確定していて段取りがまだなら、' +
        'タスク設計担当に段取りを作らせ、set_work_plan で登録してください。' +
        'すでに段取りを登録済み（承認待ち）なら、いまは CEO の承認待ちです。何もしなくてよいです。',
        { silent: true }
      );
    }

    if (id === 'qa-chief') {
      return this.think(
        '3名の検査結果が揃いました。まとめて submit_qa_verdict で合否を出してください。' +
        'すでに判定済みなら、次の検査対象が来るまで何もしなくてよいです。',
        { silent: true }
      );
    }

    return this.think('All tasks are complete! Use the deliver_project tool to fulfill the final delivery with the project result.', { silent: true });
  }

  private async handleFinalAssetGeneration(prompt: string) {
    const rid = this.host.roomId;
    const core = useCoreStore.getState();
    const activeTeam = getAgentSet(rid, useTeamStore.getState().customSystems);

    if (!activeTeam) return;

    // Check if we need manual approval
    if (activeTeam.outputAutoApprove === false) {
      core.setPendingOutputPrompt(prompt, rid);

      // Prepare default params based on output type
      const defaultParams: any = { model: activeTeam.outputModel };
      if (activeTeam.outputType === 'image') {
        defaultParams.aspectRatio = '16:9';
        defaultParams.imageSize = '1K';
      } else if (activeTeam.outputType === 'video') {
        defaultParams.resolution = '720p';
        defaultParams.aspectRatio = '16:9';
        defaultParams.durationSeconds = 4;
      }

      core.setPendingOutputParams(defaultParams, rid);
      core.setReviewingOutput(true, rid);
      return;
    }

    // Standard auto-approve flow
    await this.processFinalAsset(prompt, { model: activeTeam.outputModel });
  }

  public async processFinalAsset(prompt: string, options: any) {
    const rid = this.host.roomId;
    const core = useCoreStore.getState();
    const activeTeam = getAgentSet(rid, useTeamStore.getState().customSystems);

    if (!activeTeam) return;

    core.setIsGeneratingAsset(true, rid);
    core.setReviewingOutput(false, rid);

    try {
      if (activeTeam.outputType === 'text') {
        // For text, the prompt is the final output (produced by the Claude "brain")
        core.setFinalOutput(prompt, rid);
        core.setPhase('done', rid);
        core.setFinalOutputOpen(true, rid);
        core.setIsGeneratingAsset(false, rid);
        return;
      }

      const llmConfig = useUiStore.getState().llmConfig;
      if (!llmConfig.geminiApiKey) throw new Error('Gemini API key is required for image/music/video generation');
      const provider = new GeminiProvider(llmConfig.geminiApiKey) as any;
      const model = options.model || activeTeam.outputModel || llmConfig.model;

      core.addLogEntry({
        agentIndex: -1,
        action: `Generating final ${activeTeam.outputType} using ${model}...`,
        taskId: undefined
      }, rid);

      let assetContent: string = '';
      let usage: any = undefined;

      if (activeTeam.outputType === 'image') {
        const result = await provider.generateImage(prompt, model, (msg: string) => {
          console.log(`[System:Image] ${msg}`);
        }, options, getRoom(rid).referenceImages);
        assetContent = result.data || '';
        usage = result.usage;
      } else if (activeTeam.outputType === 'music') {
        const result = await provider.generateAudio(prompt, model, (msg: string) => {
          console.log(`[System:Audio] ${msg}`);
        });
        assetContent = result.data || '';
        usage = result.usage;
      } else if (activeTeam.outputType === 'video') {
        const result = await provider.generateVideo(prompt, model, (msg: string) => {
          console.log(`[System:Video] ${msg}`);
        }, options, getRoom(rid).referenceImages);
        assetContent = result.videoUrl || '';
        usage = result.usage;
      }

      core.addResponseLog({
        agentIndex: -1,
        agentName: 'System',
        content: `Final ${activeTeam.outputType} generated successfully.`,
        usage: usage,
        raw: { model, ...usage },
        taskId: undefined
      }, rid);

      core.setFinalOutput(prompt, rid);
      core.setFinalAsset(activeTeam.outputType === 'music' ? 'audio' : activeTeam.outputType as any, assetContent, rid);
      core.setPhase('done', rid);
      core.setFinalOutputOpen(true, rid);
    } catch (error) {
      console.error('[AgentBrain] Final asset generation failed:', error);
      core.setIsGeneratingAsset(false, rid);
      const errMsg = error instanceof Error ? error.message : String(error);
      useUiStore.getState().setBYOKOpen(true, errMsg);
      core.addLogEntry({
        agentIndex: 0,
        action: `Error generating final ${activeTeam.outputType}: ${errMsg}`,
        taskId: undefined
      }, rid);
    }
  }

  public appendHistory(message: LLMMessage) {
    this.refreshFromStore();
    this.history.push(message);
    this.syncToStore();
  }

  private refreshFromStore() {
    const history = getRoom(this.host.roomId).agentHistories[this.host.data.index];
    if (history) this.history = [...history];
  }

  private syncToStore() {
    useCoreStore.getState().setAgentHistory(this.host.data.index, this.history, this.host.roomId);
  }
}

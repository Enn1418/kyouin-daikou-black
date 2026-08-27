import { AgenticSystem, getAllAgents } from '../../data/agents';
import { getRoom, useCoreStore } from '../../integration/store/coreStore';
import { AgentHost } from './AgentHost';
import { agentStatusKey, useUiStore } from '../../integration/store/uiStore';

/**
 * AgentSimulation — Autonomous Service Layer.
 * 
 * DESIGN PRINCIPLE: State-Driven Orchestration.
 * 1. Monitors the Store to trigger autonomous loops.
 * 2. Visuals are reflections of this state.
 * 3. Event-based Resilience: Re-checks for tasks when agents become idle.
 */
export class AgentSimulation {
  private agents: Map<number, AgentHost> = new Map();
  private system: AgenticSystem;
  private unsubs: (() => void)[] = [];
  private heartbeatInterval: any = null;
  private lastSparkTriggerTime: number = 0;

  /** この職員室（部屋）のID。状態はすべてこの部屋に読み書きする。 */
  public readonly roomId: string;

  constructor(system: AgenticSystem) {
    this.system = system;
    this.roomId = system.id;
    this.initializeAgents();
    this.startStateMonitoring();
  }

  private startStateMonitoring() {
    // 1. Heartbeat safety net (Periodically check for scheduled tasks and empty boards)
    this.heartbeatInterval = setInterval(() => {
      const room = getRoom(this.roomId);
      if (room.phase === 'working' && room.tasks.length === 0) {
        this.triggerAutonomousStrategy();
      } else if (room.phase === 'working') {
        this.processScheduledTasks();
      }
    }, 5000);

    // 2. Core Store Monitoring
    this.unsubs.push(
      useCoreStore.subscribe((state, prevState) => {
        // 自分の部屋に変化が無ければ何もしない（他の部屋の更新で全部屋が反応すると荒れる）
        const room = state.rooms[this.roomId];
        const prevRoom = prevState.rooms[this.roomId];
        if (room === prevRoom) return;
        const phase = room?.phase ?? 'idle';
        const prevPhase = prevRoom?.phase ?? 'idle';

        // A. Initial Strategy (Spark)
        if (phase === 'working' && prevPhase === 'idle' && (room?.tasks.length ?? 0) === 0) {
          this.triggerAutonomousStrategy();
        }

        // B. Task Lifecycle: Process SCHEDULED tasks
        if (phase === 'working') {
          this.processScheduledTasks();
        }

        // C. Project Completion
        this.checkProjectCompletion();
      })
    );

    // 3. UI Store Monitoring (Cleanup)
    this.unsubs.push(
      useUiStore.subscribe((state, prevState) => {
        if (!state.isChatting && prevState.isChatting) {
          const room = getRoom(this.roomId);
          if (room.phase === 'working' && room.tasks.length === 0) this.triggerAutonomousStrategy();
        }
      })
    );
  }

  /** Central method to check for and start available tasks. */
  public processScheduledTasks() {
    const room = getRoom(this.roomId);
    if (room.phase !== 'working') return;

    room.tasks.filter(t => t.status === 'scheduled' || t.status === 'in_progress').forEach(task => {
      const agent = this.getAgent(task.assignedAgentId);
      const uiStatus = useUiStore.getState().agentStatuses[agentStatusKey(this.roomId, task.assignedAgentId)];
      
      // Resilience check: only start if agent is truly idle and not currently thinking.
      // We check both internal state and UI status as safety.
      if (agent && (agent.state === 'idle' || uiStatus === 'idle') && !agent.isThinking) {
        this.startTaskExecution(task.assignedAgentId, task.id);
      }
    });
  }

  private async triggerAutonomousStrategy() {
    const lead = this.getAgent(1);
    const ui = useUiStore.getState();
    const room = getRoom(this.roomId);

    // GUARD: Prevent duplication
    if (!lead || lead.isThinking || room.tasks.length > 0) return;
    if (ui.isChatting && ui.selectedNpcIndex === lead.data.index) return;
    
    if (Date.now() - this.lastSparkTriggerTime < 1000) return;
    this.lastSparkTriggerTime = Date.now();

    await lead.spark();
  }

  private async startTaskExecution(agentIndex: number, taskId: string) {
    const agent = this.getAgent(agentIndex);
    if (!agent) return;

    agent.setTask(taskId);
    useCoreStore.getState().updateTaskStatus(taskId, 'in_progress', this.roomId);
    
    await new Promise(resolve => setTimeout(resolve, Math.random() * 2000 + 1000));

    try {
      if (!agent.isThinking) {
        await agent.executeTask(taskId);
      }
    } catch (err) {
      console.error(`[AgentSimulation] Agent ${agentIndex} failed:`, err);
    } finally {
      // Resilience check: only clear task if not waiting for review or meeting
      if (agent.state !== 'on_hold' && agent.state !== 'talking') {
        agent.setTask(null);
        agent.setState('idle');
      }
      
      // KEY: When finished, check if there are other scheduled tasks waiting
      this.processScheduledTasks();
      
      // AND check if the project is now ready for delivery 
      // (Resilience for 1-agent teams where lead is thinking when the last task finishes)
      this.checkProjectCompletion();
    }
  }

  /**
   * まとめ役に一言届けて、続きを考えさせる（RoomManager.notifyLead から）。
   *
   * 考え中に割り込むと二重思考ガード（brain.isThinking）で黙って捨てられるので、
   * 空くまで少し待ってから渡す。30秒待っても空かなければ諦める
   * （その場合、CEO の次の操作で会話が動くのでそこで拾われる）。
   */
  public async notifyLead(message: string) {
    const lead = this.getAgent(this.system.leadAgent.index);
    if (!lead) return;
    for (let i = 0; i < 30 && lead.isThinking; i++) {
      await new Promise((r) => setTimeout(r, 1000));
    }
    if (lead.isThinking) return;
    try {
      await lead.think(message, { silent: true });
    } catch (err) {
      console.error('[AgentSimulation] notifyLead failed:', err);
    }
  }

  private async checkProjectCompletion() {
    const room = getRoom(this.roomId);
    const allTasksFinished = room.tasks.length > 0 && room.tasks.every(t => t.status === 'done');

    if (room.phase === 'working' && allTasksFinished && !room.isGeneratingAsset) {
      const lead = this.getAgent(this.system.leadAgent.index);
      if (lead && !lead.isThinking) {
        await lead.concludeProject();
      }
    }
  }

  private initializeAgents() {
    const allAgents = getAllAgents(this.system);
    for (const agentData of allAgents) {
      this.agents.set(agentData.index, new AgentHost(agentData, this));
    }
  }

  public getAgent(index: number): AgentHost | undefined {
    return this.agents.get(index);
  }

  public getAllAgents(): AgentHost[] {
    return Array.from(this.agents.values());
  }



  public async handleUserMessage(agentIndex: number, text: string) {
    const agent = this.getAgent(agentIndex);
    if (!agent || !agent.canChat()) return null;
    const response = await agent.think(text, { isChat: true });
    return response.text;
  }

  public dispose() {
    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
    this.unsubs.forEach(unsub => unsub());
    this.unsubs = [];
    this.agents.forEach(a => a.dispose());
  }
}

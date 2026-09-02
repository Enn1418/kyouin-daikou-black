import { AgentActionContext } from '../ToolRegistry';
import { getRoom, useCoreStore } from '../../../integration/store/coreStore';
import { useTeamStore } from '../../../integration/store/teamStore';
import { getAgentSet } from '../../../data/agents';
import { workflowEngine } from '../../workflow/WorkflowEngine';

export function deliverProject(agent: AgentActionContext, args: { output: string }): boolean {
  const store = useCoreStore.getState();
  const room = getRoom(agent.roomId);
  const { output } = args;

  // VALIDATION: Only Lead Agent (index 1) can deliver
  if (room.phase !== 'working') return false;

  // SAFETY: Prevent project delivery if subagents are still working or waiting for approval
  const pendingTasks = room.tasks.filter(t => t.status === 'in_progress' || t.status === 'on_hold');
  if (pendingTasks.length > 0) {
    const names = pendingTasks.map(t => t.title).join(', ');
    agent.appendHistory({
      role: 'user',
      content: `[SYSTEM] You cannot deliver the project yet. There are pending tasks: ${names}. All subagents must finish their work first.`,
      metadata: { internal: true }
    });
    return false;
  }

  const activeTeam = getAgentSet(agent.roomId, useTeamStore.getState().customSystems);
  const isMultimodal = activeTeam?.outputType && activeTeam.outputType !== 'text';

  if (isMultimodal) {
    store.setIsGeneratingAsset(true, agent.roomId);
    // We don't set phase to 'done' yet, AgentHost will handle generation then set phase to done.
  } else {
    store.setFinalOutput(output, agent.roomId);
    store.setPhase('done', agent.roomId);
  }

  // Mark remaining active tasks for this agent as done
  room.tasks.filter(t => t.assignedAgentId === agent.data.index && t.status === 'in_progress')
    .forEach(t => store.updateTaskStatus(t.id, 'done', agent.roomId));

  store.addLogEntry({ agentIndex: agent.data.index, action: 'delivered final project results', taskId: undefined }, agent.roomId);

  // 案件の工程として動いていた場合は、制御層に提出を知らせる。
  // **ここで完了にはならない。** 制御層が品質管理へ回す（部屋が自分で合格にできない）。
  workflowEngine.reportStepDelivered(agent.roomId, activeTeam?.teamName ?? agent.roomId);

  return true;
}

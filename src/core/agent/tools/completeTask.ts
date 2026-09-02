import { AgentActionContext } from '../ToolRegistry';
import { getRoom, useCoreStore } from '../../../integration/store/coreStore';
import { agentStatusKey, useUiStore } from '../../../integration/store/uiStore';

export function completeTask(agent: AgentActionContext, args: { taskId: string, output: string }): boolean {
  const store = useCoreStore.getState();
  const { taskId, output } = args;

  // HUMAN-IN-THE-LOOP: If agent requires validation, submit for review instead of completing.
  const agentStatus = useUiStore.getState().agentStatuses[agentStatusKey(agent.roomId, agent.data.index)];

  if (agent.data.humanInTheLoop && agentStatus !== 'on_hold') {
    const tasks = getRoom(agent.roomId).tasks;
    const task = tasks.find(t => t.id === taskId);
    const taskTitle = task?.title || taskId;

    store.submitTaskForReview(taskId, output, agent.roomId);
    agent.setState('on_hold');
    agent.appendHistory({
      role: 'assistant',
      content: `I've finished **"${taskTitle}"** and submitted it for review.`,
      metadata: { reviewTaskId: taskId }
    });
    return true;
  }

  store.updateTaskStatus(taskId, 'done', agent.roomId);
  store.setTaskOutput(taskId, output, agent.roomId);
  store.addLogEntry({ agentIndex: agent.data.index, action: `completed task`, taskId }, agent.roomId);
  
  return true;
}

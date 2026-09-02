import { useRoom } from '../store/coreStore'
import { useActiveTeam } from '../store/teamStore'
import { agentStatusKey, useUiStore } from '../store/uiStore'

export interface ChatAvailability {
  canChat: boolean
  reason: string
}

/**
 * Derives whether the player can chat with a given agent based on
 * the current project phase and the agent's task state.
 */
export function useChatAvailability(agentIndex: number | null): ChatAvailability {
  const { phase, tasks, isGeneratingAsset } = useRoom()
  const system = useActiveTeam()
  const agentStatus = useUiStore((s) => (agentIndex !== null ? s.agentStatuses[agentStatusKey(system.id, agentIndex)] : 'idle'))

  if (agentIndex === null) return { canChat: false, reason: '' }
  if (isGeneratingAsset) return { canChat: false, reason: 'Delivering...' }
  if (phase === 'done') return { canChat: false, reason: 'Project completed' }

  const isLead = agentIndex === system.leadAgent.index

  // 1. Idle Phase: Only Lead Agent can chat (to set the brief)
  if (phase === 'idle') {
    return isLead ? { canChat: true, reason: '' } : { canChat: false, reason: 'Waiting for brief' }
  }

  // 2. Working Phase: Lead Agent can always talk. Others only when idle.
  if (isLead || agentStatus === 'idle') {
    return { canChat: true, reason: '' }
  }

  // Provide specific reason for busy agents
  if (agentStatus === 'on_hold') return { canChat: false, reason: 'Review requested...' }

  const activeTask = tasks.find((t) => t.assignedAgentId === agentIndex && t.status === 'in_progress')
  return { 
    canChat: false, 
    reason: activeTask ? `Working on: "${activeTask.title}"` : 'Agent is busy' 
  }
}

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { LLMMessage, LLMTokenUsage, LLMToolCall } from '../../core/llm/types';
import { AVAILABLE_MODELS } from '../../core/llm/constants';
import { calculateCost } from '../../core/llm/pricing';
import { useTeamStore } from './teamStore';
import { useUiStore } from './uiStore';
import { appendMemoryNote } from '../../core/bridge/bridgeClient';

export type TaskStatus = 'scheduled' | 'on_hold' | 'in_progress' | 'done'

export interface TaskRevision {
  output: string
  feedback?: string
  timestamp: number
}

export interface Task {
  id: string
  title: string
  description: string
  assignedAgentId: number
  status: TaskStatus
  parentTaskId?: string
  requiresUserApproval: boolean,
  draftOutput?: string,
  reviewComments?: string,
  output?: string,
  revisions: TaskRevision[]
  createdAt: number
  updatedAt: number
}

export interface ActionLogEntry {
  id: string
  timestamp: number
  agentIndex: number
  action: string
  taskId?: string
}

export interface DebugLogEntryBase {
  id: string
  timestamp: number
  agentIndex: number
  agentName: string
  status: 'pending' | 'completed' | 'error'
  taskId?: string
}

export interface RequestDebugLogEntry extends DebugLogEntryBase {
  phase: 'request'
  systemInstruction?: string
  contents: any[]
  systemTools?: any[]
}

export interface ResponseDebugLogEntry extends DebugLogEntryBase {
  phase: 'response'
  content: string | null
  tool_calls?: LLMToolCall[]
  usage?: LLMTokenUsage
  raw?: any
}

export type DebugLogEntry = RequestDebugLogEntry | ResponseDebugLogEntry;

export type ProjectPhase = 'idle' | 'working' | 'done'

/**
 * 1部屋（=1チーム）の進行状態。
 *
 * 以前はこの中身がストア直下に1組しかなく、チームを切り替えるたびに
 * resetProject() で消していた。部屋を跨いで仕事が生き続けるように、
 * 部屋IDごとに1組ずつ持つ。担当の履歴も部屋の中にあるので、
 * 「部屋Aの1番」と「部屋Bの1番」が衝突しない。
 */
export interface RoomState {
  userBrief: string
  referenceImages: string[]
  phase: ProjectPhase
  finalOutput: string | null
  totalTokenUsage: LLMTokenUsage
  agentTokenUsage: Record<number, LLMTokenUsage>
  totalEstimatedCost: number
  agentEstimatedCost: Record<number, number>
  finalAssetType: 'text' | 'image' | 'audio' | 'video'
  finalAssetContent: string | null
  isGeneratingAsset: boolean
  isReviewingOutput: boolean
  pendingOutputPrompt: string
  pendingOutputParams: any
  isFinalOutputOpen: boolean
  tasks: Task[]
  actionLog: ActionLogEntry[]
  debugLog: DebugLogEntry[]
  agentHistories: Record<number, LLMMessage[]>
  agentSummaries: Record<number, string>
  boardroomHistories: Record<string, LLMMessage[]>
}

const emptyRoom = (): RoomState => ({
  userBrief: '',
  referenceImages: [],
  phase: 'idle',
  finalOutput: null,
  totalTokenUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
  agentTokenUsage: {},
  totalEstimatedCost: 0,
  agentEstimatedCost: {},
  finalAssetType: 'text',
  finalAssetContent: null,
  isGeneratingAsset: false,
  isReviewingOutput: false,
  pendingOutputPrompt: '',
  pendingOutputParams: {},
  isFinalOutputOpen: false,
  tasks: [],
  actionLog: [],
  debugLog: [],
  agentHistories: {},
  agentSummaries: {},
  boardroomHistories: {},
});

/** まだ何もしていない部屋の読み取りに返す。毎回新しい物を返すと再描画が止まらなくなる。 */
export const EMPTY_ROOM: RoomState = Object.freeze(emptyRoom()) as RoomState;

interface CoreState {
  // ── 部屋ごとの進行状態 ────────────────────────────────────────
  rooms: Record<string, RoomState>

  // ── 全体（部屋に依らない） ───────────────────────────────────
  availableModels: string[]
  isKanbanOpen: boolean
  viewMode: 'floor' | 'simulation' | 'design' | 'characters';
  isLogOpen: boolean
  logFilterAgentIndex: number | null;
  isResizing: boolean;

  // ── Actions — Project ────────────────────────────────────────
  // roomId を省略したときは「いま見ている部屋」。エージェント側は必ず自分の部屋を渡す。
  setUserBrief: (brief: string, roomId?: string) => void;
  addReferenceImage: (base64: string, roomId?: string) => void;
  removeReferenceImage: (index: number, roomId?: string) => void;
  clearReferenceImages: (roomId?: string) => void;
  setPhase: (phase: ProjectPhase, roomId?: string) => void;
  startProject: (brief: string, roomId?: string) => void;
  setFinalOutput: (output: string, roomId?: string) => void;
  setFinalAsset: (type: 'image' | 'audio' | 'video', content: string, roomId?: string) => void;
  setIsGeneratingAsset: (isGenerating: boolean, roomId?: string) => void;
  setReviewingOutput: (val: boolean, roomId?: string) => void;
  setPendingOutputPrompt: (prompt: string, roomId?: string) => void;
  setPendingOutputParams: (params: any, roomId?: string) => void;

  // ── Actions — Tasks ──────────────────────────────────────────
  addTask: (task: Omit<Task, 'id' | 'revisions' | 'createdAt' | 'updatedAt'>, roomId?: string) => Task;
  removeTask: (taskId: string, roomId?: string) => void;
  updateTaskStatus: (taskId: string, status: TaskStatus, roomId?: string) => void;
  submitTaskForReview: (taskId: string, draftOutput?: string, roomId?: string) => void;
  setTaskOutput: (taskId: string, output: string, roomId?: string) => void;
  approveTask: (taskId: string, roomId?: string) => void;
  rejectTask: (taskId: string, comments: string, roomId?: string) => void;

  // ── Actions — Log ────────────────────────────────────────────
  addLogEntry: (entry: Omit<ActionLogEntry, 'id' | 'timestamp'>, roomId?: string) => void;
  addRequestLog: (entry: Omit<RequestDebugLogEntry, 'id' | 'timestamp' | 'phase' | 'status'>, roomId?: string) => void;
  addResponseLog: (entry: Omit<ResponseDebugLogEntry, 'id' | 'timestamp' | 'phase' | 'status'>, roomId?: string) => void;

  // ── Actions — History ────────────────────────────────────────
  appendAgentHistory: (agentIndex: number, role: 'user' | 'assistant', parts: any[], roomId?: string) => void;
  setAgentSummary: (agentIndex: number, summary: string, roomId?: string) => void;
  appendBoardroomHistory: (taskId: string, role: 'user' | 'assistant', parts: any[], roomId?: string) => void;
  clearAllHistories: (roomId?: string) => void;
  setAgentHistory: (agentIndex: number, history: LLMMessage[], roomId?: string) => void;

  // ── Actions — UI ─────────────────────────────────────────────
  setKanbanOpen: (open: boolean) => void;
  setLogOpen: (open: boolean, filterAgent?: number | null) => void;
  setFinalOutputOpen: (open: boolean, roomId?: string) => void;
  setIsResizing: (isResizing: boolean) => void;
  resetProject: (roomId?: string) => void;
  setViewMode: (mode: 'floor' | 'simulation' | 'design' | 'characters') => void;
}

const uid = () => `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`

/** いま画面で見ている部屋。UI 側から roomId を省略されたときの既定。 */
const activeRoomId = () => useTeamStore.getState().selectedAgentSetId;

export const useCoreStore = create<CoreState>()(
  persist(
    (set, get) => {
      /** 部屋の一部だけ書き換える。無い部屋は作られる。 */
      const patchRoom = (roomId: string | undefined, fn: (room: RoomState) => Partial<RoomState>) =>
        set((s) => {
          const rid = roomId ?? activeRoomId();
          const room = s.rooms[rid] ?? emptyRoom();
          return { rooms: { ...s.rooms, [rid]: { ...room, ...fn(room) } } };
        });

      const roomOf = (roomId?: string): RoomState =>
        get().rooms[roomId ?? activeRoomId()] ?? EMPTY_ROOM;

      return {
        rooms: {},
        availableModels: [...AVAILABLE_MODELS.text],
        isKanbanOpen: true,
        isLogOpen: true,
        logFilterAgentIndex: null,
        isResizing: false,
        viewMode: 'floor',

        setViewMode: (viewMode) => set({ viewMode }),

        resetProject: (roomId) =>
          set((s) => {
            const rid = roomId ?? activeRoomId();
            const next = { ...s.rooms };
            next[rid] = emptyRoom();
            return { rooms: next };
          }),

        setUserBrief: (brief, roomId) => patchRoom(roomId, () => ({ userBrief: brief })),
        addReferenceImage: (base64, roomId) =>
          patchRoom(roomId, (r) => ({ referenceImages: [...r.referenceImages, base64].slice(0, 3) })),
        removeReferenceImage: (index, roomId) =>
          patchRoom(roomId, (r) => ({ referenceImages: r.referenceImages.filter((_, i) => i !== index) })),
        clearReferenceImages: (roomId) => patchRoom(roomId, () => ({ referenceImages: [] })),
        setPhase: (phase, roomId) => patchRoom(roomId, () => ({ phase })),
        startProject: (brief, roomId) =>
          patchRoom(roomId, () => ({ userBrief: brief, phase: 'working', finalAssetType: 'text', finalAssetContent: null })),
        setFinalOutput: (output, roomId) => patchRoom(roomId, () => ({ finalOutput: output })),
        setFinalAsset: (type, content, roomId) =>
          patchRoom(roomId, () => ({ finalAssetType: type, finalAssetContent: content, isGeneratingAsset: false })),
        setIsGeneratingAsset: (isGenerating, roomId) => patchRoom(roomId, () => ({ isGeneratingAsset: isGenerating })),
        setReviewingOutput: (val, roomId) => patchRoom(roomId, () => ({ isReviewingOutput: val })),
        setPendingOutputPrompt: (prompt, roomId) => patchRoom(roomId, () => ({ pendingOutputPrompt: prompt })),
        setPendingOutputParams: (params, roomId) => patchRoom(roomId, () => ({ pendingOutputParams: params })),

        addTask: (task, roomId) => {
          const newTask: Task = {
            ...task,
            id: `task_${uid()}`,
            revisions: [],
            createdAt: Date.now(),
            updatedAt: Date.now(),
          }
          patchRoom(roomId, (r) => ({ tasks: [...r.tasks, newTask] }))
          return newTask
        },

        removeTask: (taskId, roomId) =>
          patchRoom(roomId, (r) => {
            const newTasks = r.tasks.filter((t) => t.id !== taskId);
            const hasRemainingTasks = newTasks.some(t => t.status !== 'done');
            return {
              tasks: newTasks,
              phase: r.phase === 'working' && !hasRemainingTasks ? 'done' : r.phase,
            };
          }),

        updateTaskStatus: (taskId, status, roomId) =>
          patchRoom(roomId, (r) => {
            const task = r.tasks.find((t) => t.id === taskId);
            if (!task) return {};
            // Safety check: Cannot move back to 'in_progress' or 'on_hold' if already 'done'
            if (task.status === 'done' && (status === 'in_progress' || status === 'on_hold')) return {};
            return {
              tasks: r.tasks.map((t) => (t.id === taskId ? { ...t, status, updatedAt: Date.now() } : t)),
            };
          }),

        submitTaskForReview: (taskId, draftOutput, roomId) =>
          patchRoom(roomId, (r) => ({
            tasks: r.tasks.map((t) =>
              t.id === taskId ? { ...t, status: 'on_hold', draftOutput, updatedAt: Date.now() } : t
            ),
          })),

        approveTask: (taskId, roomId) => {
          const rid = roomId ?? activeRoomId();
          const task = roomOf(rid).tasks.find(t => t.id === taskId);
          if (task) useUiStore.getState().setAgentStatus(rid, task.assignedAgentId, 'idle');

          patchRoom(rid, (r) => ({
            tasks: r.tasks.map((t) =>
              t.id === taskId ? {
                ...t,
                status: 'done',
                output: t.draftOutput || t.output,
                revisions: t.draftOutput
                  ? [...t.revisions, { output: t.draftOutput, timestamp: Date.now() }]
                  : t.revisions,
                draftOutput: undefined,
                updatedAt: Date.now()
              } : t
            ),
          }));
        },

        rejectTask: (taskId, comments, roomId) => {
          // 担任の指摘は教材フォルダの記憶に残す（次からは最初からそうなるように）。
          // 失敗しても差し戻し自体は成立させたいので、待たずに投げっぱなしにする。
          void appendMemoryNote(comments);

          const rid = roomId ?? activeRoomId();
          const task = roomOf(rid).tasks.find(t => t.id === taskId);
          if (!task) return;
          useUiStore.getState().setAgentStatus(rid, task.assignedAgentId, 'idle');

          patchRoom(rid, (r) => {
            const history = r.agentHistories[task.assignedAgentId] || [];
            return {
              tasks: r.tasks.map((t) =>
                t.id === taskId ? {
                  ...t,
                  status: 'scheduled',
                  reviewComments: comments,
                  revisions: t.draftOutput
                    ? [...t.revisions, { output: t.draftOutput, feedback: comments, timestamp: Date.now() }]
                    : t.revisions,
                  draftOutput: undefined,
                  updatedAt: Date.now()
                } : t
              ),
              agentHistories: {
                ...r.agentHistories,
                [task.assignedAgentId]: [
                  ...history,
                  { role: 'user' as const, content: `Rejected. Reason: ${comments}` },
                ]
              }
            };
          });
        },

        setTaskOutput: (taskId, output, roomId) =>
          patchRoom(roomId, (r) => ({
            tasks: r.tasks.map((t) => (t.id === taskId ? { ...t, output, updatedAt: Date.now() } : t)),
          })),

        addLogEntry: (entry, roomId) =>
          patchRoom(roomId, (r) => ({
            actionLog: [...r.actionLog, { ...entry, id: `log_${uid()}`, timestamp: Date.now() }],
          })),

        addRequestLog: (entry, roomId) =>
          patchRoom(roomId, (r) => {
            const newEntry: DebugLogEntry = {
              ...entry,
              id: `debug_${uid()}`,
              timestamp: Date.now(),
              phase: 'request',
              status: 'completed'
            };
            const updated = [...r.debugLog, newEntry];
            return { debugLog: updated.length > 30 ? updated.slice(-30) : updated };
          }),

        addResponseLog: (entry, roomId) =>
          patchRoom(roomId, (r) => {
            const newEntry: DebugLogEntry = {
              ...entry,
              id: `debug_${uid()}`,
              timestamp: Date.now(),
              phase: 'response',
              status: 'completed'
            };
            const updated = [...r.debugLog, newEntry];

            let nextTotalUsage = r.totalTokenUsage;
            let nextAgentUsage = { ...r.agentTokenUsage };
            let nextTotalCost = r.totalEstimatedCost;
            let nextAgentCost = { ...r.agentEstimatedCost };

            if (entry.usage) {
              const modelName = entry.raw?.model || useUiStore.getState().llmConfig.model;
              const durationOrCount = entry.raw?.duration || entry.raw?.count;
              const callCost = calculateCost(entry.usage.promptTokens, entry.usage.completionTokens, modelName, durationOrCount);

              nextTotalCost += callCost;
              nextAgentCost[entry.agentIndex] = (r.agentEstimatedCost[entry.agentIndex] || 0) + callCost;

              nextTotalUsage = {
                promptTokens: r.totalTokenUsage.promptTokens + entry.usage.promptTokens,
                completionTokens: r.totalTokenUsage.completionTokens + entry.usage.completionTokens,
                totalTokens: r.totalTokenUsage.totalTokens + entry.usage.totalTokens
              };

              const currentAgentUsage = r.agentTokenUsage[entry.agentIndex] || { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
              nextAgentUsage[entry.agentIndex] = {
                promptTokens: currentAgentUsage.promptTokens + entry.usage.promptTokens,
                completionTokens: currentAgentUsage.completionTokens + entry.usage.completionTokens,
                totalTokens: currentAgentUsage.totalTokens + entry.usage.totalTokens
              };
            }

            return {
              debugLog: updated.length > 30 ? updated.slice(-30) : updated,
              totalTokenUsage: nextTotalUsage,
              agentTokenUsage: nextAgentUsage,
              totalEstimatedCost: nextTotalCost,
              agentEstimatedCost: nextAgentCost
            };
          }),

        appendAgentHistory: (agentIndex, role, parts, roomId) =>
          patchRoom(roomId, (r) => ({
            agentHistories: {
              ...r.agentHistories,
              [agentIndex]: [
                ...(r.agentHistories[agentIndex] ?? []),
                {
                  role,
                  content: Array.isArray(parts) ? parts.map(p => typeof p === 'string' ? p : JSON.stringify(p)).join(' ') : String(parts),
                },
              ],
            },
          })),

        setAgentSummary: (agentIndex, summary, roomId) =>
          patchRoom(roomId, (r) => ({
            agentSummaries: { ...r.agentSummaries, [agentIndex]: summary }
          })),

        appendBoardroomHistory: (taskId, role, parts, roomId) =>
          patchRoom(roomId, (r) => ({
            boardroomHistories: {
              ...r.boardroomHistories,
              [taskId]: [
                ...(r.boardroomHistories[taskId] ?? []),
                {
                  role,
                  content: Array.isArray(parts) ? parts.map(p => typeof p === 'string' ? p : JSON.stringify(p)).join(' ') : String(parts),
                },
              ],
            },
          })),

        clearAllHistories: (roomId) => patchRoom(roomId, () => ({ agentHistories: {}, boardroomHistories: {} })),

        setKanbanOpen: (open) => set({ isKanbanOpen: open }),
        setLogOpen: (open, filterAgent = null) =>
          set({ isLogOpen: open, logFilterAgentIndex: filterAgent ?? null }),
        setFinalOutputOpen: (open, roomId) => patchRoom(roomId, () => ({ isFinalOutputOpen: open })),
        setIsResizing: (resizing) => set({ isResizing: resizing }),

        setAgentHistory: (agentIndex, history, roomId) =>
          patchRoom(roomId, (r) => ({
            agentHistories: { ...r.agentHistories, [agentIndex]: history }
          })),
      };
    },
    {
      name: 'core-storage',
      storage: createJSONStorage(() => localStorage),
      partialize: () => ({}),
    }
  )
)

/**
 * React の外（エージェント・サービス層）から部屋の状態を読む。
 * roomId を省略すると「いま見ている部屋」。エージェント側は必ず自分の部屋を渡すこと。
 */
export function getRoom(roomId?: string): RoomState {
  return useCoreStore.getState().rooms[roomId ?? activeRoomId()] ?? EMPTY_ROOM;
}

/** React から部屋の状態を読む。roomId 省略時は「いま見ている部屋」を追いかける。 */
export function useRoom(roomId?: string): RoomState {
  const activeId = useTeamStore((s) => s.selectedAgentSetId);
  const rid = roomId ?? activeId;
  const room = useCoreStore((s) => s.rooms[rid]);
  return room ?? EMPTY_ROOM;
}

// 以前はここに「チームを切り替えたら resetProject() する」購読があった。
// 部屋ごとに状態を持つ今、切り替えで消すものは無い。仕事は部屋の中で生き続ける。

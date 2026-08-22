import { LLMMessage } from '../llm/types';
import { isBridgeConnected } from '../../integration/store/bridgeStore';
import { listFiles, readFile, writeFile } from './tools/fileTools';
import { setUserBrief } from './tools/setUserBrief';
import { proposeTask } from './tools/proposeTask';
import { completeTask } from './tools/completeTask';
import { deliverProject } from './tools/deliverProject';

export interface ToolCall {
  name: string;
  args: any;
}

/**
 * Interface that decuples the ToolRegistry from the 3D Simulation (AgentHost).
 * This allows the tool logic to be tested and used independently of the simulation.
 */
export interface AgentActionContext {
  data: { index: number; name: string, subagents?: any[], humanInTheLoop?: boolean };
  setState: (state: 'idle' | 'moving' | 'working' | 'on_hold' | 'talking') => void;
  appendHistory: (message: LLMMessage) => void;
}

export class ToolRegistry {
  /**
   * Processes a tool call by dispatching it to the appropriate tool handler.
   *
   * Returns a boolean for the store-mutating tools, or a string for tools whose
   * payload the agent needs to read back (the file tools). AgentBrain sends a
   * returned string on as the tool_result content.
   */
  public static process(agent: AgentActionContext, toolCall: ToolCall): boolean | Promise<string | boolean> {
    const { name, args } = toolCall;

    switch (name) {
      case 'list_files':
        return listFiles(args);
      case 'read_file':
        return readFile(args);
      case 'write_file':
        return writeFile(args);
      case 'set_user_brief':
        return setUserBrief(agent, args);
      case 'propose_task':
        return proposeTask(agent, args);
      case 'complete_task':
        return completeTask(agent, args);
      case 'deliver_project':
        return deliverProject(agent, args);
      default:
        console.warn(`[ToolRegistry] Unknown tool: ${name}`);
        return false;
    }
  }

  public static getDefinitions(agentIndex: number, phase: string, subagentsCount: number = 0): any[] {
    const isLead = agentIndex === 1;
    const isManager = subagentsCount > 0;
    const tools: any[] = [];

    // 0. Teaching-materials folder (only when the local bridge is running).
    //    Reading is allowed in every phase — the lead needs the class profile
    //    while the brief is still being discussed. Writing is working-phase only.
    if (isBridgeConnected()) {
      tools.push(
        {
          type: 'function',
          function: {
            name: 'list_files',
            description: '教材フォルダの中身を一覧する。去年の教材や共通資料を探すときに使う。',
            parameters: {
              type: 'object',
              properties: {
                dir: { type: 'string', description: 'フォルダの相対パス。省略時はルート。例: 01_教材/算数' }
              }
            }
          }
        },
        {
          type: 'function',
          function: {
            name: 'read_file',
            description:
              '教材フォルダのファイルを読む。学級の実態（00_共通/学級の実態.md）、自立活動の区分・項目の一次資料、' +
              '去年の教材などは、推測せず必ずこれで読むこと。',
            parameters: {
              type: 'object',
              properties: { path: { type: 'string', description: 'ファイルの相対パス' } },
              required: ['path']
            }
          }
        }
      );

      if (phase === 'working') {
        tools.push({
          type: 'function',
          function: {
            name: 'write_file',
            description:
              '成果物を教材フォルダに保存する。既存ファイルは .bak に退避される。' +
              'printTemplate を指定すると印刷用 HTML も書き出す。',
            parameters: {
              type: 'object',
              properties: {
                path: { type: 'string', description: '保存先の相対パス。例: 01_教材/算数/かさ/A児_かさ.md' },
                content: { type: 'string', description: 'ファイルの中身（Markdown）' },
                printTemplate: {
                  type: 'string',
                  enum: ['plain', 'grid', 'trace', 'spaced', 'one-task'],
                  description: '印刷用テンプレート。マス目=grid、なぞり書き=trace、分かち書き=spaced、1課題1ページ=one-task'
                }
              },
              required: ['path', 'content']
            }
          }
        });
      }
    }

    // 1. Idle Phase: Only Lead can set the brief
    if (phase === 'idle') {
      if (isLead) {
        tools.push({
          type: 'function',
          function: {
            name: 'set_user_brief',
            description: 'Start project with brief.',
            parameters: {
              type: 'object',
              properties: { brief: { type: 'string' } },
              required: ['brief']
            }
          }
        });
      }
      return tools;
    }

    // 2. Working Phase: Common tools for everyone
    if (phase === 'working') {
      if (isLead || isManager) {
        tools.push({
          type: 'function',
          function: {
            name: 'propose_task',
            description: 'Assign task to agent.',
            parameters: {
              type: 'object',
              properties: {
                title: { type: 'string' },
                description: { type: 'string' },
                agentId: { type: 'integer', description: 'Agent index' },
                requiresApproval: { type: 'boolean' }
              },
              required: ['title', 'description', 'agentId']
            }
          }
        });
      }

      tools.push(
        {
          type: 'function',
          function: {
            name: 'complete_task',
            description: 'Finish task. Output must be raw content, no introductions or credit for the work.',
            parameters: {
              type: 'object',
              properties: {
                taskId: { type: 'string' },
                output: { type: 'string', description: 'Task result in Markdown (e.g. code blocks, text, or research).' }
              },
              required: ['taskId', 'output']
            }
          }
        },
      );

      if (isLead) {
        tools.push({
          type: 'function',
          function: {
            name: 'deliver_project',
            description: 'Final delivery of the full project results.',
            parameters: {
              type: 'object',
              properties: { 
                output: { 
                  type: 'string', 
                  description: 'Full project document in Markdown. NO attribution needed.' 
                } 
              },
              required: ['output']
            }
          }
        });
      }
    }

    return tools;
  }
}

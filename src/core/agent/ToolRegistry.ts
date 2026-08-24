import { LLMMessage } from '../llm/types';
import { getBridgeRoots, isBridgeConnected } from '../../integration/store/bridgeStore';
import { generateDrill, listFiles, readFile, searchFiles, writeFile } from './tools/fileTools';
import { setUserBrief } from './tools/setUserBrief';
import { proposeTask } from './tools/proposeTask';
import { completeTask } from './tools/completeTask';
import { deliverProject } from './tools/deliverProject';
import { assignableRoomList, canSetWorkPlan, setWorkPlan } from './tools/setWorkPlan';

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
  /** この担当が属する部屋。タスクや履歴は必ずこの部屋に書く。 */
  roomId: string;
  setState: (state: 'idle' | 'moving' | 'working' | 'on_hold' | 'talking') => void;
  appendHistory: (message: LLMMessage) => void;
}

/**
 * web 検索を渡すエージェント。
 *
 * 評価担当は学習指導要領の本文を確かめるためだけに使うので、文部科学省に限定する。
 * 資料集め担当は実践事例を探すため制限しないが、回数で歯止めをかける。
 */
const WEB_SEARCH_AGENTS: Record<string, { maxUses: number; allowedDomains?: string[] }> = {
  'sn-unit-rubric': { maxUses: 5, allowedDomains: ['mext.go.jp'] },
  'sn-unit-source': { maxUses: 8 },
  'sn-board-research': { maxUses: 6 }
};

export class ToolRegistry {
  /**
   * Processes a tool call by dispatching it to the appropriate tool handler.
   *
   * Returns a boolean for the store-mutating tools, or a string for tools whose
   * payload the agent needs to read back (the file tools). AgentBrain sends a
   * returned string on as the tool_result content.
   */
  public static process(
    agent: AgentActionContext,
    toolCall: ToolCall
  ): boolean | string | Promise<string | boolean> {
    const { name, args } = toolCall;

    switch (name) {
      case 'list_files':
        return listFiles(args);
      case 'read_file':
        return readFile(args);
      case 'search_files':
        return searchFiles(args);
      case 'write_file':
        return writeFile(args);
      case 'generate_drill':
        return generateDrill(args);
      case 'set_user_brief':
        return setUserBrief(agent, args);
      case 'propose_task':
        return proposeTask(agent, args);
      case 'complete_task':
        return completeTask(agent, args);
      case 'deliver_project':
        return deliverProject(agent, args);
      case 'set_work_plan':
        return setWorkPlan(agent, args);
      default:
        console.warn(`[ToolRegistry] Unknown tool: ${name}`);
        return false;
    }
  }

  public static getDefinitions(
    agentIndex: number,
    phase: string,
    subagentsCount: number = 0,
    agentId?: string
  ): any[] {
    const isLead = agentIndex === 1;
    const isManager = subagentsCount > 0;
    const tools: any[] = [];

    // Anthropic のサーバ側 web 検索。使えるのは根拠を要する2人だけに絞る。
    // 全員に渡すと、教材づくりの最中に不要な検索が走って費用と時間を食う。
    const search = WEB_SEARCH_AGENTS[agentId || ''];
    if (search && phase === 'working') {
      tools.push({
        type: 'server',
        server: {
          type: 'web_search_20260209',
          name: 'web_search',
          max_uses: search.maxUses,
          ...(search.allowedDomains ? { allowed_domains: search.allowedDomains } : {})
        }
      });
    }

    // 0. Teaching-materials folder (only when the local bridge is running).
    //    Reading is allowed in every phase — the lead needs the class profile
    //    while the brief is still being discussed. Writing is working-phase only.
    if (isBridgeConnected()) {
      // 参照フォルダ（Obsidian の保管庫など）があれば、どこを見られるかを説明に載せる。
      // 名前を知らせないと、エージェントは教材フォルダしか見に行かない。
      const roots = getBridgeRoots();
      const refs = roots.filter((r) => !r.writable).map((r) => r.name);
      const rootNames = roots.map((r) => r.name);
      const rootHint = refs.length
        ? `フォルダ名を root で選べる（${rootNames.join(' / ')}）。省略すると教材フォルダ。` +
          `${refs.join('・')} はCEOの資料で、読むだけ（書き込みはできない）。`
        : '';

      tools.push(
        {
          type: 'function',
          function: {
            name: 'list_files',
            description: `教材フォルダの中身を一覧する。去年の教材や共通資料を探すときに使う。${rootHint}`,
            parameters: {
              type: 'object',
              properties: {
                dir: { type: 'string', description: 'フォルダの相対パス。省略時はルート。例: 01_教材/算数' },
                ...(refs.length ? { root: { type: 'string', enum: rootNames, description: '見るフォルダ。省略時は教材' } } : {})
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
              `去年の教材などは、推測せず必ずこれで読むこと。${rootHint}`,
            parameters: {
              type: 'object',
              properties: {
                path: { type: 'string', description: 'ファイルの相対パス' },
                ...(refs.length ? { root: { type: 'string', enum: rootNames, description: '読むフォルダ。省略時は教材' } } : {})
              },
              required: ['path']
            }
          }
        }
      );

      if (refs.length) {
        tools.push({
          type: 'function',
          function: {
            name: 'search_files',
            description:
              `フォルダ全体から語を探す。${refs.join('・')} は数千ファイルになりうるので、` +
              '一覧を見るのではなくここで探す。当たった箇所の前後だけ返るので、' +
              '必要なものを read_file で読む。語を複数書くと「すべて含む」で絞られる。',
            parameters: {
              type: 'object',
              properties: {
                query: { type: 'string', description: '探す語。空白区切りで複数指定できる' },
                root: { type: 'string', enum: rootNames, description: '探すフォルダ。省略時は教材' },
                limit: { type: 'integer', description: '返す件数。既定20、最大50' }
              },
              required: ['query']
            }
          }
        });
      }

      if (phase === 'working') {
        tools.push({
          type: 'function',
          function: {
            name: 'generate_drill',
            description:
              '反復練習のプリントを作る。計算問題を自分で並べてはいけない — 出題条件（型）をここに渡すと、' +
              '数値の組み合わせと検算はブリッジ側が決定的に行う。児童用と解答は別ファイルになる。',
            parameters: {
              type: 'object',
              properties: {
                path: { type: 'string', description: '保存先の相対パス（.md）' },
                title: { type: 'string' },
                count: { type: 'integer', description: '問題数。既定20' },
                seed: { type: 'integer', description: '同じ値なら同じ問題が出る。省略時はランダム' },
                columns: { type: 'integer', description: '1行あたりの問題数（1〜4）。既定2' },
                printTemplate: { type: 'string', enum: ['plain', 'grid', 'trace', 'spaced', 'one-task'] },
                spec: {
                  type: 'object',
                  description: '出題条件',
                  properties: {
                    kind: { type: 'string', enum: ['add', 'sub', 'mul', 'div'] },
                    a: { type: 'object', properties: { min: { type: 'integer' }, max: { type: 'integer' } } },
                    b: { type: 'object', properties: { min: { type: 'integer' }, max: { type: 'integer' } } },
                    carry: { type: 'boolean', description: 'たし算の繰り上がりを必須/禁止にする' },
                    borrow: { type: 'boolean', description: 'ひき算の繰り下がりを必須/禁止にする' },
                    tables: { type: 'array', items: { type: 'integer' }, description: 'かけ算で使う段の限定' },
                    answerMax: { type: 'integer' },
                    answerMin: { type: 'integer' },
                    noZero: { type: 'boolean' }
                  },
                  required: ['kind']
                }
              },
              required: ['path', 'spec']
            }
          }
        });

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
      // 段取りの登録は秘書室のタスク設計担当（と秘書長）だけ。
      // ほかの部門に渡すと、作る側が自分で順序を決めてしまい、統括が意味を失う
      if (canSetWorkPlan(agentId)) {
        tools.push({
          type: 'function',
          function: {
            name: 'set_work_plan',
            description:
              'この案件の段取りを登録する。検査に通れば単元構成案とシステム設計図が作られ、CEOの承認待ちになる。' +
              `使える部門: ${assignableRoomList()}`,
            parameters: {
              type: 'object',
              properties: {
                steps: {
                  type: 'array',
                  description: '工程の一覧。依存の無いものは同じ parallelGroup にして同時に動かす。',
                  items: {
                    type: 'object',
                    properties: {
                      id: { type: 'string', description: '工程の短いID（s1, s2 …）' },
                      roomId: { type: 'string', description: '担当する部門のID' },
                      title: { type: 'string', description: 'この工程で出すもの。依頼票の成果物名と揃える' },
                      brief: { type: 'string', description: 'その部門への依頼文' },
                      dependsOn: {
                        type: 'array',
                        items: { type: 'string' },
                        description: '先に終わっているべき工程のID'
                      },
                      parallelGroup: { type: 'integer', description: '同じ番号は同時に動く' },
                      doneCondition: {
                        type: 'string',
                        description: '終わったと言える条件。品質管理の合格基準になるので必ず書く'
                      }
                    },
                    required: ['id', 'roomId', 'title', 'doneCondition']
                  }
                }
              },
              required: ['steps']
            }
          }
        });
      }

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

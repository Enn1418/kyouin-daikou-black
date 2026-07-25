/**
 * Claude API–ready configuration for the "教員代行努ブラック" team's 8 departments
 * (リサーチ部・アイデア研究所・カリキュラム設計部・授業デザイン部・
 *  児童理解・つまずき対策部・教材開発部・評価部・QA・監査部).
 *
 * Each entry mirrors the fields Anthropic's Messages/Agents API expects
 * (`model`, `system`, `max_tokens`) so it can be spread directly into a
 * `client.messages.create({...cfg, messages})` call. Derived from the
 * single source of truth in `src/data/agents.ts` so the prompts never
 * drift out of sync with what the 3D simulation actually uses.
 */
import { AGENTIC_SETS } from '../data/agents';
import { DEFAULT_MODELS } from '../core/llm/constants';

export interface ClaudeAgentConfig {
  id: string;
  name: string;
  model: string;
  system: string;
  max_tokens: number;
}

const TEAM_ID = 'teacher-proxy-black';
const MAX_OUTPUT_TOKENS = 16000;

const team = AGENTIC_SETS.find(s => s.id === TEAM_ID);
const departmentNodes = team?.leadAgent.subagents ?? [];

export const DEPARTMENT_AGENTS: ClaudeAgentConfig[] = departmentNodes.map(dept => ({
  id: dept.id,
  name: dept.name,
  model: dept.model || DEFAULT_MODELS.text,
  system: dept.description,
  max_tokens: MAX_OUTPUT_TOKENS
}));

export function getDepartmentAgent(id: string): ClaudeAgentConfig | undefined {
  return DEPARTMENT_AGENTS.find(a => a.id === id);
}

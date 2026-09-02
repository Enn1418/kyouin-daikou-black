export type LLMRole = 'system' | 'user' | 'assistant' | 'tool';

export interface LLMMessage {
  role: LLMRole;
  content: string;
  name?: string; // Required for tool responses in some APIs
  tool_calls?: LLMToolCall[];
  images?: string[]; // Optional base64 images
  metadata?: {
    internal?: boolean;
    [key: string]: any;
  };
}

export interface LLMToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string; // JSON string
  };
}

export interface LLMToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: any; // JSON Schema
  };
}

/**
 * Anthropic のサーバ側ツール（web_search など）。
 *
 * こちらで実行するものではなく、定義をそのまま渡してあちら側で走らせる。
 * 形が普通のツールと違うので、変換せず素通しする必要がある。
 */
export interface LLMServerToolDefinition {
  type: 'server';
  /** Anthropic の tools 配列にそのまま入れる中身。 */
  server: Record<string, any>;
}

export type LLMAnyToolDefinition = LLMToolDefinition | LLMServerToolDefinition;

export function isServerTool(t: LLMAnyToolDefinition): t is LLMServerToolDefinition {
  return (t as LLMServerToolDefinition).type === 'server';
}

export interface LLMConfig {
  apiKey?: string;
  geminiApiKey?: string;
  baseUrl?: string;
  model: string;
}

export interface LLMRequestDetails {
  contents: any[];
  systemInstruction?: string;
  tools?: any[];
}

export interface LLMTokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface LLMResponse {
  content: string | null;
  tool_calls?: LLMToolCall[];
  usage?: LLMTokenUsage;
  finishReason?: string;
  raw?: any; // The original provider response
  request?: LLMRequestDetails;
}

export interface LLMProvider {
  generateCompletion(
    messages: LLMMessage[],
    tools?: LLMAnyToolDefinition[],
    systemInstruction?: string,
    modelName?: string
  ): Promise<LLMResponse>;
}

import Anthropic from '@anthropic-ai/sdk';
import { LLMAnyToolDefinition, LLMMessage, LLMProvider, LLMResponse, LLMToolCall, isServerTool } from '../types';
import { DEFAULT_MODELS } from '../constants';

const MAX_OUTPUT_TOKENS = 16000;

export class ClaudeProvider implements LLMProvider {
  private client: Anthropic;

  constructor(private apiKey: string) {
    // BYOK: the key lives in the browser and is sent directly to Anthropic from there.
    this.client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
  }

  async generateCompletion(
    messages: LLMMessage[],
    tools?: LLMAnyToolDefinition[],
    systemInstruction?: string,
    modelName: string = DEFAULT_MODELS.text
  ): Promise<LLMResponse> {
    const claudeMessages = this.mapMessagesToClaude(messages);
    // サーバ側ツール（web_search）は形が違うので変換せずそのまま渡す。
    const claudeTools = tools?.map(t =>
      isServerTool(t)
        ? t.server
        : {
            name: t.function.name,
            description: t.function.description,
            input_schema: t.function.parameters || { type: 'object', properties: {} }
          }
    ) as any;

    console.log('sent to Claude');
    console.log('messages--------', claudeMessages);
    console.log('systemInstruction--------', systemInstruction);
    console.log('tools--------', claudeTools);

    const result = await this.client.messages.create({
      model: modelName,
      max_tokens: MAX_OUTPUT_TOKENS,
      system: systemInstruction,
      messages: claudeMessages,
      tools: claudeTools
    });

    console.log('received from Claude');
    console.log('result--------', result);

    let contentStr: string | null = null;
    const toolCalls: LLMToolCall[] = [];

    for (const block of result.content) {
      if (block.type === 'text') {
        contentStr = (contentStr || '') + block.text;
      } else if (block.type === 'tool_use') {
        toolCalls.push({
          id: block.id,
          type: 'function',
          function: {
            name: block.name,
            arguments: JSON.stringify(block.input)
          }
        });
      }
    }

    const usage = result.usage ? {
      promptTokens: result.usage.input_tokens || 0,
      completionTokens: result.usage.output_tokens || 0,
      totalTokens: (result.usage.input_tokens || 0) + (result.usage.output_tokens || 0)
    } : undefined;

    return {
      content: contentStr,
      tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
      usage,
      finishReason: result.stop_reason || undefined,
      raw: result,
      request: {
        contents: claudeMessages,
        systemInstruction,
        tools: claudeTools
      }
    };
  }

  private mapMessagesToClaude(messages: LLMMessage[]): Anthropic.MessageParam[] {
    const mapped: Anthropic.MessageParam[] = messages
      .filter(m => m.role !== 'system')
      .map(m => {
        const role: 'user' | 'assistant' = m.role === 'assistant' ? 'assistant' : 'user';
        const content: Anthropic.ContentBlockParam[] = [];

        if (m.role === 'tool' && m.name) {
          // Best-effort mapping: LLMMessage doesn't carry the originating tool_use_id today.
          content.push({
            type: 'tool_result',
            tool_use_id: m.name,
            content: m.content
          });
          return { role: 'user', content };
        }

        if (m.content) {
          content.push({ type: 'text', text: m.content });
        }

        if (m.tool_calls) {
          for (const tc of m.tool_calls) {
            content.push({
              type: 'tool_use',
              id: tc.id,
              name: tc.function.name,
              input: JSON.parse(tc.function.arguments)
            });
          }
        }

        if (m.images) {
          for (const img of m.images) {
            const base64Match = img.match(/^data:(image\/[a-z]+);base64,(.+)$/);
            if (base64Match) {
              content.push({
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: base64Match[1] as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
                  data: base64Match[2]
                }
              });
            } else {
              content.push({
                type: 'image',
                source: { type: 'base64', media_type: 'image/jpeg', data: img }
              });
            }
          }
        }

        return { role, content };
      });

    // Anthropic requires strictly alternating user/assistant turns. Merge
    // adjacent same-role messages (e.g. several tool_result entries in a
    // row) instead of sending them as separate messages.
    const merged: Anthropic.MessageParam[] = [];
    for (const msg of mapped) {
      const last = merged[merged.length - 1];
      if (last && last.role === msg.role) {
        (last.content as Anthropic.ContentBlockParam[]).push(...(msg.content as Anthropic.ContentBlockParam[]));
      } else {
        merged.push(msg);
      }
    }
    return merged;
  }
}

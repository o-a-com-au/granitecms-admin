import type Anthropic from '@anthropic-ai/sdk';
import type { AssistantModel } from './model.ts';
import { ToolError, type AssistantTool, type ToolContext } from './tools.ts';

// What the chat panel receives, one per line, as the assistant works.
export type AssistantEvent =
  | { type: 'text'; text: string }
  | { type: 'tool'; label: string }
  | { type: 'done' }
  | { type: 'error'; message: string };

export interface AssistantUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export interface RunAssistantOptions {
  model: AssistantModel;
  tools: AssistantTool[];
  toolContext: ToolContext;
  system: string;
  messages: Anthropic.MessageParam[];
  emit: (event: AssistantEvent) => void;
  signal?: AbortSignal;
  // Calls to Claude per message the person sends, so one request can't
  // run away (each tool round is one more call).
  maxSteps?: number;
}

const DEFAULT_MAX_STEPS = 12;
// A tool result bigger than this is cut short: a few very large pages
// would otherwise fill the conversation.
const MAX_TOOL_RESULT_CHARS = 60_000;

function serialiseResult(value: unknown): string {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return text.length > MAX_TOOL_RESULT_CHARS ? `${text.slice(0, MAX_TOOL_RESULT_CHARS)}\n[cut short: too long to show in full]` : text;
}

async function runTool(
  tools: AssistantTool[],
  context: ToolContext,
  call: Anthropic.ToolUseBlock,
  emit: RunAssistantOptions['emit'],
): Promise<Anthropic.ToolResultBlockParam> {
  const tool = tools.find((candidate) => candidate.definition.name === call.name);
  const input = (typeof call.input === 'object' && call.input !== null ? call.input : {}) as Record<string, unknown>;
  if (!tool) {
    return { type: 'tool_result', tool_use_id: call.id, content: `There is no tool called ${call.name}.`, is_error: true };
  }
  emit({ type: 'tool', label: tool.label(input) });
  try {
    return { type: 'tool_result', tool_use_id: call.id, content: serialiseResult(await tool.run(context, input)) };
  } catch (error) {
    const message = error instanceof ToolError ? error.message : 'The website could not be reached.';
    return { type: 'tool_result', tool_use_id: call.id, content: message, is_error: true };
  }
}

// One message from the person, answered: Claude replies, calling tools
// as it needs them, until it has finished (or hits maxSteps). Text is
// streamed as it's written. Model failures are thrown for the caller to
// describe; tool failures go back to Claude to deal with.
export async function runAssistant(options: RunAssistantOptions): Promise<AssistantUsage> {
  const { model, tools, toolContext, system, emit, signal } = options;
  const messages = [...options.messages];
  const usage: AssistantUsage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };
  const maxSteps = options.maxSteps ?? DEFAULT_MAX_STEPS;
  let wroteText = false;

  for (let step = 0; step < maxSteps; step += 1) {
    // Text from a later step starts a new paragraph rather than running
    // on from what was written before the tool calls.
    let startOfStep = true;
    const reply = await model.send(
      { system, messages, tools: tools.map((tool) => tool.definition) },
      (text) => {
        emit({ type: 'text', text: startOfStep && wroteText ? `\n\n${text}` : text });
        startOfStep = false;
        wroteText = true;
      },
      signal,
    );
    usage.inputTokens += reply.usage.input_tokens;
    usage.outputTokens += reply.usage.output_tokens;
    usage.cacheReadTokens += reply.usage.cache_read_input_tokens ?? 0;
    usage.cacheWriteTokens += reply.usage.cache_creation_input_tokens ?? 0;

    const calls = reply.content.filter((block): block is Anthropic.ToolUseBlock => block.type === 'tool_use');
    if (reply.stop_reason !== 'tool_use' || calls.length === 0) {
      return usage;
    }
    messages.push({ role: 'assistant', content: reply.content });
    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const call of calls) {
      if (signal?.aborted) {
        return usage;
      }
      results.push(await runTool(tools, toolContext, call, emit));
    }
    messages.push({ role: 'user', content: results });
  }

  emit({ type: 'text', text: `${wroteText ? '\n\n' : ''}I've stopped there, as that took more steps than I'm allowed for one message. Ask me to carry on if you'd like.` });
  return usage;
}

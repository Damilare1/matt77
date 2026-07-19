import Anthropic from '@anthropic-ai/sdk';
import config from '../../config/config.js';

const client = new Anthropic({ apiKey: config.ANTHROPIC_API_KEY });
const MAX_TOKEN = 4000;

// Strip OpenAI-specific fields and convert to Anthropic input_schema
const toAnthropicTools = (tools) =>
  tools
    .filter((t) => t.type === 'function')
    .map(({ function: fn }) => {
      const { strict, ...parameters } = fn.parameters ?? {};
      return {
        name: fn.name,
        description: fn.description,
        input_schema: parameters,
      };
    });

// Convert a single message content value to an Anthropic content block array
const toAnthropicContent = (content) => {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content.map((part) => {
      if (part.type === 'text') return { type: 'text', text: part.text };
      if (part.type === 'image_base64') {
        return { type: 'image', source: { type: 'base64', media_type: part.media_type, data: part.data } };
      }
      if (part.type === 'image_url') {
        return { type: 'image', source: { type: 'url', url: part.image_url.url } };
      }
      return { type: 'text', text: JSON.stringify(part) };
    });
  }
  return content ?? '';
};

// Convert OpenAI-format message array to Anthropic messages
const toAnthropicMessages = (messages) => {
  const result = [];

  for (const msg of messages) {
    if (msg.role === 'system') continue;

    if (msg.role === 'assistant' && msg.tool_calls?.length > 0) {
      const parts = [];
      if (msg.content) parts.push({ type: 'text', text: msg.content });
      for (const tc of msg.tool_calls) {
        parts.push({
          type: 'tool_use',
          id: tc.id,
          name: tc.function.name,
          input: JSON.parse(tc.function.arguments),
        });
      }
      result.push({ role: 'assistant', content: parts });
    } else if (msg.role === 'tool') {
      // Group consecutive tool results under a single user message
      const toolResult = {
        type: 'tool_result',
        tool_use_id: msg.tool_call_id,
        content: msg.content,
      };
      const last = result[result.length - 1];
      if (last?.role === 'user' && Array.isArray(last.content) && last.content[0]?.type === 'tool_result') {
        last.content.push(toolResult);
      } else {
        result.push({ role: 'user', content: [toolResult] });
      }
    } else {
      result.push({ role: msg.role, content: toAnthropicContent(msg.content) });
    }
  }

  return result;
};

export const complete = async (context, model, _user_id, tools, systemPrompt) => {
  const messages = JSON.parse(context);

  const response = await client.messages.create({
    model,
    max_tokens: MAX_TOKEN,
    system: systemPrompt,
    messages: toAnthropicMessages(messages),
    tools: toAnthropicTools(tools),
  });

  const usage = {
    input_tokens: response.usage.input_tokens,
    output_tokens: response.usage.output_tokens,
    total_tokens: response.usage.input_tokens + response.usage.output_tokens,
  };

  const toolUseBlocks = response.content.filter((b) => b.type === 'tool_use');
  if (toolUseBlocks.length > 0) {
    return {
      function_call: true,
      tool_calls: toolUseBlocks.map((b) => ({
        id: b.id,
        type: 'function',
        function: { name: b.name, arguments: JSON.stringify(b.input) },
      })),
      content: response.content.find((b) => b.type === 'text')?.text ?? null,
      tokens: usage.total_tokens,
      usage,
    };
  }

  return {
    response: response.content.find((b) => b.type === 'text')?.text ?? '',
    tokens: usage.total_tokens,
    usage,
  };
};

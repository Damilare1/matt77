import { GoogleGenAI } from '@google/genai';
import config from '../../config/config.js';

const genAI = new GoogleGenAI({apiKey: config.GOOGLE_AI_API_KEY});
const MAX_TOKEN = 4000;

// Google requires uppercase type strings in JSON schemas (STRING, OBJECT, ARRAY, etc.)
const toGoogleSchema = (schema) => {
  if (!schema || typeof schema !== 'object') return schema;
  const result = { ...schema };
  if (result.type) result.type = result.type.toUpperCase();
  if (result.properties) {
    result.properties = Object.fromEntries(
      Object.entries(result.properties).map(([k, v]) => [k, toGoogleSchema(v)])
    );
  }
  if (result.items) result.items = toGoogleSchema(result.items);
  return result;
};

const toGoogleTools = (tools) => {
  const declarations = tools
    .filter((t) => t.type === 'function')
    .map(({ function: fn }) => {
      const { strict, ...parameters } = fn.parameters ?? {};
      return { name: fn.name, description: fn.description, parameters: toGoogleSchema(parameters) };
    });
  return declarations.length > 0 ? [{ functionDeclarations: declarations }] : null;
};

// Convert OpenAI-format messages to Google contents array.
// Consecutive tool results are grouped into one user turn as required by Gemini.
const toGoogleContents = (messages) => {
  const contents = [];
  const toolCallNames = {};
  let i = 0;

  while (i < messages.length) {
    const msg = messages[i];

    if (msg.role === 'system') {
      i++;
      continue;
    }

    if (msg.role === 'assistant' && msg.tool_calls?.length > 0) {
      for (const tc of msg.tool_calls) toolCallNames[tc.id] = tc.function.name;
      // Thinking models require the full raw parts (including thought signatures) to be replayed.
      if (msg._raw_model_parts) {
        contents.push({ role: 'model', parts: JSON.parse(msg._raw_model_parts) });
      } else {
        const parts = [];
        if (msg.content) parts.push({ text: msg.content });
        for (const tc of msg.tool_calls) {
          parts.push({ functionCall: { name: tc.function.name, args: JSON.parse(tc.function.arguments) } });
        }
        contents.push({ role: 'model', parts });
      }
    } else if (msg.role === 'tool') {
      const parts = [];
      while (i < messages.length && messages[i].role === 'tool') {
        const m = messages[i];
        parts.push({
          functionResponse: {
            name: toolCallNames[m.tool_call_id] ?? m.tool_call_id,
            response: { result: m.content },
          },
        });
        i++;
      }
      contents.push({ role: 'user', parts });
      continue;
    } else if (Array.isArray(msg.content)) {
      const parts = msg.content.map((p) => {
        if (p.type === 'text') return { text: p.text };
        if (p.type === 'image_base64') return { inlineData: { mimeType: p.media_type, data: p.data } };
        if (p.type === 'image_url') return { text: `[image: ${p.image_url.url}]` };
        return { text: JSON.stringify(p) };
      });
      contents.push({ role: msg.role === 'assistant' ? 'model' : 'user', parts });
    } else {
      contents.push({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: msg.content ?? '' }],
      });
    }

    i++;
  }

  return contents;
};

export const complete = async (context, model, _user_id, tools, systemPrompt) => {
  const messages = JSON.parse(context);

  const googleTools = toGoogleTools(tools);
  const response = await genAI.models.generateContent({
    model,
    contents: toGoogleContents(messages),
    ...(googleTools ? { tools: googleTools } : {}),
    systemInstruction: systemPrompt,
    generationConfig: { maxOutputTokens: MAX_TOKEN },
  });

  const parts = response.candidates?.[0]?.content?.parts ?? [];
  const functionCallParts = parts.filter((p) => p.functionCall);

  const usage = {
    input_tokens: response.usageMetadata?.promptTokenCount ?? 0,
    output_tokens: response.usageMetadata?.candidatesTokenCount ?? 0,
    total_tokens: response.usageMetadata?.totalTokenCount ?? 0,
  };

  if (functionCallParts.length > 0) {
    return {
      function_call: true,
      tool_calls: functionCallParts.map((p, i) => ({
        id: `call_gemini_${i}_${Date.now()}`,
        type: 'function',
        function: { name: p.functionCall.name, arguments: JSON.stringify(p.functionCall.args) },
      })),
      content: parts.find((p) => p.text && !p.thought)?.text ?? null,
      tokens: usage.total_tokens,
      usage,
      _raw_model_parts: JSON.stringify(parts),
    };
  }

  return {
    response: parts.find((p) => p.text)?.text ?? '',
    tokens: usage.total_tokens,
    usage,
  };
};

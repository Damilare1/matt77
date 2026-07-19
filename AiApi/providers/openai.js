import OpenAI from "openai";
import config from "../../config/config.js";

const { AI_KEY } = config;
const openai = new OpenAI({ apiKey: AI_KEY });
const MAX_TOKEN = 4000;

const toOpenAIContent = (content) => {
  if (!Array.isArray(content)) return content;
  return content.map((p) => {
    if (p.type === 'image_base64') {
      return { type: 'image_url', image_url: { url: `data:${p.media_type};base64,${p.data}` } };
    }
    return p;
  });
};

export const complete = async (context, model, user_id, tools, systemPrompt) => {
  const gptContext = JSON.parse(context);
  const requestObj = {
    model,
    messages: [
      { role: "system", content: systemPrompt },
      ...gptContext.map((m) => ({ ...m, content: toOpenAIContent(m.content) }))
    ],
    tools,
    stream: false,
    prompt_cache_key: user_id
  };

  if (model === "gpt-5.1") {
    requestObj['max_completion_tokens'] = MAX_TOKEN;
  } else {
    requestObj['max_tokens'] = MAX_TOKEN;
  }

  console.log(JSON.stringify(requestObj));
  const response = await openai.chat.completions.create(requestObj);
  console.log(JSON.stringify(response));

  const usage = {
    input_tokens: response.usage?.prompt_tokens ?? 0,
    output_tokens: response.usage?.completion_tokens ?? 0,
    total_tokens: response.usage?.total_tokens ?? 0,
  };

  if (response.choices[0].message.tool_calls?.length > 0) {
    return {
      function_call: true,
      tool_calls: response.choices[0].message.tool_calls,
      content: response.choices[0].message.content || null,
      tokens: usage.total_tokens,
      usage,
    };
  }

  return {
    response: response.choices[0].message.content ?? response.choices[0],
    tokens: usage.total_tokens,
    usage,
  };
};

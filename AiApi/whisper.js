import fs from 'fs';
import OpenAI from "openai";
import { GoogleGenAI } from '@google/genai';
import config from "../config/config.js";

const openai = new OpenAI({ apiKey: config.AI_KEY });
const genAI = new GoogleGenAI({apiKey: config.GOOGLE_AI_API_KEY});

const transcribeOpenAI = async (filePath, prompt, model) => {
  const response = await openai.audio.transcriptions.create({
    file: fs.createReadStream(filePath),
    model,
    prompt,
    response_format: 'text',
    temperature: 0.2
  });
  return { response };
};

const transcribeGoogle = async (filePath, prompt, model, mimeType) => {
  const base64 = fs.readFileSync(filePath).toString('base64');
  const response = await genAI.models.generateContent({
    model,
    contents: [{
      role: 'user',
      parts: [
        { inlineData: { mimeType, data: base64 } },
        { text: prompt ? `Transcribe this audio. Additional context: ${prompt}` : 'Transcribe this audio accurately.' }
      ]
    }]
  });
  const parts = response.candidates?.[0]?.content?.parts ?? [];
  return { response: parts.find((p) => p.text)?.text ?? '' };
};

export const aiAudioAssistant = async (
  filePath,
  prompt = "",
  model = "gpt-4o-transcribe",
  mimeType = "audio/ogg"
) => {
  const provider = config.audioModels?.[model]?.provider ?? 'openai';
  if (provider === 'google') return transcribeGoogle(filePath, prompt, model, mimeType);
  return transcribeOpenAI(filePath, prompt, model);
};

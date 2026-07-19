import OpenAI from "openai";
import { GoogleGenAI } from '@google/genai';
import config from "../config/config.js";

const {AI_KEY} = config
const openai = new OpenAI({ apiKey: AI_KEY });
const genAI = new GoogleGenAI({apiKey: config.GOOGLE_AI_API_KEY});

const sizeToAspectRatio = (size) => {
  if (size === '1792x1024') return '16:9';
  if (size === '1024x1792') return '9:16';
  return '1:1';
};

const generateImageOpenAI = async (prompt, model, size, n, user_id) => {
  const response = await openai.images.generate({
    model,
    prompt,
    n,
    size,
    quality: "high",
    user: user_id
  });
  return {
    response: Buffer.from(response.data[0].b64_json, "base64"),
    usage: { output_tokens: response.usage?.output_tokens ?? 0 },
  };
};

const generateImageImagen = async (prompt, model, size) => {
  const response = await genAI.models.generateImages({
    model,
    prompt,
    config: {
      numberOfImages: 1,
      aspectRatio: sizeToAspectRatio(size),
      outputMimeType: 'image/jpeg',
    },
  });
  const imageBytes = response.generatedImages?.[0]?.image?.imageBytes;
  if (!imageBytes) throw new Error('Imagen returned no image data');
  return { response: Buffer.from(imageBytes, 'base64'), usage: { images: 1 } };
};

const generateImageGemini = async (prompt, model, size) => {
  const response = await genAI.models.generateContent({
    model,
    contents: prompt,
    config: {
      imageConfig: {
        aspectRatio: sizeToAspectRatio(size),
        imageSize: size
      }
    }
  });
  for (const part of response.candidates[0].content.parts) {
    if (part.inlineData) {
      return { response: Buffer.from(part.inlineData.data, 'base64'), usage: { images: 1 } };
    }
  }
  throw new Error('Gemini returned no image data');
};

const generateImageGoogle = async (prompt, model, size) => {
  if (model.startsWith('imagen-')) return generateImageImagen(prompt, model, size);
  return generateImageGemini(prompt, model, size);
};

export const aiImageGenerationAssistant = async (
  prompt = "",
  model = "gpt-image-1",
  size = "1024x1024",
  n = 1,
  user_id = ''
) => {
  const provider = config.imageModels?.[model]?.provider ?? 'openai';
  if (provider === 'google') return generateImageGoogle(prompt, model, size);
  return generateImageOpenAI(prompt, model, size, n, user_id);
};

const editImageOpenAI = async (base_image, prompt, model, size, n, mask, user_id) => {
    const parameters = {
        model,
        prompt,
        image: base_image,
        n,
        size,
        quality: "high",
        user: user_id
    };
    if (mask) parameters['mask'] = mask;
    const response = await openai.images.edit(parameters);
    const image_base64 = response.data[0].b64_json;
    return {
      response: Buffer.from(image_base64, "base64"),
      usage: { output_tokens: response.usage?.output_tokens ?? 0 },
    };
};

const editImageImagen = async (base_image, prompt, model) => {
    const arrayBuffer = await base_image.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString('base64');
    const response = await genAI.models.generateImages({
        model,
        prompt,
        referenceImages: [{
            referenceType: 'REFERENCE_TYPE_RAW',
            referenceImage: { imageBytes: base64 },
            referenceId: 1,
        }],
        config: {
            numberOfImages: 1,
            outputMimeType: 'image/jpeg',
        },
    });
    const imageBytes = response.generatedImages?.[0]?.image?.imageBytes;
    if (!imageBytes) throw new Error('Imagen returned no image data');
    return { response: Buffer.from(imageBytes, 'base64'), usage: { images: 1 } };
};

const editImageGemini = async (base_image, prompt, model) => {
    const arrayBuffer = await base_image.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString('base64');
    const response = await genAI.models.generateContent({
        model,
        contents: [{
            role: 'user',
            parts: [
                { inlineData: { mimeType: 'image/png', data: base64 } },
                { text: prompt }
            ]
        }]
    });
    for (const part of response.candidates?.[0]?.content?.parts ?? []) {
        if (part.inlineData) {
            return { response: Buffer.from(part.inlineData.data, 'base64'), usage: { images: 1 } };
        }
    }
    throw new Error('Gemini returned no image data');
};

const editImageGoogle = async (base_image, prompt, model) => {
    if (model.startsWith('imagen-')) return editImageImagen(base_image, prompt, model);
    return editImageGemini(base_image, prompt, model);
};

export const aiImageEditAssistant = async (
    base_image,
    prompt = "",
    model = "gpt-image-1",
    size = "1024x1024",
    n = 1,
    mask = null,
    user_id = ''
) => {
    const provider = config.imageModels?.[model]?.provider ?? 'openai';
    if (provider === 'google') return editImageGoogle(base_image, prompt, model);
    return editImageOpenAI(base_image, prompt, model, size, n, mask, user_id);
};

import OpenAI from "openai";
import { GoogleGenAI } from "@google/genai";
import config from "../config/config.js";
import { createOrPutDynamoDbRecord } from "../DynamoDb/helper.js";

const { AI_KEY } = config;
const openai = new OpenAI({ apiKey: AI_KEY });
const genAI = new GoogleGenAI({ apiKey: config.GOOGLE_AI_API_KEY });

const sizeToAspectRatio = (size) => {
    const [w, h] = (size ?? "720x1280").split('x').map(Number);
    if (w > h) return '16:9';
    if (h > w) return '9:16';
    return '1:1';
};

// ── OpenAI Sora ───────────────────────────────────────────────────────────────

const generateVideoOpenAI = async (prompt, seconds, size, model, contact_id) => {
    const response = await openai.videos.create({
        model,
        prompt,
        seconds,
        size
    });
    await createOrPutDynamoDbRecord(process.env.OpenAI_WIP_TABLE, { ...response, contact_id });
    return response;
};

const generateVideoFromImageOpenAI = async (base_image, prompt, seconds, size, model, contact_id) => {
    const parameters = {
        model,
        prompt,
        input_reference: base_image,
        seconds,
        size
    };
    const response = await openai.videos.create(parameters);
    await createOrPutDynamoDbRecord(process.env.OpenAI_WIP_TABLE, { ...response, contact_id });
    return response;
};

const getVideoStatusOpenAI = async (id) => {
    const video = await openai.videos.retrieve(id);
    const progress = video.progress ?? 0;
    const status = ((s) => {
        switch (s) {
            case 'completed':   return 'Completed';
            case 'failed':      return 'Failed';
            case 'in_progress': return 'In progress';
            case 'queued':      return 'Queued';
            default:            return 'Unknown';
        }
    })(video.status);
    return { progress, status };
};

// ── Google Veo ────────────────────────────────────────────────────────────────

const generateVideoGoogle = async (prompt, seconds, size, model) => {
    const operation = await genAI.models.generateVideos({
        model,
        prompt,
        config: {
            durationSeconds: Number(seconds),
            aspectRatio: sizeToAspectRatio(size),
            numberOfVideos: 1,
        },
    });
    return { id: `google:${operation.name}` };
};

const generateVideoFromImageGoogle = async (base_image, prompt, seconds, size, model) => {
    const arrayBuffer = await base_image.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString('base64');
    const operation = await genAI.models.generateVideos({
        model,
        prompt,
        image: {
            imageBytes: base64,
            mimeType: 'image/png',
        },
        config: {
            durationSeconds: Number(seconds),
            aspectRatio: sizeToAspectRatio(size),
            numberOfVideos: 1,
        },
    });
    return { id: `google:${operation.name}` };
};

const getVideoStatusGoogle = async (operationName) => {
    const operation = await genAI.operations.getVideosOperation({ operation: { name: operationName } });
    if (operation.error) {
        return { progress: 0, status: 'Failed' };
    }
    if (!operation.done) {
        return { progress: 0, status: 'In progress' };
    }
    const sample = operation.response?.generatedSamples?.[0];
    return {
        progress: 100,
        status: 'Completed',
        video_uri: sample?.video?.uri,
    };
};

// ── Exported API ──────────────────────────────────────────────────────────────

export const aiVideoGenerationAssistant = async (
    prompt = "",
    seconds = '4',
    size = "720x1280",
    model = "sora-2",
    contact_id = ""
) => {
    console.log("Video generation request", prompt, seconds, typeof seconds, size);
    const provider = config.videoModels?.[model]?.provider ?? 'openai';
    if (provider === 'google') return generateVideoGoogle(prompt, seconds, size, model);
    return generateVideoOpenAI(prompt, seconds, size, model, contact_id);
};

export const aiVideoGenerationFromImageAssistant = async (
    base_image,
    prompt = "",
    seconds = '4',
    size = "720x1280",
    model = "sora-2",
    contact_id = ""
) => {
    const provider = config.videoModels?.[model]?.provider ?? 'openai';
    if (provider === 'google') return generateVideoFromImageGoogle(base_image, prompt, seconds, size, model);
    return generateVideoFromImageOpenAI(base_image, prompt, seconds, size, model, contact_id);
};

export const aiVideoGenerationStatus = async (id) => {
    if (id?.startsWith('google:')) return getVideoStatusGoogle(id.slice(7));
    return getVideoStatusOpenAI(id);
};

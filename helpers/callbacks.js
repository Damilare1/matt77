import fs from 'fs'
import { Markup } from "telegraf";
import { authenticated } from "./authentication.js";
import config from "../config/config.js";
import { createDirectoryIfNone } from './fsdirectory.js';
import { deleteFile, downloadFile } from './fileDownloader.js';
import functions from './functions.js';
import { createSupportTicket } from '../DynamoDb/support.js';

const MAX_AGENT_ITERATIONS = 10;
const DEFAULT_MONTHLY_TOKENS = 100_000;
const DEFAULT_MAXIMUM_VIDEOS = 10;

const getCurrentMonthKey = () => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
};

export const callbacks = (models = {}) => {
    const { mcpManager } = models;

    const initializeSessionIfNotAvailable = (ctx) => {
        if (!ctx.session) {
            ctx.session = {}
        }
        if (!ctx['user-controls']) {
            ctx['user-controls'] = {
                authenticated: false
            }
        }
    }
    const updateMessageCounter = (ctx) => {
        ctx.session.counter++;
    }
    const setModel = async (ctx, modelId) => {
        ctx.session.model = modelId;
        await ctx.reply(`Model is now set to: ${config.models[modelId]?.name ?? modelId}`);
    };

    const setContext = (ctx, data, participant = "user", tool_call_id = null, tool_calls = null, extra = null) => {
        let context = [];
        try {
            context = JSON.parse(ctx.session.context)
        } catch (e) {
            console.log("Unable to parse context");
        }
        if (tool_call_id) {
            const message = {
                role: "tool",
                tool_call_id,
                content: data
            }
            context.push(message)
        } else {
            let message = { role: participant, content: data }
            if (tool_calls) {
                message.tool_calls = tool_calls;
            }
            if (extra) {
                Object.assign(message, extra);
            }
            context.push(message)
        }
        ctx.session.context = JSON.stringify(context);
        return ctx.session.context;
    }

    const setTokensUsed = (ctx, usage, model = null) => {
        const total = typeof usage === 'number' ? usage : (usage?.total_tokens ?? 0);
        ctx.session.tokens_left = (ctx.session.tokens_left ?? 0) - total;
        if (!model) model = getModel(ctx).model;
        if (!ctx.session.tokens_used) ctx.session.tokens_used = {};
        ctx.session.tokens_used[model] = (ctx.session.tokens_used[model] ?? 0) + total;
    }

    // OpenAI images: usage.output_tokens; Google Imagen: usage.images (count)
    const trackImageUsage = (ctx, usage, model) => {
        if (!ctx.session.tokens_used) ctx.session.tokens_used = {};
        const amount = usage?.output_tokens ?? usage?.images ?? 1;
        ctx.session.tokens_used[model] = (ctx.session.tokens_used[model] ?? 0) + amount;
    };

    // Track seconds used and increment total video count for limit enforcement
    const trackVideoSeconds = (ctx, seconds, model) => {
        if (!ctx.session.video_seconds_used) ctx.session.video_seconds_used = {};
        ctx.session.video_seconds_used[model] = (ctx.session.video_seconds_used[model] ?? 0) + seconds;
        ctx.session.videos_used = (ctx.session.videos_used ?? 0) + 1;
    };

    const canGenerateVideo = (ctx) => {
        const maximum_videos = ctx.session.maximum_videos ?? DEFAULT_MAXIMUM_VIDEOS;
        return (ctx.session.videos_used ?? 0) < maximum_videos;
    };

    const checkAndResetMonthlyTokens = (ctx) => {
        const currentMonth = getCurrentMonthKey();
        if (ctx.session.tokens_reset_month !== currentMonth) {
            const maxTokens = ctx.session.maximum_tokens ?? DEFAULT_MONTHLY_TOKENS;
            ctx.session.tokens_left = maxTokens;
            ctx.session.tokens_used = {};
            ctx.session.video_seconds_used = {};
            ctx.session.videos_used = 0;
            ctx.session.tokens_reset_month = currentMonth;
        }
    };
    const getModel = (ctx) => {
        let model = ctx.session.model;
        if (!model) {
            model = "gpt-4";
            ctx.session.model = model;
        }
        const { context, prevResponses } = ctx.session;
        return { model, context, prevResponses }
    };

    const setModelActionCb = async (ctx) => {
        const modelId = ctx.update.callback_query.data.replace(/^mdl_/, '');
        await setModel(ctx, modelId);
        ctx.answerCbQuery();
    };

    const messageCb = async (ctx, next) => {
        // Use ctx.message
        initializeSessionIfNotAvailable(ctx)
        if (Object.keys(ctx.session).length === 0) {
            const maxToken = DEFAULT_MONTHLY_TOKENS;
            Object.assign(ctx.session, {
                counter: 0,
                model: "gpt-4o",
                context: "",
                prevResponses: "",
                maximum_tokens: maxToken,
                tokens_left: maxToken,
                tokens_used: {},
                video_seconds_used: {},
                videos_used: 0,
                maximum_videos: DEFAULT_MAXIMUM_VIDEOS,
                tokens_reset_month: getCurrentMonthKey(),
            })
            Object.assign(ctx['user-controls'], {
                first_name: ctx.update.message.from.first_name,
                last_name: ctx.update.message.from.last_name,
                full_name: `${ctx.update.message.from.first_name} ${ctx.update.message.from.last_name}`
            })
        } else {
            // Check monthly reset for returning users
            checkAndResetMonthlyTokens(ctx);
        }
        if (authenticated(ctx)) {
            return next();
        }
    };

    const startCb = async (ctx) => {
        if (!authenticated(ctx)) {
            await ctx.leaveChat();
        }
        return ctx.reply(`Hello ${ctx.update.message.from.first_name}!`);
    };

    const joinCb = async (ctx) => {
        authenticated(ctx);
    };

    const getStatsCb = (ctx) => {
        const tokens_left = ctx.session.tokens_left ?? 0;
        const maximum_tokens = ctx.session.maximum_tokens ?? DEFAULT_MONTHLY_TOKENS;
        const tokens_used = ctx.session.tokens_used ?? {};
        const video_seconds_used = ctx.session.video_seconds_used ?? {};
        const videos_used = ctx.session.videos_used ?? 0;
        const maximum_videos = ctx.session.maximum_videos ?? DEFAULT_MAXIMUM_VIDEOS;
        const resetMonth = ctx.session.tokens_reset_month ?? 'unknown';

        let statMessage = `*Token Usage*\n\n`;
        statMessage += `Used: ${maximum_tokens - tokens_left} / ${maximum_tokens} tokens\n`;
        statMessage += `Remaining: ${tokens_left} tokens\n`;
        statMessage += `Resets: ${resetMonth}\n`;

        const modelEntries = Object.entries(tokens_used);
        if (modelEntries.length > 0) {
            statMessage += `\n*By model (tokens):*\n`;
            for (const [model, count] of modelEntries) {
                statMessage += `• ${model}: ${count}\n`;
            }
        }

        statMessage += `\n*Video*\n`;
        statMessage += `Videos: ${videos_used} / ${maximum_videos}\n`;
        const videoEntries = Object.entries(video_seconds_used);
        if (videoEntries.length > 0) {
            for (const [model, secs] of videoEntries) {
                statMessage += `• ${model}: ${secs}s\n`;
            }
        }

        ctx.reply(statMessage, { parse_mode: 'Markdown' });
    };

    const clearContextCb = (ctx) => {
        ctx.session.prevResponses = "";
        ctx.session.context = "";

        ctx.reply("context cleared");
    };

    const compactContextCb = async (ctx) => {
        let context = [];
        try {
            context = JSON.parse(ctx.session.context);
        } catch (e) {}

        if (context.length === 0) {
            return ctx.reply("No context to compact.");
        }

        const originalLength = ctx.session.context.length;
        const { model } = getModel(ctx);
        const user_id = (ctx.from?.id ?? '').toString();

        try {
            await ctx.persistentChatAction('typing', async () => {
                const compactContext = [
                    ...context,
                    {
                        role: "user",
                        content: "Please create a detailed summary of our conversation so far. Include all key topics discussed, decisions made, code written, and any important context needed to continue the conversation seamlessly. Be comprehensive but concise."
                    }
                ];

                const data = await models.aiAssistant(JSON.stringify(compactContext), model, user_id, []);

                if (data.response) {
                    setTokensUsed(ctx, data.usage ?? data.tokens ?? 0, model);
                    const newContext = [
                        { role: "user", content: "[Conversation compacted. Summary of previous conversation:]" },
                        { role: "assistant", content: data.response }
                    ];
                    ctx.session.context = JSON.stringify(newContext);
                    const newLength = ctx.session.context.length;
                    const savedPercent = Math.round((1 - newLength / originalLength) * 100);
                    await ctx.reply(`Context compacted. Saved approximately ${savedPercent}% of context size.`);
                }
            });
        } catch (e) {
            console.log(e);
            ctx.reply("Sorry, unable to compact context. Please try again later.");
        }
    };

    const getGPTModelCb = (ctx) => {
        const { model } = getModel(ctx);
        ctx.reply(`You are currently using: ${config.models[model]?.name ?? model}`);
    };

    const listModelsCb = (ctx) => {
        const { model: currentModel } = getModel(ctx);
        const lines = Object.entries(config.models).map(([id, { name, provider }]) => {
            const active = id === currentModel ? ' ✓' : '';
            return `• ${name} (${provider})${active}`;
        });
        ctx.reply(`Available models:\n\n${lines.join('\n')}`);
    };

    const setGPTModelCb = (ctx) => {
        const buttons = Object.entries(config.models).map(([id, { name }]) =>
            Markup.button.callback(name, `mdl_${id}`)
        );
        return ctx.reply(
            "Select model to use",
            Markup.inlineKeyboard(buttons, { columns: 1 })
        );
    };

    const setAudioModelCb = (ctx) => {
        const current = ctx.session.audio_model || 'gpt-4o-transcribe';
        const buttons = Object.entries(config.audioModels).map(([id, { name }]) =>
            Markup.button.callback(`${name}${id === current ? ' ✓' : ''}`, `aud_${id}`)
        );
        return ctx.reply("Select audio transcription model", Markup.inlineKeyboard(buttons, { columns: 1 }));
    };

    const setAudioModelActionCb = async (ctx) => {
        await ctx.answerCbQuery();
        const modelId = ctx.update.callback_query.data.replace(/^aud_/, '');
        ctx.session.audio_model = modelId;
        await ctx.reply(`Audio model set to: ${config.audioModels[modelId]?.name ?? modelId}`);
    };

    const setImgModelCb = (ctx) => {
        const current = ctx.session.image_model || 'gpt-image-1';
        const buttons = Object.entries(config.imageModels).map(([id, { name }]) =>
            Markup.button.callback(`${name}${id === current ? ' ✓' : ''}`, `img_${id}`)
        );
        return ctx.reply("Select image generation model", Markup.inlineKeyboard(buttons, { columns: 1 }));
    };

    const getImgModelCb = (ctx) => {
        const { image_model } = getModel(ctx);
        ctx.reply(`You are currently using: ${config.imageModels[image_model]?.name ?? image_model}`);
    };

    const setImgModelActionCb = async (ctx) => {
        await ctx.answerCbQuery();
        const modelId = ctx.update.callback_query.data.replace(/^img_/, '');
        ctx.session.image_model = modelId;
        await ctx.reply(`Image model set to: ${config.imageModels[modelId]?.name ?? modelId}`);
    };

    const setVideoModelCb = (ctx) => {
        const current = ctx.session.video_model || 'sora-2';
        const buttons = Object.entries(config.videoModels).map(([id, { name }]) =>
            Markup.button.callback(`${name}${id === current ? ' ✓' : ''}`, `vid_${id}`)
        );
        return ctx.reply("Select video generation model", Markup.inlineKeyboard(buttons, { columns: 1 }));
    };

    const getVideoModelCb = (ctx) => {
        const { video_model } = getModel(ctx);
        ctx.reply(`You are currently using: ${config.videoModels[video_model]?.name ?? video_model}`);
    };

    const setVideoModelActionCb = async (ctx) => {
        await ctx.answerCbQuery();
        const modelId = ctx.update.callback_query.data.replace(/^vid_/, '');
        console.log('video_model',modelId)
        ctx.session.video_model = modelId;
        await ctx.reply(`Video model set to: ${config.videoModels[modelId]?.name ?? modelId}`);
    };

    const doSendTextRequest = async (ctx, follow_on_prompt = null, iteration = 0) => {
        if (iteration >= MAX_AGENT_ITERATIONS) {
            await ctx.reply("I've reached the maximum number of steps for this request.");
            return;
        }
        if (ctx.session.tokens_left != null && ctx.session.tokens_left <= 0) {
            await ctx.reply("You have used up your monthly token allowance. It will reset next month.");
            return;
        }
        const { model } = getModel(ctx);
        try {
            await ctx.persistentChatAction('typing', async () => {
                let context = "[]";
                const user_id = (ctx.update.message.from.id ?? '').toString()
                if (follow_on_prompt?.from_tool_results) {
                    context = ctx.session.context;
                } else if (follow_on_prompt != null) {
                    context = setContext(ctx, follow_on_prompt.function_call_response, 'tool', follow_on_prompt.function_call_id);
                } else {
                    context = setContext(ctx, ctx.message.text);
                }
                const mcpTools = mcpManager ? mcpManager.getOpenAITools() : [];
                const data = await models.aiAssistant(
                    context,
                    model,
                    user_id,
                    mcpTools
                )

                await handeAIResponse(data, ctx, null, iteration);
            })
        } catch (e) {
            console.log(e)
            ctx.reply("Sorry, I am unable to generate a response now. Please try again later.");
        }
    }
    const textMessageCb = async (ctx) => {
        updateMessageCounter(ctx);
        await doSendTextRequest(ctx)
    };

    const photoMessageCb = (bot) => async (ctx) => {
        updateMessageCounter(ctx);
        const photos = ctx.update.message.photo;
        const photo = photos[photos.length - 1];
        const url = await bot.telegram.getFileLink(photo.file_id);
        let prompt = ctx.update.message.caption;
        const { model } = getModel(ctx);
        const filePath = `/tmp/${ctx.from.id}`;
        const fileName = `${filePath}/${photo.file_id}.jpg`;
        try {
            if (!prompt) {
                ctx.reply("Please re-upload the image with a prompt in caption.");
                return;
            }
            createDirectoryIfNone(filePath);
            await downloadFile(url.href, fileName);
            const base64 = fs.readFileSync(fileName).toString('base64');
            await deleteFile(fileName);

            // Capture existing messages before adding this turn
            let existingMessages = [];
            try { existingMessages = JSON.parse(ctx.session.context || '[]'); } catch (_) {}

            // Store a compact placeholder in session to stay within DynamoDB size limits.
            // The full base64 image is passed directly to the API but never persisted.
            setContext(ctx, [{ type: "text", text: `${prompt} [image attached]` }]);

            const fullMessage = [
                { type: "text", text: prompt },
                { type: "image_base64", media_type: "image/jpeg", data: base64 },
            ];
            const apiContext = JSON.stringify([
                ...existingMessages,
                { role: "user", content: fullMessage }
            ]);

            const user_id = (ctx.update.message.from.id ?? '').toString()
            const mcpTools = mcpManager ? mcpManager.getOpenAITools() : [];
            const data = await models.aiAssistant(apiContext, model, user_id, mcpTools);

            await handeAIResponse(data, ctx, { base_image_url: `data:image/jpeg;base64,${base64}` });
        } catch (e) {
            console.log(e)
            try { await deleteFile(fileName); } catch (_) {}
            ctx.reply("Sorry, I am unable to generate a response now. Please try again later.");
        }
    };

    const voicePromptsCb = async (ctx) => {
        ctx.session.voice_prompts = !ctx.session.voice_prompts;
        const enabled = ctx.session.voice_prompts;
        await ctx.reply(enabled
            ? 'Voice prompts enabled. Voice notes will be sent to the AI as prompts.'
            : 'Voice prompts disabled. Voice notes will be transcribed only.'
        );
    };

    const audioMessageCb = (bot, axios) => async (ctx) => {
        updateMessageCounter(ctx);
        const model = ctx.session.audio_model || 'gpt-4o-transcribe';
        let file_id = ""
        let fileExtension = ""
        let mimeType = "audio/ogg"
        let tempFileName = ""
        if (ctx.update.message.voice) {
            file_id = ctx.update.message.voice.file_id
            mimeType = ctx.update.message.voice.mime_type
            fileExtension = mimeType.split('/')[1]
        } else {
            file_id = ctx.update.message.audio.file_id
            mimeType = ctx.update.message.audio.mime_type
            fileExtension = mimeType.split('/')[1]
            tempFileName = ctx.update.message.audio.file_name
        }
        const file = await bot.telegram.getFileLink(
            file_id
        );

        const filePath = `/tmp/${ctx.from.id}`
        createDirectoryIfNone(filePath);
        let fileName = `${filePath}/${file_id}.${fileExtension}`;
        if (tempFileName) {
            fileName = `${filePath}/${tempFileName}`
        }
        await downloadFile(file.href, fileName)
        const prompt = ctx.update.message.caption ?? "";
        try {
            const data = await models.aiAudioAssistant(fileName, prompt, model, mimeType);
            if (ctx.session.voice_prompts) {
                setContext(ctx, data.response);
                await doSendTextRequest(ctx, { from_tool_results: true });
            } else {
                setContext(ctx, prompt);
                await handeAIResponse(data, ctx);
            }
        } catch (e) {
            console.log(e)
            ctx.reply("Sorry, I am unable to generate a response now. Please try again later.");
        } finally {
            await deleteFile(fileName)
        }
    };

    async function handeAIResponse(data, ctx, additional = null, iteration = 0) {
        setTokensUsed(ctx, data.usage ?? data.tokens ?? 0)

        if (data.function_call) {
            const extra = data._raw_model_parts ? { _raw_model_parts: data._raw_model_parts } : null;
            setContext(ctx, data.content, 'assistant', null, data.tool_calls, extra);

            for (const toolCall of data.tool_calls) {
                const name = toolCall.function.name;
                let args = JSON.parse(toolCall.function.arguments);
                if (additional) {
                    args = { ...args, ...additional }
                }

                let functionResponse;
                if (functions[name]) {
                    functionResponse = await functions[name](args.content, args.filenameWithExtension, {
                        response_action: ctx.reply.bind(ctx),
                        document_action: ctx.telegram.sendDocument.bind(ctx.telegram),
                        chat_action: ctx.persistentChatAction.bind(ctx),
                        send_photo: ctx.telegram.sendPhoto.bind(ctx.telegram),
                        from_id: ctx.from.id,
                        chat_id: ctx.chat.id,
                        image_model: ctx.session.image_model || 'gpt-image-1',
                        video_model: ctx.session.video_model || 'sora-2',
                        track_image_usage: (usage, model) => trackImageUsage(ctx, usage, model),
                        track_video_seconds: (seconds, model) => trackVideoSeconds(ctx, seconds, model),
                        can_generate_video: () => canGenerateVideo(ctx),
                        ...args
                    });
                } else if (mcpManager?.hasTool(name)) {
                    functionResponse = await mcpManager.callTool(name, args);
                } else {
                    functionResponse = `Unknown tool: ${name}`;
                }

                setContext(ctx, functionResponse || "Done", 'tool', toolCall.id);
            }

            await doSendTextRequest(ctx, { from_tool_results: true }, iteration + 1);
        } else {
            setContext(ctx, data.response, 'assistant');
            const response = data.response;
            const sendChunk = async (text) => {
                try {
                    await ctx.reply(text, { parse_mode: 'Markdown' });
                } catch (e) {
                    if (e.description?.includes("can't parse entities")) {
                        await ctx.reply(text);
                    } else {
                        throw e;
                    }
                }
            };
            if (response.length >= 4096) {
                for (let start = 0; start < response.length; start += 4000) {
                    await sendChunk(response.substring(start, start + 4000));
                }
            } else {
                await sendChunk(response);
            }
        }
    }

    const supportCb = async (ctx) => {
        const text = ctx.message.text.replace(/^\/support\s*/i, '').trim();
        if (!text) {
            return ctx.reply(
                "Please include your message after the command.\n\nExample: `/support I can't generate images`",
                { parse_mode: 'Markdown' }
            );
        }

        const userId = ctx.from.id;
        const userName = `${ctx.from.first_name ?? ''} ${ctx.from.last_name ?? ''}`.trim() || String(userId);
        const ticketId = `TKT-${Date.now()}-${userId}`;

        try {
            await createSupportTicket({ ticketId, userId, userName, message: text });

            if (config.ADMIN_CHAT_ID) {
                await ctx.telegram.sendMessage(
                    config.ADMIN_CHAT_ID,
                    `*New Support Ticket*\n\nID: \`${ticketId}\`\nFrom: ${userName} (${userId})\n\n${text}`,
                    { parse_mode: 'Markdown' }
                );
            }

            await ctx.reply(
                `Your support ticket has been logged.\n\nTicket ID: \`${ticketId}\`\n\nWe will get back to you as soon as possible.`,
                { parse_mode: 'Markdown' }
            );
        } catch (e) {
            console.error("Failed to create support ticket", e);
            await ctx.reply("Sorry, we were unable to log your ticket. Please try again later.");
        }
    };

    const getConfigCb = async (ctx) => {
        const model       = ctx.session.model       || 'gpt-4o';
        const audioModel  = ctx.session.audio_model  || 'gpt-4o-transcribe';
        const imageModel  = ctx.session.image_model  || 'gpt-image-1';
        const videoModel  = ctx.session.video_model  || 'sora-2';
        const voicePrompts = ctx.session.voice_prompts ? 'Enabled' : 'Disabled';

        const modelName      = config.models[model]?.name           ?? model;
        const audioModelName = config.audioModels[audioModel]?.name ?? audioModel;
        const imageModelName = config.imageModels[imageModel]?.name ?? imageModel;
        const videoModelName = config.videoModels[videoModel]?.name ?? videoModel;

        const message =
            `*Current Configuration*\n\n` +
            `*Chat model:* ${modelName}\n` +
            `*Audio model:* ${audioModelName}\n` +
            `*Image model:* ${imageModelName}\n` +
            `*Video model:* ${videoModelName}\n` +
            `*Voice prompts:* ${voicePrompts}`;

        await ctx.reply(message, { parse_mode: 'Markdown' });
    };

    return {
        messageCb,
        startCb,
        joinCb,
        getStatsCb,
        clearContextCb,
        compactContextCb,
        getGPTModelCb,
        setGPTModelCb,
        textMessageCb,
        photoMessageCb,
        audioMessageCb,
        voicePromptsCb,
        setModelActionCb,
        listModelsCb,
        setAudioModelCb,
        setAudioModelActionCb,
        setImgModelCb,
        setImgModelActionCb,
        setVideoModelCb,
        setVideoModelActionCb,
        getImgModelCb,
        getVideoModelCb,
        supportCb,
        getConfigCb,
    };
};

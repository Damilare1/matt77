import axios from 'axios';
import { Telegraf } from "telegraf";

import config from "../config/config.js";
import { BotModifier } from "../helpers/bots.js";
import { callbacks } from "../helpers/callbacks.js";
import { aiAssistant } from "../AiApi/completion.js";
import { aiAudioAssistant } from "../AiApi/whisper.js";
import ModelControlsSession from '../helpers/ModelControlsSession.js';
import UserControlsSession from '../helpers/UserControlsSession.js';
import { aiVideoGenerationAssistant, aiVideoGenerationFromImageAssistant, aiVideoGenerationStatus } from '../AiApi/video.js';
import { McpManager } from '../MCP/manager.js';


const bot = new Telegraf(config.TELEGRAM_TOKEN);

const getSessionKey = (ctx) => {
    const from = ctx.from ?? ctx.callbackQuery?.from;
    const chat = ctx.chat ?? ctx.callbackQuery?.message?.chat;
    return from && chat && `${from.id}:${chat.id}`;
};

bot.use(new ModelControlsSession({
    getSessionKey,
    dynamoDBConfig: {
        accessKeyId: config.DYNAMODB_ACCESS_KEY,
        secretAccessKey: config.DYNAMODB_SECRET_ACCESS_KEY,
        params: {
            TableName: 'telegraf-session-dynamodb' // override this value to your table
        },
        region: config.DYNAMODB_REGION // override this value to your region
    }
}).middleware());
bot.use(new UserControlsSession({
    property: 'user-controls',
    getSessionKey,
    dynamoDBConfig: {
        accessKeyId: config.DYNAMODB_ACCESS_KEY,
        secretAccessKey: config.DYNAMODB_SECRET_ACCESS_KEY,
        params: {
            TableName: 'telegraf-user-dynamodb' // override this value to your table
        },
        region: config.DYNAMODB_REGION // override this value to your region
    }
}).middleware());


const mcpManager = new McpManager();
await mcpManager.initialize();

const models = {
    aiAssistant,
    aiAudioAssistant,
    aiVideoGenerationAssistant,
    aiVideoGenerationFromImageAssistant,
    aiVideoGenerationStatus,
    mcpManager
}
BotModifier(bot, callbacks(models), axios);

bot.telegram.setMyCommands([
    { command: 'stats', description: 'View your monthly token usage' },
    { command: 'getconfig', description: 'View all current settings' },
    { command: 'support', description: 'Log a complaint or support ticket' },
    { command: 'clearcontext', description: 'Clear conversation history' },
    { command: 'compact', description: 'Summarise and compress conversation history' },
    { command: 'listmodels', description: 'List available AI models' },
    { command: 'setgptmodel', description: 'Switch the chat model' },
    { command: 'setaudiomodel', description: 'Switch the audio transcription model' },
    { command: 'setimgmodel', description: 'Switch the image generation model' },
    { command: 'setvideomodel', description: 'Switch the video generation model' },
    { command: 'getgptmodel', description: 'Get the current chat model' },
    { command: 'getimgmodel', description: 'Get the current image generation model' },
    { command: 'getvideomodel', description: 'Get the current video generation model' },
    { command: 'getaudiomodel', description: 'Get the current audio transcription model' },
    { command: 'voice_prompts', description: 'Toggle voice notes as AI prompts' },
]);

if (!config.IS_SERVERLESS) {
    bot.launch();
    process.once("SIGINT", () => { mcpManager.shutdown(); bot.stop("SIGINT"); });
    process.once("SIGTERM", () => { mcpManager.shutdown(); bot.stop("SIGTERM"); });
}

export default bot;
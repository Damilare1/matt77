import { message } from "telegraf/filters";

export const BotModifier = (bot, callbackFns, axios) => {
    bot.on("message",callbackFns.messageCb);

    bot.start(callbackFns.startCb);

    bot.on("chat_join_request", callbackFns.joinCb);

    bot.command("stats", callbackFns.getStatsCb);

    bot.command("support", callbackFns.supportCb);

    bot.command("clearcontext", callbackFns.clearContextCb);

    bot.command("compact", callbackFns.compactContextCb);

    bot.command("getgptmodel", callbackFns.getGPTModelCb);

    bot.command("setgptmodel", callbackFns.setGPTModelCb);

    bot.command("voice_prompts", callbackFns.voicePromptsCb);

    bot.command("listmodels", callbackFns.listModelsCb);

    bot.command("setaudiomodel", callbackFns.setAudioModelCb);

    bot.command("setimgmodel", callbackFns.setImgModelCb);

    bot.command("getimgmodel", callbackFns.getImgModelCb);

    bot.command("setvideomodel", callbackFns.setVideoModelCb);

    bot.command("getvideomodel", callbackFns.getVideoModelCb);

    bot.command("getconfig", callbackFns.getConfigCb);

    bot.on(message("text"), callbackFns.textMessageCb);

    bot.on(message("voice"), callbackFns.audioMessageCb(bot, axios));

    bot.on(message("audio"), callbackFns.audioMessageCb(bot, axios));

    bot.on(message("photo"), callbackFns.photoMessageCb(bot));

    bot.action(/^mdl_/, callbackFns.setModelActionCb);

    bot.action(/^img_/, callbackFns.setImgModelActionCb);

    bot.action(/^vid_/, callbackFns.setVideoModelActionCb);

    bot.action(/^aud_/, callbackFns.setAudioModelActionCb);
}
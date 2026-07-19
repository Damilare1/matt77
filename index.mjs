import bot from './TelegramBot/index.js';

export const handler = async (event, context) => {
  console.log("Event", JSON.stringify(event))
  console.log("Context", JSON.stringify(context))
  for (let i = 0; i < event.Records.length; i++) {
    console.log(event.Records[i].body);
    const ctx = JSON.parse(event.Records[i].body);
    try {
      if (ctx?.message?.photo) {
        console.log(ctx.message.photo.length, JSON.stringify(ctx.message.photo))
      }
      console.log(["root POST", JSON.stringify(ctx)]);
      await bot.handleUpdate(ctx);
    } catch (e) {
      console.log(["Error", e]);
      throw e
    }
  }
};
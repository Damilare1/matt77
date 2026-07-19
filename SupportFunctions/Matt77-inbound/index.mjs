import { SendMessageCommand, SQSClient } from "@aws-sdk/client-sqs";
import { DynamoDBClient, GetItemCommand, PutItemCommand } from "@aws-sdk/client-dynamodb";
import { Telegraf } from "telegraf";
import { v4 as uuidv4 } from "uuid";

const sqsClient = new SQSClient({ region: process.env.AWS_REGION });
const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION });
const bot = new Telegraf(process.env.BOT_TOKEN);

async function isUserAuthorized(chatId, userId) {
  const key = `${chatId}:${userId}`;
  const result = await dynamoClient.send(
    new GetItemCommand({
      TableName: "telegraf-user-dynamodb",
      Key: { SessionKey: { S: key } },
    })
  );

  if (!result.Item) {
    await dynamoClient.send(
      new PutItemCommand({
        TableName: "telegraf-user-dynamodb",
        Item: {
          SessionKey: { S: key },
          authenticated: { BOOL: false },
          first_name: { S: "" },
          last_name: { S: "" },
          full_name: { S: "" },
        },
      })
    );
    return false;
  }

  return result.Item.authenticated?.BOOL === true;
}

export const handler = async (event, context) => {
  try {
    for (let i = 0; i < event.Records.length; i++) {
        console.log(event.Records[i].body)
        const bodyMessage = event.Records[i].body;
        const telegramMessage = JSON.parse(bodyMessage);
        const awsAccountID = context.invokedFunctionArn.split(":")[4];
        const outboundQueueUrl = `https://sqs.${process.env.AWS_REGION}.amazonaws.com/${awsAccountID}/${process.env.OutboundQueueName}`;

        const isCallbackQuery = !!telegramMessage.callback_query;
        const chatId = isCallbackQuery
          ? telegramMessage.callback_query.message.chat.id
          : telegramMessage.message.chat.id;
        const userId = isCallbackQuery
          ? telegramMessage.callback_query.from.id
          : telegramMessage.message.from.id;

        const authorized = await isUserAuthorized(chatId, userId);

        if (!authorized) {
          await bot.telegram.sendMessage(chatId, "You're not authorized to use the bot");
          continue;
        }

        const data = await sqsClient.send(
          new SendMessageCommand({
            MessageGroupId: `${chatId}`,
            MessageDeduplicationId: uuidv4(),
            MessageBody: JSON.stringify(telegramMessage),
            QueueUrl: outboundQueueUrl,
          })
        );
        console.log(data);
    }
  } catch (error) {
    console.log(error);
    throw error;
  }
};

import { SendMessageCommand, SQSClient } from "@aws-sdk/client-sqs";
import OpenAI from "openai";

const doPushToQueue = async (message) => {
  const sqsClient = new SQSClient({ region: process.env.AWS_REGION });
  const params = {
    MessageGroupId: message.id,
    MessageBody: JSON.stringify(message),
    QueueUrl: `https://sqs.${process.env.AWS_REGION}.amazonaws.com/${message.awsAccountID}/${process.env.OutboundQueueName}`,
  };
  console.log(`SQS params: ${JSON.stringify(params)}`);
  const sqsMessage = new SendMessageCommand(params);
  await sqsClient.send(sqsMessage);
}

export const handler = async (event, context) => {
  console.log("Event received", JSON.stringify(event))
  const headers = event.headers;
  const body = JSON.parse(event.body)
  const awsAccountID = context.invokedFunctionArn.split(":")[4];
  const AI_KEY = process.env.OPENAI_API_KEY
  const webhook_secret = process.env.OPENAI_WEBHOOK_SECRET;
  const client = new OpenAI({ apiKey: AI_KEY, webhookSecret: webhook_secret });

  try {
    // will throw if the signature is invalid
    const openaiEvent = await client.webhooks.unwrap(event.body, event.headers);
    console.log(JSON.stringify(openaiEvent))
    await doPushToQueue({ ...openaiEvent, awsAccountID })
  } catch (e) {
    console.log("Error", e)
  }
  // TODO implement
  const response = {
    statusCode: 200,
    body: 'Received'
  };
  return response;
};

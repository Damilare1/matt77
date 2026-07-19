import { DynamoDBClient, PutItemCommand } from "@aws-sdk/client-dynamodb";

export const createOrPutDynamoDbRecord = async (table_name, event) => {
  try {
    const client = new DynamoDBClient({
      region: process.env.AWS_REGION,
      endpoint: `https://dynamodb.${process.env.AWS_REGION}.amazonaws.com`
    });
    const params = {
      TableName: table_name,
      Item: {
        request_id: {
          "S": `${event.id}`
        },
        contact_id: {
          "S": `${event.contact_id}`
        }
      }
    }

    await client.send(new PutItemCommand(params));
  } catch (e) {
    console.log("Failed to create new record", e)
    throw e
  }
}
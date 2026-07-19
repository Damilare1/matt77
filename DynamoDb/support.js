import { DynamoDBClient, PutItemCommand } from "@aws-sdk/client-dynamodb";

const getClient = () => new DynamoDBClient({
    region: process.env.AWS_REGION,
    endpoint: `https://dynamodb.${process.env.AWS_REGION}.amazonaws.com`
});

export const createSupportTicket = async ({ ticketId, userId, userName, message }) => {
    const params = {
        TableName: process.env.SUPPORT_TABLE ?? 'matt77-support-tickets',
        Item: {
            ticket_id: { S: ticketId },
            user_id:   { S: String(userId) },
            user_name: { S: userName },
            message:   { S: message },
            timestamp: { S: new Date().toISOString() },
            status:    { S: 'open' },
        },
    };

    try {
        await getClient().send(new PutItemCommand(params));
    } catch (e) {
        console.error("Failed to create support ticket", e);
        throw e;
    }
};

import type { APIGatewayProxyWebsocketEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { putConnection } from '../shared/dynamo.js';

export async function handler(event: APIGatewayProxyWebsocketEventV2): Promise<APIGatewayProxyResultV2> {
  const connectionId = event.requestContext.connectionId;

  console.log(`WebSocket connect: ${connectionId}`);

  try {
    await putConnection(connectionId);
    return { statusCode: 200, body: 'Connected' };
  } catch (error) {
    console.error('Failed to store connection:', error);
    return { statusCode: 500, body: 'Failed to connect' };
  }
}

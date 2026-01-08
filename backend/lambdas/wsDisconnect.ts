import type { APIGatewayProxyWebsocketEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { deleteConnection } from '../shared/dynamo.js';

export async function handler(event: APIGatewayProxyWebsocketEventV2): Promise<APIGatewayProxyResultV2> {
  const connectionId = event.requestContext.connectionId;

  console.log(`WebSocket disconnect: ${connectionId}`);

  try {
    await deleteConnection(connectionId);
    return { statusCode: 200, body: 'Disconnected' };
  } catch (error) {
    console.error('Failed to delete connection:', error);
    // Return success anyway - connection will be cleaned up by TTL
    return { statusCode: 200, body: 'Disconnected' };
  }
}

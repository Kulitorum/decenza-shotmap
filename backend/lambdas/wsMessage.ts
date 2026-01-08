import type { APIGatewayProxyWebsocketEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { validateWsMessage } from '../shared/validate.js';
import { putConnection, updateConnectionTtl } from '../shared/dynamo.js';
import { sendToConnection } from '../shared/broadcast.js';

export async function handler(event: APIGatewayProxyWebsocketEventV2): Promise<APIGatewayProxyResultV2> {
  const connectionId = event.requestContext.connectionId;

  let body: unknown;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    await sendToConnection(connectionId, { error: 'Invalid JSON' });
    return { statusCode: 400, body: 'Invalid JSON' };
  }

  const validation = validateWsMessage(body);
  if (!validation.success) {
    await sendToConnection(connectionId, { error: validation.error });
    return { statusCode: 400, body: validation.error };
  }

  const message = validation.data;

  switch (message.action) {
    case 'subscribe':
      // Update connection with filters
      await putConnection(connectionId, message.filters);
      await sendToConnection(connectionId, {
        type: 'subscribed',
        filters: message.filters || {},
      });
      break;

    case 'unsubscribe':
      // Remove filters
      await putConnection(connectionId);
      await sendToConnection(connectionId, {
        type: 'unsubscribed',
      });
      break;

    case 'ping':
      // Heartbeat - update TTL and respond
      await updateConnectionTtl(connectionId);
      await sendToConnection(connectionId, {
        type: 'pong',
        ts: Date.now(),
      });
      break;

    default:
      await sendToConnection(connectionId, { error: 'Unknown action' });
      return { statusCode: 400, body: 'Unknown action' };
  }

  return { statusCode: 200, body: 'OK' };
}

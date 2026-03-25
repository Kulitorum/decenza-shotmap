import type { APIGatewayProxyWebsocketEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { putConnection, putConnectionWithDevice } from '../shared/dynamo.js';

export async function handler(event: APIGatewayProxyWebsocketEventV2): Promise<APIGatewayProxyResultV2> {
  const connectionId = event.requestContext.connectionId;
  const queryParams = event.queryStringParameters || {};
  const deviceId = queryParams.device_id;
  const role = queryParams.role as 'device' | 'controller' | undefined;

  console.log(`WebSocket connect: ${connectionId} device_id=${deviceId || 'none'} role=${role || 'none'}`);

  try {
    if (deviceId && role && (role === 'device' || role === 'controller')) {
      await putConnectionWithDevice(connectionId, deviceId, role, '');
    } else {
      await putConnection(connectionId);
    }
    return { statusCode: 200, body: 'Connected' };
  } catch (error) {
    console.error('Failed to store connection:', error);
    return { statusCode: 500, body: 'Failed to connect' };
  }
}

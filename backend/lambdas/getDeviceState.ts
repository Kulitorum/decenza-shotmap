import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { getDeviceState } from '../shared/dynamo.js';

export async function handler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const corsOrigin = process.env.CORS_ORIGIN || '*';
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': corsOrigin,
  };

  const deviceId = event.queryStringParameters?.device_id;
  if (!deviceId) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'device_id required' }) };
  }

  const state = await getDeviceState(deviceId);

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({
      device_id: deviceId,
      isAwake: state?.isAwake ?? false,
    }),
  };
}

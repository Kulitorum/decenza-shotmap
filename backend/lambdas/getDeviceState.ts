import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { createHash } from 'crypto';
import { getDeviceState, getConnectionsByDeviceId } from '../shared/dynamo.js';

export async function handler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const corsOrigin = process.env.CORS_ORIGIN || '*';
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': corsOrigin,
  };

  const deviceId = event.queryStringParameters?.device_id;
  const pairingToken = event.queryStringParameters?.pairing_token;
  if (!deviceId || !pairingToken) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'device_id and pairing_token required' }) };
  }

  // Verify pairing token against stored connection hashes
  const tokenHash = createHash('sha256').update(pairingToken).digest('hex');
  const conns = await getConnectionsByDeviceId(deviceId);
  const authorized = conns.some(c => c.pairing_token_hash === tokenHash);
  if (!authorized) {
    return { statusCode: 403, headers, body: JSON.stringify({ error: 'Invalid pairing token' }) };
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

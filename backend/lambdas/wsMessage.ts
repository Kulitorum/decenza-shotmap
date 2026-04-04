import type { APIGatewayProxyWebsocketEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { createHash, randomUUID } from 'crypto';
import { validateWsMessage } from '../shared/validate.js';
import { putConnection, updateConnectionTtl, putConnectionWithDevice, getConnectionsByDeviceId, getConnection } from '../shared/dynamo.js';
import { sendToConnection, sendBinaryToConnection } from '../shared/broadcast.js';

export async function handler(event: APIGatewayProxyWebsocketEventV2): Promise<APIGatewayProxyResultV2> {
  const connectionId = event.requestContext.connectionId;

  // Binary frames arrive base64-encoded — relay them without JSON parsing
  if (event.isBase64Encoded) {
    const binaryData = Buffer.from(event.body || '', 'base64');
    const { sent, failed } = await relayBinary(connectionId, binaryData);
    console.log(`Binary relay: ${binaryData.length} bytes -> ${sent} sent, ${failed} failed`);
    return { statusCode: 200, body: 'OK' };
  }

  let body: unknown;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    await sendToConnection(connectionId, { error: 'Invalid JSON' });
    return { statusCode: 400, body: 'Invalid JSON' };
  }

  const validation = validateWsMessage(body);
  if (!validation.success) {
    console.log(`Validation failed for ${connectionId}: ${validation.error}`, JSON.stringify(body));
    await sendToConnection(connectionId, { error: validation.error });
    return { statusCode: 400, body: validation.error };
  }

  const message = validation.data;

  switch (message.action) {
    case 'subscribe':
      await putConnection(connectionId, message.filters);
      await sendToConnection(connectionId, {
        type: 'subscribed',
        filters: message.filters || {},
      });
      break;

    case 'unsubscribe':
      await putConnection(connectionId);
      await sendToConnection(connectionId, { type: 'unsubscribed' });
      break;

    case 'ping':
      await updateConnectionTtl(connectionId);
      await sendToConnection(connectionId, { type: 'pong', ts: Date.now() });
      break;

    case 'register': {
      const tokenHash = createHash('sha256').update(message.pairing_token).digest('hex');
      await putConnectionWithDevice(connectionId, message.device_id, message.role, tokenHash);
      await sendToConnection(connectionId, {
        type: 'registered',
        device_id: message.device_id,
        role: message.role,
      });
      console.log(`Relay register: ${message.role} for device ${message.device_id}`);
      break;
    }

    case 'command': {
      const devices = await getConnectionsByDeviceId(message.device_id, 'device');
      console.log(`Relay command: ${message.command} -> found ${devices.length} devices for ${message.device_id}`);
      const device = devices[0]; // Use first connected device

      if (!device) {
        console.log(`Relay command: no device connected`);
        await sendToConnection(connectionId, {
          type: 'error',
          error: 'Device not connected',
        });
        break;
      }

      const commandId = randomUUID();
      const sent = await sendToConnection(device.connection_id, {
        type: 'relay_command',
        command_id: commandId,
        command: message.command,
        from_connection: connectionId,
      });

      if (sent) {
        await sendToConnection(connectionId, { type: 'command_sent', command_id: commandId });
      } else {
        await sendToConnection(connectionId, {
          type: 'error',
          error: 'Failed to reach device',
        });
      }
      console.log(`Relay command: ${message.command} -> device ${message.device_id} (sent=${sent})`);
      break;
    }

    case 'command_response': {
      const conn = await getConnection(connectionId);
      if (!conn?.device_id) break;

      const controllers = await getConnectionsByDeviceId(conn.device_id, 'controller');
      await Promise.all(controllers.map(ctrl =>
        sendToConnection(ctrl.connection_id, {
          type: 'relay_response',
          command_id: message.command_id,
          success: message.success,
          data: message.data,
        })
      ));
      break;
    }

    case 'status_push': {
      const conn = await getConnection(connectionId);
      console.log(`Relay status_push: connectionId=${connectionId} device_id=${conn?.device_id} role=${conn?.role}`);
      if (!conn?.device_id) {
        console.log('Relay status_push: no device_id on connection, dropping');
        break;
      }

      const controllers = await getConnectionsByDeviceId(conn.device_id, 'controller');
      console.log(`Relay status_push: found ${controllers.length} controllers for device ${conn.device_id}`);
      const results = await Promise.all(controllers.map(async ctrl => {
        const sent = await sendToConnection(ctrl.connection_id, {
          type: 'relay_status',
          device_id: conn.device_id!,
          state: message.state,
          phase: message.phase,
          temperature: message.temperature,
          waterLevelMl: message.waterLevelMl,
          isHeating: message.isHeating,
          isReady: message.isReady,
          isAwake: message.isAwake,
          timestamp: new Date().toISOString(),
        });
        console.log(`Relay status_push: sent to ${ctrl.connection_id} result=${sent}`);
        return sent;
      }));
      break;
    }

    case 'binary_relay': {
      const conn = await getConnection(connectionId);
      if (!conn?.device_id || !conn?.role) break;

      const targetRole = conn.role === 'device' ? 'controller' : 'device';
      const targets = await getConnectionsByDeviceId(conn.device_id, targetRole);

      // Forward the JSON envelope as-is (base64 data stays encoded)
      await Promise.all(targets.map(target =>
        sendToConnection(target.connection_id, { type: 'binary_relay', data: message.data })
      ));
      console.log(`Binary relay: ${message.data.length} chars -> ${targets.length} targets`);
      break;
    }

    default:
      await sendToConnection(connectionId, { error: 'Unknown action' });
      return { statusCode: 400, body: 'Unknown action' };
  }

  return { statusCode: 200, body: 'OK' };
}

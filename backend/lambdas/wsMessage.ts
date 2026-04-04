import type { APIGatewayProxyWebsocketEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { createHash, randomUUID } from 'crypto';
import { validateWsMessage } from '../shared/validate.js';
import { putConnection, updateConnectionTtl, putConnectionWithDevice, getConnectionsByDeviceId, getConnection, putFcmToken, getDeviceState, putDeviceState, getFcmTokensByDevice, deleteFcmToken } from '../shared/dynamo.js';
import { sendToConnection, sendBinaryToConnection } from '../shared/broadcast.js';
import { sendFcmMessage } from '../shared/fcm.js';

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

      // Broadcast to connected controllers (existing behavior)
      const controllers = await getConnectionsByDeviceId(conn.device_id, 'controller');
      console.log(`Relay status_push: found ${controllers.length} controllers for device ${conn.device_id}`);
      await Promise.all(controllers.map(async ctrl => {
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

      // Cache state and send FCM if isAwake changed
      const prevState = await getDeviceState(conn.device_id);
      if (prevState === null || prevState.isAwake !== message.isAwake) {
        await putDeviceState(conn.device_id, message.isAwake);
        console.log(`Device ${conn.device_id} isAwake changed: ${prevState?.isAwake} -> ${message.isAwake}`);

        // Send FCM to all registered tokens
        const tokens = await getFcmTokensByDevice(conn.device_id);
        if (tokens.length > 0) {
          console.log(`FCM: sending isAwake=${message.isAwake} to ${tokens.length} tokens`);
          await Promise.all(tokens.map(async (t) => {
            const ok = await sendFcmMessage(t.fcm_token, {
              device_id: conn.device_id!,
              isAwake: String(message.isAwake),
            });
            if (!ok) {
              await deleteFcmToken(conn.device_id!, t.fcm_token);
            }
          }));
        }
      }
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

    case 'register_fcm_token': {
      // Verify pairing token by checking against stored connection hashes
      const tokenHash = createHash('sha256').update(message.pairing_token).digest('hex');
      const devices = await getConnectionsByDeviceId(message.device_id, 'device');
      const authorized = devices.some(d => d.pairing_token_hash === tokenHash);
      if (!authorized) {
        // Also check controller connections (device may be offline but controller registered before)
        const controllers = await getConnectionsByDeviceId(message.device_id, 'controller');
        const ctrlAuthorized = controllers.some(c => c.pairing_token_hash === tokenHash);
        if (!ctrlAuthorized) {
          await sendToConnection(connectionId, { type: 'error', error: 'Invalid pairing token' });
          break;
        }
      }
      await putFcmToken(message.device_id, message.fcm_token, message.platform);
      await sendToConnection(connectionId, {
        type: 'fcm_token_registered',
        device_id: message.device_id,
      });
      console.log(`FCM token registered for device ${message.device_id} (${message.platform})`);
      break;
    }

    case 'get_device_state': {
      // Verify pairing token
      const tokenHash = createHash('sha256').update(message.pairing_token).digest('hex');
      const conns = await getConnectionsByDeviceId(message.device_id);
      const authorized = conns.some(c => c.pairing_token_hash === tokenHash);
      if (!authorized) {
        await sendToConnection(connectionId, { type: 'error', error: 'Invalid pairing token' });
        break;
      }
      const state = await getDeviceState(message.device_id);
      await sendToConnection(connectionId, {
        type: 'device_state',
        device_id: message.device_id,
        isAwake: state?.isAwake ?? false,
      });
      break;
    }

    default:
      await sendToConnection(connectionId, { error: 'Unknown action' });
      return { statusCode: 400, body: 'Unknown action' };
  }

  return { statusCode: 200, body: 'OK' };
}

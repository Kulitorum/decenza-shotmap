import {
  ApiGatewayManagementApiClient,
  PostToConnectionCommand,
  GoneException,
} from '@aws-sdk/client-apigatewaymanagementapi';
import { getAllConnections, deleteConnection } from './dynamo.js';
import type { ShotBroadcast, WsConnection } from './types.js';

let apiClient: ApiGatewayManagementApiClient | null = null;

function getApiClient(): ApiGatewayManagementApiClient {
  if (!apiClient) {
    const endpoint = process.env.WEBSOCKET_API_ENDPOINT;
    if (!endpoint) {
      throw new Error('WEBSOCKET_API_ENDPOINT not configured');
    }
    apiClient = new ApiGatewayManagementApiClient({
      endpoint,
    });
  }
  return apiClient;
}

/** Broadcast a shot event to all connected WebSocket clients */
export async function broadcastShot(shot: ShotBroadcast): Promise<{
  sent: number;
  failed: number;
  stale: number;
}> {
  const connections = await getAllConnections();
  const client = getApiClient();
  const message = JSON.stringify(shot);

  let sent = 0;
  let failed = 0;
  let stale = 0;

  const results = await Promise.allSettled(
    connections.map(async (conn: WsConnection) => {
      // Check filters
      if (conn.filters?.country_code && shot.country_code !== conn.filters.country_code) {
        return 'filtered';
      }

      try {
        await client.send(new PostToConnectionCommand({
          ConnectionId: conn.connection_id,
          Data: Buffer.from(message),
        }));
        return 'sent';
      } catch (error) {
        if (error instanceof GoneException) {
          // Connection is stale, clean it up
          await deleteConnection(conn.connection_id);
          return 'stale';
        }
        console.error(`Failed to send to ${conn.connection_id}:`, error);
        return 'failed';
      }
    })
  );

  for (const result of results) {
    if (result.status === 'fulfilled') {
      switch (result.value) {
        case 'sent': sent++; break;
        case 'failed': failed++; break;
        case 'stale': stale++; break;
      }
    } else {
      failed++;
    }
  }

  return { sent, failed, stale };
}

/** Send a message to a specific connection */
export async function sendToConnection(connectionId: string, message: unknown): Promise<boolean> {
  const client = getApiClient();
  try {
    await client.send(new PostToConnectionCommand({
      ConnectionId: connectionId,
      Data: Buffer.from(JSON.stringify(message)),
    }));
    return true;
  } catch (error) {
    if (error instanceof GoneException) {
      await deleteConnection(connectionId);
    }
    console.error(`Failed to send to ${connectionId}:`, error);
    return false;
  }
}

import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { randomUUID } from 'crypto';
import { validateShotInput } from '../shared/validate.js';
import { putRawShot, incrementAggregate, checkIdempotencyKey, setIdempotencyKey } from '../shared/dynamo.js';
import { resolveCity } from '../shared/cities.js';
import { broadcastShot } from '../shared/broadcast.js';
import type { ShotResponse, ShotBroadcast } from '../shared/types.js';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': process.env.CORS_ORIGIN || '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-api-key',
  'Content-Type': 'application/json',
};

function respond(statusCode: number, body: ShotResponse): APIGatewayProxyResultV2 {
  return {
    statusCode,
    headers: CORS_HEADERS,
    body: JSON.stringify(body),
  };
}

export async function handler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  // Handle CORS preflight
  if (event.requestContext.http.method === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: CORS_HEADERS,
    };
  }

  // Parse body
  let body: unknown;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return respond(400, { ok: false, resolved: false, error: 'Invalid JSON body' });
  }

  // Validate input
  const validation = validateShotInput(body);
  if (!validation.success) {
    return respond(400, { ok: false, resolved: false, error: validation.error });
  }

  const input = validation.data;

  // Check idempotency key
  if (input.idempotency_key) {
    const existingEventId = await checkIdempotencyKey(input.idempotency_key);
    if (existingEventId) {
      // Return success with existing event_id (idempotent)
      return respond(200, {
        ok: true,
        resolved: true,
        event_id: existingEventId,
      });
    }
  }

  // Resolve city coordinates
  const resolved = await resolveCity(
    input.city,
    input.country_code,
    input.lat,
    input.lon
  );

  // Generate event ID and timestamp
  const eventId = randomUUID();
  const ts = input.ts || Date.now();
  const day = new Date(ts).toISOString().split('T')[0];

  // Build raw shot record
  const record = {
    pk: `DAY#${day}`,
    sk: `TS#${ts}#${eventId}`,
    city: resolved.city,
    country_code: resolved.country_code,
    lat: resolved.lat,
    lon: resolved.lon,
    profile: input.profile,
    software_name: input.software_name,
    software_version: input.software_version,
    machine_model: input.machine_model,
    ts,
    event_id: eventId,
  };

  // Store raw shot and update aggregates concurrently
  await Promise.all([
    putRawShot(record),
    incrementAggregate(resolved.city, resolved.country_code, input.profile, ts),
    input.idempotency_key ? setIdempotencyKey(input.idempotency_key, eventId) : Promise.resolve(),
  ]);

  // Broadcast to WebSocket clients
  const broadcast: ShotBroadcast = {
    type: 'shot',
    ts,
    city: resolved.city,
    country_code: resolved.country_code,
    lat: resolved.lat,
    lon: resolved.lon,
    profile: input.profile,
    software_name: input.software_name,
    software_version: input.software_version,
    machine_model: input.machine_model,
  };

  try {
    const { sent, failed, stale } = await broadcastShot(broadcast);
    console.log(`Broadcast: sent=${sent}, failed=${failed}, stale=${stale}`);
  } catch (error) {
    // Don't fail the request if broadcast fails
    console.error('Broadcast error:', error);
  }

  return respond(200, {
    ok: true,
    resolved: resolved.resolved,
    lat: resolved.lat,
    lon: resolved.lon,
    event_id: eventId,
  });
}

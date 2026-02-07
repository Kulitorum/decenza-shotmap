import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand,
  QueryCommand,
  UpdateCommand,
  DeleteCommand,
  ScanCommand,
} from '@aws-sdk/lib-dynamodb';
import type { ShotRawRecord, ShotAggRecord, WsConnection, CityEntry, LibraryEntryRecord } from './types.js';

const client = new DynamoDBClient({});
export const docClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: { removeUndefinedValues: true },
});

const SHOTS_RAW_TABLE = process.env.SHOTS_RAW_TABLE || 'ShotsRaw';
const SHOTS_AGG_TABLE = process.env.SHOTS_AGG_TABLE || 'ShotsAgg';
const CONNECTIONS_TABLE = process.env.CONNECTIONS_TABLE || 'WsConnections';
const CITIES_TABLE = process.env.CITIES_TABLE || 'Cities';
const IDEMPOTENCY_TABLE = process.env.IDEMPOTENCY_TABLE || 'Idempotency';
const RATE_LIMIT_TABLE = process.env.RATE_LIMIT_TABLE || 'RateLimit';
const LIBRARY_TABLE = process.env.LIBRARY_TABLE || 'Library';

/** TTL for raw events: 180 days */
const RAW_TTL_DAYS = parseInt(process.env.RAW_TTL_DAYS || '180', 10);

/** TTL for idempotency keys: 1 hour */
const IDEMPOTENCY_TTL_SECONDS = 3600;

/** TTL for WebSocket connections: 2 hours */
const CONNECTION_TTL_SECONDS = 7200;

// ============ Raw Shots ============

export async function putRawShot(record: Omit<ShotRawRecord, 'ttl'>): Promise<void> {
  const ttl = Math.floor(Date.now() / 1000) + (RAW_TTL_DAYS * 24 * 60 * 60);
  await docClient.send(new PutCommand({
    TableName: SHOTS_RAW_TABLE,
    Item: { ...record, ttl },
  }));
}

export async function getRecentShots(limit: number = 20): Promise<ShotRawRecord[]> {
  const today = new Date().toISOString().split('T')[0];
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

  const results: ShotRawRecord[] = [];

  for (const day of [today, yesterday]) {
    if (results.length >= limit) break;

    const response = await docClient.send(new QueryCommand({
      TableName: SHOTS_RAW_TABLE,
      KeyConditionExpression: 'pk = :pk',
      ExpressionAttributeValues: { ':pk': `DAY#${day}` },
      ScanIndexForward: false,
      Limit: limit - results.length,
    }));

    if (response.Items) {
      results.push(...(response.Items as ShotRawRecord[]));
    }
  }

  return results.slice(0, limit);
}

export async function getShotsByDay(day: string): Promise<ShotRawRecord[]> {
  const response = await docClient.send(new QueryCommand({
    TableName: SHOTS_RAW_TABLE,
    KeyConditionExpression: 'pk = :pk',
    ExpressionAttributeValues: { ':pk': `DAY#${day}` },
    ScanIndexForward: false,
  }));
  return (response.Items || []) as ShotRawRecord[];
}

// ============ Aggregates ============

export async function incrementAggregate(
  city: string,
  countryCode: string,
  profile: string,
  ts: number
): Promise<void> {
  const day = new Date(ts).toISOString().split('T')[0];

  // Update city-level daily aggregate
  const cityPk = `CITY#${city}#CC#${countryCode}`;
  const citySk = `DAY#${day}#PROFILE#${profile}`;

  await docClient.send(new UpdateCommand({
    TableName: SHOTS_AGG_TABLE,
    Key: { pk: cityPk, sk: citySk },
    UpdateExpression: 'SET #count = if_not_exists(#count, :zero) + :one, last_ts = :ts',
    ExpressionAttributeNames: { '#count': 'count' },
    ExpressionAttributeValues: { ':zero': 0, ':one': 1, ':ts': ts },
  }));

  // Update global daily total
  const globalPk = `DAY#${day}`;
  await docClient.send(new UpdateCommand({
    TableName: SHOTS_AGG_TABLE,
    Key: { pk: globalPk, sk: 'TOTAL' },
    UpdateExpression: 'SET #count = if_not_exists(#count, :zero) + :one, last_ts = :ts',
    ExpressionAttributeNames: { '#count': 'count' },
    ExpressionAttributeValues: { ':zero': 0, ':one': 1, ':ts': ts },
  }));

  // Update daily per-city total (for top cities)
  await docClient.send(new UpdateCommand({
    TableName: SHOTS_AGG_TABLE,
    Key: { pk: globalPk, sk: `CITY#${city}#CC#${countryCode}` },
    UpdateExpression: 'SET #count = if_not_exists(#count, :zero) + :one, last_ts = :ts, city = :city, country_code = :cc',
    ExpressionAttributeNames: { '#count': 'count' },
    ExpressionAttributeValues: { ':zero': 0, ':one': 1, ':ts': ts, ':city': city, ':cc': countryCode },
  }));

  // Update daily per-profile total (for top profiles)
  await docClient.send(new UpdateCommand({
    TableName: SHOTS_AGG_TABLE,
    Key: { pk: globalPk, sk: `PROFILE#${profile}` },
    UpdateExpression: 'SET #count = if_not_exists(#count, :zero) + :one, last_ts = :ts, profile = :profile',
    ExpressionAttributeNames: { '#count': 'count' },
    ExpressionAttributeValues: { ':zero': 0, ':one': 1, ':ts': ts, ':profile': profile },
  }));
}

export async function getDailyTotal(day: string): Promise<number> {
  const response = await docClient.send(new GetCommand({
    TableName: SHOTS_AGG_TABLE,
    Key: { pk: `DAY#${day}`, sk: 'TOTAL' },
  }));
  return (response.Item as ShotAggRecord | undefined)?.count || 0;
}

export async function getTopCitiesForDay(day: string, limit: number = 5): Promise<Array<{ city: string; count: number }>> {
  const response = await docClient.send(new QueryCommand({
    TableName: SHOTS_AGG_TABLE,
    KeyConditionExpression: 'pk = :pk AND begins_with(sk, :prefix)',
    ExpressionAttributeValues: { ':pk': `DAY#${day}`, ':prefix': 'CITY#' },
  }));

  const items = (response.Items || []) as Array<ShotAggRecord & { city?: string }>;
  return items
    .filter(i => i.city)
    .sort((a, b) => b.count - a.count)
    .slice(0, limit)
    .map(i => ({ city: i.city!, count: i.count }));
}

export async function getTopProfilesForDay(day: string, limit: number = 5): Promise<Array<{ profile: string; count: number }>> {
  const response = await docClient.send(new QueryCommand({
    TableName: SHOTS_AGG_TABLE,
    KeyConditionExpression: 'pk = :pk AND begins_with(sk, :prefix)',
    ExpressionAttributeValues: { ':pk': `DAY#${day}`, ':prefix': 'PROFILE#' },
  }));

  const items = (response.Items || []) as Array<ShotAggRecord & { profile?: string }>;
  return items
    .filter(i => i.profile)
    .sort((a, b) => b.count - a.count)
    .slice(0, limit)
    .map(i => ({ profile: i.profile!, count: i.count }));
}

// ============ WebSocket Connections ============

export async function putConnection(connectionId: string, filters?: { country_code?: string }): Promise<void> {
  const now = Date.now();
  const ttl = Math.floor(now / 1000) + CONNECTION_TTL_SECONDS;

  await docClient.send(new PutCommand({
    TableName: CONNECTIONS_TABLE,
    Item: {
      connection_id: connectionId,
      connected_at: now,
      ttl,
      filters,
    },
  }));
}

export async function deleteConnection(connectionId: string): Promise<void> {
  await docClient.send(new DeleteCommand({
    TableName: CONNECTIONS_TABLE,
    Key: { connection_id: connectionId },
  }));
}

export async function getAllConnections(): Promise<WsConnection[]> {
  const response = await docClient.send(new ScanCommand({
    TableName: CONNECTIONS_TABLE,
  }));
  return (response.Items || []) as WsConnection[];
}

export async function updateConnectionTtl(connectionId: string): Promise<void> {
  const ttl = Math.floor(Date.now() / 1000) + CONNECTION_TTL_SECONDS;
  await docClient.send(new UpdateCommand({
    TableName: CONNECTIONS_TABLE,
    Key: { connection_id: connectionId },
    UpdateExpression: 'SET #ttl = :ttl',
    ExpressionAttributeNames: { '#ttl': 'ttl' },
    ExpressionAttributeValues: { ':ttl': ttl },
  }));
}

// ============ Cities Lookup ============

export async function lookupCity(city: string, countryCode?: string): Promise<CityEntry | null> {
  const normalizedCity = city.toLowerCase().trim();

  // Try with country code first
  if (countryCode) {
    const response = await docClient.send(new GetCommand({
      TableName: CITIES_TABLE,
      Key: {
        city_lower: normalizedCity,
        country_code: countryCode.toUpperCase(),
      },
    }));
    if (response.Item) {
      return response.Item as CityEntry;
    }
  }

  // Fall back to query without country code (return first match)
  const response = await docClient.send(new QueryCommand({
    TableName: CITIES_TABLE,
    KeyConditionExpression: 'city_lower = :city',
    ExpressionAttributeValues: { ':city': normalizedCity },
    Limit: 1,
  }));

  if (response.Items && response.Items.length > 0) {
    return response.Items[0] as CityEntry;
  }

  return null;
}

// ============ Idempotency ============

export async function checkIdempotencyKey(key: string): Promise<string | null> {
  const response = await docClient.send(new GetCommand({
    TableName: IDEMPOTENCY_TABLE,
    Key: { idempotency_key: key },
  }));

  if (response.Item) {
    return response.Item.event_id as string;
  }
  return null;
}

export async function setIdempotencyKey(key: string, eventId: string): Promise<void> {
  const ttl = Math.floor(Date.now() / 1000) + IDEMPOTENCY_TTL_SECONDS;

  await docClient.send(new PutCommand({
    TableName: IDEMPOTENCY_TABLE,
    Item: {
      idempotency_key: key,
      event_id: eventId,
      ttl,
    },
  }));
}

// ============ Rate Limiting ============

/** Rate limit window: 1 hour in seconds */
const RATE_LIMIT_WINDOW_SECONDS = 3600;

/** Max requests per IP per hour */
const RATE_LIMIT_MAX_REQUESTS = 10;

/**
 * Check and increment rate limit for an IP address.
 * Returns true if the request is allowed, false if rate limited.
 */
export async function checkRateLimit(ip: string): Promise<{ allowed: boolean; remaining: number }> {
  const pk = `RATELIMIT#${ip}`;
  const now = Math.floor(Date.now() / 1000);
  const windowStart = now - (now % RATE_LIMIT_WINDOW_SECONDS);
  const ttl = windowStart + RATE_LIMIT_WINDOW_SECONDS + 60; // Keep for 1 minute after window expires

  try {
    const response = await docClient.send(new UpdateCommand({
      TableName: RATE_LIMIT_TABLE,
      Key: { pk },
      UpdateExpression: 'SET #count = if_not_exists(#count, :zero) + :one, window_start = if_not_exists(window_start, :windowStart), #ttl = :ttl',
      ConditionExpression: 'attribute_not_exists(window_start) OR window_start = :windowStart',
      ExpressionAttributeNames: { '#count': 'count', '#ttl': 'ttl' },
      ExpressionAttributeValues: { ':zero': 0, ':one': 1, ':windowStart': windowStart, ':ttl': ttl },
      ReturnValues: 'ALL_NEW',
    }));

    const count = (response.Attributes?.count as number) || 1;
    const allowed = count <= RATE_LIMIT_MAX_REQUESTS;
    return { allowed, remaining: Math.max(0, RATE_LIMIT_MAX_REQUESTS - count) };
  } catch (error: unknown) {
    // If condition failed, the window has changed - reset the counter
    if ((error as { name?: string }).name === 'ConditionalCheckFailedException') {
      await docClient.send(new PutCommand({
        TableName: RATE_LIMIT_TABLE,
        Item: { pk, count: 1, window_start: windowStart, ttl },
      }));
      return { allowed: true, remaining: RATE_LIMIT_MAX_REQUESTS - 1 };
    }
    throw error;
  }
}

/** Configurable rate limiter with custom key prefix and max requests */
export async function checkRateLimitCustom(
  key: string,
  maxRequests: number
): Promise<{ allowed: boolean; remaining: number }> {
  const pk = `RATELIMIT#${key}`;
  const now = Math.floor(Date.now() / 1000);
  const windowStart = now - (now % RATE_LIMIT_WINDOW_SECONDS);
  const ttl = windowStart + RATE_LIMIT_WINDOW_SECONDS + 60;

  try {
    const response = await docClient.send(new UpdateCommand({
      TableName: RATE_LIMIT_TABLE,
      Key: { pk },
      UpdateExpression: 'SET #count = if_not_exists(#count, :zero) + :one, window_start = if_not_exists(window_start, :windowStart), #ttl = :ttl',
      ConditionExpression: 'attribute_not_exists(window_start) OR window_start = :windowStart',
      ExpressionAttributeNames: { '#count': 'count', '#ttl': 'ttl' },
      ExpressionAttributeValues: { ':zero': 0, ':one': 1, ':windowStart': windowStart, ':ttl': ttl },
      ReturnValues: 'ALL_NEW',
    }));

    const count = (response.Attributes?.count as number) || 1;
    const allowed = count <= maxRequests;
    return { allowed, remaining: Math.max(0, maxRequests - count) };
  } catch (error: unknown) {
    if ((error as { name?: string }).name === 'ConditionalCheckFailedException') {
      await docClient.send(new PutCommand({
        TableName: RATE_LIMIT_TABLE,
        Item: { pk, count: 1, window_start: windowStart, ttl },
      }));
      return { allowed: true, remaining: maxRequests - 1 };
    }
    throw error;
  }
}

// ============ Library ============

export async function putLibraryEntry(record: LibraryEntryRecord): Promise<void> {
  await docClient.send(new PutCommand({
    TableName: LIBRARY_TABLE,
    Item: record,
  }));
}

export async function getLibraryEntry(id: string): Promise<LibraryEntryRecord | null> {
  const response = await docClient.send(new GetCommand({
    TableName: LIBRARY_TABLE,
    Key: { id },
  }));
  return (response.Item as LibraryEntryRecord | undefined) || null;
}

export async function deleteLibraryEntry(id: string, deviceId: string): Promise<boolean> {
  try {
    await docClient.send(new DeleteCommand({
      TableName: LIBRARY_TABLE,
      Key: { id },
      ConditionExpression: 'deviceId = :deviceId',
      ExpressionAttributeValues: { ':deviceId': deviceId },
    }));
    return true;
  } catch (error: unknown) {
    if ((error as { name?: string }).name === 'ConditionalCheckFailedException') {
      return false;
    }
    throw error;
  }
}

export async function incrementLibraryDownloads(id: string): Promise<number> {
  const response = await docClient.send(new UpdateCommand({
    TableName: LIBRARY_TABLE,
    Key: { id },
    UpdateExpression: 'SET downloads = if_not_exists(downloads, :zero) + :one',
    ConditionExpression: 'attribute_exists(id)',
    ExpressionAttributeValues: { ':zero': 0, ':one': 1 },
    ReturnValues: 'ALL_NEW',
  }));
  return (response.Attributes?.downloads as number) || 1;
}

export async function incrementLibraryFlags(id: string): Promise<void> {
  await docClient.send(new UpdateCommand({
    TableName: LIBRARY_TABLE,
    Key: { id },
    UpdateExpression: 'SET flagCount = if_not_exists(flagCount, :zero) + :one',
    ExpressionAttributeValues: { ':zero': 0, ':one': 1 },
  }));
}

export async function setLibraryThumbnail(id: string, deviceId: string): Promise<boolean> {
  try {
    await docClient.send(new UpdateCommand({
      TableName: LIBRARY_TABLE,
      Key: { id },
      UpdateExpression: 'SET hasThumbnail = :true',
      ConditionExpression: 'deviceId = :deviceId',
      ExpressionAttributeValues: { ':true': true, ':deviceId': deviceId },
    }));
    return true;
  } catch (error: unknown) {
    if ((error as { name?: string }).name === 'ConditionalCheckFailedException') {
      return false;
    }
    throw error;
  }
}

export async function queryLibraryByType(type: string): Promise<LibraryEntryRecord[]> {
  const response = await docClient.send(new QueryCommand({
    TableName: LIBRARY_TABLE,
    IndexName: 'GSI1',
    KeyConditionExpression: '#type = :type',
    ExpressionAttributeNames: { '#type': 'type' },
    ExpressionAttributeValues: { ':type': type },
    ScanIndexForward: false,
  }));
  return (response.Items || []) as LibraryEntryRecord[];
}

export async function queryLibraryByDevice(deviceId: string): Promise<LibraryEntryRecord[]> {
  const response = await docClient.send(new QueryCommand({
    TableName: LIBRARY_TABLE,
    IndexName: 'GSI2',
    KeyConditionExpression: 'deviceId = :deviceId',
    ExpressionAttributeValues: { ':deviceId': deviceId },
    ScanIndexForward: false,
  }));
  return (response.Items || []) as LibraryEntryRecord[];
}

export async function scanLibraryEntries(): Promise<LibraryEntryRecord[]> {
  const items: LibraryEntryRecord[] = [];
  let lastKey: Record<string, unknown> | undefined;

  do {
    const response = await docClient.send(new ScanCommand({
      TableName: LIBRARY_TABLE,
      ExclusiveStartKey: lastKey,
    }));
    if (response.Items) {
      items.push(...(response.Items as LibraryEntryRecord[]));
    }
    lastKey = response.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (lastKey);

  return items;
}

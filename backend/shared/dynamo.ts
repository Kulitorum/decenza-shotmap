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
import type { ShotRawRecord, ShotAggRecord, WsConnection, CityEntry } from './types.js';

const client = new DynamoDBClient({});
export const docClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: { removeUndefinedValues: true },
});

const SHOTS_RAW_TABLE = process.env.SHOTS_RAW_TABLE || 'ShotsRaw';
const SHOTS_AGG_TABLE = process.env.SHOTS_AGG_TABLE || 'ShotsAgg';
const CONNECTIONS_TABLE = process.env.CONNECTIONS_TABLE || 'WsConnections';
const CITIES_TABLE = process.env.CITIES_TABLE || 'Cities';
const IDEMPOTENCY_TABLE = process.env.IDEMPOTENCY_TABLE || 'Idempotency';

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

import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { getRecentShots } from '../shared/dynamo.js';
import type { ShotEvent } from '../shared/types.js';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': process.env.CORS_ORIGIN || '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
  'Cache-Control': 'max-age=5',
};

export async function handler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  if (event.requestContext.http.method === 'OPTIONS') {
    return { statusCode: 204, headers: CORS_HEADERS };
  }

  const limitParam = event.queryStringParameters?.limit;
  const limit = Math.min(Math.max(parseInt(limitParam || '20', 10), 1), 100);

  try {
    const rawShots = await getRecentShots(limit);

    // Transform to public ShotEvent format
    const shots: ShotEvent[] = rawShots.map(raw => ({
      event_id: raw.event_id,
      ts: raw.ts,
      city: raw.city,
      country_code: raw.country_code,
      lat: raw.lat,
      lon: raw.lon,
      profile: raw.profile,
      software_name: raw.software_name,
      software_version: raw.software_version,
      machine_model: raw.machine_model,
    }));

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({ shots }),
    };
  } catch (error) {
    console.error('Failed to get recent shots:', error);
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'Failed to get recent shots' }),
    };
  }
}

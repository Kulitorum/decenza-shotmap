import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { validateLibraryFlagInput } from '../shared/validate.js';
import { getLibraryEntry, incrementLibraryFlags, checkRateLimitCustom } from '../shared/dynamo.js';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': process.env.CORS_ORIGIN || '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Device-Id',
  'Content-Type': 'application/json',
};

const FLAG_RATE_LIMIT = 10;

export async function handler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  if (event.requestContext.http.method === 'OPTIONS') {
    return { statusCode: 204, headers: CORS_HEADERS };
  }

  const id = event.pathParameters?.id;
  if (!id) {
    return {
      statusCode: 400,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'Missing entry id' }),
    };
  }

  const clientIp = event.requestContext.http.sourceIp || 'unknown';
  const { allowed, remaining } = await checkRateLimitCustom(`LIBFLAG#${clientIp}`, FLAG_RATE_LIMIT);
  if (!allowed) {
    return {
      statusCode: 429,
      headers: { ...CORS_HEADERS, 'X-RateLimit-Remaining': '0', 'Retry-After': '3600' },
      body: JSON.stringify({ error: `Rate limit exceeded. Maximum ${FLAG_RATE_LIMIT} flags per hour.` }),
    };
  }

  let body: unknown;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return {
      statusCode: 400,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'Invalid JSON body' }),
    };
  }

  const validation = validateLibraryFlagInput(body);
  if (!validation.success) {
    return {
      statusCode: 400,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: validation.error }),
    };
  }

  try {
    const entry = await getLibraryEntry(id);
    if (!entry) {
      return {
        statusCode: 404,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: 'Entry not found' }),
      };
    }

    await incrementLibraryFlags(id);
    console.log(`Entry ${id} flagged: reason=${validation.data.reason}, ip=${clientIp}`);

    return {
      statusCode: 200,
      headers: { ...CORS_HEADERS, 'X-RateLimit-Remaining': String(remaining) },
      body: JSON.stringify({ success: true }),
    };
  } catch (error) {
    console.error('Failed to flag library entry:', error);
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'Failed to flag entry' }),
    };
  }
}

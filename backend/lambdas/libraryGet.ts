import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { getLibraryEntry } from '../shared/dynamo.js';
import type { LibraryEntryResponse } from '../shared/types.js';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': process.env.CORS_ORIGIN || '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Device-Id',
  'Content-Type': 'application/json',
};

const THUMBNAIL_URL_PREFIX = process.env.THUMBNAIL_URL_PREFIX || 'https://decenza.coffee/library/thumbnails';

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

  try {
    const record = await getLibraryEntry(id);
    if (!record) {
      return {
        statusCode: 404,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: 'Entry not found' }),
      };
    }

    const response: LibraryEntryResponse = {
      id: record.id,
      version: record.version,
      type: record.type,
      tags: Array.isArray(record.tags) ? record.tags : [],
      appVersion: record.appVersion,
      deviceId: record.deviceId,
      data: JSON.parse(record.data),
      downloads: record.downloads || 0,
      flagCount: record.flagCount || 0,
      thumbnailUrl: record.hasThumbnail ? `${THUMBNAIL_URL_PREFIX}/${record.id}.png` : null,
      createdAt: record.createdAt,
    };

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify(response),
    };
  } catch (error) {
    console.error('Failed to get library entry:', error);
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'Failed to get library entry' }),
    };
  }
}

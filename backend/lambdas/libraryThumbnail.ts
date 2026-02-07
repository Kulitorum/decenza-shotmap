import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { setLibraryThumbnail } from '../shared/dynamo.js';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': process.env.CORS_ORIGIN || '*',
  'Access-Control-Allow-Methods': 'PUT, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Device-Id',
  'Content-Type': 'application/json',
};

const s3 = new S3Client({});
const WEBSITE_BUCKET = process.env.WEBSITE_BUCKET || '';
const THUMBNAIL_URL_PREFIX = process.env.THUMBNAIL_URL_PREFIX || 'https://decenza.coffee/library/thumbnails';
const MAX_THUMBNAIL_SIZE = 500 * 1024; // 500KB

// PNG magic bytes: 89 50 4E 47 0D 0A 1A 0A
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export async function handler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  if (event.requestContext.http.method === 'OPTIONS') {
    return { statusCode: 204, headers: CORS_HEADERS };
  }

  const deviceId = event.headers['x-device-id'];
  if (!deviceId || deviceId.trim().length === 0) {
    return {
      statusCode: 401,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'X-Device-Id header is required' }),
    };
  }

  const id = event.pathParameters?.id;
  if (!id) {
    return {
      statusCode: 400,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'Missing entry id' }),
    };
  }

  if (!event.body) {
    return {
      statusCode: 400,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'Request body is required' }),
    };
  }

  // Decode binary body (API Gateway V2 base64-encodes binary payloads)
  const imageBuffer = event.isBase64Encoded
    ? Buffer.from(event.body, 'base64')
    : Buffer.from(event.body, 'binary');

  // Validate size
  if (imageBuffer.length > MAX_THUMBNAIL_SIZE) {
    return {
      statusCode: 400,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: `Thumbnail must be at most ${MAX_THUMBNAIL_SIZE / 1024}KB` }),
    };
  }

  // Validate PNG magic bytes
  if (imageBuffer.length < 8 || !imageBuffer.subarray(0, 8).equals(PNG_MAGIC)) {
    return {
      statusCode: 400,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'Thumbnail must be a PNG image' }),
    };
  }

  try {
    // Verify ownership and mark thumbnail as uploaded
    const updated = await setLibraryThumbnail(id, deviceId);
    if (!updated) {
      return {
        statusCode: 403,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: 'Entry not found or you are not the owner' }),
      };
    }

    // Upload to S3
    await s3.send(new PutObjectCommand({
      Bucket: WEBSITE_BUCKET,
      Key: `library/thumbnails/${id}.png`,
      Body: imageBuffer,
      ContentType: 'image/png',
      CacheControl: 'public, max-age=3600',
    }));

    const thumbnailUrl = `${THUMBNAIL_URL_PREFIX}/${id}.png`;

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({ thumbnailUrl }),
    };
  } catch (error) {
    console.error('Failed to upload thumbnail:', error);
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'Failed to upload thumbnail' }),
    };
  }
}

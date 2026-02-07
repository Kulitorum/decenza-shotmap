import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { S3Client, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { deleteLibraryEntry } from '../shared/dynamo.js';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': process.env.CORS_ORIGIN || '*',
  'Access-Control-Allow-Methods': 'DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Device-Id',
  'Content-Type': 'application/json',
};

const s3 = new S3Client({});
const WEBSITE_BUCKET = process.env.WEBSITE_BUCKET || '';

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

  try {
    const deleted = await deleteLibraryEntry(id, deviceId);
    if (!deleted) {
      return {
        statusCode: 403,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: 'Entry not found or you are not the owner' }),
      };
    }

    // Fire-and-forget: delete thumbnails from S3
    if (WEBSITE_BUCKET) {
      Promise.all([
        s3.send(new DeleteObjectCommand({ Bucket: WEBSITE_BUCKET, Key: `library/thumbnails/${id}_full.png` })),
        s3.send(new DeleteObjectCommand({ Bucket: WEBSITE_BUCKET, Key: `library/thumbnails/${id}_compact.png` })),
      ]).catch(err => console.error('Failed to delete thumbnails from S3:', err));
    }

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({ success: true }),
    };
  } catch (error) {
    console.error('Failed to delete library entry:', error);
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'Failed to delete library entry' }),
    };
  }
}

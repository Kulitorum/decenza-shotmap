import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': process.env.CORS_ORIGIN || '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
  'Cache-Control': 'max-age=300',
};

const s3 = new S3Client({});
const TRANSLATIONS_BUCKET = process.env.TRANSLATIONS_BUCKET || '';

const LANG_CODE_RE = /^[a-z]{2,3}(-[A-Z]{2})?$/i;

export async function handler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  if (event.requestContext.http.method === 'OPTIONS') {
    return { statusCode: 204, headers: CORS_HEADERS };
  }

  const code = event.pathParameters?.code;
  if (!code || !LANG_CODE_RE.test(code)) {
    return {
      statusCode: 400,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'Invalid language code format' }),
    };
  }

  try {
    const key = `translations/${code.toLowerCase()}.json`;
    const obj = await s3.send(new GetObjectCommand({
      Bucket: TRANSLATIONS_BUCKET,
      Key: key,
    }));
    const body = await obj.Body!.transformToString();

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body,
    };
  } catch (error: unknown) {
    if ((error as { name?: string }).name === 'NoSuchKey') {
      return {
        statusCode: 404,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: 'Translation not found' }),
      };
    }
    console.error('Failed to get translation:', error);
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'Failed to get translation' }),
    };
  }
}

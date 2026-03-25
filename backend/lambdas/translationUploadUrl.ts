import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { checkRateLimitCustom } from '../shared/dynamo.js';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': process.env.CORS_ORIGIN || '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

const s3 = new S3Client({});
const TRANSLATIONS_BUCKET = process.env.TRANSLATIONS_BUCKET || '';

const LANG_CODE_RE = /^[a-z]{2,3}(-[A-Z]{2})?$/i;

export async function handler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  if (event.requestContext.http.method === 'OPTIONS') {
    return { statusCode: 204, headers: CORS_HEADERS };
  }

  const clientIp = event.requestContext.http.sourceIp || 'unknown';
  const { allowed } = await checkRateLimitCustom(`TRANSLATION#${clientIp}`, 10);
  if (!allowed) {
    return {
      statusCode: 429,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'Rate limit exceeded. Please try again later.' }),
    };
  }

  const lang = event.queryStringParameters?.lang;
  if (!lang) {
    return {
      statusCode: 400,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'Missing required parameter: lang' }),
    };
  }

  if (!LANG_CODE_RE.test(lang)) {
    return {
      statusCode: 400,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'Invalid language code format' }),
    };
  }

  try {
    const key = `translations/${lang.toLowerCase()}.json`;
    const command = new PutObjectCommand({
      Bucket: TRANSLATIONS_BUCKET,
      Key: key,
      ContentType: 'application/json',
    });
    const url = await getSignedUrl(s3, command, { expiresIn: 300 });

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({ url, key }),
    };
  } catch (error) {
    console.error('Failed to generate upload URL:', error);
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'Failed to generate upload URL' }),
    };
  }
}

import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { S3Client, ListObjectsV2Command, GetObjectCommand } from '@aws-sdk/client-s3';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': process.env.CORS_ORIGIN || '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
  'Cache-Control': 'max-age=60',
};

const s3 = new S3Client({});
const TRANSLATIONS_BUCKET = process.env.TRANSLATIONS_BUCKET || '';

interface TranslationMeta {
  language?: string;
  displayName?: string;
  nativeName?: string;
}

export async function handler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  if (event.requestContext.http.method === 'OPTIONS') {
    return { statusCode: 204, headers: CORS_HEADERS };
  }

  try {
    const listResult = await s3.send(new ListObjectsV2Command({
      Bucket: TRANSLATIONS_BUCKET,
      Prefix: 'translations/',
    }));

    const keys = (listResult.Contents || [])
      .map(obj => obj.Key!)
      .filter(key => key.endsWith('.json'));

    const languages = [];
    for (const key of keys) {
      try {
        const obj = await s3.send(new GetObjectCommand({
          Bucket: TRANSLATIONS_BUCKET,
          Key: key,
        }));
        const body = await obj.Body!.transformToString();
        const data = JSON.parse(body) as TranslationMeta;
        languages.push({
          code: data.language || key.replace('translations/', '').replace('.json', ''),
          name: data.displayName || '',
          nativeName: data.nativeName || '',
        });
      } catch (e) {
        console.error(`Failed to fetch ${key}:`, e);
      }
    }

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({ languages }),
    };
  } catch (error) {
    console.error('Failed to list translations:', error);
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'Failed to list translations' }),
    };
  }
}

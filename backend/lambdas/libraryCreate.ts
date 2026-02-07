import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { randomUUID, createHash } from 'crypto';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { validateLibraryEntryInput } from '../shared/validate.js';
import { putLibraryEntry, checkRateLimitCustom, queryLibraryByDataHash } from '../shared/dynamo.js';
import type { LibraryEntryRecord } from '../shared/types.js';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': process.env.CORS_ORIGIN || '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Device-Id',
  'Content-Type': 'application/json',
};

const s3 = new S3Client({});
const WEBSITE_BUCKET = process.env.WEBSITE_BUCKET || '';
const THUMBNAIL_URL_PREFIX = process.env.THUMBNAIL_URL_PREFIX || 'https://decenza.coffee/library/thumbnails';
const UPLOAD_RATE_LIMIT = 20;
const MAX_THUMBNAIL_SIZE = 500 * 1024;
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

interface MultipartParts {
  entry?: string;
  thumbnail_full?: Buffer;
  thumbnail_compact?: Buffer;
}

/** Parse multipart/form-data body into named parts */
function parseMultipart(body: Buffer, boundary: string): MultipartParts {
  const result: MultipartParts = {};
  const boundaryBuf = Buffer.from(`--${boundary}`);

  // Find all boundary positions
  const positions: number[] = [];
  let searchFrom = 0;
  while (true) {
    const idx = body.indexOf(boundaryBuf, searchFrom);
    if (idx === -1) break;
    positions.push(idx);
    searchFrom = idx + boundaryBuf.length;
  }

  for (let i = 0; i < positions.length - 1; i++) {
    const partStart = positions[i] + boundaryBuf.length;
    const partEnd = positions[i + 1];

    // Skip the \r\n after boundary
    let dataStart = partStart;
    if (body[dataStart] === 0x0d && body[dataStart + 1] === 0x0a) {
      dataStart += 2;
    }

    // Trim trailing \r\n before next boundary
    let dataEnd = partEnd;
    if (body[dataEnd - 1] === 0x0a && body[dataEnd - 2] === 0x0d) {
      dataEnd -= 2;
    }

    const partData = body.subarray(dataStart, dataEnd);

    // Split headers from body at \r\n\r\n
    const headerEndIdx = partData.indexOf('\r\n\r\n');
    if (headerEndIdx === -1) continue;

    const headerStr = partData.subarray(0, headerEndIdx).toString('utf-8');
    const partBody = partData.subarray(headerEndIdx + 4);

    // Extract part name from Content-Disposition
    const nameMatch = headerStr.match(/name="([^"]+)"/);
    if (!nameMatch) continue;
    const name = nameMatch[1];

    if (name === 'entry') {
      result.entry = partBody.toString('utf-8');
    } else if (name === 'thumbnail_full') {
      result.thumbnail_full = Buffer.from(partBody);
    } else if (name === 'thumbnail_compact') {
      result.thumbnail_compact = Buffer.from(partBody);
    }
  }

  return result;
}

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

  const { allowed, remaining } = await checkRateLimitCustom(`LIBUPLOAD#${deviceId}`, UPLOAD_RATE_LIMIT);
  if (!allowed) {
    return {
      statusCode: 429,
      headers: { ...CORS_HEADERS, 'X-RateLimit-Remaining': '0', 'Retry-After': '3600' },
      body: JSON.stringify({ error: `Rate limit exceeded. Maximum ${UPLOAD_RATE_LIMIT} uploads per hour.` }),
    };
  }

  const contentType = event.headers['content-type'] || '';
  let entryJson: unknown;
  let thumbnailFullBuffer: Buffer | null = null;
  let thumbnailCompactBuffer: Buffer | null = null;

  if (contentType.includes('multipart/form-data')) {
    // Parse multipart body
    const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^\s;]+))/);
    if (!boundaryMatch) {
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: 'Missing multipart boundary' }),
      };
    }
    const boundary = boundaryMatch[1] || boundaryMatch[2];

    const rawBody = event.isBase64Encoded
      ? Buffer.from(event.body || '', 'base64')
      : Buffer.from(event.body || '', 'binary');

    const parts = parseMultipart(rawBody, boundary);

    if (!parts.entry) {
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: 'Missing "entry" part in multipart body' }),
      };
    }

    try {
      entryJson = JSON.parse(parts.entry);
    } catch {
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: 'Invalid JSON in "entry" part' }),
      };
    }

    if (parts.thumbnail_full) {
      thumbnailFullBuffer = parts.thumbnail_full;
    }
    if (parts.thumbnail_compact) {
      thumbnailCompactBuffer = parts.thumbnail_compact;
    }
  } else {
    // Plain JSON body
    try {
      entryJson = JSON.parse(event.body || '{}');
    } catch {
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: 'Invalid JSON body' }),
      };
    }
  }

  const validation = validateLibraryEntryInput(entryJson);
  if (!validation.success) {
    return {
      statusCode: 400,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: validation.error }),
    };
  }

  // Validate thumbnails if present
  for (const [label, buf] of [['thumbnail_full', thumbnailFullBuffer], ['thumbnail_compact', thumbnailCompactBuffer]] as const) {
    if (buf) {
      if (buf.length > MAX_THUMBNAIL_SIZE) {
        return {
          statusCode: 400,
          headers: CORS_HEADERS,
          body: JSON.stringify({ error: `${label} must be at most ${MAX_THUMBNAIL_SIZE / 1024}KB` }),
        };
      }
      if (buf.length < 8 || !buf.subarray(0, 8).equals(PNG_MAGIC)) {
        return {
          statusCode: 400,
          headers: CORS_HEADERS,
          body: JSON.stringify({ error: `${label} must be a PNG image` }),
        };
      }
    }
  }

  const input = validation.data;
  const dataStr = JSON.stringify(input.data);
  const dataHash = createHash('sha256').update(dataStr).digest('hex');

  // Check for duplicate data
  const duplicates = await queryLibraryByDataHash(dataHash);
  if (duplicates.length > 0) {
    return {
      statusCode: 409,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'An entry with identical data already exists', existingId: duplicates[0].id }),
    };
  }

  const id = randomUUID();
  const now = new Date().toISOString();
  const hasThumbnailFull = thumbnailFullBuffer !== null;
  const hasThumbnailCompact = thumbnailCompactBuffer !== null;

  const record: LibraryEntryRecord = {
    id,
    version: input.version,
    type: input.type,
    tags: input.tags,
    appVersion: input.appVersion,
    data: dataStr,
    dataHash,
    deviceId,
    downloads: 0,
    flagCount: 0,
    hasThumbnailFull,
    hasThumbnailCompact,
    createdAt: now,
  };

  await putLibraryEntry(record);

  // Upload thumbnails to S3 if present
  const uploads: Promise<unknown>[] = [];
  if (thumbnailFullBuffer && WEBSITE_BUCKET) {
    uploads.push(s3.send(new PutObjectCommand({
      Bucket: WEBSITE_BUCKET,
      Key: `library/thumbnails/${id}_full.png`,
      Body: thumbnailFullBuffer,
      ContentType: 'image/png',
      CacheControl: 'public, max-age=3600',
    })));
  }
  if (thumbnailCompactBuffer && WEBSITE_BUCKET) {
    uploads.push(s3.send(new PutObjectCommand({
      Bucket: WEBSITE_BUCKET,
      Key: `library/thumbnails/${id}_compact.png`,
      Body: thumbnailCompactBuffer,
      ContentType: 'image/png',
      CacheControl: 'public, max-age=3600',
    })));
  }
  if (uploads.length > 0) {
    try {
      await Promise.all(uploads);
    } catch (err) {
      console.error('Failed to upload thumbnails to S3:', err);
    }
  }

  const response: Record<string, unknown> = {
    id,
    type: input.type,
    createdAt: now,
    thumbnailFullUrl: hasThumbnailFull ? `${THUMBNAIL_URL_PREFIX}/${id}_full.png` : null,
    thumbnailCompactUrl: hasThumbnailCompact ? `${THUMBNAIL_URL_PREFIX}/${id}_compact.png` : null,
  };

  return {
    statusCode: 201,
    headers: { ...CORS_HEADERS, 'X-RateLimit-Remaining': String(remaining) },
    body: JSON.stringify(response),
  };
}

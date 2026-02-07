import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { queryLibraryByType, queryLibraryByDevice, scanLibraryEntries } from '../shared/dynamo.js';
import type { LibraryEntryRecord, LibraryEntrySummary } from '../shared/types.js';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': process.env.CORS_ORIGIN || '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Device-Id',
  'Content-Type': 'application/json',
  'Cache-Control': 'max-age=10',
};

const THUMBNAIL_URL_PREFIX = process.env.THUMBNAIL_URL_PREFIX || 'https://decenza.coffee/library/thumbnails';
const MAX_PER_PAGE = 50;
const DEFAULT_PER_PAGE = 20;

function toSummary(record: LibraryEntryRecord): LibraryEntrySummary {
  return {
    id: record.id,
    version: record.version,
    type: record.type,
    tags: Array.isArray(record.tags) ? record.tags : [],
    appVersion: record.appVersion,
    deviceId: record.deviceId,
    downloads: record.downloads || 0,
    flagCount: record.flagCount || 0,
    thumbnailUrl: record.hasThumbnail ? `${THUMBNAIL_URL_PREFIX}/${record.id}.png` : null,
    createdAt: record.createdAt,
  };
}

export async function handler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  if (event.requestContext.http.method === 'OPTIONS') {
    return { statusCode: 204, headers: CORS_HEADERS };
  }

  try {
    const params = event.queryStringParameters || {};
    const type = params.type;
    const tagsParam = params.tags;
    const requestedTags = tagsParam ? tagsParam.split(',').map(t => t.trim()).filter(Boolean) : [];
    const since = params.since;
    const sort = params.sort || 'newest';
    const page = Math.max(parseInt(params.page || '1', 10) || 1, 1);
    const perPage = Math.min(Math.max(parseInt(params.per_page || String(DEFAULT_PER_PAGE), 10) || DEFAULT_PER_PAGE, 1), MAX_PER_PAGE);

    // Handle device_id=mine by reading X-Device-Id header
    let deviceIdFilter = params.device_id;
    if (deviceIdFilter === 'mine') {
      const headerDeviceId = event.headers['x-device-id'];
      if (!headerDeviceId || headerDeviceId.trim().length === 0) {
        return {
          statusCode: 401,
          headers: CORS_HEADERS,
          body: JSON.stringify({ error: 'X-Device-Id header is required when using device_id=mine' }),
        };
      }
      deviceIdFilter = headerDeviceId;
    }

    // Query strategy
    let records: LibraryEntryRecord[];
    if (deviceIdFilter) {
      records = await queryLibraryByDevice(deviceIdFilter);
    } else if (type) {
      records = await queryLibraryByType(type);
    } else {
      records = await scanLibraryEntries();
    }

    // Since filter
    if (since) {
      records = records.filter(r => r.createdAt > since);
    }

    // Tag filter (all specified tags must be present)
    if (requestedTags.length > 0) {
      records = records.filter(r => {
        const entryTags = Array.isArray(r.tags) ? r.tags : [];
        return requestedTags.every(tag => entryTags.includes(tag));
      });
    }

    // Sort
    switch (sort) {
      case 'popular':
        records.sort((a, b) => (b.downloads || 0) - (a.downloads || 0));
        break;
      case 'newest':
      default:
        records.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        break;
    }

    // Paginate
    const total = records.length;
    const offset = (page - 1) * perPage;
    const paged = records.slice(offset, offset + perPage);

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        entries: paged.map(toSummary),
        total,
        page,
        per_page: perPage,
      }),
    };
  } catch (error) {
    console.error('Failed to list library entries:', error);
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'Failed to list library entries' }),
    };
  }
}

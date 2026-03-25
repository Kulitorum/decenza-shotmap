import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { queryLibraryByType, queryLibraryByDevice, scanLibraryEntries, queryLibraryDeletionsSince } from '../shared/dynamo.js';
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

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '');
}

interface ItemData {
  type?: string;
  content?: string;
  emoji?: string;
  [key: string]: unknown;
}

/** Extract all searchable text fragments from a parsed data object, grouped by priority. */
function extractSearchableFields(data: Record<string, unknown>): { tags: string[]; content: string[]; nested: string[] } {
  const result = { tags: [] as string[], content: [] as string[], nested: [] as string[] };

  // Extract from a single item
  function extractItem(item: ItemData, target: string[]) {
    if (item.content) target.push(stripHtml(String(item.content)));
    if (item.emoji) target.push(String(item.emoji));
    if (item.type) target.push(String(item.type));
  }

  // Extract from an array of items
  function extractItems(items: unknown[], target: string[]) {
    for (const item of items) {
      if (item && typeof item === 'object') extractItem(item as ItemData, target);
    }
  }

  // Direct item (type=item)
  if (data.item && typeof data.item === 'object') {
    extractItem(data.item as ItemData, result.content);
  }

  // Zone (type=zone)
  if (data.zoneName) result.content.push(String(data.zoneName));
  if (Array.isArray(data.items)) {
    extractItems(data.items, result.nested);
  }

  // Layout (type=layout) - recurse into all zones
  if (data.layout && typeof data.layout === 'object') {
    const layout = data.layout as { zones?: Record<string, unknown[]> };
    if (layout.zones && typeof layout.zones === 'object') {
      for (const [zoneName, items] of Object.entries(layout.zones)) {
        result.nested.push(zoneName);
        if (Array.isArray(items)) extractItems(items, result.nested);
      }
    }
  }

  return result;
}

/** Score a record against a search term. Returns 0 for no match. */
function scoreSearch(record: LibraryEntryRecord, searchLower: string): number {
  let score = 0;

  // Priority 1: tag match (highest)
  const tags = Array.isArray(record.tags) ? record.tags : [];
  for (const tag of tags) {
    if (tag.toLowerCase().includes(searchLower)) {
      score += 30;
      break;
    }
  }

  // Parse data for content search
  let data: Record<string, unknown> | null = null;
  try {
    data = JSON.parse(record.data);
  } catch { /* skip unparseable data */ }

  if (data) {
    const fields = extractSearchableFields(data);

    // Priority 2: direct content match
    for (const text of fields.content) {
      if (text.toLowerCase().includes(searchLower)) {
        score += 20;
        break;
      }
    }

    // Priority 3: nested item match (layout/zone items)
    for (const text of fields.nested) {
      if (text.toLowerCase().includes(searchLower)) {
        score += 10;
        break;
      }
    }
  }

  return score;
}

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
    thumbnailFullUrl: record.hasThumbnailFull ? `${THUMBNAIL_URL_PREFIX}/${record.id}_full.png` : null,
    thumbnailCompactUrl: record.hasThumbnailCompact ? `${THUMBNAIL_URL_PREFIX}/${record.id}_compact.png` : null,
    createdAt: record.createdAt,
  };
}

export async function handler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  if (event.requestContext.http.method === 'OPTIONS') {
    return { statusCode: 204, headers: CORS_HEADERS };
  }

  try {
    const params = event.queryStringParameters || {};
    const type = params.type || undefined;
    const search = params.search?.trim() || undefined;
    const tagsParam = params.tags;
    const requestedTags = tagsParam ? tagsParam.split(',').map(t => t.trim()).filter(Boolean) : [];
    const variable = params.variable || undefined;
    const action = params.action || undefined;
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

    // Variable filter (exact tag match)
    if (variable) {
      const varTag = `var:${variable}`;
      records = records.filter(r => {
        const entryTags = Array.isArray(r.tags) ? r.tags : [];
        return entryTags.includes(varTag);
      });
    }

    // Action filter (exact tag match)
    if (action) {
      const actionTag = `action:${action}`;
      records = records.filter(r => {
        const entryTags = Array.isArray(r.tags) ? r.tags : [];
        return entryTags.includes(actionTag);
      });
    }

    // Tag filter (all specified tags must be present)
    if (requestedTags.length > 0) {
      records = records.filter(r => {
        const entryTags = Array.isArray(r.tags) ? r.tags : [];
        return requestedTags.every(tag => entryTags.includes(tag));
      });
    }

    // Search filter with relevance scoring
    let scores: Map<string, number> | undefined;
    if (search) {
      const searchLower = search.toLowerCase();
      scores = new Map();
      records = records.filter(r => {
        const s = scoreSearch(r, searchLower);
        if (s > 0) { scores!.set(r.id, s); return true; }
        return false;
      });
    }

    // Sort
    switch (sort) {
      case 'popular':
        records.sort((a, b) => (b.downloads || 0) - (a.downloads || 0));
        break;
      case 'newest':
      default:
        // When searching, sort by relevance first, then by date
        if (scores) {
          records.sort((a, b) => {
            const scoreDiff = (scores!.get(b.id) || 0) - (scores!.get(a.id) || 0);
            if (scoreDiff !== 0) return scoreDiff;
            return b.createdAt.localeCompare(a.createdAt);
          });
        } else {
          records.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        }
        break;
    }

    // Query deletion log when since is provided
    let deletedIds: string[] | undefined;
    if (since) {
      deletedIds = await queryLibraryDeletionsSince(since);
    }

    // Paginate
    const total = records.length;
    const offset = (page - 1) * perPage;
    const paged = records.slice(offset, offset + perPage);

    const responseBody: Record<string, unknown> = {
      entries: paged.map(toSummary),
      total,
      page,
      per_page: perPage,
    };
    if (deletedIds && deletedIds.length > 0) {
      responseBody.deletedIds = deletedIds;
    }

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify(responseBody),
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

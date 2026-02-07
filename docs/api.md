# API Documentation

## Base URLs

- **HTTP API**: `https://api.decenza.coffee`
- **WebSocket**: `wss://ws.decenza.coffee`

## Authentication

Currently, the API is open without authentication. For v1, rate limiting is applied at the API Gateway level.

Future versions will support:
- API keys (x-api-key header)
- JWT tokens
- OAuth 2.0

## HTTP Endpoints

### POST /v1/shots

Ingest a new shot event.

**Request Headers:**
```
Content-Type: application/json
x-api-key: <optional>
```

**Request Body:**
```json
{
  "city": "Copenhagen",
  "country_code": "DK",
  "profile": "Classic Espresso",
  "software_name": "Decenza|DE1",
  "software_version": "1.2.3",
  "machine_model": "Decent DE1",
  "ts": 1704067200000,
  "lat": 55.6761,
  "lon": 12.5683,
  "idempotency_key": "abc123"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| city | string | Yes | City name (max 100 chars) |
| country_code | string | No | ISO 3166-1 alpha-2 code (recommended) |
| profile | string | Yes | Espresso profile name (max 200 chars) |
| software_name | string | Yes | App/software name (max 100 chars) |
| software_version | string | Yes | Version string (max 50 chars) |
| machine_model | string | Yes | Machine model (max 100 chars) |
| ts | number | No | Timestamp in epoch milliseconds (default: server time) |
| lat | number | No | Latitude (-90 to 90) - only if using client coords |
| lon | number | No | Longitude (-180 to 180) - only if using client coords |
| idempotency_key | string | No | Unique key for idempotent requests (max 64 chars) |

**Response (200 OK):**
```json
{
  "ok": true,
  "resolved": true,
  "lat": 55.6761,
  "lon": 12.5683,
  "event_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

| Field | Type | Description |
|-------|------|-------------|
| ok | boolean | Request succeeded |
| resolved | boolean | City was resolved to coordinates |
| lat | number | Resolved latitude |
| lon | number | Resolved longitude |
| event_id | string | UUID for this event |

**Response (400 Bad Request):**
```json
{
  "ok": false,
  "resolved": false,
  "error": "city: city is required; profile: profile is required"
}
```

**Example (curl):**
```bash
curl -X POST https://api.decenza.coffee/v1/shots \
  -H "Content-Type: application/json" \
  -d '{
    "city": "Copenhagen",
    "country_code": "DK",
    "profile": "Classic Espresso",
    "software_name": "Decenza|DE1",
    "software_version": "1.2.3",
    "machine_model": "Decent DE1"
  }'
```

### GET /v1/stats

Get rolling 24-hour statistics.

**Response (200 OK):**
```json
{
  "shots_today": 1234,
  "shots_last_hour": 87,
  "top_cities": [
    { "city": "New York", "count": 156 },
    { "city": "London", "count": 134 },
    { "city": "Tokyo", "count": 98 },
    { "city": "Copenhagen", "count": 76 },
    { "city": "Berlin", "count": 65 }
  ],
  "top_profiles": [
    { "profile": "Classic Espresso", "count": 234 },
    { "profile": "Lungo", "count": 189 },
    { "profile": "Filter 2.0", "count": 156 },
    { "profile": "Turbo", "count": 98 },
    { "profile": "Ristretto", "count": 87 }
  ]
}
```

| Field | Type | Description |
|-------|------|-------------|
| shots_today | number | Shots in the last 24 hours (rolling window) |
| shots_last_hour | number | Shots in the last 60 minutes |
| top_cities | array | Top 5 cities by shot count (last 24h) |
| top_profiles | array | Top 5 profiles by shot count (last 24h) |

Note: Despite the field name `shots_today`, this returns a rolling 24-hour count, not calendar day.

**Example (curl):**
```bash
curl https://api.decenza.coffee/v1/stats
```

### GET /v1/shots/recent

Get recent shot events.

**Query Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| limit | number | 20 | Number of events (1-100) |

**Response (200 OK):**
```json
{
  "shots": [
    {
      "event_id": "550e8400-e29b-41d4-a716-446655440000",
      "ts": 1704067200000,
      "city": "Copenhagen",
      "country_code": "DK",
      "lat": 55.6761,
      "lon": 12.5683,
      "profile": "Classic Espresso",
      "software_name": "Decenza|DE1",
      "software_version": "1.2.3",
      "machine_model": "Decent DE1"
    }
  ]
}
```

**Example (curl):**
```bash
curl "https://api.decenza.coffee/v1/shots/recent?limit=50"
```

### POST /v1/crash-report

Submit a crash report from the Decenza DE1 app. Creates a GitHub issue in the [Kulitorum/Decenza](https://github.com/Kulitorum/Decenza) repository.

**Request Body:**
```json
{
  "version": "1.1.37",
  "platform": "android",
  "device": "Decent Tablet",
  "crash_log": "=== CRASH REPORT ===\nSignal: 11 (SIGSEGV)...",
  "user_notes": "I was steaming milk when it crashed",
  "debug_log_tail": "last 50 lines of debug.log..."
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| version | string | Yes | App version (max 50 chars) |
| platform | string | Yes | One of: `android`, `ios`, `windows`, `macos`, `linux` |
| device | string | No | Device info (max 100 chars) |
| crash_log | string | Yes | Crash log content (max 50,000 chars) |
| user_notes | string | No | User description of what happened (max 2,000 chars) |
| debug_log_tail | string | No | Last lines of debug log (max 10,000 chars) |

**Response (200 OK):**
```json
{
  "success": true,
  "issue_url": "https://github.com/Kulitorum/Decenza/issues/123"
}
```

**Response (429 Too Many Requests):**
```json
{
  "success": false,
  "error": "Rate limit exceeded. Maximum 10 crash reports per hour."
}
```

**Features:**
- **Duplicate detection**: Searches for existing open issues with similar crash signatures. If found, adds a comment instead of creating a new issue.
- **Rate limiting**: Maximum 10 reports per IP address per hour.
- **Security**: User notes are sanitized to prevent markdown injection. File paths containing usernames are redacted.

**Example (curl):**
```bash
curl -X POST https://api.decenza.coffee/v1/crash-report \
  -H "Content-Type: application/json" \
  -d '{
    "version": "1.1.37",
    "platform": "android",
    "crash_log": "=== CRASH REPORT ===\nSignal: 11 (SIGSEGV)\nStack trace...",
    "user_notes": "App crashed during startup"
  }'
```

## Widget Library Endpoints

### POST /v1/library/entries

Upload a new library entry (widget, zone, layout, etc.).

**Accepts both `multipart/form-data` and `application/json`.**

**Option 1: Multipart (with optional inline thumbnail)**

```
Content-Type: multipart/form-data; boundary=----DecenzaBoundary...
X-Device-Id: <device-uuid>
```

Parts:
- `entry` (required): JSON string with the entry data
- `thumbnail` (optional): PNG image (max 500KB, validated by magic bytes)

**Option 2: Plain JSON**

```
Content-Type: application/json
X-Device-Id: <device-uuid>
```

**Entry JSON (used in both cases):**
```json
{
  "version": 1,
  "type": "item",
  "name": "Temperature Display",
  "description": "Shows group head temp with color coding",
  "tags": ["temperature", "%TEMP%", "%CONNECTED_COLOR%", "custom"],
  "appVersion": "1.2.3",
  "data": {
    "item": {
      "type": "custom",
      "content": "<span style='color:%CONNECTED_COLOR%'>%TEMP%</span>\u00B0C",
      "emoji": "qrc:/icons/temperature.svg",
      "action": "",
      "align": "center",
      "backgroundColor": "#333333"
    }
  }
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| version | number | Yes | Entry format version (1-100) |
| type | string | Yes | Entry type: `item`, `zone`, `layout`, or any string (max 50 chars) |
| name | string | Yes | Display name (max 100 chars) |
| description | string | No | Description (max 500 chars, default: "") |
| tags | string[] | No | Searchable tags (max 20 tags, each max 50 chars) |
| appVersion | string | Yes | App version that created this entry (max 50 chars) |
| data | object | Yes | Opaque JSON data (max 100KB serialized) |

**Response (201 Created):**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "type": "item",
  "name": "Temperature Display",
  "createdAt": "2026-02-07T12:00:00.000Z",
  "thumbnailUrl": "https://decenza.coffee/library/thumbnails/550e8400-....png"
}
```

Note: `thumbnailUrl` is only included if a thumbnail was uploaded (either inline via multipart or separately via PUT).

**Rate limit:** 20 uploads per hour per device UUID.

### GET /v1/library/entries

Browse and search library entries. Returns metadata only (no `data` field).

**Query Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| type | string | (none) | Filter by entry type (exact match) |
| search | string | (none) | Case-insensitive text search in name/description |
| tags | string | (none) | Comma-separated tags (AND logic: all must match) |
| sort | string | newest | Sort order: `newest`, `popular`, `name` |
| page | number | 1 | Page number (1-based) |
| per_page | number | 20 | Results per page (1-50) |
| device_id | string | (none) | Filter by device UUID. Use `mine` to read from X-Device-Id header. |

**Response (200 OK):**
```json
{
  "entries": [
    {
      "id": "550e8400-...",
      "version": 1,
      "type": "item",
      "name": "Temperature Display",
      "description": "Shows group head temp with color coding",
      "tags": ["temperature", "%TEMP%"],
      "appVersion": "1.2.3",
      "downloads": 42,
      "flagCount": 0,
      "thumbnailUrl": "https://decenza.coffee/library/thumbnails/550e8400-....png",
      "createdAt": "2026-02-07T12:00:00.000Z"
    }
  ],
  "total": 142,
  "page": 1,
  "per_page": 20
}
```

Note: `thumbnailUrl` is `null` if no thumbnail has been uploaded. Response is cached for 10 seconds.

**Examples:**
```bash
# Browse all items
curl "https://api.decenza.coffee/v1/library/entries?type=item"

# Search for temperature widgets
curl "https://api.decenza.coffee/v1/library/entries?type=item&search=temperature"

# Filter by tags (URL-encoded %TEMP% = %25TEMP%25)
curl "https://api.decenza.coffee/v1/library/entries?tags=%25TEMP%25,%25WEIGHT%25"

# Most popular layouts
curl "https://api.decenza.coffee/v1/library/entries?type=layout&sort=popular"

# My uploads
curl -H "X-Device-Id: my-uuid" "https://api.decenza.coffee/v1/library/entries?device_id=mine"
```

### GET /v1/library/entries/{id}

Get a single library entry with full data.

**Response (200 OK):**
```json
{
  "id": "550e8400-...",
  "version": 1,
  "type": "item",
  "name": "Temperature Display",
  "description": "Shows group head temp with color coding",
  "tags": ["temperature", "%TEMP%"],
  "appVersion": "1.2.3",
  "data": { "item": { ... } },
  "downloads": 42,
  "flagCount": 0,
  "thumbnailUrl": "https://decenza.coffee/library/thumbnails/550e8400-....png",
  "createdAt": "2026-02-07T12:00:00.000Z"
}
```

**Response (404 Not Found):**
```json
{ "error": "Entry not found" }
```

### POST /v1/library/entries/{id}/download

Record a download (import) of a library entry. Call this when the user actually imports the entry, not on browse/preview.

**Response (200 OK):**
```json
{ "success": true, "downloads": 43 }
```

**Response (404 Not Found):**
```json
{ "error": "Entry not found" }
```

### DELETE /v1/library/entries/{id}

Delete your own library entry. Also removes the thumbnail from S3.

**Request Headers:**
```
X-Device-Id: <device-uuid>
```

**Response (200 OK):**
```json
{ "success": true }
```

**Response (403 Forbidden):**
```json
{ "error": "Entry not found or you are not the owner" }
```

### POST /v1/library/entries/{id}/flag

Report a library entry for moderation.

**Request Body:**
```json
{ "reason": "inappropriate" }
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| reason | string | Yes | One of: `inappropriate`, `spam`, `broken` |

**Response (200 OK):**
```json
{ "success": true }
```

**Rate limit:** 10 flags per hour per IP address.

### PUT /v1/library/entries/{id}/thumbnail

Upload a PNG thumbnail for a library entry.

**Request Headers:**
```
Content-Type: image/png
X-Device-Id: <device-uuid>
```

**Request Body:** Raw PNG binary data (max 500KB).

**Response (200 OK):**
```json
{ "thumbnailUrl": "https://decenza.coffee/library/thumbnails/550e8400-....png" }
```

**Constraints:**
- Must be PNG format (server validates magic bytes)
- Maximum 500KB file size
- X-Device-Id must match the entry's uploader
- Calling PUT again replaces the existing thumbnail (CloudFront cache TTL: 1 hour)

**Example (curl):**
```bash
curl -X PUT "https://api.decenza.coffee/v1/library/entries/550e8400-.../thumbnail" \
  -H "Content-Type: image/png" \
  -H "X-Device-Id: my-device-uuid" \
  --data-binary @thumbnail.png
```

## WebSocket API

Connect to `wss://ws.decenza.coffee` for real-time shot events.

### Connection

```javascript
const ws = new WebSocket('wss://ws.decenza.coffee');

ws.onopen = () => {
  console.log('Connected');
  // Subscribe to all events
  ws.send(JSON.stringify({ action: 'subscribe' }));
};

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log('Received:', data);
};
```

### Client Messages

**Subscribe (global):**
```json
{ "action": "subscribe" }
```

**Subscribe (filtered by country):**
```json
{
  "action": "subscribe",
  "filters": {
    "country_code": "US"
  }
}
```

**Unsubscribe:**
```json
{ "action": "unsubscribe" }
```

**Ping (heartbeat):**
```json
{ "action": "ping" }
```

### Server Messages

**Subscription confirmed:**
```json
{
  "type": "subscribed",
  "filters": {}
}
```

**Pong (heartbeat response):**
```json
{
  "type": "pong",
  "ts": 1704067200000
}
```

**Shot event:**
```json
{
  "type": "shot",
  "ts": 1704067200000,
  "city": "Copenhagen",
  "country_code": "DK",
  "lat": 55.6761,
  "lon": 12.5683,
  "profile": "Classic Espresso",
  "software_name": "Decenza|DE1",
  "software_version": "1.2.3",
  "machine_model": "Decent DE1"
}
```

### Heartbeat

Send a ping every 30 seconds to keep the connection alive:

```javascript
setInterval(() => {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ action: 'ping' }));
  }
}, 30000);
```

## Rate Limits

| Endpoint | Limit | Notes |
|----------|-------|-------|
| POST /v1/shots | 100/second | Per API key (future) |
| GET /v1/stats | 100/second | Cached for 30s |
| GET /v1/shots/recent | 100/second | Cached for 5s |
| POST /v1/crash-report | 10/hour | Per IP address |
| POST /v1/library/entries | 20/hour | Per device UUID |
| POST /v1/library/entries/{id}/flag | 10/hour | Per IP address |
| WebSocket connections | 1000 concurrent | Per account |

## Error Handling

All endpoints return JSON with consistent error format:

```json
{
  "ok": false,
  "error": "Error description"
}
```

HTTP status codes:
- `200` - Success
- `201` - Created (new library entry)
- `400` - Bad request (validation error)
- `401` - Missing X-Device-Id header
- `403` - Not the owner of this entry
- `404` - Entry not found
- `429` - Rate limit exceeded
- `500` - Internal server error

## CORS

The API supports CORS for browser requests:

```
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS
Access-Control-Allow-Headers: Content-Type, x-api-key, X-Device-Id
```

## Integration Examples

### JavaScript/TypeScript

```typescript
async function sendShot(shot: {
  city: string;
  profile: string;
  software_name: string;
  software_version: string;
  machine_model: string;
  country_code?: string;
}) {
  const response = await fetch('https://api.decenza.coffee/v1/shots', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(shot),
  });

  return response.json();
}
```

### Python

```python
import requests

def send_shot(city, profile, software_name, software_version, machine_model, country_code=None):
    response = requests.post(
        'https://api.decenza.coffee/v1/shots',
        json={
            'city': city,
            'country_code': country_code,
            'profile': profile,
            'software_name': software_name,
            'software_version': software_version,
            'machine_model': machine_model,
        }
    )
    return response.json()
```

### C# (.NET)

```csharp
using System.Net.Http.Json;

public class ShotMapClient
{
    private readonly HttpClient _client = new();

    public async Task<ShotResponse> SendShotAsync(ShotEvent shot)
    {
        var response = await _client.PostAsJsonAsync(
            "https://api.decenza.coffee/v1/shots",
            shot
        );
        return await response.Content.ReadFromJsonAsync<ShotResponse>();
    }
}
```

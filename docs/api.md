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
- `400` - Bad request (validation error)
- `429` - Rate limit exceeded
- `500` - Internal server error

## CORS

The API supports CORS for browser requests:

```
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, POST, OPTIONS
Access-Control-Allow-Headers: Content-Type, x-api-key
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

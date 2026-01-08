# Architecture

## Overview

The Decenza Shot Map is a real-time visualization platform for espresso shots pulled worldwide. The architecture is designed to be:

- **Serverless**: Pay only for what you use
- **Scalable**: Handle traffic spikes without manual intervention
- **Cost-effective**: Target ~$100/year for domain + hosting + API
- **Privacy-first**: Store minimal data, city-level only

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                  Internet                                    │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
                        ┌─────────────────────────┐
                        │       Route 53          │
                        │   decenza.coffee        │
                        │   api.decenza.coffee    │
                        │   ws.decenza.coffee     │
                        └─────────────────────────┘
                                      │
          ┌───────────────────────────┼───────────────────────────┐
          │                           │                           │
          ▼                           ▼                           ▼
┌─────────────────┐       ┌─────────────────┐       ┌─────────────────┐
│   CloudFront    │       │  API Gateway    │       │  API Gateway    │
│   Distribution  │       │   HTTP API      │       │  WebSocket API  │
│                 │       │                 │       │                 │
│ decenza.coffee  │       │ api.decenza.*   │       │ ws.decenza.*    │
└─────────────────┘       └─────────────────┘       └─────────────────┘
          │                           │                           │
          ▼                           ▼                           ▼
┌─────────────────┐       ┌─────────────────┐       ┌─────────────────┐
│    S3 Bucket    │       │     Lambda      │       │     Lambda      │
│                 │       │                 │       │                 │
│ Static Website  │       │ - ingestShot    │       │ - wsConnect     │
│ (React SPA)     │       │ - getStats      │       │ - wsDisconnect  │
│                 │       │ - getRecentShots│       │ - wsMessage     │
└─────────────────┘       └─────────────────┘       └─────────────────┘
                                      │                           │
                                      └─────────┬─────────────────┘
                                                │
                                                ▼
                          ┌─────────────────────────────────────────┐
                          │              DynamoDB                    │
                          │                                         │
                          │ ┌─────────┐  ┌─────────┐  ┌─────────┐  │
                          │ │ShotsRaw │  │ShotsAgg │  │ Cities  │  │
                          │ └─────────┘  └─────────┘  └─────────┘  │
                          │                                         │
                          │ ┌─────────────┐  ┌──────────────────┐  │
                          │ │WsConnections│  │   Idempotency    │  │
                          │ └─────────────┘  └──────────────────┘  │
                          └─────────────────────────────────────────┘
```

## Components

### Frontend (decenza.coffee)

- **Technology**: Vite + React + TypeScript
- **Map**: MapLibre GL JS with OpenStreetMap tiles
- **Hosting**: S3 + CloudFront

Features:
- Fullscreen world map with pulse animations
- Live event ticker
- Statistics (shots today, last hour, top cities/profiles)
- WebSocket for real-time updates
- Responsive design

### API (api.decenza.coffee)

HTTP API endpoints:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/v1/shots` | POST | Ingest a new shot event |
| `/v1/stats` | GET | Get current statistics |
| `/v1/shots/recent` | GET | Get recent shot events |

### WebSocket (ws.decenza.coffee)

Real-time event broadcasting:

- `$connect`: Client connects, stored in DynamoDB
- `$disconnect`: Client disconnects, removed from DynamoDB
- `$default`: Handle subscribe/unsubscribe/ping messages

Message types:
- `{ action: "subscribe", filters?: { country_code?: string } }`
- `{ action: "unsubscribe" }`
- `{ action: "ping" }`

Broadcast format:
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

### Storage

#### ShotsRaw Table

Stores individual shot events with TTL (default 180 days).

| Key | Type | Description |
|-----|------|-------------|
| pk | String | `DAY#YYYY-MM-DD` |
| sk | String | `TS#<epoch_ms>#<uuid>` |
| city | String | City name |
| country_code | String | ISO 3166-1 alpha-2 |
| lat | Number | Latitude |
| lon | Number | Longitude |
| profile | String | Espresso profile name |
| software_name | String | App/software name |
| software_version | String | Version string |
| machine_model | String | Machine model |
| ts | Number | Timestamp (epoch ms) |
| event_id | String | UUID |
| ttl | Number | TTL for automatic deletion |

#### ShotsAgg Table

Stores aggregated counts for efficient statistics.

Patterns:
- `pk=DAY#YYYY-MM-DD, sk=TOTAL` - Daily total
- `pk=DAY#YYYY-MM-DD, sk=CITY#<city>#CC#<cc>` - Daily per-city
- `pk=DAY#YYYY-MM-DD, sk=PROFILE#<profile>` - Daily per-profile
- `pk=CITY#<city>#CC#<cc>, sk=DAY#YYYY-MM-DD#PROFILE#<profile>` - City/day/profile

#### Cities Table

Lookup table for city coordinates.

| Key | Type | Description |
|-----|------|-------------|
| city_lower | String | Lowercase city name |
| country_code | String | ISO 3166-1 alpha-2 |
| city | String | Original city name |
| lat | Number | Latitude |
| lon | Number | Longitude |

#### WsConnections Table

Active WebSocket connections with TTL.

| Key | Type | Description |
|-----|------|-------------|
| connection_id | String | API Gateway connection ID |
| connected_at | Number | Connection timestamp |
| ttl | Number | TTL for automatic cleanup |
| filters | Map | Optional subscription filters |

#### Idempotency Table

Short-lived idempotency keys (1 hour TTL).

| Key | Type | Description |
|-----|------|-------------|
| idempotency_key | String | Client-provided key |
| event_id | String | Associated event ID |
| ttl | Number | TTL |

## Data Flow

### Shot Ingestion

1. Client POSTs to `/v1/shots`
2. Lambda validates input with Zod
3. Check idempotency key (if provided)
4. Resolve city to coordinates via Cities table
5. Store raw event in ShotsRaw
6. Update aggregates in ShotsAgg (atomic counters)
7. Broadcast to WebSocket connections
8. Return response with resolved coordinates

### Real-time Updates

1. Client connects to WebSocket API
2. Connection stored in WsConnections
3. Client sends `{ action: "subscribe" }`
4. When shot is ingested, broadcast to all connections
5. Filter by country_code if client specified
6. Clean up stale connections (GoneException)

### Statistics

1. Client requests `/v1/stats`
2. Lambda queries ShotsAgg for daily totals
3. Query recent shots for last-hour count
4. Return aggregated statistics

## City Geocoding

We use **Option A: Server-side lookup table** for city geocoding.

**Pros:**
- Best privacy: client only sends city name
- No external API dependencies
- Fast (<10ms DynamoDB lookup)
- Consistent results

**Cons:**
- Requires maintaining dataset
- Unknown cities logged as "unresolved"

The cities table is seeded with ~130 major cities. Unknown cities:
1. Log warning for monitoring
2. Use default coordinates (Atlantic Ocean)
3. Can be added manually to Cities table

## Cost Estimation

Assuming 5,000 shots/day, 1,000 visitors/day:

| Service | Estimate | Notes |
|---------|----------|-------|
| Route 53 | $0.50/month | Hosted zone |
| CloudFront | $1-2/month | Low traffic |
| S3 | $0.10/month | Small static site |
| API Gateway | $3-5/month | HTTP + WebSocket |
| Lambda | $1-2/month | Minimal compute |
| DynamoDB | $2-5/month | On-demand billing |
| ACM | Free | Certificates |

**Total: ~$10-15/month (~$120-180/year)**

To reduce costs further:
- Use DynamoDB provisioned capacity (if traffic is predictable)
- Reduce raw event TTL
- Optimize Lambda memory allocation

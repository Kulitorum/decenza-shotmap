# Decenza Shot Map - Screensaver Data API

A lightweight, cached endpoint for screensavers and high-traffic visualizations.

## Endpoint

```
GET https://decenza.coffee/api/shots-latest.json
```

## Polling

- Fetch every **30-60 seconds**
- Data updates every minute server-side
- Response is cached at edge (CDN) for 30 seconds
- Efficient for thousands of concurrent viewers

## Response Format

```json
{
  "generated_at": "2026-01-08T23:07:25.913Z",
  "count": 5,
  "shots": [
    {
      "city": "Copenhagen",
      "country_code": "DK",
      "lat": 55.6761,
      "lon": 12.5683,
      "profile": "Classic Espresso",
      "beverage_type": "espresso",
      "ts": "2026-01-08T22:45:12.000Z"
    },
    {
      "city": "Tokyo",
      "country_code": "JP",
      "lat": 35.6762,
      "lon": 139.6503,
      "profile": "Lungo",
      "beverage_type": "lungo",
      "ts": "2026-01-08T22:30:00.000Z"
    }
  ]
}
```

## Field Descriptions

| Field | Type | Description |
|-------|------|-------------|
| `generated_at` | ISO 8601 | When this JSON was generated |
| `count` | number | Total shots in the response |
| `shots` | array | Shots from last 24 hours, newest first |
| `shots[].city` | string | City name |
| `shots[].country_code` | string | ISO 3166-1 alpha-2 country code |
| `shots[].lat` | number | Latitude |
| `shots[].lon` | number | Longitude |
| `shots[].profile` | string? | Espresso profile name (optional) |
| `shots[].beverage_type` | string? | e.g. "espresso", "lungo" (optional) |
| `shots[].ts` | ISO 8601 | When the shot was pulled |

## Visualization Tips

- Shots are sorted newest-first
- Fade opacity based on age: `opacity = 1 - (age_hours / 24)`
- Aggregate by location (same lat/lon = one dot, larger or with count)
- New shots appear at the top of the array - animate them in

## Example Fetch (JavaScript)

```javascript
async function fetchShots() {
  const res = await fetch('https://decenza.coffee/api/shots-latest.json');
  const data = await res.json();
  return data.shots;
}

// Poll every 30 seconds
setInterval(fetchShots, 30000);
```

## Example Fetch (Python)

```python
import requests
import time

def fetch_shots():
    response = requests.get('https://decenza.coffee/api/shots-latest.json')
    return response.json()['shots']

# Poll every 30 seconds
while True:
    shots = fetch_shots()
    # render shots...
    time.sleep(30)
```

## Why This Endpoint?

The main website uses WebSockets for real-time updates, which is great for a few hundred users but expensive at scale. This static JSON endpoint:

- Serves from CloudFront CDN edge locations globally
- Handles unlimited concurrent viewers
- Costs nearly nothing regardless of traffic
- Updates every minute with the last 24 hours of shots

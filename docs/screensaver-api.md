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
  "generated_at": "2026-01-09T00:52:35.548Z",
  "shots": [
    { "lat": 55.7, "lon": 12.5, "age": 126 },
    { "lat": 37.7749, "lon": -122.4194, "age": 137 },
    { "lat": 35.6762, "lon": 139.6503, "age": 137 }
  ],
  "top_profiles": [
    { "name": "Default", "count": 2 },
    { "name": "Damian's LRv3", "count": 1 },
    { "name": "Turbo", "count": 1 }
  ]
}
```

## Field Descriptions

| Field | Type | Description |
|-------|------|-------------|
| `generated_at` | ISO 8601 | When this JSON was generated |
| `shots` | array | Shots from last 24 hours, newest first (max 1000) |
| `shots[].lat` | number | Latitude |
| `shots[].lon` | number | Longitude |
| `shots[].age` | number | Age in minutes since shot was pulled |
| `top_profiles` | array | Top 10 most popular profiles |
| `top_profiles[].name` | string | Profile name |
| `top_profiles[].count` | number | Number of shots with this profile |

## Visualization Tips

- Shots are sorted newest-first (lowest age first)
- Fade opacity based on age: `opacity = 1 - (age / 1440)` (1440 = minutes in 24 hours)
- Aggregate nearby coordinates for cleaner display
- New shots have low age values - animate them in

## Example Fetch (JavaScript)

```javascript
async function fetchShots() {
  const res = await fetch('https://decenza.coffee/api/shots-latest.json');
  const data = await res.json();
  return data;
}

// Poll every 30 seconds
setInterval(async () => {
  const { shots, top_profiles } = await fetchShots();
  // render shots on map...
  // display top_profiles leaderboard...
}, 30000);
```

## Example Fetch (Python)

```python
import requests
import time

def fetch_shots():
    response = requests.get('https://decenza.coffee/api/shots-latest.json')
    return response.json()

# Poll every 30 seconds
while True:
    data = fetch_shots()
    shots = data['shots']
    top_profiles = data['top_profiles']
    # render shots...
    time.sleep(30)
```

## Why This Endpoint?

The main website uses WebSockets for real-time updates, which is great for a few hundred users but expensive at scale. This static JSON endpoint:

- Serves from CloudFront CDN edge locations globally
- Handles unlimited concurrent viewers
- Costs nearly nothing regardless of traffic
- Updates every minute with the last 24 hours of shots

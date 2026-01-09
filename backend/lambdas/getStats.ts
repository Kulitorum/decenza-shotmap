import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { getShotsByDay } from '../shared/dynamo.js';
import type { StatsResponse } from '../shared/types.js';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': process.env.CORS_ORIGIN || '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
  'Cache-Control': 'max-age=30',
};

export async function handler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  if (event.requestContext.http.method === 'OPTIONS') {
    return { statusCode: 204, headers: CORS_HEADERS };
  }

  const now = Date.now();
  const twentyFourHoursAgo = now - 24 * 60 * 60 * 1000;
  const oneHourAgo = now - 60 * 60 * 1000;

  const today = new Date(now).toISOString().split('T')[0];
  const yesterday = new Date(now - 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  try {
    // Fetch shots from both days in parallel
    const [todayShots, yesterdayShots] = await Promise.all([
      getShotsByDay(today),
      getShotsByDay(yesterday),
    ]);

    // Combine and filter to exactly 24 hours
    const allShots = [...todayShots, ...yesterdayShots]
      .filter(shot => shot.ts >= twentyFourHoursAgo);

    // Count shots
    const shotsLast24h = allShots.length;
    const shotsLastHour = allShots.filter(shot => shot.ts >= oneHourAgo).length;

    // Calculate top cities
    const cityCounts = new Map<string, { city: string; count: number }>();
    for (const shot of allShots) {
      const key = `${shot.city}#${shot.country_code}`;
      const existing = cityCounts.get(key);
      if (existing) {
        existing.count++;
      } else {
        cityCounts.set(key, { city: shot.city, count: 1 });
      }
    }
    const topCities = Array.from(cityCounts.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // Calculate top profiles
    const profileCounts = new Map<string, { profile: string; count: number }>();
    for (const shot of allShots) {
      const profile = shot.profile || 'Unknown';
      const existing = profileCounts.get(profile);
      if (existing) {
        existing.count++;
      } else {
        profileCounts.set(profile, { profile, count: 1 });
      }
    }
    const topProfiles = Array.from(profileCounts.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    const stats: StatsResponse = {
      shots_today: shotsLast24h,
      shots_last_hour: shotsLastHour,
      top_cities: topCities,
      top_profiles: topProfiles,
    };

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify(stats),
    };
  } catch (error) {
    console.error('Failed to get stats:', error);
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'Failed to get stats' }),
    };
  }
}

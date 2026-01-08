import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { getDailyTotal, getTopCitiesForDay, getTopProfilesForDay, getShotsByDay } from '../shared/dynamo.js';
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

  const today = new Date().toISOString().split('T')[0];
  const oneHourAgo = Date.now() - 3600000;

  try {
    // Fetch data in parallel
    const [shotsToday, topCities, topProfiles, todayShots] = await Promise.all([
      getDailyTotal(today),
      getTopCitiesForDay(today, 5),
      getTopProfilesForDay(today, 5),
      getShotsByDay(today),
    ]);

    // Calculate shots in the last hour
    const shotsLastHour = todayShots.filter(shot => shot.ts >= oneHourAgo).length;

    const stats: StatsResponse = {
      shots_today: shotsToday,
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

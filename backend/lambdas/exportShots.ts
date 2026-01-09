import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const ddbClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(ddbClient);
const s3Client = new S3Client({});

const SHOTS_RAW_TABLE = process.env.SHOTS_RAW_TABLE!;
const WEBSITE_BUCKET = process.env.WEBSITE_BUCKET!;

interface ShotRecord {
  pk: string;
  sk: string;
  city: string;
  country_code: string;
  lat: number;
  lon: number;
  profile?: string;
  beverage_type?: string;
  event_id: string;
  ts: number; // Unix timestamp in milliseconds
}

export async function handler(): Promise<void> {
  const now = Date.now();
  const twentyFourHoursAgo = now - 24 * 60 * 60 * 1000;

  // Query shots from the last 24 hours
  // Data is partitioned by DAY#YYYY-MM-DD
  const shots: ShotRecord[] = [];
  const daysToQuery: string[] = [];

  // Generate day keys for today and yesterday (covers last 24 hours)
  for (let i = 0; i < 2; i++) {
    const dayDate = new Date(now - i * 24 * 60 * 60 * 1000);
    const dayKey = dayDate.toISOString().slice(0, 10); // "2026-01-08"
    daysToQuery.push(`DAY#${dayKey}`);
  }

  // Query each day partition in parallel
  const queries = daysToQuery.map(async (pk) => {
    try {
      const result = await docClient.send(new QueryCommand({
        TableName: SHOTS_RAW_TABLE,
        KeyConditionExpression: 'pk = :pk',
        ExpressionAttributeValues: {
          ':pk': pk,
        },
        Limit: 1000, // Cap per day
      }));
      return (result.Items || []) as ShotRecord[];
    } catch (err) {
      console.error(`Error querying ${pk}:`, err);
      return [];
    }
  });

  const results = await Promise.all(queries);
  for (const items of results) {
    shots.push(...items);
  }

  // Filter to exactly 24 hours and sort by timestamp descending
  const filteredShots = shots
    .filter(s => s.ts >= twentyFourHoursAgo)
    .sort((a, b) => b.ts - a.ts)
    .slice(0, 1000); // Cap at 1000 shots

  // Transform to minimal format: just coords and age in minutes
  const publicShots = filteredShots.map(s => ({
    lat: s.lat,
    lon: s.lon,
    age: Math.round((now - s.ts) / 60000), // age in minutes
  }));

  // Calculate top 10 profiles
  const profileCounts = new globalThis.Map<string, number>();
  for (const s of filteredShots) {
    const profile = s.profile || 'Unknown';
    profileCounts.set(profile, (profileCounts.get(profile) || 0) + 1);
  }
  const topProfiles = Array.from(profileCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([name, count]) => ({ name, count }));

  const output = {
    generated_at: new Date(now).toISOString(),
    shots: publicShots,
    top_profiles: topProfiles,
  };

  // Write to S3
  await s3Client.send(new PutObjectCommand({
    Bucket: WEBSITE_BUCKET,
    Key: 'api/shots-latest.json',
    Body: JSON.stringify(output),
    ContentType: 'application/json',
    CacheControl: 'public, max-age=30', // 30 second cache
  }));

  console.log(`Exported ${publicShots.length} shots to S3`);
}

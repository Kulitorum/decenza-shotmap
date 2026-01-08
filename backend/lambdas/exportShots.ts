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
  ts: string;
}

export async function handler(): Promise<void> {
  const now = new Date();
  const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  // Query shots from the last 24 hours
  // We need to query each hour partition
  const shots: ShotRecord[] = [];
  const hoursToQuery: string[] = [];

  // Generate hour keys for the last 24 hours
  for (let i = 0; i < 24; i++) {
    const hourDate = new Date(now.getTime() - i * 60 * 60 * 1000);
    const hourKey = hourDate.toISOString().slice(0, 13); // "2024-01-08T22"
    hoursToQuery.push(`HOUR#${hourKey}`);
  }

  // Query each hour partition in parallel
  const queries = hoursToQuery.map(async (pk) => {
    try {
      const result = await docClient.send(new QueryCommand({
        TableName: SHOTS_RAW_TABLE,
        KeyConditionExpression: 'pk = :pk',
        ExpressionAttributeValues: {
          ':pk': pk,
        },
        Limit: 500, // Cap per hour to avoid runaway costs
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
    .filter(s => new Date(s.ts) >= twentyFourHoursAgo)
    .sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime())
    .slice(0, 1000); // Cap at 1000 shots

  // Transform to public format
  const publicShots = filteredShots.map(s => ({
    city: s.city,
    country_code: s.country_code,
    lat: s.lat,
    lon: s.lon,
    profile: s.profile,
    beverage_type: s.beverage_type,
    ts: s.ts,
  }));

  const output = {
    generated_at: now.toISOString(),
    count: publicShots.length,
    shots: publicShots,
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

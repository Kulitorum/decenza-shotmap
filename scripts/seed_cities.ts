/**
 * Seed the Cities DynamoDB table with city data
 *
 * Usage:
 *   npx tsx scripts/seed_cities.ts [table_name] [region]
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, BatchWriteCommand } from '@aws-sdk/lib-dynamodb';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

interface CityData {
  city: string;
  country_code: string;
  lat: number;
  lon: number;
}

async function seedCities(tableName: string, region: string) {
  const client = new DynamoDBClient({ region });
  const docClient = DynamoDBDocumentClient.from(client);

  // Load cities data
  const citiesPath = join(__dirname, '..', 'backend', 'data', 'cities-sample.json');
  const cities: CityData[] = JSON.parse(readFileSync(citiesPath, 'utf-8'));

  console.log(`Seeding ${cities.length} cities to table: ${tableName}`);

  // Batch write in chunks of 25 (DynamoDB limit)
  const chunkSize = 25;
  let processed = 0;

  for (let i = 0; i < cities.length; i += chunkSize) {
    const chunk = cities.slice(i, i + chunkSize);

    const putRequests = chunk.map(city => ({
      PutRequest: {
        Item: {
          city_lower: city.city.toLowerCase(),
          country_code: city.country_code,
          city: city.city,
          lat: city.lat,
          lon: city.lon,
        },
      },
    }));

    await docClient.send(new BatchWriteCommand({
      RequestItems: {
        [tableName]: putRequests,
      },
    }));

    processed += chunk.length;
    console.log(`Processed ${processed}/${cities.length} cities`);
  }

  console.log('Seeding complete!');
}

// Parse command line arguments
const tableName = process.argv[2] || 'decenza-shotmap-cities';
const region = process.argv[3] || process.env.AWS_REGION || 'eu-west-1';

seedCities(tableName, region).catch(err => {
  console.error('Error seeding cities:', err);
  process.exit(1);
});

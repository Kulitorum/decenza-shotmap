/**
 * City centroid lookup using Option A: Server-side lookup table
 *
 * Pros:
 * - Best privacy: client only sends city name, no coordinates
 * - Robust: works offline, no external API dependencies
 * - Fast: DynamoDB lookup is <10ms
 * - Consistent: same city always resolves to same coordinates
 *
 * Cons:
 * - Requires maintaining city dataset
 * - Unknown cities need manual resolution
 * - May not have every small town
 *
 * The cities table is seeded from GeoNames data (world-cities.json)
 * containing ~44,000 cities with population > 15,000
 */

import { lookupCity } from './dynamo.js';
import type { CityEntry } from './types.js';

export interface ResolvedCity {
  resolved: boolean;
  lat: number;
  lon: number;
  city: string;
  country_code: string;
}

/** Default coordinates for unresolved cities (Atlantic Ocean) */
const UNRESOLVED_LAT = 0;
const UNRESOLVED_LON = -30;
const DEFAULT_COUNTRY_CODE = 'XX';

/**
 * Resolve city name to coordinates
 *
 * @param city - City name (case-insensitive)
 * @param countryCode - Optional ISO 3166-1 alpha-2 country code
 * @param clientLat - Optional client-provided latitude (fallback)
 * @param clientLon - Optional client-provided longitude (fallback)
 */
export async function resolveCity(
  city: string,
  countryCode?: string,
  clientLat?: number,
  clientLon?: number
): Promise<ResolvedCity> {
  // Try lookup in cities table
  const entry = await lookupCity(city, countryCode);

  if (entry) {
    return {
      resolved: true,
      lat: entry.lat,
      lon: entry.lon,
      city: entry.city,
      country_code: entry.country_code,
    };
  }

  // If client provided coordinates, use them (rounded to city-level)
  if (clientLat !== undefined && clientLon !== undefined) {
    return {
      resolved: true,
      lat: Math.round(clientLat * 10) / 10, // ~11km precision
      lon: Math.round(clientLon * 10) / 10,
      city,
      country_code: countryCode || DEFAULT_COUNTRY_CODE,
    };
  }

  // Unresolved - log for later manual resolution
  console.warn(`Unresolved city: "${city}" (country: ${countryCode || 'unknown'})`);

  return {
    resolved: false,
    lat: UNRESOLVED_LAT,
    lon: UNRESOLVED_LON,
    city,
    country_code: countryCode || DEFAULT_COUNTRY_CODE,
  };
}

/**
 * Core shot event types shared between backend and frontend
 */

/** Incoming shot event from client */
export interface ShotEventInput {
  ts?: number;
  city: string;
  country_code?: string;
  profile: string;
  software_name: string;
  software_version: string;
  machine_model: string;
  lat?: number;
  lon?: number;
  idempotency_key?: string;
}

/** Stored shot event with resolved coordinates */
export interface ShotEvent {
  event_id: string;
  ts: number;
  city: string;
  country_code: string;
  lat: number;
  lon: number;
  profile: string;
  software_name: string;
  software_version: string;
  machine_model: string;
}

/** Broadcast event sent to WebSocket clients */
export interface ShotBroadcast {
  type: 'shot';
  ts: number;
  city: string;
  country_code?: string;
  lat: number;
  lon: number;
  profile: string;
  software_name: string;
  software_version: string;
  machine_model: string;
}

/** API response for shot ingestion */
export interface ShotResponse {
  ok: boolean;
  resolved: boolean;
  lat?: number;
  lon?: number;
  event_id?: string;
  error?: string;
}

/** City lookup entry */
export interface CityEntry {
  city: string;
  country_code: string;
  lat: number;
  lon: number;
  population?: number;
}

/** Stats response */
export interface StatsResponse {
  shots_today: number;
  shots_last_hour: number;
  top_cities: Array<{ city: string; count: number }>;
  top_profiles: Array<{ profile: string; count: number }>;
}

/** WebSocket connection record */
export interface WsConnection {
  connection_id: string;
  connected_at: number;
  ttl: number;
  filters?: {
    country_code?: string;
  };
}

/** DynamoDB raw shot record */
export interface ShotRawRecord {
  pk: string;  // DAY#YYYY-MM-DD
  sk: string;  // TS#<epoch_ms>#<uuid>
  city: string;
  country_code: string;
  lat: number;
  lon: number;
  profile: string;
  software_name: string;
  software_version: string;
  machine_model: string;
  ts: number;
  event_id: string;
  ttl: number;
}

/** DynamoDB aggregate record */
export interface ShotAggRecord {
  pk: string;  // CITY#<city>#CC#<cc> or DAY#YYYY-MM-DD
  sk: string;  // DAY#YYYY-MM-DD#PROFILE#<profile> or TOTAL
  count: number;
  last_ts: number;
}

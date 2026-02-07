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

/** Crash report input from DE1 app */
export interface CrashReportInput {
  version: string;
  platform: 'android' | 'ios' | 'windows' | 'macos' | 'linux';
  device?: string;
  crash_log: string;
  user_notes?: string;
  debug_log_tail?: string;
}

/** Crash report response */
export interface CrashReportResponse {
  success: boolean;
  issue_url?: string;
  error?: string;
}

/** Rate limit record in DynamoDB */
export interface RateLimitRecord {
  pk: string;  // RATELIMIT#<ip>
  count: number;
  window_start: number;
  ttl: number;
}

// ============ Library ============

/** Library entry as submitted by the client */
export interface LibraryEntryInput {
  version: number;
  type: string;
  name: string;
  description: string;
  tags: string[];
  appVersion: string;
  data: Record<string, unknown>;
}

/** Library entry as stored in DynamoDB */
export interface LibraryEntryRecord {
  id: string;
  version: number;
  type: string;
  name: string;
  description: string;
  tags: string[];
  appVersion: string;
  data: string;           // JSON-serialized
  deviceId: string;
  downloads: number;
  flagCount: number;
  hasThumbnail: boolean;
  createdAt: string;      // ISO 8601
}

/** Full library entry response (GET by ID) - includes data */
export interface LibraryEntryResponse {
  id: string;
  version: number;
  type: string;
  name: string;
  description: string;
  tags: string[];
  appVersion: string;
  data: Record<string, unknown>;
  downloads: number;
  flagCount: number;
  thumbnailUrl: string | null;
  createdAt: string;
}

/** Library entry summary for browse results - no data field */
export interface LibraryEntrySummary {
  id: string;
  version: number;
  type: string;
  name: string;
  description: string;
  tags: string[];
  appVersion: string;
  downloads: number;
  flagCount: number;
  thumbnailUrl: string | null;
  createdAt: string;
}

/** Library list response */
export interface LibraryListResponse {
  entries: LibraryEntrySummary[];
  total: number;
  page: number;
  per_page: number;
}

/** Library flag input */
export interface LibraryFlagInput {
  reason: 'inappropriate' | 'spam' | 'broken';
}

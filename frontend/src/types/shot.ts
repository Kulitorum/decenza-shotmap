/** Shot event from API/WebSocket */
export interface ShotEvent {
  event_id?: string;
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

/** WebSocket message types */
export interface ShotBroadcast extends ShotEvent {
  type: 'shot';
}

export interface WsSubscribed {
  type: 'subscribed';
  filters: Record<string, string>;
}

export interface WsPong {
  type: 'pong';
  ts: number;
}

export type WsMessage = ShotBroadcast | WsSubscribed | WsPong;

/** Stats from API */
export interface Stats {
  shots_today: number;
  shots_last_hour: number;
  top_cities: Array<{ city: string; count: number }>;
  top_profiles: Array<{ profile: string; count: number }>;
}

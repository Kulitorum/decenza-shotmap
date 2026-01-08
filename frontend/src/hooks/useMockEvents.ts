import { useEffect, useRef } from 'react';
import type { ShotEvent } from '../types/shot';

interface UseMockEventsOptions {
  onShot: (shot: ShotEvent) => void;
  enabled?: boolean;
  interval?: number;
}

const mockCities = [
  { city: 'New York', country_code: 'US', lat: 40.7128, lon: -74.006 },
  { city: 'Los Angeles', country_code: 'US', lat: 34.0522, lon: -118.2437 },
  { city: 'San Francisco', country_code: 'US', lat: 37.7749, lon: -122.4194 },
  { city: 'Seattle', country_code: 'US', lat: 47.6062, lon: -122.3321 },
  { city: 'London', country_code: 'GB', lat: 51.5074, lon: -0.1278 },
  { city: 'Paris', country_code: 'FR', lat: 48.8566, lon: 2.3522 },
  { city: 'Berlin', country_code: 'DE', lat: 52.52, lon: 13.405 },
  { city: 'Tokyo', country_code: 'JP', lat: 35.6762, lon: 139.6503 },
  { city: 'Sydney', country_code: 'AU', lat: -33.8688, lon: 151.2093 },
  { city: 'Melbourne', country_code: 'AU', lat: -37.8136, lon: 144.9631 },
  { city: 'Copenhagen', country_code: 'DK', lat: 55.6761, lon: 12.5683 },
  { city: 'Stockholm', country_code: 'SE', lat: 59.3293, lon: 18.0686 },
  { city: 'Amsterdam', country_code: 'NL', lat: 52.3676, lon: 4.9041 },
  { city: 'Milan', country_code: 'IT', lat: 45.4642, lon: 9.19 },
  { city: 'Rome', country_code: 'IT', lat: 41.9028, lon: 12.4964 },
  { city: 'Barcelona', country_code: 'ES', lat: 41.3851, lon: 2.1734 },
  { city: 'Toronto', country_code: 'CA', lat: 43.6532, lon: -79.3832 },
  { city: 'Vancouver', country_code: 'CA', lat: 49.2827, lon: -123.1207 },
  { city: 'Singapore', country_code: 'SG', lat: 1.3521, lon: 103.8198 },
  { city: 'Hong Kong', country_code: 'HK', lat: 22.3193, lon: 114.1694 },
];

const mockProfiles = [
  'Classic Espresso',
  'Lungo',
  'Ristretto',
  'Filter 2.0',
  'Turbo',
  'Blooming Espresso',
  'Adaptive',
  'Low Pressure',
];

const mockSoftware = [
  { name: 'Decenza|DE1', version: '1.2.3' },
  { name: 'Decenza|DE1', version: '1.1.0' },
  { name: 'Visualizer', version: '3.0.1' },
  { name: 'Decent App', version: '2.5.0' },
];

const mockMachines = [
  'Decent DE1',
  'Decent DE1PRO',
  'Decent DE1XL',
  'Bengle',
  'Custom Lever',
];

function randomItem<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

let mockIdCounter = 0;

function generateMockShot(): ShotEvent {
  const city = randomItem(mockCities);
  const software = randomItem(mockSoftware);

  return {
    event_id: `mock-${++mockIdCounter}`,
    ts: Date.now(),
    city: city.city,
    country_code: city.country_code,
    lat: city.lat,
    lon: city.lon,
    profile: randomItem(mockProfiles),
    software_name: software.name,
    software_version: software.version,
    machine_model: randomItem(mockMachines),
  };
}

export function useMockEvents({
  onShot,
  enabled = false,
  interval = 3000,
}: UseMockEventsOptions) {
  const intervalRef = useRef<number>();

  useEffect(() => {
    if (!enabled) return;

    // Generate initial shots
    for (let i = 0; i < 5; i++) {
      setTimeout(() => {
        onShot(generateMockShot());
      }, i * 500);
    }

    // Generate periodic shots with some randomness
    intervalRef.current = window.setInterval(() => {
      const delay = Math.random() * interval;
      setTimeout(() => {
        onShot(generateMockShot());
      }, delay);
    }, interval);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [enabled, interval, onShot]);
}

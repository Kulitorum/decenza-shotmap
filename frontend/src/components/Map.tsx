import { useEffect, useRef, useMemo } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { ShotEvent } from '../types/shot';
import type { MapStyle } from './Sidebar';

interface MapProps {
  shots: ShotEvent[];
  mapStyle: MapStyle;
}

interface AggregatedLocation {
  key: string;
  lat: number;
  lon: number;
  city: string;
  count: number;
  newestTs: number;
}

interface LocationMarker {
  marker: maplibregl.Marker;
  element: HTMLDivElement;
}

const TILE_SOURCES = {
  voyager: {
    url: 'https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
  },
  satellite: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: '&copy; <a href="https://www.esri.com/">Esri</a>',
  },
};

const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;

export default function Map({ shots, mapStyle }: MapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<globalThis.Map<string, LocationMarker>>(new globalThis.Map());
  const updateIntervalRef = useRef<number | null>(null);

  // Aggregate shots by location (round to ~1km precision)
  const aggregatedLocations = useMemo(() => {
    const now = Date.now();
    const locationMap = new globalThis.Map<string, AggregatedLocation>();

    for (const shot of shots) {
      const ts = new Date(shot.ts).getTime();
      const age = now - ts;

      // Skip shots older than 24 hours
      if (age > TWENTY_FOUR_HOURS) continue;

      // Round coordinates to aggregate nearby shots (~1km)
      const latKey = Math.round(shot.lat * 100) / 100;
      const lonKey = Math.round(shot.lon * 100) / 100;
      const key = `${latKey},${lonKey}`;

      const existing = locationMap.get(key);
      if (existing) {
        existing.count++;
        if (ts > existing.newestTs) {
          existing.newestTs = ts;
        }
      } else {
        locationMap.set(key, {
          key,
          lat: shot.lat,
          lon: shot.lon,
          city: shot.city,
          count: 1,
          newestTs: ts,
        });
      }
    }

    return Array.from(locationMap.values());
  }, [shots]);

  // Build map style object
  const buildStyle = (style: MapStyle): maplibregl.StyleSpecification => {
    const source = TILE_SOURCES[style];
    return {
      version: 8,
      sources: {
        basemap: {
          type: 'raster',
          tiles: [source.url],
          tileSize: 256,
          attribution: source.attribution,
        },
      },
      layers: [
        {
          id: 'basemap',
          type: 'raster',
          source: 'basemap',
          minzoom: 0,
          maxzoom: 20,
        },
      ],
      glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
    };
  };

  // Initialize map
  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainer.current,
      style: buildStyle(mapStyle),
      center: [10, 45],
      zoom: 2,
      maxZoom: 18,
      minZoom: 1,
    });

    mapRef.current = map;

    return () => {
      if (updateIntervalRef.current) {
        clearInterval(updateIntervalRef.current);
      }
      for (const data of markersRef.current.values()) {
        data.marker.remove();
      }
      markersRef.current.clear();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Update map style when it changes
  useEffect(() => {
    if (!mapRef.current) return;
    mapRef.current.setStyle(buildStyle(mapStyle));
  }, [mapStyle]);

  // Update markers when aggregated locations change
  useEffect(() => {
    if (!mapRef.current) return;

    const map = mapRef.current;
    const existingKeys = new Set(markersRef.current.keys());
    const newKeys = new Set(aggregatedLocations.map(loc => loc.key));

    // Remove markers that no longer exist
    for (const key of existingKeys) {
      if (!newKeys.has(key)) {
        const data = markersRef.current.get(key);
        if (data) {
          data.marker.remove();
          markersRef.current.delete(key);
        }
      }
    }

    // Add or update markers
    const now = Date.now();
    for (const loc of aggregatedLocations) {
      const age = now - loc.newestTs;
      const opacity = Math.max(0.15, 1 - (age / TWENTY_FOUR_HOURS) * 0.85);
      const scale = Math.min(1.5, 0.8 + (loc.count * 0.1));

      const existing = markersRef.current.get(loc.key);
      if (existing) {
        // Update opacity and scale
        existing.element.style.opacity = String(opacity);
        existing.element.style.transform = `scale(${scale})`;
      } else {
        // Create new marker
        const el = document.createElement('div');
        el.className = 'location-dot';
        el.style.opacity = String(opacity);
        el.style.transform = `scale(${scale})`;
        el.title = `${loc.city}: ${loc.count} shot${loc.count > 1 ? 's' : ''}`;

        const marker = new maplibregl.Marker({
          element: el,
          anchor: 'center',
        })
          .setLngLat([loc.lon, loc.lat])
          .addTo(map);

        markersRef.current.set(loc.key, { marker, element: el });
      }
    }
  }, [aggregatedLocations]);

  // Periodically update opacity based on age
  useEffect(() => {
    updateIntervalRef.current = window.setInterval(() => {
      const now = Date.now();
      for (const loc of aggregatedLocations) {
        const data = markersRef.current.get(loc.key);
        if (data) {
          const age = now - loc.newestTs;
          const opacity = Math.max(0.15, 1 - (age / TWENTY_FOUR_HOURS) * 0.85);
          data.element.style.opacity = String(opacity);
        }
      }
    }, 60000); // Update every minute

    return () => {
      if (updateIntervalRef.current) {
        clearInterval(updateIntervalRef.current);
      }
    };
  }, [aggregatedLocations]);

  return <div ref={mapContainer} style={{ width: '100%', height: '100%' }} />;
}

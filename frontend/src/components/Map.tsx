import { useEffect, useRef, useMemo, useState, useCallback } from 'react';
import maplibregl from 'maplibre-gl';
import Supercluster from 'supercluster';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { ShotEvent } from '../types/shot';
import type { MapStyle } from './Sidebar';

interface MapProps {
  shots: ShotEvent[];
  mapStyle: MapStyle;
}

interface ShotProperties {
  city: string;
  profile: string;
  ts: number;
}

interface ClusterProperties {
  cluster: true;
  cluster_id: number;
  point_count: number;
}

type PointFeature = GeoJSON.Feature<GeoJSON.Point, ShotProperties>;

interface AggregatedCluster {
  key: string;
  lat: number;
  lon: number;
  cities: globalThis.Map<string, number>; // city -> count
  count: number;
  newestTs: number;
  profiles: globalThis.Map<string, number>; // profile name -> count
  isCluster: boolean;
  clusterId?: number;
}

interface LocationMarker {
  marker: maplibregl.Marker;
  element: HTMLDivElement;
  popup: maplibregl.Popup;
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
const DEFAULT_CENTER: [number, number] = [10, 45];
const DEFAULT_ZOOM = 2;

export default function Map({ shots, mapStyle }: MapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<globalThis.Map<string, LocationMarker>>(new globalThis.Map());
  const updateIntervalRef = useRef<number | null>(null);
  const superclusterRef = useRef<Supercluster<ShotProperties, ClusterProperties> | null>(null);
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);

  // Filter shots to last 24 hours and create GeoJSON features
  const geoJsonPoints = useMemo(() => {
    const now = Date.now();
    const points: PointFeature[] = [];

    for (const shot of shots) {
      const ts = new Date(shot.ts).getTime();
      const age = now - ts;
      if (age > TWENTY_FOUR_HOURS) continue;

      points.push({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [shot.lon, shot.lat],
        },
        properties: {
          city: shot.city,
          profile: shot.profile || 'Unknown',
          ts,
        },
      });
    }

    return points;
  }, [shots]);

  // Initialize Supercluster
  useEffect(() => {
    superclusterRef.current = new Supercluster<ShotProperties, ClusterProperties>({
      radius: 10, // Cluster radius in pixels - only merge when dots overlap
      maxZoom: 16,
      minZoom: 0,
    });
    superclusterRef.current.load(geoJsonPoints);
  }, [geoJsonPoints]);

  // Get clusters for current zoom level
  const getClusters = useCallback((currentZoom: number): AggregatedCluster[] => {
    if (!superclusterRef.current) return [];

    const clusters = superclusterRef.current.getClusters([-180, -85, 180, 85], Math.floor(currentZoom));
    const result: AggregatedCluster[] = [];

    for (const feature of clusters) {
      const [lon, lat] = feature.geometry.coordinates;
      const props = feature.properties;

      if ('cluster' in props && props.cluster) {
        // It's a cluster - get all leaves to aggregate stats
        const leaves = superclusterRef.current.getLeaves(props.cluster_id, Infinity);
        const cities = new globalThis.Map<string, number>();
        const profiles = new globalThis.Map<string, number>();
        let newestTs = 0;

        for (const leaf of leaves) {
          const leafProps = leaf.properties as ShotProperties;
          cities.set(leafProps.city, (cities.get(leafProps.city) || 0) + 1);
          profiles.set(leafProps.profile, (profiles.get(leafProps.profile) || 0) + 1);
          if (leafProps.ts > newestTs) newestTs = leafProps.ts;
        }

        result.push({
          key: `cluster-${props.cluster_id}`,
          lat,
          lon,
          cities,
          count: props.point_count,
          newestTs,
          profiles,
          isCluster: true,
          clusterId: props.cluster_id,
        });
      } else {
        // Single point
        const pointProps = props as ShotProperties;
        const cities = new globalThis.Map<string, number>();
        cities.set(pointProps.city, 1);
        const profiles = new globalThis.Map<string, number>();
        profiles.set(pointProps.profile, 1);

        result.push({
          key: `point-${lat}-${lon}-${pointProps.ts}`,
          lat,
          lon,
          cities,
          count: 1,
          newestTs: pointProps.ts,
          profiles,
          isCluster: false,
        });
      }
    }

    return result;
  }, []);

  const [aggregatedClusters, setAggregatedClusters] = useState<AggregatedCluster[]>([]);

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

  // Build popup HTML content for clusters
  const buildPopupContent = (cluster: AggregatedCluster): string => {
    // Sort cities by count descending
    const sortedCities = Array.from(cluster.cities.entries())
      .sort((a, b) => b[1] - a[1]);

    // Sort profiles by count descending
    const sortedProfiles = Array.from(cluster.profiles.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5); // Top 5 profiles

    const profileList = sortedProfiles
      .map(([name, count]) => `<li>${name}: ${count}</li>`)
      .join('');

    // Build title based on number of cities
    let titleHtml: string;
    if (sortedCities.length === 1) {
      titleHtml = `<div class="shot-popup-title">${sortedCities[0][0]}</div>`;
    } else if (sortedCities.length <= 3) {
      // Show all cities
      const cityNames = sortedCities.map(([name]) => name).join(', ');
      titleHtml = `<div class="shot-popup-title">${cityNames}</div>`;
    } else {
      // Show top 2 cities + "and X more"
      const topTwo = sortedCities.slice(0, 2).map(([name]) => name).join(', ');
      const remaining = sortedCities.length - 2;
      titleHtml = `<div class="shot-popup-title">${topTwo}</div><div class="shot-popup-more">and ${remaining} more location${remaining > 1 ? 's' : ''}</div>`;
    }

    return `
      ${titleHtml}
      <div class="shot-popup-count">${cluster.count} shot${cluster.count > 1 ? 's' : ''}</div>
      <div class="shot-popup-profiles">
        Profiles:
        <ul>${profileList}</ul>
      </div>
    `;
  };

  // Initialize map
  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainer.current,
      style: buildStyle(mapStyle),
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
      maxZoom: 18,
      minZoom: 1,
    });

    mapRef.current = map;

    // Track zoom changes for clustering
    const handleZoom = () => {
      setZoom(map.getZoom());
    };
    map.on('zoomend', handleZoom);
    map.on('moveend', handleZoom);

    return () => {
      map.off('zoomend', handleZoom);
      map.off('moveend', handleZoom);
      if (updateIntervalRef.current) {
        clearInterval(updateIntervalRef.current);
      }
      for (const data of markersRef.current.values()) {
        data.popup.remove();
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

  // Update clusters when zoom or data changes
  useEffect(() => {
    if (!superclusterRef.current) return;
    setAggregatedClusters(getClusters(zoom));
  }, [zoom, geoJsonPoints, getClusters]);

  // Update markers when clusters change
  useEffect(() => {
    if (!mapRef.current) return;

    const map = mapRef.current;
    const existingKeys = new Set(markersRef.current.keys());
    const newKeys = new Set(aggregatedClusters.map(c => c.key));

    // Remove markers that no longer exist
    for (const key of existingKeys) {
      if (!newKeys.has(key)) {
        const data = markersRef.current.get(key);
        if (data) {
          data.popup.remove();
          data.marker.remove();
          markersRef.current.delete(key);
        }
      }
    }

    // Add or update markers
    const now = Date.now();
    for (const cluster of aggregatedClusters) {
      const age = now - cluster.newestTs;
      const opacity = Math.max(0.15, 1 - (age / TWENTY_FOUR_HOURS) * 0.85);
      const size = Math.min(32, 12 + Math.sqrt(cluster.count) * 4); // Size based on count

      const existing = markersRef.current.get(cluster.key);
      if (existing) {
        // Update opacity, size, and popup content
        existing.element.style.opacity = String(opacity);
        existing.element.style.setProperty('--dot-size', `${size}px`);
        existing.popup.setHTML(buildPopupContent(cluster));
        existing.popup.setOffset([0, -size / 2 - 5]);
      } else {
        // Create new marker
        const el = document.createElement('div');
        el.className = cluster.isCluster ? 'location-dot cluster' : 'location-dot';
        el.style.opacity = String(opacity);
        el.style.setProperty('--dot-size', `${size}px`);

        // Create popup
        const popup = new maplibregl.Popup({
          closeButton: false,
          closeOnClick: false,
          className: 'shot-popup',
          offset: [0, -size / 2 - 5],
        }).setHTML(buildPopupContent(cluster));

        // Show popup on hover
        el.addEventListener('mouseenter', () => {
          popup.setLngLat([cluster.lon, cluster.lat]).addTo(map);
        });
        el.addEventListener('mouseleave', () => {
          popup.remove();
        });

        // Click to zoom into cluster
        if (cluster.isCluster && cluster.clusterId !== undefined) {
          el.style.cursor = 'pointer';
          el.addEventListener('click', () => {
            if (superclusterRef.current && cluster.clusterId !== undefined) {
              const expansionZoom = superclusterRef.current.getClusterExpansionZoom(cluster.clusterId);
              map.easeTo({
                center: [cluster.lon, cluster.lat],
                zoom: Math.min(expansionZoom, 16),
              });
            }
          });
        }

        const marker = new maplibregl.Marker({
          element: el,
          anchor: 'center',
        })
          .setLngLat([cluster.lon, cluster.lat])
          .addTo(map);

        markersRef.current.set(cluster.key, { marker, element: el, popup });
      }
    }
  }, [aggregatedClusters]);

  // Periodically update opacity based on age
  useEffect(() => {
    updateIntervalRef.current = window.setInterval(() => {
      const now = Date.now();
      for (const cluster of aggregatedClusters) {
        const data = markersRef.current.get(cluster.key);
        if (data) {
          const age = now - cluster.newestTs;
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
  }, [aggregatedClusters]);

  const resetView = () => {
    if (mapRef.current) {
      mapRef.current.jumpTo({
        center: DEFAULT_CENTER,
        zoom: DEFAULT_ZOOM,
      });
    }
  };

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <div ref={mapContainer} style={{ width: '100%', height: '100%' }} />
      <div className="map-controls">
        <button className="map-control-btn" onClick={resetView} title="Reset view">
          ⌂
        </button>
      </div>
    </div>
  );
}

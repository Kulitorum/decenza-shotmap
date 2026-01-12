import { useEffect, useRef, useMemo, useState, useCallback } from 'react';
import maplibregl from 'maplibre-gl';
import Supercluster from 'supercluster';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { ShotEvent } from '../types/shot';
import type { MapStyle } from './Sidebar';

// Solar terminator calculation - computes day/night boundary on Earth
function getSunPosition(date: Date): { declination: number; hourAngle: number } {
  // Days since J2000.0 epoch (Jan 1, 2000 12:00 UTC)
  const jd = date.getTime() / 86400000 + 2440587.5;
  const n = jd - 2451545.0;

  // Mean longitude of the Sun (degrees)
  const L = (280.460 + 0.9856474 * n) % 360;
  // Mean anomaly of the Sun (degrees)
  const g = ((357.528 + 0.9856003 * n) % 360) * Math.PI / 180;

  // Ecliptic longitude (degrees)
  const lambda = L + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g);
  // Obliquity of the ecliptic (degrees)
  const epsilon = 23.439 - 0.0000004 * n;

  // Sun's declination
  const declination = Math.asin(
    Math.sin(epsilon * Math.PI / 180) * Math.sin(lambda * Math.PI / 180)
  ) * 180 / Math.PI;

  // Greenwich Mean Sidereal Time (hours)
  const gmst = (18.697374558 + 24.06570982441908 * n) % 24;
  // Sun's right ascension (hours)
  const ra = Math.atan2(
    Math.cos(epsilon * Math.PI / 180) * Math.sin(lambda * Math.PI / 180),
    Math.cos(lambda * Math.PI / 180)
  ) * 180 / Math.PI / 15;

  // Hour angle (degrees) - where the sun is relative to Greenwich
  const hourAngle = (gmst - ra) * 15;

  return { declination, hourAngle };
}

function generateTerminatorPolygon(date: Date): GeoJSON.Feature<GeoJSON.Polygon> {
  const { declination, hourAngle } = getSunPosition(date);
  const decRad = declination * Math.PI / 180;

  // Generate points along the terminator (day/night boundary)
  const points: [number, number][] = [];

  // The terminator is where the sun is at the horizon
  // For each longitude, calculate the latitude where sun elevation = 0
  for (let lon = -180; lon <= 180; lon += 2) {
    // Hour angle at this longitude
    const ha = (hourAngle + lon) * Math.PI / 180;

    // Latitude where sun is at horizon (elevation = 0)
    // sin(elevation) = sin(lat)*sin(dec) + cos(lat)*cos(dec)*cos(ha) = 0
    // tan(lat) = -cos(ha) / tan(dec)
    let lat: number;
    if (Math.abs(declination) < 0.001) {
      // Equinox - terminator is a great circle through poles
      lat = Math.atan(-Math.cos(ha) / 0.001) * 180 / Math.PI;
    } else {
      lat = Math.atan(-Math.cos(ha) / Math.tan(decRad)) * 180 / Math.PI;
    }

    // Clamp latitude to valid range
    lat = Math.max(-90, Math.min(90, lat));
    points.push([lon, lat]);
  }

  // Build the night polygon
  // The night region is always bounded by the terminator and the polar night pole
  // Polar night pole: South pole when declination >= 0 (northern summer),
  //                   North pole when declination < 0 (northern winter)
  const nightPoints: [number, number][] = [];
  const polarNightLat = declination >= 0 ? -90 : 90;

  // Start from the terminator
  for (const p of points) {
    nightPoints.push(p);
  }

  // Close via the polar night pole
  nightPoints.push([180, polarNightLat]);
  nightPoints.push([-180, polarNightLat]);
  nightPoints.push(points[0]); // Close the polygon

  return {
    type: 'Feature',
    properties: {},
    geometry: {
      type: 'Polygon',
      coordinates: [nightPoints],
    },
  };
}

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

const TILE_SOURCES: Record<string, { url: string; attribution: string }> = {
  voyager: {
    url: 'https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
  },
  positron: {
    url: 'https://basemaps.cartocdn.com/light_all/{z}/{x}/{y}@2x.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
  },
  'dark-matter': {
    url: 'https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
  },
  satellite: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: '&copy; <a href="https://www.esri.com/">Esri</a>',
  },
  'esri-topo': {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',
    attribution: '&copy; <a href="https://www.esri.com/">Esri</a>',
  },
  osm: {
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
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
  const [showDayNight, setShowDayNight] = useState(false);
  const dayNightIntervalRef = useRef<number | null>(null);

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

  // Manage day/night overlay
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const sourceId = 'day-night-source';
    const layerId = 'day-night-layer';

    const addDayNightLayer = () => {
      if (!map.isStyleLoaded()) return;
      // Don't add if already exists
      if (map.getSource(sourceId)) return;

      const geojson = generateTerminatorPolygon(new Date());
      map.addSource(sourceId, {
        type: 'geojson',
        data: geojson,
      });
      map.addLayer({
        id: layerId,
        type: 'fill',
        source: sourceId,
        paint: {
          'fill-color': '#000022',
          'fill-opacity': 0.4,
        },
      });
    };

    const removeDayNightLayer = () => {
      if (map.getLayer(layerId)) {
        map.removeLayer(layerId);
      }
      if (map.getSource(sourceId)) {
        map.removeSource(sourceId);
      }
    };

    if (showDayNight) {
      // Always listen for style.load to re-add layer after style changes
      const onStyleLoad = () => addDayNightLayer();
      map.on('style.load', onStyleLoad);

      // Also add immediately if style is already loaded
      addDayNightLayer();

      // Update every minute for real-time accuracy
      dayNightIntervalRef.current = window.setInterval(() => {
        if (map.isStyleLoaded() && map.getSource(sourceId)) {
          const geojson = generateTerminatorPolygon(new Date());
          (map.getSource(sourceId) as maplibregl.GeoJSONSource).setData(geojson);
        }
      }, 60000);

      return () => {
        map.off('style.load', onStyleLoad);
        if (dayNightIntervalRef.current) {
          clearInterval(dayNightIntervalRef.current);
          dayNightIntervalRef.current = null;
        }
      };
    } else {
      removeDayNightLayer();
    }
  }, [showDayNight]);

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
        <button
          className={`map-control-btn${showDayNight ? ' active' : ''}`}
          onClick={() => setShowDayNight(!showDayNight)}
          title="Toggle day/night overlay"
        >
          ◐
        </button>
      </div>
    </div>
  );
}

import type { Stats } from '../types/shot';

export type MapStyle =
  | 'voyager'
  | 'positron'
  | 'dark-matter'
  | 'satellite'
  | 'esri-topo'
  | 'osm';

export const MAP_STYLE_LABELS: Record<MapStyle, string> = {
  'voyager': 'Street (CARTO Voyager)',
  'positron': 'Light (CARTO Positron)',
  'dark-matter': 'Dark (CARTO Dark Matter)',
  'satellite': 'Satellite (ESRI)',
  'esri-topo': 'Topographic (ESRI)',
  'osm': 'OpenStreetMap',
};

interface SidebarProps {
  stats: Stats;
  mapStyle: MapStyle;
  onMapStyleChange: (style: MapStyle) => void;
  isOpen: boolean;
}

export default function Sidebar({ stats, mapStyle, onMapStyleChange, isOpen }: SidebarProps) {
  return (
    <div className={`sidebar ${isOpen ? 'open' : ''}`}>
      <div className="sidebar-header">
        <h1>Decenza Shot Map</h1>
        <p>Espresso shots worldwide</p>
      </div>

      <div className="stats-section">
        <div className="stats-grid">
          <div className="stat-item">
            <div className="stat-value">{stats.shots_today.toLocaleString()}</div>
            <div className="stat-label">Last 24 Hours</div>
          </div>
          <div className="stat-item">
            <div className="stat-value">{stats.shots_last_hour.toLocaleString()}</div>
            <div className="stat-label">Last Hour</div>
          </div>
        </div>
      </div>

      <div className="top-lists">
        <div className="top-list">
          <h3>Top Cities (24h)</h3>
          {stats.top_cities.length === 0 ? (
            <div className="top-list-item">
              <span className="name" style={{ color: 'var(--color-text-muted)' }}>
                No data yet
              </span>
            </div>
          ) : (
            stats.top_cities.slice(0, 5).map((item, i) => (
              <div key={i} className="top-list-item">
                <span className="name">{item.city}</span>
                <span className="count">{item.count}</span>
              </div>
            ))
          )}
        </div>

        <div className="top-list">
          <h3>Top Profiles (24h)</h3>
          {stats.top_profiles.length === 0 ? (
            <div className="top-list-item">
              <span className="name" style={{ color: 'var(--color-text-muted)' }}>
                No data yet
              </span>
            </div>
          ) : (
            stats.top_profiles.slice(0, 5).map((item, i) => (
              <div key={i} className="top-list-item">
                <span className="name">{item.profile}</span>
                <span className="count">{item.count}</span>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="map-style-section">
        <h3>Map Style</h3>
        <select
          className="map-style-select"
          value={mapStyle}
          onChange={(e) => onMapStyleChange(e.target.value as MapStyle)}
        >
          {(Object.keys(MAP_STYLE_LABELS) as MapStyle[]).map((key) => (
            <option key={key} value={key}>
              {MAP_STYLE_LABELS[key]}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

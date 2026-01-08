import type { ShotEvent, Stats } from '../types/shot';
import type { ConnectionStatus } from '../hooks/useWebSocket';

interface SidebarProps {
  shots: ShotEvent[];
  stats: Stats;
  connectionStatus: ConnectionStatus;
  isOpen: boolean;
}

export default function Sidebar({ shots, stats, connectionStatus, isOpen }: SidebarProps) {
  return (
    <div className={`sidebar ${isOpen ? 'open' : ''}`}>
      <div className="sidebar-header">
        <h1>Decenza Shot Map</h1>
        <p>Live espresso shots worldwide</p>
      </div>

      <div className="stats-section">
        <div className="stats-grid">
          <div className="stat-item">
            <div className="stat-value">{stats.shots_today.toLocaleString()}</div>
            <div className="stat-label">Shots Today</div>
          </div>
          <div className="stat-item">
            <div className="stat-value">{stats.shots_last_hour.toLocaleString()}</div>
            <div className="stat-label">Last Hour</div>
          </div>
        </div>
      </div>

      <div className="top-lists">
        <div className="top-list">
          <h3>Top Cities Today</h3>
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
          <h3>Top Profiles Today</h3>
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

      <div className="ticker-section">
        <div className="ticker-header">
          <h3>Live Feed</h3>
        </div>
        <div className="ticker-list">
          {shots.slice(0, 20).map((shot, index) => (
            <TickerItem key={shot.event_id || `${shot.ts}-${index}`} shot={shot} />
          ))}
        </div>
      </div>

      <div className="connection-status">
        <div className={`status-dot ${connectionStatus}`} />
        <span>
          {connectionStatus === 'connected' && 'Connected'}
          {connectionStatus === 'connecting' && 'Connecting...'}
          {connectionStatus === 'disconnected' && 'Disconnected'}
        </span>
      </div>
    </div>
  );
}

function TickerItem({ shot }: { shot: ShotEvent }) {
  const timeAgo = getTimeAgo(shot.ts);

  return (
    <div className="ticker-item">
      <div>
        <span className="city">{shot.city}</span>
        {shot.country_code && (
          <span className="country">{shot.country_code}</span>
        )}
      </div>
      <div className="details">
        {shot.profile} &bull; {shot.machine_model}
      </div>
      <div className="time">{timeAgo}</div>
    </div>
  );
}

function getTimeAgo(ts: number): string {
  const seconds = Math.floor((Date.now() - ts) / 1000);

  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

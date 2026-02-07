import { useState, useEffect, useCallback } from 'react';
import Map from './components/Map';
import Sidebar, { type MapStyle } from './components/Sidebar';
import { useWebSocket } from './hooks/useWebSocket';
import { useStats } from './hooks/useStats';
import { useMockEvents } from './hooks/useMockEvents';
import type { ShotEvent } from './types/shot';
import './App.css';

const API_URL = import.meta.env.VITE_API_URL || '';
const WS_URL = import.meta.env.VITE_WS_URL || '';
const MOCK_MODE = import.meta.env.VITE_MOCK_MODE === 'true';

const MAX_RECENT_SHOTS = 100;

function App() {
  const [recentShots, setRecentShots] = useState<ShotEvent[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth > 768);
  const [mapStyle, setMapStyle] = useState<MapStyle>('satellite');

  // Add new shot to the list
  const addShot = useCallback((shot: ShotEvent) => {
    setRecentShots(prev => {
      const newShots = [shot, ...prev];
      return newShots.slice(0, MAX_RECENT_SHOTS);
    });
  }, []);

  // WebSocket connection for real-time updates
  useWebSocket({
    url: WS_URL,
    onShot: addShot,
    enabled: !MOCK_MODE && !!WS_URL,
  });

  // Mock events for development
  useMockEvents({
    onShot: addShot,
    enabled: MOCK_MODE,
    interval: 3000,
  });

  // Stats polling
  const { stats } = useStats({
    apiUrl: API_URL,
    enabled: !MOCK_MODE && !!API_URL,
    pollInterval: 30000,
  });

  // Fetch shots from last 24 hours
  useEffect(() => {
    if (MOCK_MODE || !API_URL) return;

    fetch(`${API_URL}/v1/shots/recent?limit=500`)
      .then(res => res.json())
      .then(data => {
        if (data.shots) {
          setRecentShots(data.shots);
        }
      })
      .catch(err => console.error('Failed to fetch recent shots:', err));
  }, []);

  return (
    <div className="app">
      <div className="map-container">
        <Map shots={recentShots} mapStyle={mapStyle} />
      </div>

      <button
        className="sidebar-toggle"
        onClick={() => setSidebarOpen(!sidebarOpen)}
        aria-label={sidebarOpen ? 'Close sidebar' : 'Open sidebar'}
      >
        {sidebarOpen ? '✕' : '☰'}
      </button>

      <Sidebar
        stats={stats}
        mapStyle={mapStyle}
        onMapStyleChange={setMapStyle}
        isOpen={sidebarOpen}
      />
    </div>
  );
}

export default App;

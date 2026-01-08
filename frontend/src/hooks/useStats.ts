import { useState, useEffect, useCallback } from 'react';
import type { Stats } from '../types/shot';

interface UseStatsOptions {
  apiUrl: string;
  enabled?: boolean;
  pollInterval?: number;
}

const defaultStats: Stats = {
  shots_today: 0,
  shots_last_hour: 0,
  top_cities: [],
  top_profiles: [],
};

export function useStats({
  apiUrl,
  enabled = true,
  pollInterval = 30000,
}: UseStatsOptions) {
  const [stats, setStats] = useState<Stats>(defaultStats);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = useCallback(async () => {
    if (!enabled || !apiUrl) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${apiUrl}/v1/stats`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data = await response.json();
      setStats(data);
    } catch (err) {
      console.error('Failed to fetch stats:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [apiUrl, enabled]);

  useEffect(() => {
    fetchStats();

    const interval = setInterval(fetchStats, pollInterval);
    return () => clearInterval(interval);
  }, [fetchStats, pollInterval]);

  return { stats, loading, error, refresh: fetchStats };
}

import { useEffect, useRef, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import type { AiPredictionSettings, AiTunableKey, BotSettings, OpenPosition, PendingOrder, Strategy, StrategyOptimization, TradeHistory } from '@/lib/types';

const HEARTBEAT_STALE_SECONDS = 60;

export function useBotSettings() {
  const [settings, setSettings] = useState<BotSettings | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchSettings = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('bot_settings')
        .select('*')
        .eq('id', 1)
        .maybeSingle();
      if (error) {
        console.error('Failed to load bot settings:', error);
        return;
      }
      setSettings(data as BotSettings | null);
    } catch (error) {
      console.error('Failed to load bot settings:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
    const interval = setInterval(fetchSettings, 5000);
    const channel = supabase
      .channel('bot_settings_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bot_settings' }, () => {
        fetchSettings();
      })
      .subscribe();
    return () => {
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, [fetchSettings]);

  const updateSettings = useCallback(
    async (patch: Partial<BotSettings>) => {
      const { error } = await supabase
        .from('bot_settings')
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq('id', 1);
      if (error) {
        console.error('Failed to update settings:', error);
        return false;
      }
      await fetchSettings();
      return true;
    },
    [fetchSettings]
  );

  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const isOnline =
    settings?.last_heartbeat !== null &&
    settings?.last_heartbeat !== undefined &&
    Math.floor((Date.now() - new Date(settings.last_heartbeat).getTime()) / 1000) <
      HEARTBEAT_STALE_SECONDS;

  return { settings, loading, updateSettings, isOnline, refetch: fetchSettings };
}

export function useOpenPositions() {
  const [positions, setPositions] = useState<OpenPosition[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchPositions = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('open_positions')
        .select('*')
        .order('open_time', { ascending: false });
      if (error) {
        console.error('Failed to load positions:', error);
        return;
      }
      setPositions((data as OpenPosition[]) ?? []);
    } catch (error) {
      console.error('Failed to load positions:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPositions();
    const interval = setInterval(fetchPositions, 3000);
    const channel = supabase
      .channel('open_positions_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'open_positions' }, () => {
        fetchPositions();
      })
      .subscribe();
    return () => {
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, [fetchPositions]);

  return { positions, loading, refetch: fetchPositions };
}

export function usePendingOrders() {
  const [orders, setOrders] = useState<PendingOrder[]>([]);

  const fetchOrders = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('pending_orders')
        .select('*')
        .eq('status', 'pending')
        .order('created_at', { ascending: false });
      if (error) {
        console.error('Failed to load pending orders:', error);
        return;
      }
      setOrders((data as PendingOrder[]) ?? []);
    } catch (error) {
      console.error('Failed to load pending orders:', error);
    }
  }, []);

  useEffect(() => {
    fetchOrders();
    const interval = setInterval(fetchOrders, 3000);
    const channel = supabase
      .channel('pending_orders_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pending_orders' }, () => {
        fetchOrders();
      })
      .subscribe();
    return () => {
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, [fetchOrders]);

  return { orders, refetch: fetchOrders };
}

export function useRecentTrades(days: number) {
  const [trades, setTrades] = useState<Pick<TradeHistory, 'close_time' | 'profit'>[]>([]);

  const fetchTrades = useCallback(async () => {
    try {
      const since = new Date(Date.now() - (days + 1) * 86400000).toISOString();
      const { data, error } = await supabase
        .from('trade_history')
        .select('close_time, profit')
        .gte('close_time', since);
      if (error) {
        console.error('Failed to load recent trades:', error);
        return;
      }
      setTrades((data as Pick<TradeHistory, 'close_time' | 'profit'>[]) ?? []);
    } catch (error) {
      console.error('Failed to load recent trades:', error);
    }
  }, [days]);

  useEffect(() => {
    fetchTrades();
    const interval = setInterval(fetchTrades, 10000);
    return () => clearInterval(interval);
  }, [fetchTrades]);

  return trades;
}

export function useAiPredictionSettings() {
  const [settings, setSettings] = useState<AiPredictionSettings | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchSettings = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('ai_prediction_settings')
        .select('*')
        .eq('id', 1)
        .maybeSingle();
      if (error) {
        console.error('Failed to load AI prediction settings:', error);
        return;
      }
      setSettings(data as AiPredictionSettings | null);
    } catch (error) {
      console.error('Failed to load AI prediction settings:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
    const interval = setInterval(fetchSettings, 5000);
    return () => clearInterval(interval);
  }, [fetchSettings]);

  const saveSettings = useCallback(
    async (patch: Record<AiTunableKey, number>) => {
      const { error } = await supabase
        .from('ai_prediction_settings')
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq('id', 1);
      if (error) {
        console.error('Failed to save AI prediction settings:', error);
        return false;
      }
      await fetchSettings();
      return true;
    },
    [fetchSettings]
  );

  return { settings, loading, saveSettings, refetch: fetchSettings };
}

export function useStrategies() {
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const fetchStrategies = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('strategies')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) {
        console.error('Failed to load strategies:', error);
        setError(true);
        return;
      }
      setStrategies((data as Strategy[]) ?? []);
      setError(false);
    } catch (err) {
      console.error('Failed to load strategies:', err);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStrategies();
  }, [fetchStrategies]);

  return { strategies, loading, error, refetch: fetchStrategies };
}

export function useOptimizations(strategyId: string) {
  const [optimizations, setOptimizations] = useState<StrategyOptimization[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchOptimizations = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('strategy_optimizations')
        .select('*')
        .eq('strategy_id', strategyId)
        .order('created_at', { ascending: false })
        .limit(1);
      if (error) {
        console.error('Failed to load optimizations:', error);
        return;
      }
      setOptimizations((data as StrategyOptimization[]) ?? []);
    } catch (err) {
      console.error('Failed to load optimizations:', err);
    } finally {
      setLoading(false);
    }
  }, [strategyId]);

  useEffect(() => {
    fetchOptimizations();
    const interval = setInterval(fetchOptimizations, 5000);
    return () => clearInterval(interval);
  }, [fetchOptimizations]);

  return { optimizations, loading, refetch: fetchOptimizations };
}

export function usePolling<T>(
  fetcher: () => Promise<T>,
  intervalMs: number,
  deps: unknown[] = []
): { data: T | null; loading: boolean; error: string | null; refetch: () => void } {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const doFetch = useCallback(async () => {
    try {
      const result = await fetcherRef.current();
      setData(result);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    doFetch();
    const interval = setInterval(doFetch, intervalMs);
    return () => clearInterval(interval);
  }, [doFetch]);

  return { data, loading, error, refetch: doFetch };
}

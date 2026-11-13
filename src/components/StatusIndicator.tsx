import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useTranslation } from '@/lib/i18n';
import { Badge } from '@/components/ui';
import type { BotSettings } from '@/lib/types';

const HEARTBEAT_STALE_SECONDS = 60;

export function useBotStatus() {
  const [settings, setSettings] = useState<BotSettings | null>(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const { data, error } = await supabase
          .from('bot_settings')
          .select('*')
          .eq('id', 1)
          .maybeSingle();
        if (error) console.error('Failed to load bot status:', error);
        if (data) setSettings(data as BotSettings);
      } catch (error) {
        console.error('Failed to load bot status:', error);
      }
    };
    fetchSettings();
    const interval = setInterval(fetchSettings, 5000);
    const channel = supabase
      .channel('bot_settings_status')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bot_settings' }, () => {
        fetchSettings();
      })
      .subscribe();
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      clearInterval(interval);
      supabase.removeChannel(channel);
      clearInterval(tick);
    };
  }, []);

  const heartbeatAge = settings?.last_heartbeat
    ? Math.floor((now - new Date(settings.last_heartbeat).getTime()) / 1000)
    : null;
  const isOnline = heartbeatAge !== null && heartbeatAge < HEARTBEAT_STALE_SECONDS;

  return { settings, isOnline, heartbeatAge };
}

export function StatusIndicator() {
  const { t } = useTranslation();
  const { settings, isOnline, heartbeatAge } = useBotStatus();
  const running = settings?.is_running ?? false;

  let variant: 'success' | 'danger' | 'warning' | 'neutral' = 'neutral';
  let label = t('status.offline');

  if (isOnline && running) {
    variant = 'success';
    label = t('status.running');
  } else if (isOnline && !running) {
    variant = 'warning';
    label = t('status.idle');
  } else if (!isOnline && heartbeatAge !== null) {
    variant = 'danger';
    label = t('status.disconnected');
  } else {
    variant = 'neutral';
    label = t('status.neverStarted');
  }

  return (
    <div className="flex items-center gap-2">
      <Badge dot variant={variant}>{label}</Badge>
      {settings?.mt5_connected && isOnline && (
        <Badge variant="info">{t('status.mt5Connected')}</Badge>
      )}
    </div>
  );
}

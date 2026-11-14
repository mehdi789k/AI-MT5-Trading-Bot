import { useState } from 'react';
import { Square } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useTranslation } from '@/lib/i18n';
import { Button, Modal } from '@/components/ui';

interface EngineShutdownButtonProps {
  isOnline: boolean;
}

export function EngineShutdownButton({ isOnline }: EngineShutdownButtonProps) {
  const { t } = useTranslation();
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);
  const [requested, setRequested] = useState(false);
  const [failed, setFailed] = useState(false);

  const requestShutdown = async () => {
    setSending(true);
    setFailed(false);
    try {
      const { error } = await supabase.from('bot_logs').insert({
        level: 'warning',
        message: 'Engine shutdown requested from the dashboard',
        details: { action: 'shutdown_engine', requested_by: 'dashboard' },
      });
      if (error) {
        console.error('Failed to send shutdown request:', error);
        setFailed(true);
        return;
      }
      setRequested(true);
      setConfirming(false);
    } catch (err) {
      console.error('Failed to send shutdown request:', err);
      setFailed(true);
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <Button
        onClick={() => setConfirming(true)}
        variant="ghost"
        size="md"
        disabled={!isOnline || requested}
        className="w-full text-danger-text"
      >
        <span className="flex items-center justify-center gap-2">
          <Square size={14} />
          {requested ? t('power.shuttingDown') : t('power.shutdown')}
        </span>
      </Button>

      {confirming && (
        <Modal onClose={() => setConfirming(false)} className="max-w-md">
          <h2 className="text-lg font-semibold text-text-primary mb-2">{t('power.shutdownTitle')}</h2>
          <p className="text-text-secondary text-sm mb-6">{t('power.shutdownDesc')}</p>
          {failed && <p className="text-danger-text text-sm mb-4">{t('power.shutdownFailed')}</p>}
          <div className="flex gap-3 justify-end">
            <Button variant="ghost" onClick={() => setConfirming(false)} disabled={sending}>{t('set.cancel')}</Button>
            <Button variant="danger" onClick={requestShutdown} disabled={sending}>{t('power.shutdownConfirm')}</Button>
          </div>
        </Modal>
      )}
    </>
  );
}

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useTranslation } from '@/lib/i18n';
import { formatDateTime } from '@/lib/format';
import { Modal } from '@/components/ui';
import { AI_SETTING_FIELDS } from '@/lib/aiSettings';
import type { AiPredictionSettingsSnapshot } from '@/lib/types';

const HISTORY_LIMIT = 50;

export function AiPredictionHistoryModal({ onClose }: { onClose: () => void }) {
  const { t, lang } = useTranslation();
  const [rows, setRows] = useState<AiPredictionSettingsSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const { data, error } = await supabase
          .from('ai_prediction_settings_history')
          .select('*')
          .order('changed_at', { ascending: false })
          .limit(HISTORY_LIMIT);
        if (error) {
          console.error('Failed to load AI settings history:', error);
          setFailed(true);
          return;
        }
        setRows((data as AiPredictionSettingsSnapshot[]) ?? []);
      } catch (error) {
        console.error('Failed to load AI settings history:', error);
        setFailed(true);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  return (
    <Modal onClose={onClose} className="max-w-2xl">
      <div className="flex items-center justify-between mb-5">
        <h3 className="text-text-primary font-semibold">{t('ai.historyTitle')}</h3>
        <button
          type="button"
          onClick={onClose}
          className="px-3 py-1.5 rounded-lg text-sm text-text-secondary bg-bg-tertiary border border-border hover:bg-bg-hover transition-colors"
        >
          {t('ai.close')}
        </button>
      </div>

      {loading && <div className="text-text-muted text-sm py-6 text-center">{t('status.loading')}</div>}
      {!loading && failed && (
        <div className="text-danger-text text-sm py-6 text-center">{t('ai.loadFailed')}</div>
      )}
      {!loading && !failed && rows.length === 0 && (
        <div className="text-text-muted text-sm py-6 text-center">{t('ai.historyEmpty')}</div>
      )}

      {!loading && !failed && rows.length > 0 && (
        <ul className="space-y-2">
          {rows.map((row, index) => {
            const previous = rows[index + 1];
            const prevSnap = previous?.snapshot ?? {};
            const curSnap = row.snapshot ?? {};
            const changes = previous
              ? AI_SETTING_FIELDS.filter((field) => prevSnap[field.key] !== curSnap[field.key])
              : [];
            return (
              <li key={row.id} className="p-3 bg-bg-tertiary rounded-lg">
                <div className="text-text-muted text-xs font-mono">{formatDateTime(row.changed_at, lang)}</div>
                {!previous ? (
                  <div className="text-text-primary text-sm mt-1">{t('ai.initialValues')}</div>
                ) : (
                  <ul className="mt-1 space-y-0.5">
                    {changes.map((field) => (
                      <li key={field.key} className="text-text-primary text-sm font-mono">
                        {t(`ai.field.${field.key}`)}: {prevSnap[field.key]} → {curSnap[field.key]}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Modal>
  );
}

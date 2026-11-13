import { useEffect, useMemo, useState } from 'react';
import { History, RotateCcw, Save, Sparkles } from 'lucide-react';
import { useAiPredictionSettings } from '@/lib/hooks';
import { useTranslation } from '@/lib/i18n';
import { Card, Badge } from '@/components/ui';
import { AiPredictionHistoryModal } from '@/components/AiPredictionHistoryModal';
import {
  AI_SETTING_DEFAULTS,
  AI_SETTING_FIELDS,
  AI_SETTING_GROUPS,
  findOutOfRangeKeys,
  isRsiOrderValid,
  type AiSettingField,
  type AiSettingValues,
} from '@/lib/aiSettings';
import type { AiPredictionSettings } from '@/lib/types';

type SaveStatus = 'idle' | 'saved' | 'failed';

function pickValues(settings: AiPredictionSettings): AiSettingValues {
  return Object.fromEntries(
    AI_SETTING_FIELDS.map((field) => [field.key, settings[field.key]]),
  ) as AiSettingValues;
}

export function AiPredictionSettingsCard() {
  const { t } = useTranslation();
  const { settings, loading, saveSettings } = useAiPredictionSettings();
  const [form, setForm] = useState<AiSettingValues | null>(null);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<SaveStatus>('idle');
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    if (settings && !form) setForm(pickValues(settings));
  }, [settings, form]);

  const dirty = useMemo(
    () =>
      form !== null &&
      settings !== null &&
      AI_SETTING_FIELDS.some((field) => form[field.key] !== settings[field.key]),
    [form, settings],
  );

  const invalidKeys = form ? findOutOfRangeKeys(form) : [];
  const rsiOrderOk = form ? isRsiOrderValid(form) : true;
  const canSave = dirty && invalidKeys.length === 0 && rsiOrderOk && !saving;

  const updateField = (field: AiSettingField, value: number) => {
    setStatus('idle');
    setForm((prev) => (prev ? { ...prev, [field.key]: value } : prev));
  };

  const handleSave = async () => {
    if (!form || !canSave) return;
    setSaving(true);
    try {
      const ok = await saveSettings(form);
      setStatus(ok ? 'saved' : 'failed');
    } catch {
      setStatus('failed');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setStatus('idle');
    setForm({ ...AI_SETTING_DEFAULTS });
  };

  if (!form) {
    return (
      <Card className="p-5">
        <div className="text-text-muted text-sm">
          {loading ? t('status.loading') : t('ai.loadFailed')}
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <h3 className="text-text-primary font-semibold flex items-center gap-2">
            <Sparkles size={18} className="text-accent-primary" />
            {t('ai.title')}
          </h3>
          <p className="text-text-muted text-sm mt-1 max-w-2xl">{t('ai.subtitle')}</p>
        </div>
        <button
          type="button"
          onClick={() => setShowHistory(true)}
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-text-secondary bg-bg-tertiary border border-border hover:bg-bg-hover transition-colors"
        >
          <History size={16} />
          {t('ai.history')}
        </button>
      </div>

      <div className="space-y-6">
        {AI_SETTING_GROUPS.map((group) => (
          <section key={group}>
            <h4 className="text-text-secondary text-sm font-semibold mb-3">{t(`ai.group.${group}`)}</h4>
            <div className="grid md:grid-cols-2 gap-4">
              {AI_SETTING_FIELDS.filter((field) => field.group === group).map((field) => (
                <AiSettingInput
                  key={field.key}
                  field={field}
                  value={form[field.key]}
                  invalid={invalidKeys.includes(field.key)}
                  onChange={(value) => updateField(field, value)}
                />
              ))}
            </div>
            {group === 'rules' && !rsiOrderOk && (
              <div className="text-danger-text text-xs mt-3">{t('ai.rsiOrder')}</div>
            )}
          </section>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 mt-6 pt-5 border-t border-border-subtle">
        <div className="min-h-6">
          {invalidKeys.length > 0 || !rsiOrderOk ? (
            <Badge dot variant="danger">{t('ai.fixErrors')}</Badge>
          ) : dirty ? (
            <Badge dot variant="warning">{t('ai.unsaved')}</Badge>
          ) : status === 'saved' ? (
            <Badge dot variant="success">{t('ai.saved')}</Badge>
          ) : status === 'failed' ? (
            <Badge dot variant="danger">{t('ai.saveFailed')}</Badge>
          ) : null}
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleReset}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium text-text-secondary bg-bg-tertiary border border-border hover:bg-bg-hover transition-colors"
          >
            <RotateCcw size={16} />
            {t('ai.reset')}
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!canSave}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold bg-accent-primary text-white transition-all hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Save size={16} />
            {saving ? t('ai.saving') : t('ai.save')}
          </button>
        </div>
      </div>

      {showHistory && <AiPredictionHistoryModal onClose={() => setShowHistory(false)} />}
    </Card>
  );
}

function AiSettingInput({
  field,
  value,
  invalid,
  onChange,
}: {
  field: AiSettingField;
  value: number;
  invalid: boolean;
  onChange: (value: number) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="bg-bg-tertiary rounded-lg p-4 border border-border-subtle">
      <label htmlFor={`ai-${field.key}`} className="text-text-primary text-sm font-medium block">
        {t(`ai.field.${field.key}`)}
      </label>
      <div className="text-text-muted text-xs mt-1">{t(`ai.hint.${field.key}`)}</div>
      <div className="flex items-center justify-between gap-3 mt-3">
        <input
          id={`ai-${field.key}`}
          type="number"
          min={field.min}
          max={field.max}
          step={field.step}
          value={Number.isFinite(value) ? value : ''}
          onChange={(event) => onChange(event.target.valueAsNumber)}
          className={`w-32 px-3 py-2 rounded-lg bg-bg-card font-mono text-sm text-text-primary border focus:outline-none focus:ring-2 focus:ring-accent-primary/40 ${
            invalid ? 'border-danger text-danger-text' : 'border-border'
          }`}
        />
        <span className={`text-xs font-mono ${invalid ? 'text-danger-text' : 'text-text-muted'}`}>
          {t('ai.range')}: {field.min} - {field.max}
        </span>
      </div>
    </div>
  );
}

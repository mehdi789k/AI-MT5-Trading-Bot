import { useEffect, useMemo, useState } from 'react';
import { Save, RotateCcw, ShieldAlert } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';
import { Card, Badge } from '@/components/ui';
import type { BotSettings } from '@/lib/types';

type RiskKey =
  | 'max_risk_percent'
  | 'max_concurrent_positions'
  | 'daily_loss_limit_percent'
  | 'max_drawdown_percent'
  | 'max_total_risk_percent';

interface RiskField {
  key: RiskKey;
  min: number;
  max: number;
  step: number;
}

const RISK_FIELDS: RiskField[] = [
  { key: 'max_risk_percent', min: 0.1, max: 5, step: 0.1 },
  { key: 'max_concurrent_positions', min: 1, max: 20, step: 1 },
  { key: 'daily_loss_limit_percent', min: 0.5, max: 20, step: 0.5 },
  { key: 'max_drawdown_percent', min: 1, max: 50, step: 0.5 },
  { key: 'max_total_risk_percent', min: 1, max: 50, step: 0.5 },
];

type RiskValues = Record<RiskKey, number>;
type SaveStatus = 'idle' | 'saved' | 'failed';

function valuesFromSettings(settings: BotSettings): RiskValues {
  return {
    max_risk_percent: settings.max_risk_percent,
    max_concurrent_positions: settings.max_concurrent_positions,
    daily_loss_limit_percent: settings.daily_loss_limit_percent ?? 5,
    max_drawdown_percent: settings.max_drawdown_percent ?? 10,
    max_total_risk_percent: settings.max_total_risk_percent ?? 20,
  };
}

interface RiskLimitsCardProps {
  settings: BotSettings | null;
  updateSettings: (patch: Partial<BotSettings>) => Promise<boolean>;
}

export function RiskLimitsCard({ settings, updateSettings }: RiskLimitsCardProps) {
  const { t } = useTranslation();
  const [form, setForm] = useState<RiskValues | null>(null);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<SaveStatus>('idle');

  useEffect(() => {
    if (settings && !form) setForm(valuesFromSettings(settings));
  }, [settings, form]);

  const original = settings ? valuesFromSettings(settings) : null;

  const invalidKeys = useMemo(
    () =>
      form
        ? RISK_FIELDS.filter((f) => {
            const v = form[f.key];
            return !Number.isFinite(v) || v < f.min || v > f.max;
          }).map((f) => f.key)
        : [],
    [form]
  );

  const totalBelowPerTrade = !!form && form.max_total_risk_percent < form.max_risk_percent;
  const dirty = !!form && !!original && RISK_FIELDS.some((f) => form[f.key] !== original[f.key]);
  const canSave = dirty && invalidKeys.length === 0 && !totalBelowPerTrade && !saving;

  const updateField = (key: RiskKey, value: number) => {
    setStatus('idle');
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  };

  const handleSave = async () => {
    if (!form || !canSave) return;
    setSaving(true);
    try {
      const ok = await updateSettings(form);
      setStatus(ok ? 'saved' : 'failed');
    } catch {
      setStatus('failed');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setStatus('idle');
    if (settings) setForm(valuesFromSettings(settings));
  };

  if (!form) {
    return (
      <Card className="p-5">
        <div className="text-text-muted text-sm">{settings ? t('ai.loadFailed') : t('status.loading')}</div>
      </Card>
    );
  }

  return (
    <Card className="p-5">
      <div className="mb-5">
        <h3 className="text-text-primary font-semibold flex items-center gap-2">
          <ShieldAlert size={18} className="text-accent-primary" />
          {t('risk.title')}
        </h3>
        <p className="text-text-muted text-sm mt-1">{t('risk.subtitle')}</p>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        {RISK_FIELDS.map((field) => (
          <RiskInput
            key={field.key}
            field={field}
            value={form[field.key]}
            invalid={invalidKeys.includes(field.key)}
            onChange={(value) => updateField(field.key, value)}
          />
        ))}
      </div>

      {totalBelowPerTrade && <div className="text-danger-text text-xs mt-3">{t('risk.totalBelowPerTrade')}</div>}

      <div className="flex flex-wrap items-center justify-between gap-3 mt-6 pt-5 border-t border-border-subtle">
        <div className="min-h-6">
          {invalidKeys.length > 0 || totalBelowPerTrade ? (
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
            disabled={!dirty}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium text-text-secondary bg-bg-tertiary border border-border hover:bg-bg-hover transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
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
    </Card>
  );
}

function RiskInput({
  field,
  value,
  invalid,
  onChange,
}: {
  field: RiskField;
  value: number;
  invalid: boolean;
  onChange: (value: number) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="bg-bg-tertiary rounded-lg p-4 border border-border-subtle">
      <label htmlFor={`risk-${field.key}`} className="text-text-primary text-sm font-medium block">
        {t(`risk.field.${field.key}`)}
      </label>
      <div className="text-text-muted text-xs mt-1">{t(`risk.hint.${field.key}`)}</div>
      <div className="flex items-center justify-between gap-3 mt-3">
        <input
          id={`risk-${field.key}`}
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

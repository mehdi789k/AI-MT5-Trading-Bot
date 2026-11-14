import { Toggle } from '@/components/ui';
import { useTranslation } from '@/lib/i18n';
import type { ProfitTargetMode, SymbolConfig } from '@/lib/types';

interface ProfitProtectionFieldsProps {
  config: SymbolConfig;
  onChange: (patch: Partial<SymbolConfig>) => void;
}

const INPUT_CLASS = 'w-28 bg-bg-tertiary border border-border rounded-lg px-3 py-2 text-text-primary font-mono focus:outline-none focus:border-accent-primary';
const LABEL_CLASS = 'text-text-secondary text-sm font-medium';

const parseNumber = (v: string): number => {
  const n = parseFloat(v);
  return Number.isNaN(n) ? 0 : n;
};

export function ProfitProtectionFields({ config, onChange }: ProfitProtectionFieldsProps) {
  const { t } = useTranslation();
  const unit = config.profit_target_mode === 'percent' ? '%' : t('set.unitPoints');

  return (
    <div className="space-y-4 pt-3 border-t border-border-subtle">
      <div className="flex items-center justify-between gap-3">
        <span className={LABEL_CLASS}>{t('set.profitTargetMode')}</span>
        <select
          value={config.profit_target_mode}
          onChange={(e) => onChange({ profit_target_mode: e.target.value as ProfitTargetMode })}
          className="bg-bg-tertiary border border-border rounded-lg px-3 py-2 text-text-primary focus:outline-none focus:border-accent-primary"
        >
          <option value="points">{t('set.profitMode.points')}</option>
          <option value="percent">{t('set.profitMode.percent')}</option>
        </select>
      </div>

      <div className="flex items-center justify-between">
        <Toggle
          checked={config.break_even_enabled}
          onChange={(checked) => onChange({ break_even_enabled: checked })}
          label={t('set.breakEven')}
        />
        {config.break_even_enabled && (
          <div className="flex items-center gap-2">
            <input
              type="number" min="0" step="any"
              value={config.break_even_trigger}
              onChange={(e) => onChange({ break_even_trigger: parseNumber(e.target.value) })}
              className={INPUT_CLASS}
            />
            <span className="text-text-muted text-sm">{unit}</span>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between">
        <Toggle
          checked={config.partial_close_enabled}
          onChange={(checked) => onChange({ partial_close_enabled: checked })}
          label={t('set.partialClose')}
        />
      </div>

      {config.partial_close_enabled && (
        <div className="space-y-3 rounded-lg bg-bg-tertiary/50 p-3">
          <StageRow
            title={t('set.stage1')}
            unit={unit}
            trigger={config.partial_stage1_trigger}
            percent={config.partial_stage1_close_percent}
            onTriggerChange={(v) => onChange({ partial_stage1_trigger: v })}
            onPercentChange={(v) => onChange({ partial_stage1_close_percent: v })}
          />
          <div className="flex items-center justify-between">
            <Toggle
              checked={config.partial_stage2_enabled}
              onChange={(checked) => onChange({ partial_stage2_enabled: checked })}
              label={t('set.stage2Enable')}
            />
          </div>
          {config.partial_stage2_enabled && (
            <StageRow
              title={t('set.stage2')}
              unit={unit}
              trigger={config.partial_stage2_trigger}
              percent={config.partial_stage2_close_percent}
              onTriggerChange={(v) => onChange({ partial_stage2_trigger: v })}
              onPercentChange={(v) => onChange({ partial_stage2_close_percent: v })}
            />
          )}
        </div>
      )}
    </div>
  );
}

interface StageRowProps {
  title: string;
  unit: string;
  trigger: number;
  percent: number;
  onTriggerChange: (value: number) => void;
  onPercentChange: (value: number) => void;
}

function StageRow({ title, unit, trigger, percent, onTriggerChange, onPercentChange }: StageRowProps) {
  const { t } = useTranslation();
  return (
    <div className="space-y-2">
      <span className="text-text-primary text-sm font-medium">{title}</span>
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-text-secondary text-sm">
          {t('set.stageTrigger')}
          <input
            type="number" min="0" step="any"
            value={trigger}
            onChange={(e) => onTriggerChange(parseNumber(e.target.value))}
            className={INPUT_CLASS}
          />
          <span className="text-text-muted">{unit}</span>
        </label>
        <label className="flex items-center gap-2 text-text-secondary text-sm">
          {t('set.stageShare')}
          <input
            type="number" min="1" max="99" step="any"
            value={percent}
            onChange={(e) => onPercentChange(parseNumber(e.target.value))}
            className={INPUT_CLASS}
          />
          <span className="text-text-muted">%</span>
        </label>
      </div>
    </div>
  );
}

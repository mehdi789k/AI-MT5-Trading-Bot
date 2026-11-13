import type { AiTunableKey } from '@/lib/types';

export type AiSettingGroup = 'signal' | 'rules' | 'training' | 'boosting' | 'target';

export interface AiSettingField {
  key: AiTunableKey;
  group: AiSettingGroup;
  min: number;
  max: number;
  step: number;
  defaultValue: number;
}

export const AI_SETTING_GROUPS: AiSettingGroup[] = ['signal', 'rules', 'training', 'boosting', 'target'];

export const AI_SETTING_FIELDS: AiSettingField[] = [
  { key: 'min_confidence_threshold', group: 'signal', min: 10, max: 100, step: 1, defaultValue: 60 },
  { key: 'neutral_threshold', group: 'signal', min: 0, max: 0.45, step: 0.01, defaultValue: 0.15 },
  { key: 'min_trades_for_model', group: 'training', min: 2, max: 1000, step: 1, defaultValue: 10 },
  { key: 'retraining_interval_trades', group: 'training', min: 1, max: 500, step: 1, defaultValue: 20 },
  { key: 'gb_n_estimators', group: 'boosting', min: 10, max: 1000, step: 10, defaultValue: 100 },
  { key: 'gb_max_depth', group: 'boosting', min: 1, max: 10, step: 1, defaultValue: 4 },
  { key: 'gb_learning_rate', group: 'boosting', min: 0.001, max: 1, step: 0.001, defaultValue: 0.1 },
  { key: 'gb_subsample', group: 'boosting', min: 0.1, max: 1, step: 0.05, defaultValue: 0.8 },
  { key: 'rule_rsi_oversold', group: 'rules', min: 5, max: 49, step: 1, defaultValue: 35 },
  { key: 'rule_rsi_overbought', group: 'rules', min: 51, max: 95, step: 1, defaultValue: 65 },
  { key: 'rule_trend_threshold', group: 'rules', min: 0, max: 5, step: 0.1, defaultValue: 0.5 },
  { key: 'rule_macd_weight', group: 'rules', min: 0, max: 2, step: 0.1, defaultValue: 0.5 },
  { key: 'predicted_price_atr_mult', group: 'target', min: 0, max: 10, step: 0.1, defaultValue: 2 },
];

export type AiSettingValues = Record<AiTunableKey, number>;

export const AI_SETTING_DEFAULTS = Object.fromEntries(
  AI_SETTING_FIELDS.map((field) => [field.key, field.defaultValue]),
) as AiSettingValues;

export function findOutOfRangeKeys(values: AiSettingValues): AiTunableKey[] {
  return AI_SETTING_FIELDS.filter((field) => {
    const value = values[field.key];
    return !Number.isFinite(value) || value < field.min || value > field.max;
  }).map((field) => field.key);
}

export function isRsiOrderValid(values: AiSettingValues): boolean {
  return values.rule_rsi_oversold < values.rule_rsi_overbought;
}

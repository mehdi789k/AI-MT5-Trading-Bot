import { useState } from 'react';
import { Check, Sparkles, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useTranslation } from '@/lib/i18n';
import { formatDateTime } from '@/lib/format';
import { Badge, Button, Card } from '@/components/ui';
import type { StrategyOptimization, Strategy } from '@/lib/types';

function MetricRow({ label, before, after, format }: { label: string; before: number | null; after: number | null; format?: (v: number) => string }) {
  const fmt = format ?? ((v: number) => v.toFixed(2));
  const b = before ?? 0;
  const a = after ?? 0;
  const improved = a > b;
  const worse = a < b;
  const color = improved ? 'text-success-text' : worse ? 'text-danger-text' : 'text-text-muted';
  const arrow = improved ? '↑' : worse ? '↓' : '→';
  return (
    <div className="flex items-center justify-between gap-2 py-1.5 border-b border-border-subtle last:border-0">
      <span className="text-text-secondary text-sm">{label}</span>
      <div className="flex items-center gap-3 font-mono text-sm">
        <span className="text-text-muted">{fmt(b)}</span>
        <span className="text-text-muted">{arrow}</span>
        <span className={color}>{fmt(a)}</span>
      </div>
    </div>
  );
}

export function OptimizationResultCard({ optimization, strategy }: { optimization: StrategyOptimization; strategy: Strategy }) {
  const { t, lang } = useTranslation();
  const [confirming, setConfirming] = useState(false);
  const [applying, setApplying] = useState(false);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleApply = async () => {
    setApplying(true);
    try {
      const { error } = await supabase
        .from('strategies')
        .update({
          code: optimization.optimized_code,
          version: strategy.version + 1,
          updated_at: new Date().toISOString(),
        })
        .eq('id', strategy.id);
      if (error) {
        setNotice({ type: 'error', text: t('strat.applyFailed') });
        return;
      }
      setConfirming(false);
      setNotice({ type: 'success', text: t('strat.applied') });
    } catch {
      setNotice({ type: 'error', text: t('strat.applyFailed') });
    } finally {
      setApplying(false);
    }
  };

  return (
    <Card className="p-5 space-y-4 border-accent-primary/20">
      <div className="flex items-center gap-2">
        <Sparkles size={18} className="text-accent-primary" />
        <span className="font-mono font-semibold text-text-primary">{optimization.symbol}</span>
        <Badge variant="neutral">{optimization.timeframe}</Badge>
        <span className="text-text-muted text-xs">{formatDateTime(optimization.created_at, lang)}</span>
      </div>

      {notice && (
        <p className={`text-sm ${notice.type === 'success' ? 'text-success-text' : 'text-danger-text'}`}>{notice.text}</p>
      )}

      {optimization.status === 'failed' ? (
        <p className="text-danger-text text-sm">{optimization.error_message || t('strat.optFailed')}</p>
      ) : (
        <>
          <div className="grid sm:grid-cols-2 gap-x-6 gap-y-1">
            <MetricRow label={t('strat.netProfit')} before={optimization.before_net_profit} after={optimization.after_net_profit} />
            <MetricRow label={t('strat.winRate')} before={optimization.before_win_rate} after={optimization.after_win_rate} format={(v) => `${v.toFixed(1)}%`} />
            <MetricRow label={t('strat.profitFactorOpt')} before={optimization.before_profit_factor} after={optimization.after_profit_factor} />
            <MetricRow label={t('strat.maxDrawdown')} before={optimization.before_max_drawdown} after={optimization.after_max_drawdown} format={(v) => `${v.toFixed(1)}%`} />
            <MetricRow label={t('strat.sharpeRatio')} before={optimization.before_sharpe_ratio} after={optimization.after_sharpe_ratio} />
            <MetricRow label={t('strat.totalTrades')} before={optimization.before_total_trades} after={optimization.after_total_trades} format={(v) => String(Math.round(v))} />
          </div>

          {(optimization.param_changes ?? []).length > 0 && (
            <div>
              <p className="text-text-secondary text-sm font-medium mb-2">{t('strat.paramChanges')}</p>
              <div className="space-y-1">
                {(optimization.param_changes ?? []).map((c) => (
                  <div key={c.name} className="flex items-center justify-between gap-2 py-1 px-3 bg-bg-tertiary rounded-md">
                    <span className="font-mono text-sm text-text-primary">{c.name}</span>
                    <div className="flex items-center gap-2 font-mono text-sm">
                      <span className="text-text-muted">{c.before}</span>
                      <span className="text-text-muted">→</span>
                      <span className="text-accent-primary">{c.after}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center gap-4 text-sm text-text-muted">
            <span>{t('strat.combinationsTried')}: <span className="font-mono text-text-secondary">{optimization.combinations_tried}</span></span>
            <span>{t('strat.bestScore')}: <span className="font-mono text-text-secondary">{optimization.best_score.toFixed(2)}</span></span>
          </div>

          {(optimization.param_changes ?? []).length > 0 && (
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-border-subtle">
              {confirming ? (
                <>
                  <span className="text-text-secondary text-sm">{t('strat.applyConfirm')}</span>
                  <Button size="sm" onClick={handleApply} disabled={applying}>
                    <Check size={14} className="me-1.5" />
                    {applying ? t('strat.optimizing') : t('strat.confirmYes')}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>
                    <X size={14} className="me-1.5" />
                    {t('strat.discardOpt')}
                  </Button>
                </>
              ) : (
                <Button size="sm" onClick={() => setConfirming(true)}>
                  <Check size={14} className="me-1.5" />
                  {t('strat.applyOptimized')}
                </Button>
              )}
            </div>
          )}
        </>
      )}
    </Card>
  );
}

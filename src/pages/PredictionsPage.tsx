import { useEffect, useState, useCallback } from 'react';
import { Brain, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useTranslation } from '@/lib/i18n';
import { useFormat } from '@/lib/format';
import { Card, Badge } from '@/components/ui';
import { formatDateTime } from '@/lib/format';
import type { Prediction, SymbolConfig } from '@/lib/types';

export function PredictionsPage() {
  const { t, lang } = useTranslation();
  const fmt = useFormat();
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [symbols, setSymbols] = useState<SymbolConfig[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const [predResp, symResp] = await Promise.all([
        supabase.from('predictions').select('*').order('created_at', { ascending: false }).limit(50),
        supabase.from('symbol_config').select('*').order('symbol'),
      ]);
      if (predResp.error) console.error('Failed to load predictions:', predResp.error);
      if (symResp.error) console.error('Failed to load symbols:', symResp.error);
      if (predResp.data) setPredictions(predResp.data as Prediction[]);
      if (symResp.data) setSymbols(symResp.data as SymbolConfig[]);
    } catch (err) {
      console.error('Failed to fetch prediction data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Group latest prediction per symbol
  const latestBySymbol = new Map<string, Prediction>();
  for (const pred of predictions) {
    if (!latestBySymbol.has(pred.symbol)) {
      latestBySymbol.set(pred.symbol, pred);
    }
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Prediction Cards */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {symbols.map((sym) => {
          const pred = latestBySymbol.get(sym.symbol);
          return (
            <PredictionCard key={sym.id} symbol={sym.symbol} categoryLabel={t(`set.${sym.category}`)} prediction={pred} t={t} fmt={fmt} />
          );
        })}
        {symbols.length === 0 && !loading && (
          <Card className="col-span-full p-12 text-center">
            <Brain size={32} className="text-text-muted mx-auto mb-3" />
            <div className="text-text-secondary text-sm">
              {t('pred.noSymbols')}
            </div>
          </Card>
        )}
      </div>

      {/* Prediction History */}
      <Card className="overflow-hidden">
        <div className="p-4 border-b border-border-subtle">
          <h3 className="text-text-primary font-semibold flex items-center gap-2">
            <Brain size={18} className="text-accent-primary" />
            {t('pred.recentPredictions')}
          </h3>
        </div>
        {predictions.length === 0 ? (
          <div className="p-12 text-center">
            <Brain size={32} className="text-text-muted mx-auto mb-3" />
            <div className="text-text-secondary text-sm">
              {t('pred.noPredictions')}
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-text-muted text-xs uppercase border-b border-border-subtle">
                  <th className="text-start px-4 py-3 font-medium">{t('pred.symbol')}</th>
                  <th className="text-start px-4 py-3 font-medium">{t('pred.direction')}</th>
                  <th className="text-end px-4 py-3 font-medium">{t('pred.confidence')}</th>
                  <th className="text-end px-4 py-3 font-medium">{t('pred.currentPrice')}</th>
                  <th className="text-end px-4 py-3 font-medium">{t('pred.predicted')}</th>
                  <th className="text-start px-4 py-3 font-medium">{t('pred.model')}</th>
                  <th className="text-start px-4 py-3 font-medium">{t('pred.time')}</th>
                </tr>
              </thead>
              <tbody>
                {predictions.map((pred) => (
                  <tr key={pred.id} className="border-b border-border-subtle hover:bg-bg-hover transition-colors">
                    <td className="px-4 py-3 font-mono font-medium text-text-primary">{pred.symbol}</td>
                    <td className="px-4 py-3">
                      <DirectionBadge direction={pred.direction} t={t} />
                    </td>
                    <td className="px-4 py-3 text-end">
                      <ConfidenceBar confidence={pred.confidence} fmt={fmt} />
                    </td>
                    <td className="px-4 py-3 text-end font-mono text-text-secondary">
                      {fmt.price(pred.current_price)}
                    </td>
                    <td className="px-4 py-3 text-end font-mono text-text-secondary">
                      {fmt.price(pred.predicted_price)}
                    </td>
                    <td className="px-4 py-3 text-text-muted text-xs font-mono">{pred.model_version ?? '--'}</td>
                    <td className="px-4 py-3 text-text-muted text-xs">{formatDateTime(pred.created_at, lang)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

interface PredCardProps {
  symbol: string;
  categoryLabel: string;
  prediction: Prediction | undefined;
  t: (key: string) => string;
  fmt: ReturnType<typeof useFormat>;
}

function PredictionCard({ symbol, categoryLabel, prediction, t, fmt }: PredCardProps) {
  const direction = prediction?.direction ?? 'neutral';
  const confidence = prediction?.confidence ?? 0;

  const bgGradient =
    direction === 'up'
      ? 'from-success-muted/20 to-transparent'
      : direction === 'down'
      ? 'from-danger-muted/20 to-transparent'
      : 'from-bg-tertiary to-transparent';

  const icon =
    direction === 'up' ? (
      <TrendingUp size={20} className="text-success-text" />
    ) : direction === 'down' ? (
      <TrendingDown size={20} className="text-danger-text" />
    ) : (
      <Minus size={20} className="text-text-muted" />
    );

  return (
    <Card className={`p-5 bg-gradient-to-b ${bgGradient} relative overflow-hidden`}>
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="font-mono font-bold text-text-primary text-lg">{symbol}</div>
          <Badge variant="neutral">{categoryLabel}</Badge>
        </div>
        {icon}
      </div>

      {prediction ? (
        <>
          <div className="flex items-center gap-2 mb-3">
            <DirectionBadge direction={direction} t={t} />
            <span className="text-text-muted text-xs">{formatDateTime(prediction.created_at)}</span>
          </div>
          <div className="space-y-1.5">
            <div className="flex justify-between text-sm">
              <span className="text-text-muted">{t('pred.confidence')}</span>
              <span className="font-mono font-semibold text-text-primary">{fmt.percent(confidence)}</span>
            </div>
            <div className="w-full h-2 bg-bg-tertiary rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  direction === 'up' ? 'bg-success' : direction === 'down' ? 'bg-danger' : 'bg-text-muted'
                }`}
                style={{ width: `${confidence}%` }}
              />
            </div>
            <div className="flex justify-between text-sm pt-1">
              <span className="text-text-muted">{t('pred.currentPrice')}</span>
              <span className="font-mono text-text-secondary">{fmt.price(prediction.current_price)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-text-muted">{t('pred.predicted')}</span>
              <span className="font-mono text-text-secondary">{fmt.price(prediction.predicted_price)}</span>
            </div>
          </div>
        </>
      ) : (
        <div className="text-text-muted text-sm py-4 text-center">
          {t('pred.noPrediction')}
        </div>
      )}
    </Card>
  );
}

function DirectionBadge({ direction, t }: { direction: string; t: (key: string) => string }) {
  if (direction === 'up') return <Badge variant="success" dot>{t('pred.bullish')} ↑</Badge>;
  if (direction === 'down') return <Badge variant="danger" dot>{t('pred.bearish')} ↓</Badge>;
  return <Badge variant="neutral">{t('pred.neutral')}</Badge>;
}

function ConfidenceBar({ confidence, fmt }: { confidence: number; fmt: ReturnType<typeof useFormat> }) {
  const color = confidence >= 70 ? 'text-success-text' : confidence >= 50 ? 'text-warning-text' : 'text-text-muted';
  return (
    <div className="flex items-center justify-end gap-2">
      <div className="w-16 h-1.5 bg-bg-tertiary rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${confidence >= 70 ? 'bg-success' : confidence >= 50 ? 'bg-warning' : 'bg-text-muted'}`}
          style={{ width: `${confidence}%` }}
        />
      </div>
      <span className={`font-mono text-xs ${color}`}>{fmt.percent(confidence)}</span>
    </div>
  );
}

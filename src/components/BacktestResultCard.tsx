import { Download } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';
import { Button } from '@/components/ui';
import { downloadTradesCsv } from '@/lib/strategyFile';
import type { BacktestResult } from '@/lib/types';

const REASON_KEYS: Record<string, string> = {
  tp_hit: 'hist.reason.tpHit',
  sl_hit: 'hist.reason.slHit',
  end_of_data: 'strat.endOfData',
};

const CHART_WIDTH = 600;
const CHART_HEIGHT = 160;

function EquityChart({ values }: { values: number[] }) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const points = values
    .map((value, i) => {
      const x = (i / (values.length - 1)) * CHART_WIDTH;
      const y = CHART_HEIGHT - ((value - min) / range) * CHART_HEIGHT;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  return (
    <svg viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`} preserveAspectRatio="none" className="w-full h-40 text-accent-primary">
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth={2} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export function BacktestResultCard({ result }: { result: BacktestResult }) {
  const { t } = useTranslation();

  if (result.status === 'failed') {
    return <p className="text-danger-text text-sm">{result.error_message || t('strat.failed')}</p>;
  }

  const curve = (result.equity_curve ?? []).map((point) => point.equity);
  const trades = result.trades_detail ?? [];
  const recentTrades = [...trades].reverse().slice(0, 50);
  const profitTone = result.net_profit >= 0 ? 'text-success-text' : 'text-danger-text';

  const stats = [
    { label: t('hist.netProfit'), value: result.net_profit.toFixed(2), tone: profitTone },
    { label: t('hist.totalTrades'), value: String(result.total_trades), tone: 'text-text-primary' },
    { label: t('hist.winRate'), value: `${result.win_rate.toFixed(1)}%`, tone: 'text-text-primary' },
    { label: t('dash.drawdown'), value: `${result.max_drawdown.toFixed(1)}%`, tone: 'text-danger-text' },
    { label: t('strat.profitFactor'), value: result.profit_factor.toFixed(2), tone: 'text-text-primary' },
    { label: t('strat.sharpe'), value: (result.sharpe_ratio ?? 0).toFixed(2), tone: 'text-text-primary' },
    { label: t('strat.sortino'), value: (result.sortino_ratio ?? 0).toFixed(2), tone: 'text-text-primary' },
    { label: t('strat.expectancy'), value: (result.expectancy ?? 0).toFixed(2), tone: profitTone },
    { label: t('strat.avgWin'), value: (result.avg_win ?? 0).toFixed(2), tone: 'text-success-text' },
    { label: t('strat.avgLoss'), value: (result.avg_loss ?? 0).toFixed(2), tone: 'text-danger-text' },
    { label: t('strat.maxConsecWins'), value: String(result.max_consecutive_wins ?? 0), tone: 'text-success-text' },
    { label: t('strat.maxConsecLosses'), value: String(result.max_consecutive_losses ?? 0), tone: 'text-danger-text' },
  ];

  return (
    <div className="space-y-5">
      {(result.requested_from_date && result.received_candles !== null &&
        result.expected_candles !== null && result.received_candles < result.expected_candles * 0.9) && (
        <div className="text-warning-text text-sm bg-warning/10 border border-warning/30 rounded-lg px-3 py-2">
          {t('strat.partialData')}
        </div>
      )}
      {(result.requested_from_date || result.requested_to_date) && (
        <div className="text-text-muted text-xs flex flex-wrap gap-x-4 gap-y-1">
          <span>{t('strat.requestedRange')}: <span className="font-mono">{result.requested_from_date} → {result.requested_to_date}</span></span>
          {(result.from_date && (result.from_date !== result.requested_from_date || result.to_date !== result.requested_to_date)) && (
            <span>{t('strat.testedRange')}: <span className="font-mono">{result.from_date} → {result.to_date}</span></span>
          )}
          {result.received_candles !== null && result.received_candles !== undefined && (
            <span>{t('strat.candles')}: <span className="font-mono">{result.received_candles}</span></span>
          )}
        </div>
      )}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {stats.map((stat) => (
          <div key={stat.label} className="bg-bg-tertiary rounded-lg p-3">
            <div className="text-text-muted text-xs">{stat.label}</div>
            <div className={`font-mono font-semibold text-lg mt-1 ${stat.tone}`}>{stat.value}</div>
          </div>
        ))}
      </div>

      {(result.total_commission ?? 0) > 0 && (
        <div className="text-text-muted text-xs">
          {t('strat.totalCommission')}: <span className="font-mono">${result.total_commission!.toFixed(2)}</span>
        </div>
      )}

      <div>
        <h5 className="text-text-secondary text-sm font-medium mb-2">{t('strat.equityCurve')}</h5>
        {curve.length >= 2 ? <EquityChart values={curve} /> : <p className="text-text-muted text-sm">{t('strat.noCurve')}</p>}
      </div>

      <div>
        <div className="flex items-center justify-between gap-3 mb-2">
          <h5 className="text-text-secondary text-sm font-medium">{t('strat.tradesList')}</h5>
          <Button variant="ghost" size="sm" onClick={() => downloadTradesCsv(result)} disabled={trades.length === 0}>
            <Download size={14} className="me-1.5" />
            {t('strat.downloadCsv')}
          </Button>
        </div>
        {recentTrades.length === 0 ? (
          <p className="text-text-muted text-sm">{t('strat.noTrades')}</p>
        ) : (
          <div className="max-h-64 overflow-auto rounded-lg border border-border-subtle">
            <table className="w-full text-sm">
              <thead className="bg-bg-tertiary text-text-muted text-xs sticky top-0">
                <tr>
                  <th className="px-3 py-2 text-start font-medium">{t('hist.type')}</th>
                  <th className="px-3 py-2 text-start font-medium">{t('hist.open')}</th>
                  <th className="px-3 py-2 text-start font-medium">{t('hist.close')}</th>
                  <th className="px-3 py-2 text-start font-medium">{t('hist.pl')}</th>
                  <th className="px-3 py-2 text-start font-medium">{t('hist.reason')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {recentTrades.map((trade, index) => (
                  <tr key={`${trade.close_time}-${index}`}>
                    <td className="px-3 py-2">{t(trade.type === 'buy' ? 'pos.buy' : 'pos.sell')}</td>
                    <td className="px-3 py-2 font-mono">{trade.entry}</td>
                    <td className="px-3 py-2 font-mono">{trade.close}</td>
                    <td className={`px-3 py-2 font-mono ${trade.pnl >= 0 ? 'text-success-text' : 'text-danger-text'}`}>
                      {trade.pnl.toFixed(2)}
                    </td>
                    <td className="px-3 py-2 text-text-secondary">{t(REASON_KEYS[trade.reason] ?? trade.reason)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

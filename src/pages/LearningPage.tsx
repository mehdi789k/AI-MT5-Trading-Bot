import { useEffect, useState, useCallback } from 'react';
import { LineChart as LineChartIcon, Brain, Target, Zap, Award } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useTranslation } from '@/lib/i18n';
import { useFormat } from '@/lib/format';
import { Card, StatCard, Badge } from '@/components/ui';
import { formatDateTime } from '@/lib/format';
import type { LearningReport, TradeHistory } from '@/lib/types';

export function LearningPage() {
  const { t, lang } = useTranslation();
  const fmt = useFormat();
  const [reports, setReports] = useState<LearningReport[]>([]);
  const [trades, setTrades] = useState<TradeHistory[]>([]);
  const [accuracyData, setAccuracyData] = useState<{ x: number; y: number }[]>([]);
  const [profitData, setProfitData] = useState<{ date: string; profit: number }[]>([]);

  const fetchData = useCallback(async () => {
    try {
      const [reportsResp, tradesResp] = await Promise.all([
        supabase.from('learning_reports').select('*').order('created_at', { ascending: false }).limit(20),
        supabase.from('trade_history').select('*').order('close_time', { ascending: true }).limit(500),
      ]);
      if (reportsResp.error) console.error('Failed to load learning reports:', reportsResp.error);
      if (tradesResp.error) console.error('Failed to load trades:', tradesResp.error);
      if (reportsResp.data) {
        const r = reportsResp.data as LearningReport[];
        setReports(r);
        setAccuracyData(
          r.slice().reverse().map((rep, i) => ({ x: i, y: rep.accuracy }))
        );
      }
      if (tradesResp.data) {
        const tr = tradesResp.data as TradeHistory[];
        setTrades(tr);
        const byDay = new Map<string, number>();
        for (const trade of tr) {
          if (!trade.close_time) continue;
          const day = trade.close_time.split('T')[0];
          byDay.set(day, (byDay.get(day) ?? 0) + trade.profit);
        }
        setProfitData(
          Array.from(byDay.entries()).map(([date, profit]) => ({ date, profit }))
        );
      }
    } catch (err) {
      console.error('Failed to fetch learning data:', err);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 10000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const latestReport = reports[0];
  const totalTrades = trades.length;
  const wins = trades.filter((tr) => tr.profit > 0).length;
  const totalProfit = trades.reduce((s, tr) => s + tr.profit, 0);
  const avgProfit = totalTrades > 0 ? totalProfit / totalTrades : 0;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* AI Model Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label={t('learn.modelAccuracy')}
          value={fmt.percent(latestReport?.accuracy)}
          icon={<Target size={18} />}
          trend={(latestReport?.accuracy ?? 0) >= 55 ? 'up' : 'down'}
          subtitle={latestReport ? `v${latestReport.model_version}` : t('learn.noModel')}
        />
        <StatCard
          label={t('learn.trainingSamples')}
          value={fmt.number(latestReport?.training_samples ?? 0, 0)}
          icon={<Brain size={18} />}
          subtitle={t('learn.tradesUsedForLearning')}
        />
        <StatCard
          label={t('learn.totalWinRate')}
          value={fmt.percent(totalTrades > 0 ? (wins / totalTrades) * 100 : 0)}
          icon={<Award size={18} />}
          trend={totalTrades > 0 && wins / totalTrades >= 0.5 ? 'up' : 'down'}
          subtitle={`${totalTrades} ${t('learn.closedTrades')}`}
        />
        <StatCard
          label={t('learn.avgProfitTrade')}
          value={fmt.currency(avgProfit)}
          icon={<Zap size={18} />}
          trend={avgProfit > 0 ? 'up' : 'down'}
          subtitle={`${t('learn.total')}: ${fmt.currency(totalProfit)}`}
        />
      </div>

      {/* Accuracy Chart */}
      <Card className="p-6">
        <h3 className="text-text-primary font-semibold flex items-center gap-2 mb-5">
          <LineChartIcon size={18} className="text-accent-primary" />
          {t('learn.accuracyOverTime')}
        </h3>
        {accuracyData.length > 0 ? (
          <LineChart data={accuracyData} />
        ) : (
          <div className="h-40 flex items-center justify-center text-text-muted text-sm">
            {t('learn.noReports')}
          </div>
        )}
      </Card>

      {/* Daily Profit Chart */}
      <Card className="p-6">
        <h3 className="text-text-primary font-semibold flex items-center gap-2 mb-5">
          <LineChartIcon size={18} className="text-accent-primary" />
          {t('learn.dailyPL')}
        </h3>
        {profitData.length > 0 ? (
          <BarChart data={profitData} />
        ) : (
          <div className="h-40 flex items-center justify-center text-text-muted text-sm">
            {t('learn.noTradeHistory')}
          </div>
        )}
      </Card>

      {/* Latest Learning Report */}
      {latestReport && (
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-text-primary font-semibold flex items-center gap-2">
              <Brain size={18} className="text-accent-primary" />
              {t('learn.latestReport')}
            </h3>
            <Badge variant="info">v{latestReport.model_version}</Badge>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <MetricBox label={t('learn.accuracy')} value={fmt.percent(latestReport.accuracy)} />
            <MetricBox label={t('learn.precision')} value={fmt.percent(latestReport.precision)} />
            <MetricBox label={t('learn.recall')} value={fmt.percent(latestReport.recall)} />
            <MetricBox label={t('learn.winRate')} value={fmt.percent(latestReport.win_rate)} />
            <MetricBox label={t('learn.backtestProfit')} value={fmt.currency(latestReport.backtest_profit)} />
            <MetricBox label={t('learn.backtestTrades')} value={fmt.number(latestReport.backtest_trades ?? 0, 0)} />
            <MetricBox label={t('learn.backtestWinRate')} value={fmt.percent(latestReport.backtest_win_rate)} />
            <MetricBox label={t('learn.samples')} value={fmt.number(latestReport.training_samples, 0)} />
          </div>
          {latestReport.notes && (
            <div className="mt-4 p-3 bg-bg-tertiary rounded-lg text-text-secondary text-sm">
              {latestReport.notes}
            </div>
          )}
          <div className="mt-3 text-text-muted text-xs">{formatDateTime(latestReport.created_at, lang)}</div>
        </Card>
      )}

      {/* Learning Report History */}
      <Card className="overflow-hidden">
        <div className="p-4 border-b border-border-subtle">
          <h3 className="text-text-primary font-semibold">{t('learn.trainingHistory')}</h3>
        </div>
        {reports.length === 0 ? (
          <div className="p-8 text-center text-text-muted text-sm">
            {t('learn.noTrainingHistory')}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-text-muted text-xs uppercase border-b border-border-subtle">
                  <th className="text-start px-4 py-3 font-medium">{t('learn.version')}</th>
                  <th className="text-end px-4 py-3 font-medium">{t('learn.samples')}</th>
                  <th className="text-end px-4 py-3 font-medium">{t('learn.accuracy')}</th>
                  <th className="text-end px-4 py-3 font-medium">{t('learn.winRate')}</th>
                  <th className="text-end px-4 py-3 font-medium">{t('learn.backtestProfit')}</th>
                  <th className="text-start px-4 py-3 font-medium">{t('learn.date')}</th>
                </tr>
              </thead>
              <tbody>
                {reports.map((rep) => (
                  <tr key={rep.id} className="border-b border-border-subtle hover:bg-bg-hover transition-colors">
                    <td className="px-4 py-3 font-mono text-text-primary">v{rep.model_version}</td>
                    <td className="px-4 py-3 text-end font-mono text-text-secondary">{rep.training_samples}</td>
                    <td className="px-4 py-3 text-end font-mono text-text-primary">{fmt.percent(rep.accuracy)}</td>
                    <td className="px-4 py-3 text-end font-mono text-text-secondary">{fmt.percent(rep.win_rate)}</td>
                    <td className={`px-4 py-3 text-end font-mono ${(rep.backtest_profit ?? 0) >= 0 ? 'text-success-text' : 'text-danger-text'}`}>
                      {fmt.currency(rep.backtest_profit)}
                    </td>
                    <td className="px-4 py-3 text-text-muted text-xs">{formatDateTime(rep.created_at, lang)}</td>
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

function MetricBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-bg-tertiary rounded-lg p-3">
      <div className="text-text-muted text-xs">{label}</div>
      <div className="text-text-primary font-mono font-semibold text-lg mt-1">{value}</div>
    </div>
  );
}

function LineChart({ data }: { data: { x: number; y: number }[] }) {
  const width = 600;
  const height = 180;
  const padding = 40;
  const chartW = width - padding * 2;
  const chartH = height - padding * 2;

  const xMax = Math.max(data.length - 1, 1);
  const yMin = Math.min(...data.map((d) => d.y), 0);
  const yMax = Math.max(...data.map((d) => d.y), 100);
  const yRange = yMax - yMin || 1;

  const points = data.map((d) => ({
    x: padding + (d.x / xMax) * chartW,
    y: padding + chartH - ((d.y - yMin) / yRange) * chartH,
  }));

  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  const areaD = `${pathD} L ${padding + chartW} ${padding + chartH} L ${padding} ${padding + chartH} Z`;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto">
      <defs>
        <linearGradient id="accuracyGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0, 25, 50, 75, 100].map((y) => {
        const py = padding + chartH - ((y - yMin) / yRange) * chartH;
        return (
          <g key={y}>
            <line x1={padding} y1={py} x2={padding + chartW} y2={py} stroke="#1e293b" strokeWidth="1" />
            <text x={padding - 8} y={py + 4} fill="#64748b" fontSize="10" textAnchor="end">{y}%</text>
          </g>
        );
      })}
      <path d={areaD} fill="url(#accuracyGrad)" />
      <path d={pathD} fill="none" stroke="#3b82f6" strokeWidth="2" />
      {points.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r="3" fill="#3b82f6" />
      ))}
    </svg>
  );
}

function BarChart({ data }: { data: { date: string; profit: number }[] }) {
  const maxAbs = Math.max(...data.map((d) => Math.abs(d.profit)), 1);
  const chartHeight = 160;

  return (
    <div className="flex items-end gap-1 overflow-x-auto pb-2" style={{ height: chartHeight + 30 }}>
      {data.map((d) => {
        const h = (Math.abs(d.profit) / maxAbs) * chartHeight;
        const isPositive = d.profit >= 0;
        return (
          <div key={d.date} className="flex flex-col items-center gap-1 shrink-0" style={{ minWidth: 40 }}>
            <div className="text-xs font-mono" style={{ color: isPositive ? '#34d399' : '#f87171' }}>
              {d.profit >= 0 ? '+' : ''}{d.profit.toFixed(0)}
            </div>
            <div
              className="w-7 rounded-t transition-all duration-300"
              style={{
                height: h,
                backgroundColor: isPositive ? '#10b981' : '#ef4444',
              }}
            />
            <div className="text-text-muted text-xs" style={{ fontSize: 9 }}>
              {d.date.slice(5)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

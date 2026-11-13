import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  Wallet,
  TrendingUp,
  TrendingDown,
  Activity,
  Target,
  AlertTriangle,
  Bot,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useBotSettings, useOpenPositions, useRecentTrades } from '@/lib/hooks';
import { useTranslation } from '@/lib/i18n';
import { useFormat } from '@/lib/format';
import { Card, StatCard, Badge } from '@/components/ui';
import { formatDateTime } from '@/lib/format';
import type { TradeHistory, BotLog } from '@/lib/types';
import { PnlChart } from '@/components/PnlChart';
import { PredictionAccuracyChart } from '@/components/PredictionAccuracyChart';
import { RiskLimitsCard } from '@/components/RiskLimitsCard';
import { buildDailyPnl } from '@/lib/performance';
import { getBilingualActivity } from '@/lib/activity';
import { Sparkles } from 'lucide-react';

type LatestOptimization = {
  id: string;
  symbol: string;
  timeframe: string;
  status: string;
  best_score: number;
  combinations_tried: number;
  before_net_profit: number;
  after_net_profit: number;
  before_sharpe_ratio: number;
  after_sharpe_ratio: number;
  param_changes: Array<{ name: string; before: number; after: number }> | null;
  created_at: string;
  strategies: { name: string } | { name: string }[] | null;
};

export function DashboardPage() {
  const { t, lang } = useTranslation();
  const fmt = useFormat();
  const { settings, isOnline, updateSettings } = useBotSettings();
  const { positions } = useOpenPositions();
  const recentTrades = useRecentTrades(14);
  const [todayTrades, setTodayTrades] = useState<TradeHistory[]>([]);
  const [recentLogs, setRecentLogs] = useState<BotLog[]>([]);
  const [totalTrades, setTotalTrades] = useState(0);
  const [winRate, setWinRate] = useState(0);
  const [latestOptimization, setLatestOptimization] = useState<LatestOptimization | null>(null);

  const fetchDashboardData = useCallback(async () => {
    try {
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);

      const [tradesResp, logsResp, allTradesResp, optResp] = await Promise.all([
        supabase
          .from('trade_history')
          .select('*')
          .gte('close_time', startOfDay.toISOString())
          .order('close_time', { ascending: false }),
        supabase
          .from('bot_logs')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(8),
        supabase.from('trade_history').select('profit'),
        supabase
          .from('strategy_optimizations')
          .select('id, symbol, timeframe, status, best_score, combinations_tried, before_net_profit, after_net_profit, before_sharpe_ratio, after_sharpe_ratio, param_changes, created_at, strategies(name)')
          .order('created_at', { ascending: false })
          .limit(1),
      ]);

      if (tradesResp.error) console.error('Dashboard trades error:', tradesResp.error);
      if (logsResp.error) console.error('Dashboard logs error:', logsResp.error);
      if (allTradesResp.error) console.error('Dashboard allTrades error:', allTradesResp.error);
      if (optResp.error) console.error('Dashboard optimization error:', optResp.error);
      if (tradesResp.data) setTodayTrades(tradesResp.data as TradeHistory[]);
      if (logsResp.data) setRecentLogs(logsResp.data as BotLog[]);
      if (optResp.data && optResp.data.length > 0) {
        setLatestOptimization(optResp.data[0] as LatestOptimization);
      } else if (optResp.data) {
        setLatestOptimization(null);
      }
      if (allTradesResp.data) {
        const trades = allTradesResp.data as { profit: number }[];
        setTotalTrades(trades.length);
        const wins = trades.filter((tr) => tr.profit > 0).length;
        setWinRate(trades.length > 0 ? (wins / trades.length) * 100 : 0);
      }
    } catch (error) {
      console.error('Failed to refresh dashboard data:', error);
    }
  }, []);

  useEffect(() => {
    fetchDashboardData();
    const interval = setInterval(fetchDashboardData, 5000);
    return () => clearInterval(interval);
  }, [fetchDashboardData]);

  const totalProfit = todayTrades.reduce((sum, tr) => sum + tr.profit, 0);
  const openProfit = positions.reduce((sum, p) => sum + (p.profit ?? 0), 0);
  const todayWinRate =
    todayTrades.length > 0
      ? (todayTrades.filter((tr) => tr.profit > 0).length / todayTrades.length) * 100
      : 0;

  const positionLabel = t('dash.openPositions');

  const dailyPnl = useMemo(
    () => buildDailyPnl(recentTrades, 14, settings?.daily_loss_reset_hour ?? 0),
    [recentTrades, settings?.daily_loss_reset_hour],
  );

  const equity = settings?.account_equity ?? null;
  const dayStartEquity = settings?.day_start_equity ?? null;
  const peakEquity = settings?.peak_equity ?? null;
  const dailyLossPercent =
    equity !== null && dayStartEquity ? Math.max(0, ((dayStartEquity - equity) / dayStartEquity) * 100) : 0;
  const drawdownPercent =
    equity !== null && peakEquity ? Math.max(0, ((peakEquity - equity) / peakEquity) * 100) : 0;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Top Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label={t('dash.accountBalance')}
          value={fmt.currency(settings?.account_balance, settings?.account_currency)}
          icon={<Wallet size={18} />}
          subtitle={`${t('dash.equity')}: ${fmt.currency(settings?.account_equity, settings?.account_currency)}`}
        />
        <StatCard
          label={t('dash.openPL')}
          value={fmt.currency(openProfit, settings?.account_currency)}
          icon={openProfit >= 0 ? <TrendingUp size={18} /> : <TrendingDown size={18} />}
          trend={openProfit > 0 ? 'up' : openProfit < 0 ? 'down' : 'neutral'}
          subtitle={`${positions.length} ${positionLabel}`}
        />
        <StatCard
          label={t('dash.todayPL')}
          value={fmt.currency(totalProfit, settings?.account_currency)}
          icon={totalProfit >= 0 ? <TrendingUp size={18} /> : <TrendingDown size={18} />}
          trend={totalProfit > 0 ? 'up' : totalProfit < 0 ? 'down' : 'neutral'}
          subtitle={`${todayTrades.length} ${t('dash.tradesToday')}`}
        />
        <StatCard
          label={t('dash.overallWinRate')}
          value={fmt.percent(winRate)}
          icon={<Target size={18} />}
          trend={winRate >= 50 ? 'up' : 'down'}
          subtitle={`${totalTrades} ${t('dash.totalTrades')}`}
        />
      </div>

      {/* Bot Status Row */}
      <Card className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div
              className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                isOnline
                  ? 'bg-success-muted/30 text-success-text'
                  : 'bg-bg-tertiary text-text-muted'
              }`}
            >
              <Bot size={24} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-text-primary font-semibold">{t('dash.tradingEngine')}</span>
                {isOnline ? (
                  <Badge dot variant={settings?.is_running ? 'success' : 'warning'}>
                    {settings?.is_running ? t('dash.autoTradingActive') : t('dash.idlePressStart')}
                  </Badge>
                ) : (
                  <Badge dot variant="danger">
                    {t('status.offline')}
                  </Badge>
                )}
              </div>
              <div className="text-text-muted text-sm mt-0.5">
                {settings?.mt5_connected ? t('dash.mt5Connected') : t('dash.mt5NotConnected')} ·
                {t('dash.heartbeat')} {fmt.timeAgo(settings?.last_heartbeat)}
              </div>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-6">
            <MiniStat label={t('dash.maxRisk')} value={fmt.percent(settings?.max_risk_percent)} />
            <MiniStat label={t('dash.maxPositions')} value={fmt.number(settings?.max_concurrent_positions, 0)} />
            <MiniStat label={t('dash.todayWinRate')} value={fmt.percent(todayWinRate)} />
          </div>
        </div>
      </Card>

      <RiskLimitsCard settings={settings} updateSettings={updateSettings} />

      {/* Capital Safety Row */}
      <Card className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <Badge dot variant={settings?.trading_paused ? 'danger' : 'success'}>
            {settings?.trading_paused ? t('dash.tradingPaused') : t('dash.safetyLimits')}
          </Badge>
          <div className="grid grid-cols-2 gap-6">
            <MiniStat
              label={t('dash.dailyLoss')}
              value={`${fmt.percent(dailyLossPercent)} / ${fmt.percent(settings?.daily_loss_limit_percent)}`}
            />
            <MiniStat
              label={t('dash.drawdown')}
              value={`${fmt.percent(drawdownPercent)} / ${fmt.percent(settings?.max_drawdown_percent)}`}
            />
          </div>
        </div>
      </Card>

      {/* Latest Optimization */}
      {latestOptimization && (
        <Card className="p-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-accent-primary/10 text-accent-primary">
                <Sparkles size={24} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-text-primary font-semibold">{t('dash.latestOptimization')}</span>
                  {latestOptimization.status === 'completed' ? (
                    <Badge dot variant="success">{t('strat.afterOpt')}</Badge>
                  ) : latestOptimization.status === 'failed' ? (
                    <Badge dot variant="danger">{t('strat.optFailed')}</Badge>
                  ) : (
                    <Badge dot variant="warning">{t('strat.optimizing')}</Badge>
                  )}
                </div>
                <div className="text-text-muted text-sm mt-0.5">
                  {(() => {
                    const s = latestOptimization.strategies;
                    const name = Array.isArray(s) ? s[0]?.name : s?.name;
                    return name || latestOptimization.symbol;
                  })()}
                  {' · '}{latestOptimization.symbol} {latestOptimization.timeframe}
                  {' · '}{formatDateTime(latestOptimization.created_at, lang)}
                </div>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-6">
              <MiniStat
                label={t('strat.netProfit')}
                value={`${(latestOptimization.before_net_profit ?? 0).toFixed(0)} → ${(latestOptimization.after_net_profit ?? 0).toFixed(0)}`}
              />
              <MiniStat
                label={t('strat.sharpeRatio')}
                value={`${(latestOptimization.before_sharpe_ratio ?? 0).toFixed(2)} → ${(latestOptimization.after_sharpe_ratio ?? 0).toFixed(2)}`}
              />
              <MiniStat
                label={t('strat.combinationsTried')}
                value={String(latestOptimization.combinations_tried)}
              />
            </div>
          </div>
        </Card>
      )}

      <PnlChart
        days={dailyPnl}
        balance={settings?.account_balance ?? null}
        currency={settings?.account_currency ?? 'USD'}
        dailyLossLimit={settings?.daily_loss_limit_percent ?? 0}
        maxDrawdown={settings?.max_drawdown_percent ?? 0}
      />

      <PredictionAccuracyChart />

      {/* Two-column: Positions + Logs */}
      <div className="grid lg:grid-cols-2 gap-4">
        {/* Open Positions Summary */}
        <Card className="p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-text-primary font-semibold flex items-center gap-2">
              <Activity size={18} className="text-accent-primary" />
              {t('dash.openPositionsTitle')}
            </h3>
            <Badge variant="info">{positions.length}</Badge>
          </div>
          {positions.length === 0 ? (
            <div className="text-text-muted text-sm py-8 text-center">
              {t('dash.noOpenPositions')}
            </div>
          ) : (
            <div className="space-y-2">
              {positions.slice(0, 5).map((pos) => (
                <div
                  key={pos.id}
                  className="flex items-center justify-between p-3 bg-bg-tertiary rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <Badge variant={pos.position_type === 'buy' ? 'success' : 'danger'}>
                      {pos.position_type === 'buy' ? t('pos.buy') : t('pos.sell')}
                    </Badge>
                    <div>
                      <div className="text-text-primary text-sm font-medium font-mono">{pos.symbol}</div>
                      <div className="text-text-muted text-xs">
                        {fmt.number(pos.volume, 2)} {t('dash.lots')} {t('dash.at')} {fmt.number(pos.open_price, 5)}
                      </div>
                    </div>
                  </div>
                  <div
                    className={`font-mono text-sm font-semibold ${
                      (pos.profit ?? 0) >= 0 ? 'text-success-text' : 'text-danger-text'
                    }`}
                  >
                    {(pos.profit ?? 0) >= 0 ? '+' : ''}
                    {fmt.currency(pos.profit)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Recent Logs */}
        <Card className="p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-text-primary font-semibold flex items-center gap-2">
              <AlertTriangle size={18} className="text-warning" />
              {t('dash.recentActivity')}
            </h3>
          </div>
          {recentLogs.length === 0 ? (
            <div className="text-text-muted text-sm py-8 text-center">
              {t('dash.noActivity')}
            </div>
          ) : (
            <div className="space-y-2 max-h-72 overflow-y-auto">
              {recentLogs.map((log) => {
                const activity = getBilingualActivity(log.message);
                return (
                  <div key={log.id} className="flex items-start gap-3 p-2.5 bg-bg-tertiary rounded-lg">
                  <span
                    className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${
                      log.level === 'error'
                        ? 'bg-danger'
                        : log.level === 'warning'
                        ? 'bg-warning'
                        : 'bg-success'
                    }`}
                  />
                  <div className="min-w-0 flex-1">
                    <div dir="rtl" className="text-text-primary text-sm leading-6">
                      {activity.fa}
                    </div>
                    <div dir="ltr" className="text-text-secondary text-xs leading-5 text-left mt-0.5">
                      {activity.en}
                    </div>
                    <div className="text-text-muted text-xs">
                      {log.symbol && <span className="font-mono">{log.symbol} · </span>}
                      {formatDateTime(log.created_at, lang)}
                    </div>
                  </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-text-muted text-xs">{label}</div>
      <div className="text-text-primary font-semibold font-mono text-sm mt-0.5">{value}</div>
    </div>
  );
}

import { useEffect, useState, useCallback } from 'react';
import { History, Filter, TrendingUp, TrendingDown, Target } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useTranslation } from '@/lib/i18n';
import { useFormat } from '@/lib/format';
import { Card, Badge, StatCard } from '@/components/ui';
import { formatDateTime } from '@/lib/format';
import type { TradeHistory } from '@/lib/types';

export function HistoryPage() {
  const { t, lang } = useTranslation();
  const fmt = useFormat();
  const [trades, setTrades] = useState<TradeHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterSymbol, setFilterSymbol] = useState('all');
  const [filterResult, setFilterResult] = useState('all');
  const [stats, setStats] = useState({ totalProfit: 0, totalTrades: 0, wins: 0, losses: 0 });
  const [allSymbols, setAllSymbols] = useState<string[]>([]);

  const fetchTrades = useCallback(async () => {
    try {
      let query = supabase.from('trade_history').select('*').order('close_time', { ascending: false }).limit(200);
      if (filterSymbol !== 'all') query = query.eq('symbol', filterSymbol);
      const { data, error } = await query;
      if (error) {
        console.error('Failed to load trade history:', error);
        return;
      }
      let filtered = (data as TradeHistory[]) ?? [];
      if (filterResult === 'win') filtered = filtered.filter((tr) => tr.profit > 0);
      if (filterResult === 'loss') filtered = filtered.filter((tr) => tr.profit <= 0);
      setTrades(filtered);

      const totalProfit = filtered.reduce((s, tr) => s + tr.profit, 0);
      const wins = filtered.filter((tr) => tr.profit > 0).length;
      setStats({ totalProfit, totalTrades: filtered.length, wins, losses: filtered.length - wins });
    } catch (err) {
      console.error('Failed to fetch trade history:', err);
    } finally {
      setLoading(false);
    }
  }, [filterSymbol, filterResult]);

  useEffect(() => {
    fetchTrades();
  }, [fetchTrades]);

  useEffect(() => {
    supabase
      .from('trade_history')
      .select('symbol')
      .order('symbol')
      .then(({ data }) => {
        if (data) setAllSymbols(Array.from(new Set((data as { symbol: string }[]).map((r) => r.symbol))));
      });
  }, []);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label={t('hist.totalTrades')}
          value={fmt.number(stats.totalTrades, 0)}
          icon={<History size={18} />}
        />
        <StatCard
          label={t('hist.netProfit')}
          value={fmt.currency(stats.totalProfit)}
          icon={stats.totalProfit >= 0 ? <TrendingUp size={18} /> : <TrendingDown size={18} />}
          trend={stats.totalProfit > 0 ? 'up' : 'down'}
        />
        <StatCard
          label={t('hist.winRate')}
          value={fmt.percent(stats.totalTrades > 0 ? (stats.wins / stats.totalTrades) * 100 : 0)}
          icon={<Target size={18} />}
          trend={stats.totalTrades > 0 && stats.wins / stats.totalTrades >= 0.5 ? 'up' : 'down'}
        />
        <StatCard
          label={t('hist.winsLosses')}
          value={`${stats.wins} / ${stats.losses}`}
          icon={<TrendingUp size={18} />}
        />
      </div>

      {/* Filters */}
      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2 text-text-secondary">
            <Filter size={16} /> {t('hist.filters')}:
          </div>
          <select
            value={filterSymbol}
            onChange={(e) => setFilterSymbol(e.target.value)}
            className="bg-bg-tertiary border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent-primary"
          >
            <option value="all">{t('hist.allSymbols')}</option>
            {allSymbols.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <select
            value={filterResult}
            onChange={(e) => setFilterResult(e.target.value)}
            className="bg-bg-tertiary border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent-primary"
          >
            <option value="all">{t('hist.allResults')}</option>
            <option value="win">{t('hist.winsOnly')}</option>
            <option value="loss">{t('hist.lossesOnly')}</option>
          </select>
        </div>
      </Card>

      {/* Trade History Table */}
      <Card className="overflow-hidden">
        <div className="p-4 border-b border-border-subtle">
          <h3 className="text-text-primary font-semibold flex items-center gap-2">
            <History size={18} className="text-accent-primary" />
            {t('hist.closedTrades')}
          </h3>
        </div>
        {loading ? (
          <div className="p-8 text-center text-text-muted">{t('hist.loading')}</div>
        ) : trades.length === 0 ? (
          <div className="p-12 text-center">
            <History size={32} className="text-text-muted mx-auto mb-3" />
            <div className="text-text-secondary text-sm">{t('hist.noTrades')}</div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-text-muted text-xs uppercase border-b border-border-subtle">
                  <th className="text-start px-4 py-3 font-medium">{t('hist.symbol')}</th>
                  <th className="text-start px-4 py-3 font-medium">{t('hist.type')}</th>
                  <th className="text-end px-4 py-3 font-medium">{t('hist.volume')}</th>
                  <th className="text-end px-4 py-3 font-medium">{t('hist.open')}</th>
                  <th className="text-end px-4 py-3 font-medium">{t('hist.close')}</th>
                  <th className="text-end px-4 py-3 font-medium">{t('hist.pl')}</th>
                  <th className="text-start px-4 py-3 font-medium">{t('hist.reason')}</th>
                  <th className="text-start px-4 py-3 font-medium">{t('hist.slTpMode')}</th>
                  <th className="text-start px-4 py-3 font-medium">{t('hist.closedAt')}</th>
                </tr>
              </thead>
              <tbody>
                {trades.map((trade) => (
                  <tr key={trade.id} className="border-b border-border-subtle hover:bg-bg-hover transition-colors">
                    <td className="px-4 py-3 font-mono font-medium text-text-primary">{trade.symbol}</td>
                    <td className="px-4 py-3">
                      <Badge variant={trade.position_type === 'buy' ? 'success' : 'danger'}>
                        {trade.position_type === 'buy' ? t('pos.buy') : t('pos.sell')}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-end font-mono text-text-secondary">
                      {fmt.number(trade.volume, 2)}
                    </td>
                    <td className="px-4 py-3 text-end font-mono text-text-secondary">
                      {fmt.price(trade.open_price)}
                    </td>
                    <td className="px-4 py-3 text-end font-mono text-text-secondary">
                      {fmt.price(trade.close_price)}
                    </td>
                    <td
                      className={`px-4 py-3 text-end font-mono font-semibold ${
                        trade.profit >= 0 ? 'text-success-text' : 'text-danger-text'
                      }`}
                    >
                      {trade.profit >= 0 ? '+' : ''}
                      {fmt.currency(trade.profit)}
                    </td>
                    <td className="px-4 py-3">
                      <ReasonBadge reason={trade.close_reason} t={t} />
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={trade.sl_tp_mode === 'dynamic' ? 'info' : 'neutral'}>
                        {t(`hist.${trade.sl_tp_mode}`)}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-text-muted text-xs">{formatDateTime(trade.close_time, lang)}</td>
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

function ReasonBadge({ reason, t }: { reason: string; t: (key: string) => string }) {
  const map: Record<string, { variant: 'success' | 'danger' | 'info' | 'warning' | 'neutral'; key: string }> = {
    tp_hit: { variant: 'success', key: 'hist.reason.tpHit' },
    sl_hit: { variant: 'danger', key: 'hist.reason.slHit' },
    model_signal: { variant: 'info', key: 'hist.reason.modelSignal' },
    manual: { variant: 'neutral', key: 'hist.reason.manual' },
    error: { variant: 'warning', key: 'hist.reason.error' },
    partial_close: { variant: 'info', key: 'hist.reason.partialClose' },
  };
  const cfg = map[reason] ?? map.manual;
  return <Badge variant={cfg.variant}>{t(cfg.key)}</Badge>;
}

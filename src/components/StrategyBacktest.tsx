import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { ChevronDown, ChevronUp, Download, Play, Sparkles, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useTranslation } from '@/lib/i18n';
import { useOptimizations } from '@/lib/hooks';
import { Badge, Button, Card } from '@/components/ui';
import { BacktestResultCard } from '@/components/BacktestResultCard';
import { OptimizationResultCard } from '@/components/OptimizationResultCard';
import { downloadBacktestReport } from '@/lib/strategyFile';
import type { BacktestResult, Strategy } from '@/lib/types';

const TIMEFRAMES = ['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1'];
const INPUT_CLASS =
  'w-full bg-bg-tertiary border border-border rounded-lg px-3 py-2.5 text-text-primary font-mono focus:outline-none focus:border-accent-primary';
const RESULTS_POLL_MS = 5000;

interface ConfiguredSymbol {
  symbol: string;
}

interface Notice {
  type: 'success' | 'error';
  text: string;
}

const isoDate = (date: Date) => date.toISOString().slice(0, 10);

const safeFloat = (v: string): number => { const n = parseFloat(v); return Number.isNaN(n) ? 0 : n; };

const NUMERIC_RESULT_FIELDS = [
  'initial_capital',
  'net_profit',
  'total_trades',
  'wins',
  'losses',
  'win_rate',
  'max_drawdown',
  'profit_factor',
] as const;

function normalizeResult(row: Record<string, unknown>): BacktestResult {
  const normalized: Record<string, unknown> = { ...row };
  for (const field of NUMERIC_RESULT_FIELDS) {
    normalized[field] = Number(row[field] ?? 0);
  }
  if (!Array.isArray(normalized.equity_curve)) normalized.equity_curve = [];
  if (!Array.isArray(normalized.trades_detail)) normalized.trades_detail = [];
  return normalized as unknown as BacktestResult;
}

function FormField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <label className="text-text-secondary text-sm font-medium block mb-2">{label}</label>
      {children}
    </div>
  );
}

export function StrategyBacktest({ strategy }: { strategy: Strategy }) {
  const { t } = useTranslation();
  const [symbols, setSymbols] = useState<ConfiguredSymbol[]>([]);
  const [results, setResults] = useState<BacktestResult[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [form, setForm] = useState(() => {
    const yearAgo = new Date();
    yearAgo.setFullYear(yearAgo.getFullYear() - 1);
    return {
      symbol: '',
      timeframe: 'M5',
      fromDate: isoDate(yearAgo),
      toDate: isoDate(new Date()),
      capital: 10000,
    };
  });
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [confirmingDeleteAll, setConfirmingDeleteAll] = useState(false);
  const [deletingAll, setDeletingAll] = useState(false);
  const [deleteAllError, setDeleteAllError] = useState<string | null>(null);
  const [optimizing, setOptimizing] = useState(false);
  const { optimizations } = useOptimizations(strategy.id);

  useEffect(() => {
    supabase
      .from('symbol_config')
      .select('symbol')
      .order('symbol')
      .then(({ data, error }) => {
        if (error || !data) return;
        const rows = data as ConfiguredSymbol[];
        setSymbols(rows);
        if (rows.length > 0) {
          setForm((prev) => ({ ...prev, symbol: prev.symbol || rows[0].symbol }));
        }
      })
      .catch((err) => console.error('Failed to load symbols:', err));
  }, []);

  const fetchResults = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('strategy_backtest_results')
        .select('*')
        .eq('strategy_id', strategy.id)
        .order('created_at', { ascending: false })
        .limit(10);
      if (!error && data) setResults((data as Record<string, unknown>[]).map(normalizeResult));
    } catch (err) {
      console.error('Failed to load backtest results:', err);
    }
  }, [strategy.id]);

  useEffect(() => {
    fetchResults();
    const interval = setInterval(fetchResults, RESULTS_POLL_MS);
    return () => clearInterval(interval);
  }, [fetchResults]);

  const handleDeleteResult = async (id: string) => {
    setDeletingId(id);
    setDeleteError(null);
    try {
      const { error } = await supabase.from('strategy_backtest_results').delete().eq('id', id);
      if (error) {
        setDeleteError(t('strat.deleteResultFailed'));
        return;
      }
      setConfirmingDeleteId(null);
      setExpandedId(null);
      setResults((prev) => prev.filter((result) => result.id !== id));
    } catch (err) {
      console.error('Failed to delete result:', err);
      setDeleteError(t('strat.deleteResultFailed'));
    } finally {
      setDeletingId(null);
    }
  };

  const handleDeleteAllResults = async () => {
    setDeletingAll(true);
    setDeleteAllError(null);
    try {
      const { error } = await supabase
        .from('strategy_backtest_results')
        .delete()
        .eq('strategy_id', strategy.id);
      if (error) {
        setDeleteAllError(t('strat.deleteResultFailed'));
        return;
      }
      setConfirmingDeleteAll(false);
      setExpandedId(null);
      setResults([]);
    } catch (err) {
      console.error('Failed to delete all results:', err);
      setDeleteAllError(t('strat.deleteResultFailed'));
    } finally {
      setDeletingAll(false);
    }
  };

  const handleSymbolChange = (symbol: string) => {
    setForm({ ...form, symbol });
  };

  const handleRun = async () => {
    if (!form.symbol) {
      setNotice({ type: 'error', text: t('strat.noSymbols') });
      return;
    }
    if (!form.fromDate || !form.toDate || form.fromDate > form.toDate) {
      setNotice({ type: 'error', text: t('strat.rangeInvalid') });
      return;
    }
    if (!(form.capital > 0)) {
      setNotice({ type: 'error', text: t('strat.capitalInvalid') });
      return;
    }

    setSending(true);
    setNotice(null);
    try {
      const { error } = await supabase.from('bot_logs').insert({
        level: 'info',
        message: 'Backtest request',
        details: {
          action: 'run_backtest',
          strategy_id: strategy.id,
          symbol: form.symbol,
          timeframe: form.timeframe,
          from_date: form.fromDate,
          to_date: form.toDate,
          initial_capital: form.capital,
        },
      });
      setNotice(
        error
          ? { type: 'error', text: t('strat.requestFailed') }
          : { type: 'success', text: t('strat.requestSent') }
      );
    } catch (err) {
      console.error('Failed to send backtest request:', err);
      setNotice({ type: 'error', text: t('strat.requestFailed') });
    } finally {
      setSending(false);
    }
  };

  const handleOptimize = async () => {
    const latest = results.find((r) => r.status === 'completed');
    if (!latest) {
      setNotice({ type: 'error', text: t('strat.noResults') });
      return;
    }

    setOptimizing(true);
    setNotice(null);
    try {
      const { error } = await supabase.from('bot_logs').insert({
        level: 'info',
        message: 'Optimization request',
        details: {
          action: 'run_optimize',
          strategy_id: strategy.id,
          symbol: latest.symbol,
          timeframe: latest.timeframe,
          from_date: latest.from_date,
          to_date: latest.to_date,
          initial_capital: latest.initial_capital,
          reference_backtest_id: latest.id,
        },
      });
      setNotice(
        error
          ? { type: 'error', text: t('strat.optimizeRequestFailed') }
          : { type: 'success', text: t('strat.optimizeRequestSent') }
      );
    } catch (err) {
      console.error('Failed to send optimization request:', err);
      setNotice({ type: 'error', text: t('strat.optimizeRequestFailed') });
    } finally {
      setOptimizing(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <h3 className="text-text-primary font-semibold flex items-center gap-2 mb-1">
          <Play size={18} className="text-accent-primary" />
          {t('strat.backtest')}
        </h3>
        <p className="text-text-muted text-sm mb-5">{t('strat.backtestDesc')}</p>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
          <FormField label={t('hist.symbol')}>
            <select value={form.symbol} onChange={(e) => handleSymbolChange(e.target.value)} className={INPUT_CLASS}>
              {symbols.map((s) => (
                <option key={s.symbol} value={s.symbol}>{s.symbol}</option>
              ))}
            </select>
          </FormField>
          <FormField label={t('set.timeframe')}>
            <select value={form.timeframe} onChange={(e) => setForm({ ...form, timeframe: e.target.value })} className={INPUT_CLASS}>
              {TIMEFRAMES.map((tf) => (
                <option key={tf} value={tf}>{tf}</option>
              ))}
            </select>
          </FormField>
          <FormField label={t('strat.from')}>
            <input type="date" value={form.fromDate} onChange={(e) => setForm({ ...form, fromDate: e.target.value })} className={INPUT_CLASS} />
          </FormField>
          <FormField label={t('strat.to')}>
            <input type="date" value={form.toDate} onChange={(e) => setForm({ ...form, toDate: e.target.value })} className={INPUT_CLASS} />
          </FormField>
          <FormField label={t('strat.capital')}>
            <input type="number" min="1" step="100" value={form.capital} onChange={(e) => setForm({ ...form, capital: safeFloat(e.target.value) })} className={INPUT_CLASS} />
          </FormField>
        </div>

        <p className="text-text-muted text-sm mt-4">{t('strat.usesSymbolSettings')}</p>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          {notice ? (
            <p className={`text-sm ${notice.type === 'success' ? 'text-success-text' : 'text-danger-text'}`}>{notice.text}</p>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={handleOptimize} disabled={optimizing || symbols.length === 0 || results.length === 0}>
              <Sparkles size={14} className="me-1.5" />
              {optimizing ? t('strat.optimizing') : t('strat.optimize')}
            </Button>
            <Button onClick={handleRun} disabled={sending || symbols.length === 0}>
              {t('strat.runBacktest')}
            </Button>
          </div>
        </div>
      </Card>

      {optimizations.length > 0 && (
        <div className="space-y-3">
          <h4 className="text-text-primary font-semibold flex items-center gap-2">
            <Sparkles size={16} className="text-accent-primary" />
            {t('strat.optimizationResults')}
          </h4>
          <OptimizationResultCard key={optimizations[0].id} optimization={optimizations[0]} strategy={strategy} />
        </div>
      )}

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h4 className="text-text-primary font-semibold">{t('strat.backtestResults')}</h4>
          {results.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              {deleteAllError && !confirmingDeleteAll && (
                <span className="text-danger-text text-sm">{deleteAllError}</span>
              )}
              {confirmingDeleteAll ? (
                <>
                  <span className="text-danger-text text-sm">{t('strat.confirmDeleteAllResults')}</span>
                  <Button variant="danger" size="sm" onClick={handleDeleteAllResults} disabled={deletingAll}>
                    {t('strat.confirmYes')}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => { setConfirmingDeleteAll(false); setDeleteAllError(null); }}>
                    {t('set.cancel')}
                  </Button>
                </>
              ) : (
                <Button variant="ghost" size="sm" onClick={() => { setDeleteAllError(null); setConfirmingDeleteAll(true); }}>
                  <Trash2 size={14} className="me-1.5 text-danger-text" />
                  {t('strat.deleteAllResults')}
                </Button>
              )}
            </div>
          )}
        </div>
        {results.length === 0 && <p className="text-text-muted text-sm">{t('strat.noResults')}</p>}
        {results.map((result) => {
          const open = expandedId === result.id;
          return (
            <Card key={result.id} className="overflow-hidden">
              <button
                onClick={() => setExpandedId(open ? null : result.id)}
                className="w-full flex items-center justify-between gap-3 p-4 text-start hover:bg-bg-hover transition-colors"
              >
                <div className="flex flex-wrap items-center gap-3 min-w-0">
                  <span className="font-mono font-semibold text-text-primary">{result.symbol}</span>
                  <Badge variant="neutral">{result.timeframe}</Badge>
                  <span className="text-text-muted text-xs">{new Date(result.created_at).toLocaleString()}</span>
                  {result.status === 'completed' ? (
                    <span className={`font-mono text-sm ${result.net_profit >= 0 ? 'text-success-text' : 'text-danger-text'}`}>
                      {result.net_profit.toFixed(2)}
                    </span>
                  ) : (
                    <Badge variant="danger">{t('strat.failed')}</Badge>
                  )}
                </div>
                {open ? <ChevronUp size={16} className="text-text-muted shrink-0" /> : <ChevronDown size={16} className="text-text-muted shrink-0" />}
              </button>
              {open && (
                <div className="px-4 pb-4 pt-4 border-t border-border-subtle">
                  <div className="flex flex-wrap items-center justify-end gap-2 mb-4">
                    {deleteError && confirmingDeleteId === result.id && (
                      <span className="text-danger-text text-sm me-auto">{deleteError}</span>
                    )}
                    <Button variant="ghost" size="sm" onClick={() => downloadBacktestReport(result)}>
                      <Download size={14} className="me-1.5" />
                      {t('strat.downloadReport')}
                    </Button>
                    {confirmingDeleteId === result.id ? (
                      <>
                        <span className="text-danger-text text-sm">{t('strat.confirmDeleteResult')}</span>
                        <Button variant="danger" size="sm" onClick={() => handleDeleteResult(result.id)} disabled={deletingId === result.id}>
                          {t('strat.confirmYes')}
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setConfirmingDeleteId(null)}>
                          {t('set.cancel')}
                        </Button>
                      </>
                    ) : (
                      <Button variant="ghost" size="sm" onClick={() => { setDeleteError(null); setConfirmingDeleteId(result.id); }}>
                        <Trash2 size={14} className="me-1.5 text-danger-text" />
                        {t('strat.deleteResult')}
                      </Button>
                    )}
                  </div>
                  <BacktestResultCard result={result} />
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}

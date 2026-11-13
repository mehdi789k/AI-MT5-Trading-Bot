import { useEffect, useState, useCallback, useMemo } from 'react';
import { Settings as SettingsIcon, Plus, Trash2, Save, Coins, Shield, Layers, Search, Check } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useBotSettings, useStrategies } from '@/lib/hooks';
import { useTranslation } from '@/lib/i18n';
import { Card, Badge, Button, Toggle, Modal } from '@/components/ui';
import type { SymbolConfig, SymbolCategory, Mt5Symbol } from '@/lib/types';
import { AiPredictionSettingsCard } from '@/components/AiPredictionSettingsCard';

const TIMEFRAMES = ['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1'];

const safeFloat = (v: string): number => { const n = parseFloat(v); return Number.isNaN(n) ? 0 : n; };
const safeInt = (v: string): number => { const n = parseInt(v, 10); return Number.isNaN(n) ? 0 : n; };

const CATEGORY_COLORS: Record<string, 'neutral' | 'info' | 'success' | 'warning'> = {
  forex: 'neutral',
  metals: 'warning',
  indices: 'info',
  crypto: 'success',
  energy: 'warning',
  stocks: 'info',
};

export function SettingsPage() {
  const { t } = useTranslation();
  const { settings, updateSettings } = useBotSettings();
  const { strategies } = useStrategies();
  const [symbols, setSymbols] = useState<SymbolConfig[]>([]);
  const [mt5Symbols, setMt5Symbols] = useState<Mt5Symbol[]>([]);
  const [symbolSearch, setSymbolSearch] = useState('');
  const [symbolCatFilter, setSymbolCatFilter] = useState<string>('all');
  const [editingSymbol, setEditingSymbol] = useState<SymbolConfig | null>(null);
  const [savingGlobal, setSavingGlobal] = useState(false);
  const [savingSymbol, setSavingSymbol] = useState(false);
  const [newSymbol, setNewSymbol] = useState('');
  const [newCategory, setNewCategory] = useState<SymbolCategory>('forex');

  const [globalForm, setGlobalForm] = useState({
    max_risk_percent: 1,
    max_concurrent_positions: 5,
    auto_mode: true,
    daily_loss_limit_percent: 5,
    max_drawdown_percent: 10,
    max_total_risk_percent: 20,
    risk_per_trade_mode: 'percent' as 'percent' | 'fixed',
    fixed_risk_amount: 0,
    enable_limit_orders: false,
    limit_order_offset_points: 0,
    daily_loss_reset_hour: 0,
  });
  const [savingCapital, setSavingCapital] = useState(false);

  const categories: { value: SymbolCategory; label: string }[] = [
    { value: 'forex', label: t('set.forex') },
    { value: 'metals', label: t('set.metals') },
    { value: 'indices', label: t('set.indices') },
    { value: 'crypto', label: t('set.crypto') },
    { value: 'energy', label: t('set.energy') },
    { value: 'stocks', label: t('set.stocks') },
  ];

  useEffect(() => {
    if (settings) {
      setGlobalForm({
        max_risk_percent: settings.max_risk_percent,
        max_concurrent_positions: settings.max_concurrent_positions,
        auto_mode: settings.auto_mode,
        daily_loss_limit_percent: settings.daily_loss_limit_percent ?? 5,
        max_drawdown_percent: settings.max_drawdown_percent ?? 10,
        max_total_risk_percent: settings.max_total_risk_percent ?? 20,
        risk_per_trade_mode: settings.risk_per_trade_mode ?? 'percent',
        fixed_risk_amount: settings.fixed_risk_amount ?? 0,
        enable_limit_orders: settings.enable_limit_orders ?? false,
        limit_order_offset_points: settings.limit_order_offset_points ?? 0,
        daily_loss_reset_hour: settings.daily_loss_reset_hour ?? 0,
      });
    }
  }, [settings]);

  const fetchSymbols = useCallback(async () => {
    const { data } = await supabase.from('symbol_config').select('*').order('symbol');
    if (data) setSymbols(data as SymbolConfig[]);
  }, []);

  const fetchMt5Symbols = useCallback(async () => {
    const { data } = await supabase.from('mt5_symbols').select('*').order('symbol');
    if (data) setMt5Symbols(data as Mt5Symbol[]);
  }, []);

  useEffect(() => {
    fetchSymbols();
    fetchMt5Symbols();
    const interval = setInterval(fetchMt5Symbols, 10000);
    return () => clearInterval(interval);
  }, [fetchSymbols, fetchMt5Symbols]);

  const saveGlobal = async () => {
    setSavingGlobal(true);
    await updateSettings({
      max_risk_percent: globalForm.max_risk_percent,
      max_concurrent_positions: globalForm.max_concurrent_positions,
      auto_mode: globalForm.auto_mode,
    });
    setSavingGlobal(false);
  };

  const saveCapital = async () => {
    setSavingCapital(true);
    await updateSettings({
      daily_loss_limit_percent: globalForm.daily_loss_limit_percent,
      max_drawdown_percent: globalForm.max_drawdown_percent,
      max_total_risk_percent: globalForm.max_total_risk_percent,
      risk_per_trade_mode: globalForm.risk_per_trade_mode,
      fixed_risk_amount: globalForm.fixed_risk_amount,
      enable_limit_orders: globalForm.enable_limit_orders,
      limit_order_offset_points: globalForm.limit_order_offset_points,
      daily_loss_reset_hour: globalForm.daily_loss_reset_hour,
    });
    setSavingCapital(false);
  };

  const resumeTrading = async () => {
    await updateSettings({ trading_paused: false, peak_equity: null });
  };

  const saveSymbol = async () => {
    if (!editingSymbol) return;
    setSavingSymbol(true);
    const { id, created_at, updated_at, ...patch } = editingSymbol;
    void id; void created_at; void updated_at;
    await supabase.from('symbol_config').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', editingSymbol.id);
    setSavingSymbol(false);
    setEditingSymbol(null);
    fetchSymbols();
  };

  const addSymbol = async (symbolName?: string, category?: SymbolCategory) => {
    const name = (symbolName ?? newSymbol).trim().toUpperCase();
    const cat = category ?? newCategory;
    if (!name) return;
    const { data, error } = await supabase
      .from('symbol_config')
      .insert({
        symbol: name,
        category: cat,
        enabled: true,
        timeframe: 'M15',
        sl_tp_mode: 'fixed',
      })
      .select()
      .single();
    if (!error && data) {
      setSymbols((prev) => [...prev, data as SymbolConfig].sort((a, b) => a.symbol.localeCompare(b.symbol)));
      if (!symbolName) setNewSymbol('');
    }
  };

  const configuredSymbolNames = useMemo(() => new Set(symbols.map((s) => s.symbol.toUpperCase())), [symbols]);

  const filteredMt5Symbols = useMemo(() => {
    let list = mt5Symbols;
    if (symbolCatFilter !== 'all') {
      list = list.filter((s) => s.category === symbolCatFilter);
    }
    if (symbolSearch.trim()) {
      const q = symbolSearch.trim().toUpperCase();
      list = list.filter((s) => s.symbol.includes(q) || s.description?.toUpperCase().includes(q));
    }
    return list;
  }, [mt5Symbols, symbolCatFilter, symbolSearch]);

  const deleteSymbol = async (id: string) => {
    await supabase.from('symbol_config').delete().eq('id', id);
    setSymbols((prev) => prev.filter((s) => s.id !== id));
  };

  const toggleSymbolEnabled = async (sym: SymbolConfig) => {
    const newEnabled = !sym.enabled;
    await supabase.from('symbol_config').update({ enabled: newEnabled, updated_at: new Date().toISOString() }).eq('id', sym.id);
    setSymbols((prev) => prev.map((s) => (s.id === sym.id ? { ...s, enabled: newEnabled } : s)));
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Global Settings */}
      <Card className="p-6">
        <h3 className="text-text-primary font-semibold flex items-center gap-2 mb-5">
          <SettingsIcon size={18} className="text-accent-primary" />
          {t('set.globalRisk')}
        </h3>
        <div className="grid md:grid-cols-3 gap-5">
          <div>
            <label className="text-text-secondary text-sm font-medium block mb-2">
              {t('set.maxRiskPerTrade')}
            </label>
            <input
              type="number"
              min="0.1"
              max="10"
              step="0.1"
              value={globalForm.max_risk_percent}
              onChange={(e) => setGlobalForm({ ...globalForm, max_risk_percent: safeFloat(e.target.value) })}
              className="w-full bg-bg-tertiary border border-border rounded-lg px-3 py-2.5 text-text-primary font-mono focus:outline-none focus:border-accent-primary"
            />
            <p className="text-text-muted text-xs mt-1">{t('set.maxRiskDesc')}</p>
          </div>
          <div>
            <label className="text-text-secondary text-sm font-medium block mb-2">
              {t('set.maxConcurrent')}
            </label>
            <input
              type="number"
              min="1"
              max="20"
              value={globalForm.max_concurrent_positions}
              onChange={(e) => setGlobalForm({ ...globalForm, max_concurrent_positions: safeInt(e.target.value) })}
              className="w-full bg-bg-tertiary border border-border rounded-lg px-3 py-2.5 text-text-primary font-mono focus:outline-none focus:border-accent-primary"
            />
            <p className="text-text-muted text-xs mt-1">{t('set.maxConcurrentDesc')}</p>
          </div>
          <div>
            <label className="text-text-secondary text-sm font-medium block mb-2">{t('set.autoTradeMode')}</label>
            <div className="bg-bg-tertiary border border-border rounded-lg px-3 py-2.5">
              <Toggle
                checked={globalForm.auto_mode}
                onChange={(checked) => setGlobalForm({ ...globalForm, auto_mode: checked })}
                label={globalForm.auto_mode ? t('set.fullyAuto') : t('set.manualApproval')}
              />
            </div>
            <p className="text-text-muted text-xs mt-1">{t('set.autoTradeDesc')}</p>
          </div>
        </div>
        <div className="mt-5 flex justify-end">
          <Button onClick={saveGlobal} disabled={savingGlobal}>
            <Save size={16} className="mr-2" /> {savingGlobal ? t('set.saving') : t('set.saveGlobal')}
          </Button>
        </div>
      </Card>

      {/* Capital Protection */}
      <Card className="p-6">
        <h3 className="text-text-primary font-semibold flex items-center gap-2 mb-2">
          <Shield size={18} className="text-warning" />
          {t('cap.capitalProtection')}
        </h3>
        {settings?.trading_paused && (
          <div className="mb-4 p-3 bg-danger-muted/20 border border-danger/30 rounded-lg flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-danger-text font-medium text-sm">{t('cap.tradingPaused')}</span>
              <span className="text-text-muted text-xs">— {t('cap.tradingPausedDesc')}</span>
            </div>
            <Button variant="success" size="sm" onClick={resumeTrading}>{t('cap.resumeTrading')}</Button>
          </div>
        )}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
          <div>
            <label className="text-text-secondary text-sm font-medium block mb-2">
              {t('cap.dailyLossLimit')}
            </label>
            <input
              type="number" min="0.5" max="50" step="0.5"
              value={globalForm.daily_loss_limit_percent}
              onChange={(e) => setGlobalForm({ ...globalForm, daily_loss_limit_percent: safeFloat(e.target.value) })}
              className="w-full bg-bg-tertiary border border-border rounded-lg px-3 py-2.5 text-text-primary font-mono focus:outline-none focus:border-accent-primary"
            />
            <p className="text-text-muted text-xs mt-1">{t('cap.dailyLossDesc')}</p>
          </div>
          <div>
            <label className="text-text-secondary text-sm font-medium block mb-2">
              {t('cap.maxDrawdown')}
            </label>
            <input
              type="number" min="1" max="50" step="1"
              value={globalForm.max_drawdown_percent}
              onChange={(e) => setGlobalForm({ ...globalForm, max_drawdown_percent: safeFloat(e.target.value) })}
              className="w-full bg-bg-tertiary border border-border rounded-lg px-3 py-2.5 text-text-primary font-mono focus:outline-none focus:border-accent-primary"
            />
            <p className="text-text-muted text-xs mt-1">{t('cap.drawdownDesc')}</p>
          </div>
          <div>
            <label className="text-text-secondary text-sm font-medium block mb-2">
              {t('cap.maxTotalRisk')}
            </label>
            <input
              type="number" min="1" max="100" step="1"
              value={globalForm.max_total_risk_percent}
              onChange={(e) => setGlobalForm({ ...globalForm, max_total_risk_percent: safeFloat(e.target.value) })}
              className="w-full bg-bg-tertiary border border-border rounded-lg px-3 py-2.5 text-text-primary font-mono focus:outline-none focus:border-accent-primary"
            />
            <p className="text-text-muted text-xs mt-1">{t('cap.totalRiskDesc')}</p>
          </div>
          <div>
            <label className="text-text-secondary text-sm font-medium block mb-2">
              {t('cap.riskMode')}
            </label>
            <div className="flex gap-2">
              <ModeButton
                active={globalForm.risk_per_trade_mode === 'percent'}
                onClick={() => setGlobalForm({ ...globalForm, risk_per_trade_mode: 'percent' })}
                label={t('cap.percentMode')}
              />
              <ModeButton
                active={globalForm.risk_per_trade_mode === 'fixed'}
                onClick={() => setGlobalForm({ ...globalForm, risk_per_trade_mode: 'fixed' })}
                label={t('cap.fixedMode')}
              />
            </div>
          </div>
          {globalForm.risk_per_trade_mode === 'fixed' && (
            <div>
              <label className="text-text-secondary text-sm font-medium block mb-2">
                {t('cap.fixedRiskAmount')}
              </label>
              <input
                type="number" min="1" step="1"
                value={globalForm.fixed_risk_amount}
                onChange={(e) => setGlobalForm({ ...globalForm, fixed_risk_amount: safeFloat(e.target.value) })}
                className="w-full bg-bg-tertiary border border-border rounded-lg px-3 py-2.5 text-text-primary font-mono focus:outline-none focus:border-accent-primary"
              />
              <p className="text-text-muted text-xs mt-1">{t('cap.fixedRiskDesc')}</p>
            </div>
          )}
          <div>
            <label className="text-text-secondary text-sm font-medium block mb-2">
              {t('cap.dailyResetHour')}
            </label>
            <input
              type="number" min="0" max="23" step="1"
              value={globalForm.daily_loss_reset_hour}
              onChange={(e) => setGlobalForm({ ...globalForm, daily_loss_reset_hour: safeInt(e.target.value) })}
              className="w-full bg-bg-tertiary border border-border rounded-lg px-3 py-2.5 text-text-primary font-mono focus:outline-none focus:border-accent-primary"
            />
            <p className="text-text-muted text-xs mt-1">{t('cap.resetHourDesc')}</p>
          </div>
        </div>

        {/* Limit Orders Section */}
        <div className="mt-5 pt-5 border-t border-border-subtle">
          <h4 className="text-text-primary font-semibold flex items-center gap-2 mb-4">
            <Layers size={16} className="text-accent-primary" />
            {t('lim.limitOrders')}
          </h4>
          <div className="flex items-center justify-between mb-4">
            <div>
              <Toggle
                checked={globalForm.enable_limit_orders}
                onChange={(checked) => setGlobalForm({ ...globalForm, enable_limit_orders: checked })}
                label={t('lim.enableLimit')}
              />
              <p className="text-text-muted text-xs mt-1">{t('lim.enableLimitDesc')}</p>
            </div>
          </div>
          <div className="grid md:grid-cols-2 gap-5">
            <div>
              <label className="text-text-secondary text-sm font-medium block mb-2">
                {t('lim.minOffset')}
              </label>
              <input
                type="number" min="0" step="1"
                value={globalForm.limit_order_offset_points}
                onChange={(e) => setGlobalForm({ ...globalForm, limit_order_offset_points: safeInt(e.target.value) })}
                disabled={!globalForm.enable_limit_orders}
                className="w-full bg-bg-tertiary border border-border rounded-lg px-3 py-2.5 text-text-primary font-mono focus:outline-none focus:border-accent-primary disabled:opacity-40"
              />
              <p className="text-text-muted text-xs mt-1">{t('lim.offsetDesc')}</p>
            </div>
          </div>
        </div>

        <div className="mt-5 flex justify-end">
          <Button onClick={saveCapital} disabled={savingCapital}>
            <Save size={16} className="mr-2" /> {savingCapital ? t('set.saving') : t('cap.saveCapital')}
          </Button>
        </div>
      </Card>

      {/* AI Prediction Settings */}
      <AiPredictionSettingsCard />

      {/* Symbol Configuration */}
      <Card className="p-6">
        <h3 className="text-text-primary font-semibold flex items-center gap-2 mb-5">
          <Coins size={18} className="text-accent-primary" />
          {t('set.symbolConfig')}
        </h3>

        {/* Add new symbol manually */}
        <div className="flex flex-wrap items-end gap-3 mb-5">
          <div>
            <label className="text-text-secondary text-sm font-medium block mb-1">{t('set.symbolName')}</label>
            <input
              type="text"
              value={newSymbol}
              onChange={(e) => setNewSymbol(e.target.value)}
              placeholder="e.g. AUDUSD, NAS100"
              className="bg-bg-tertiary border border-border rounded-lg px-3 py-2 text-text-primary font-mono w-40 focus:outline-none focus:border-accent-primary"
            />
          </div>
          <div>
            <label className="text-text-secondary text-sm font-medium block mb-1">{t('set.category')}</label>
            <select
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value as SymbolCategory)}
              className="bg-bg-tertiary border border-border rounded-lg px-3 py-2 text-text-primary focus:outline-none focus:border-accent-primary"
            >
              {categories.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </div>
          <Button onClick={() => addSymbol()} variant="ghost" size="md">
            <Plus size={16} className="mr-1" /> {t('set.addSymbol')}
          </Button>
        </div>

        {/* MT5 Symbol Browser */}
        <div className="mb-5 pb-5 border-b border-border-subtle">
          <div className="flex items-center gap-2 mb-1">
            <Search size={16} className="text-accent-primary" />
            <h4 className="text-text-primary font-medium text-sm">{t('set.symbolBrowser')}</h4>
          </div>
          <p className="text-text-muted text-xs mb-4">{t('set.symbolBrowserDesc')}</p>

          {mt5Symbols.length === 0 ? (
            <div className="bg-bg-tertiary rounded-lg p-6 text-center">
              <p className="text-text-muted text-sm">{t('set.noMt5Symbols')}</p>
            </div>
          ) : (
            <>
              {/* Search + filter */}
              <div className="flex flex-wrap gap-3 mb-3">
                <div className="relative flex-1 min-w-[200px]">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                  <input
                    type="text"
                    value={symbolSearch}
                    onChange={(e) => setSymbolSearch(e.target.value)}
                    placeholder={t('set.searchSymbols')}
                    className="w-full bg-bg-tertiary border border-border rounded-lg pl-9 pr-3 py-2 text-text-primary text-sm focus:outline-none focus:border-accent-primary"
                  />
                </div>
                <select
                  value={symbolCatFilter}
                  onChange={(e) => setSymbolCatFilter(e.target.value)}
                  className="bg-bg-tertiary border border-border rounded-lg px-3 py-2 text-text-primary text-sm focus:outline-none focus:border-accent-primary"
                >
                  <option value="all">{t('set.allCategories')}</option>
                  {categories.map((c) => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
                <span className="text-text-muted text-xs self-center whitespace-nowrap">
                  {filteredMt5Symbols.length} / {mt5Symbols.length} {t('set.symbolCount')}
                </span>
              </div>

              {/* Symbol grid */}
              <div className="max-h-72 overflow-y-auto rounded-lg border border-border-subtle divide-y divide-border-subtle">
                {filteredMt5Symbols.map((sym) => {
                  const isAdded = configuredSymbolNames.has(sym.symbol.toUpperCase());
                  return (
                    <div key={sym.symbol} className="flex items-center justify-between px-3 py-2 hover:bg-bg-hover transition-colors">
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="font-mono text-sm font-medium text-text-primary whitespace-nowrap">{sym.symbol}</span>
                        <Badge variant={CATEGORY_COLORS[sym.category] ?? 'neutral'}>{t(`set.${sym.category}`)}</Badge>
                        {sym.visible && (
                          <span className="text-success-text text-xs whitespace-nowrap">{t('set.mwVisible')}</span>
                        )}
                        {sym.description && (
                          <span className="text-text-muted text-xs truncate hidden sm:inline">{sym.description}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 flex-shrink-0">
                        {sym.bid != null && (
                          <span className="text-text-muted text-xs font-mono hidden md:inline">
                            {t('set.bid')} {sym.bid}
                          </span>
                        )}
                        {isAdded ? (
                          <Badge variant="success">
                            <Check size={12} className="inline mr-1" />
                            {t('set.alreadyAdded')}
                          </Badge>
                        ) : (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => addSymbol(sym.symbol, sym.category as SymbolCategory)}
                          >
                            <Plus size={14} className="mr-1" />
                            {t('set.addToConfig')}
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* Symbol list */}
        <div className="space-y-3">
          {symbols.map((sym) => (
            <div key={sym.id} className="bg-bg-tertiary rounded-lg p-4">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-3">
                  <Toggle checked={sym.enabled} onChange={() => toggleSymbolEnabled(sym)} />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-semibold text-text-primary">{sym.symbol}</span>
                      <Badge variant="neutral">{t(`set.${sym.category}`)}</Badge>
                      <Badge variant={sym.sl_tp_mode === 'dynamic' ? 'info' : 'neutral'}>
                        {t(`hist.${sym.sl_tp_mode}`)} SL/TP
                      </Badge>
                    </div>
                    <div className="text-text-muted text-xs mt-0.5">
                      {sym.timeframe} ·
                      {sym.sl_tp_mode === 'fixed'
                        ? ` SL ${sym.fixed_sl_percent}% / TP ${sym.fixed_tp_percent}%`
                        : ` SL ${sym.dynamic_sl_mult}x ATR / TP ${sym.dynamic_tp_mult}x ATR`}
                      {sym.use_trailing_stop && ` · Trailing ${sym.trailing_stop_points}pts`}
                    </div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setEditingSymbol(sym)}>{t('set.edit')}</Button>
                  <Button variant="ghost" size="sm" onClick={() => deleteSymbol(sym.id)}>
                    <Trash2 size={14} className="text-danger-text" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Edit Symbol Modal */}
      {editingSymbol && (
        <Modal onClose={() => setEditingSymbol(null)} className="max-w-lg">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-text-primary font-semibold text-lg">
                {t('set.editSymbol')} {editingSymbol.symbol}
              </h3>
              <button onClick={() => setEditingSymbol(null)} className="text-text-muted hover:text-text-primary">✕</button>
            </div>

            <div className="space-y-4">
              <Field label={t('set.category')}>
                <select
                  value={editingSymbol.category}
                  onChange={(e) => setEditingSymbol({ ...editingSymbol, category: e.target.value as SymbolCategory })}
                  className="w-full bg-bg-tertiary border border-border rounded-lg px-3 py-2 text-text-primary focus:outline-none focus:border-accent-primary"
                >
                  {categories.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </Field>

              <Field label={t('set.timeframe')}>
                <select
                  value={editingSymbol.timeframe}
                  onChange={(e) => setEditingSymbol({ ...editingSymbol, timeframe: e.target.value })}
                  className="w-full bg-bg-tertiary border border-border rounded-lg px-3 py-2 text-text-primary focus:outline-none focus:border-accent-primary"
                >
                  {TIMEFRAMES.map((tf) => <option key={tf} value={tf}>{tf}</option>)}
                </select>
              </Field>

              <Field label={t('set.slTpMode')}>
                <div className="flex gap-2">
                  <ModeButton
                    active={editingSymbol.sl_tp_mode === 'fixed'}
                    onClick={() => setEditingSymbol({ ...editingSymbol, sl_tp_mode: 'fixed' })}
                    label={t('set.fixedPct')}
                  />
                  <ModeButton
                    active={editingSymbol.sl_tp_mode === 'dynamic'}
                    onClick={() => setEditingSymbol({ ...editingSymbol, sl_tp_mode: 'dynamic' })}
                    label={t('set.dynamicAtr')}
                  />
                </div>
              </Field>

              {editingSymbol.sl_tp_mode === 'fixed' ? (
                <div className="grid grid-cols-2 gap-4">
                  <Field label={t('set.stopLossPct')}>
                    <input
                      type="number" min="0.1" step="0.1"
                      value={editingSymbol.fixed_sl_percent}
                      onChange={(e) => setEditingSymbol({ ...editingSymbol, fixed_sl_percent: safeFloat(e.target.value) })}
                      className="w-full bg-bg-tertiary border border-border rounded-lg px-3 py-2 text-text-primary font-mono focus:outline-none focus:border-accent-primary"
                    />
                  </Field>
                  <Field label={t('set.takeProfitPct')}>
                    <input
                      type="number" min="0.1" step="0.1"
                      value={editingSymbol.fixed_tp_percent}
                      onChange={(e) => setEditingSymbol({ ...editingSymbol, fixed_tp_percent: safeFloat(e.target.value) })}
                      className="w-full bg-bg-tertiary border border-border rounded-lg px-3 py-2 text-text-primary font-mono focus:outline-none focus:border-accent-primary"
                    />
                  </Field>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-4">
                  <Field label={t('set.slAtrMult')}>
                    <input
                      type="number" min="0.1" step="0.1"
                      value={editingSymbol.dynamic_sl_mult}
                      onChange={(e) => setEditingSymbol({ ...editingSymbol, dynamic_sl_mult: safeFloat(e.target.value) })}
                      className="w-full bg-bg-tertiary border border-border rounded-lg px-3 py-2 text-text-primary font-mono focus:outline-none focus:border-accent-primary"
                    />
                  </Field>
                  <Field label={t('set.tpAtrMult')}>
                    <input
                      type="number" min="0.1" step="0.1"
                      value={editingSymbol.dynamic_tp_mult}
                      onChange={(e) => setEditingSymbol({ ...editingSymbol, dynamic_tp_mult: safeFloat(e.target.value) })}
                      className="w-full bg-bg-tertiary border border-border rounded-lg px-3 py-2 text-text-primary font-mono focus:outline-none focus:border-accent-primary"
                    />
                  </Field>
                </div>
              )}

              <Field label={t('lim.orderType')}>
                <div className="flex gap-2">
                  <ModeButton
                    active={editingSymbol.order_type === 'market'}
                    onClick={() => setEditingSymbol({ ...editingSymbol, order_type: 'market' })}
                    label={t('lim.market')}
                  />
                  <ModeButton
                    active={editingSymbol.order_type === 'limit'}
                    onClick={() => setEditingSymbol({ ...editingSymbol, order_type: 'limit' })}
                    label={t('lim.limit')}
                  />
                  <ModeButton
                    active={editingSymbol.order_type === 'both'}
                    onClick={() => setEditingSymbol({ ...editingSymbol, order_type: 'both' })}
                    label={t('lim.both')}
                  />
                </div>
              </Field>

              {editingSymbol.order_type !== 'market' && (
                <div className="grid grid-cols-2 gap-4">
                  <Field label={t('lim.limitDistanceMult')}>
                    <input
                      type="number" min="0.1" step="0.1"
                      value={editingSymbol.limit_order_distance_mult}
                      onChange={(e) => setEditingSymbol({ ...editingSymbol, limit_order_distance_mult: safeFloat(e.target.value) })}
                      className="w-full bg-bg-tertiary border border-border rounded-lg px-3 py-2 text-text-primary font-mono focus:outline-none focus:border-accent-primary"
                    />
                  </Field>
                  <Field label={t('lim.limitExpiry')}>
                    <input
                      type="number" min="1" step="1"
                      value={editingSymbol.limit_order_expiry_hours}
                      onChange={(e) => setEditingSymbol({ ...editingSymbol, limit_order_expiry_hours: safeInt(e.target.value) })}
                      className="w-full bg-bg-tertiary border border-border rounded-lg px-3 py-2 text-text-primary font-mono focus:outline-none focus:border-accent-primary"
                    />
                  </Field>
                </div>
              )}

              <Field label={t('strat.assignMode')}>
                <div className="flex gap-2">
                  <ModeButton
                    active={editingSymbol.strategy_mode === 'ai'}
                    onClick={() => setEditingSymbol({ ...editingSymbol, strategy_mode: 'ai' })}
                    label={t('strat.modeAi')}
                  />
                  <ModeButton
                    active={editingSymbol.strategy_mode === 'strategy'}
                    onClick={() => setEditingSymbol({ ...editingSymbol, strategy_mode: 'strategy' })}
                    label={t('strat.modeStrategy')}
                  />
                  <ModeButton
                    active={editingSymbol.strategy_mode === 'both'}
                    onClick={() => setEditingSymbol({ ...editingSymbol, strategy_mode: 'both' })}
                    label={t('strat.modeBoth')}
                  />
                </div>
              </Field>

              <Field label={t('strat.assignStrategy')}>
                <select
                  value={editingSymbol.strategy_id ?? ''}
                  onChange={(e) => setEditingSymbol({ ...editingSymbol, strategy_id: e.target.value || null })}
                  className="w-full bg-bg-tertiary border border-border rounded-lg px-3 py-2 text-text-primary focus:outline-none focus:border-accent-primary"
                >
                  <option value="">{t('strat.noStrategyOption')}</option>
                  {strategies.filter((s) => s.is_active).map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
                <p className="text-text-muted text-xs mt-1">{t('strat.assignHint')}</p>
              </Field>

              <div className="flex items-center justify-between pt-3 border-t border-border-subtle">
                <Toggle
                  checked={editingSymbol.use_trailing_stop}
                  onChange={(checked) => setEditingSymbol({ ...editingSymbol, use_trailing_stop: checked })}
                  label={t('set.useTrailingStop')}
                />
                {editingSymbol.use_trailing_stop && (
                  <input
                    type="number" min="0"
                    value={editingSymbol.trailing_stop_points}
                    onChange={(e) => setEditingSymbol({ ...editingSymbol, trailing_stop_points: safeInt(e.target.value) })}
                    className="w-32 bg-bg-tertiary border border-border rounded-lg px-3 py-2 text-text-primary font-mono focus:outline-none focus:border-accent-primary"
                    placeholder="Points"
                  />
                )}
              </div>
            </div>

            <div className="flex gap-3 justify-end mt-6">
              <Button variant="ghost" onClick={() => setEditingSymbol(null)}>{t('set.cancel')}</Button>
              <Button onClick={saveSymbol} disabled={savingSymbol}>
                <Save size={16} className="mr-2" /> {savingSymbol ? t('set.saving') : t('set.saveChanges')}
              </Button>
            </div>
        </Modal>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-text-secondary text-sm font-medium block mb-1.5">{label}</label>
      {children}
    </div>
  );
}

function ModeButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
        active
          ? 'bg-accent-primary text-white'
          : 'bg-bg-tertiary text-text-secondary border border-border hover:bg-bg-hover'
      }`}
    >
      {label}
    </button>
  );
}

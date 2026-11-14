export interface BotSettings {
  id: number;
  is_running: boolean;
  auto_mode: boolean;
  max_risk_percent: number;
  max_concurrent_positions: number;
  last_heartbeat: string | null;
  mt5_connected: boolean;
  account_balance: number | null;
  account_equity: number | null;
  account_currency: string;
  daily_loss_limit_percent: number;
  max_drawdown_percent: number;
  max_total_risk_percent: number;
  risk_per_trade_mode: 'percent' | 'fixed';
  fixed_risk_amount: number;
  account_mode: 'demo' | 'live';
  mt5_account_type: 'demo' | 'real' | 'contest' | null;
  enable_limit_orders: boolean;
  limit_order_offset_points: number;
  daily_loss_reset_hour: number;
  trading_paused: boolean;
  peak_equity: number | null;
  day_start_equity: number | null;
  day_start_key: string | null;
  updated_at: string;
}

export type SymbolCategory = 'forex' | 'metals' | 'indices' | 'crypto' | 'energy' | 'stocks';
export type SLTPMode = 'fixed' | 'dynamic';
export type OrderTypeMode = 'market' | 'limit' | 'both';
export type ProfitTargetMode = 'points' | 'percent';

export interface Mt5Symbol {
  symbol: string;
  description: string;
  category: string;
  digits: number;
  volume_min: number;
  volume_step: number;
  visible: boolean;
  bid: number | null;
  ask: number | null;
  updated_at: string;
}

export interface SymbolConfig {
  id: string;
  symbol: string;
  category: SymbolCategory;
  enabled: boolean;
  timeframe: string;
  sl_tp_mode: SLTPMode;
  fixed_sl_percent: number;
  fixed_tp_percent: number;
  dynamic_sl_mult: number;
  dynamic_tp_mult: number;
  use_trailing_stop: boolean;
  trailing_stop_points: number;
  order_type: OrderTypeMode;
  limit_order_distance_mult: number;
  limit_order_expiry_hours: number;
  profit_target_mode: ProfitTargetMode;
  break_even_enabled: boolean;
  break_even_trigger: number;
  partial_close_enabled: boolean;
  partial_stage1_trigger: number;
  partial_stage1_close_percent: number;
  partial_stage2_enabled: boolean;
  partial_stage2_trigger: number;
  partial_stage2_close_percent: number;
  strategy_id: string | null;
  strategy_mode: StrategyMode;
  created_at: string;
  updated_at: string;
}

export type PositionType = 'buy' | 'sell';
export type CloseReason = 'tp_hit' | 'sl_hit' | 'model_signal' | 'manual' | 'error' | 'partial_close';

export interface OpenPosition {
  id: string;
  mt5_ticket: number;
  symbol: string;
  position_type: PositionType;
  volume: number;
  open_price: number;
  current_price: number | null;
  stop_loss: number | null;
  take_profit: number | null;
  sl_tp_mode: SLTPMode;
  order_type: string;
  profit: number | null;
  swap: number | null;
  open_time: string;
  updated_at: string;
}

export type PendingOrderType = 'buy_limit' | 'sell_limit' | 'buy_stop' | 'sell_stop';
export type PendingOrderStatus = 'pending' | 'filled' | 'cancelled' | 'expired';

export interface PendingOrder {
  id: string;
  mt5_order_ticket: number | null;
  symbol: string;
  order_type: PendingOrderType;
  volume: number;
  entry_price: number;
  stop_loss: number | null;
  take_profit: number | null;
  sl_tp_mode: SLTPMode;
  status: PendingOrderStatus;
  expires_at: string;
  created_at: string;
  updated_at: string;
  filled_position_ticket: number | null;
}

export interface TradeHistory {
  id: string;
  mt5_ticket: number;
  symbol: string;
  position_type: PositionType;
  volume: number;
  open_price: number;
  close_price: number;
  stop_loss: number | null;
  take_profit: number | null;
  sl_tp_mode: SLTPMode;
  profit: number;
  close_reason: CloseReason;
  open_time: string;
  close_time: string;
  order_type: string;
  risk_amount: number | null;
  feat_trend: number | null;
  feat_volatility: number | null;
  feat_rsi: number | null;
  feat_atr: number | null;
  feat_macd: number | null;
  feat_ema_fast: number | null;
  feat_ema_slow: number | null;
  feat_time_hour: number | null;
  feat_day_of_week: number | null;
  prediction_confidence: number | null;
  created_at: string;
}

export type PredictionDirection = 'up' | 'down' | 'neutral';

export interface Prediction {
  id: string;
  symbol: string;
  timeframe: string;
  direction: PredictionDirection;
  confidence: number;
  predicted_price: number | null;
  current_price: number | null;
  model_version: string | null;
  features_snapshot: Record<string, unknown> | null;
  created_at: string;
}

export interface LearningReport {
  id: string;
  model_version: string;
  training_samples: number;
  accuracy: number;
  precision: number | null;
  recall: number | null;
  win_rate: number | null;
  backtest_profit: number | null;
  backtest_trades: number | null;
  backtest_win_rate: number | null;
  notes: string | null;
  created_at: string;
}

export type LogLevel = 'info' | 'warning' | 'error';

export interface BotLog {
  id: string;
  level: LogLevel;
  message: string;
  symbol: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
}

export interface AiPredictionSettings {
  id: number;
  min_confidence_threshold: number;
  neutral_threshold: number;
  min_trades_for_model: number;
  retraining_interval_trades: number;
  gb_n_estimators: number;
  gb_max_depth: number;
  gb_learning_rate: number;
  gb_subsample: number;
  rule_rsi_oversold: number;
  rule_rsi_overbought: number;
  rule_trend_threshold: number;
  rule_macd_weight: number;
  predicted_price_atr_mult: number;
  updated_at: string;
}

export type AiTunableKey = Exclude<keyof AiPredictionSettings, 'id' | 'updated_at'>;

export interface AiPredictionSettingsSnapshot {
  id: string;
  snapshot: AiPredictionSettings;
  changed_at: string;
}

export interface MarketData {
  id: string;
  symbol: string;
  timeframe: string;
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  rsi: number | null;
  atr: number | null;
  macd: number | null;
  ema_fast: number | null;
  ema_slow: number | null;
  trend: number | null;
  volatility: number | null;
}

export type StrategyMode = 'ai' | 'strategy' | 'both';
export type SignalDirection = 'buy' | 'sell' | 'neutral';

export interface Strategy {
  id: string;
  name: string;
  description: string;
  code: string;
  is_active: boolean;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface StrategySignal {
  id: string;
  strategy_id: string;
  symbol: string;
  direction: SignalDirection;
  confidence: number;
  reason: string;
  created_at: string;
}

export interface BacktestTrade {
  type: PositionType;
  entry: number;
  close: number;
  sl: number;
  tp: number;
  volume: number;
  pnl: number;
  reason: string;
  open_time: string;
  close_time: string;
}

export interface BacktestResult {
  id: string;
  strategy_id: string;
  symbol: string;
  timeframe: string;
  from_date: string | null;
  to_date: string | null;
  requested_from_date: string | null;
  requested_to_date: string | null;
  expected_candles: number | null;
  received_candles: number | null;
  initial_capital: number;
  net_profit: number;
  total_trades: number;
  wins: number;
  losses: number;
  win_rate: number;
  max_drawdown: number;
  profit_factor: number;
  equity_curve: Array<{ index: number; equity: number }>;
  trades_detail: BacktestTrade[];
  status: 'completed' | 'failed' | 'running';
  error_message: string | null;
  created_at: string;
  avg_win?: number;
  avg_loss?: number;
  expectancy?: number;
  max_consecutive_wins?: number;
  max_consecutive_losses?: number;
  sharpe_ratio?: number;
  sortino_ratio?: number;
  total_commission?: number;
}

export interface ParamChange {
  name: string;
  before: number;
  after: number;
}

export interface StrategyOptimization {
  id: string;
  strategy_id: string;
  symbol: string;
  timeframe: string;
  from_date: string | null;
  to_date: string | null;
  reference_backtest_id: string | null;
  before_net_profit: number;
  before_win_rate: number;
  before_profit_factor: number;
  before_max_drawdown: number;
  before_sharpe_ratio: number;
  before_total_trades: number;
  after_net_profit: number;
  after_win_rate: number;
  after_profit_factor: number;
  after_max_drawdown: number;
  after_sharpe_ratio: number;
  after_total_trades: number;
  param_changes: ParamChange[];
  combinations_tried: number;
  best_score: number;
  optimized_code: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

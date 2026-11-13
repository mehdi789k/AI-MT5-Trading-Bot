/*
# Automated MT5 Trading Bot — Core Schema

## Overview
Creates the complete database schema for an automated MetaTrader 5 trading bot
with a self-learning AI prediction model. The database serves as the communication
bridge between the local Python trading engine (running on the user's Windows
machine alongside MT5) and the web-based management dashboard built in Bolt.

Single-user app (the bot owner). No sign-in screen — all policies target
`anon, authenticated` with `USING (true)` because data is intentionally shared.

## New Tables
1. `bot_settings` — global bot configuration (singleton, id=1)
2. `symbol_config` — per-symbol trading configuration
3. `open_positions` — currently open MT5 positions with live P/L
4. `trade_history` — closed trades with outcomes and ML training features
5. `market_data` — OHLCV + indicator features per symbol/timeframe
6. `predictions` — AI model price-direction predictions
7. `learning_reports` — model accuracy, sample count, backtest results
8. `bot_logs` — engine event logs

## Security
- RLS enabled on all tables; grants to anon, authenticated; policies USING(true).
*/

-- 1. bot_settings (singleton)
CREATE TABLE IF NOT EXISTS bot_settings (
  id integer PRIMARY KEY DEFAULT 1,
  is_running boolean NOT NULL DEFAULT false,
  auto_mode boolean NOT NULL DEFAULT true,
  max_risk_percent numeric(5,2) NOT NULL DEFAULT 1.00,
  max_concurrent_positions integer NOT NULL DEFAULT 5,
  last_heartbeat timestamptz,
  mt5_connected boolean NOT NULL DEFAULT false,
  account_balance numeric(12,2),
  account_equity numeric(12,2),
  account_currency text DEFAULT 'USD',
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT bot_settings_single_row CHECK (id = 1)
);
ALTER TABLE bot_settings ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON bot_settings TO anon, authenticated;
DROP POLICY IF EXISTS "anon_select_bot_settings" ON bot_settings;
CREATE POLICY "anon_select_bot_settings" ON bot_settings FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_bot_settings" ON bot_settings;
CREATE POLICY "anon_insert_bot_settings" ON bot_settings FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_bot_settings" ON bot_settings;
CREATE POLICY "anon_update_bot_settings" ON bot_settings FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_bot_settings" ON bot_settings;
CREATE POLICY "anon_delete_bot_settings" ON bot_settings FOR DELETE TO anon, authenticated USING (true);
INSERT INTO bot_settings (id, is_running) VALUES (1, false) ON CONFLICT (id) DO NOTHING;

-- 2. symbol_config
CREATE TABLE IF NOT EXISTS symbol_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol text NOT NULL UNIQUE,
  category text NOT NULL DEFAULT 'forex',
  enabled boolean NOT NULL DEFAULT true,
  timeframe text NOT NULL DEFAULT 'M15',
  sl_tp_mode text NOT NULL DEFAULT 'fixed',
  fixed_sl_percent numeric(5,2) NOT NULL DEFAULT 1.00,
  fixed_tp_percent numeric(5,2) NOT NULL DEFAULT 2.00,
  dynamic_sl_mult numeric(5,2) NOT NULL DEFAULT 1.50,
  dynamic_tp_mult numeric(5,2) NOT NULL DEFAULT 3.00,
  use_trailing_stop boolean NOT NULL DEFAULT false,
  trailing_stop_points integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT symbol_config_category_ck CHECK (category IN ('forex','metals','indices','crypto')),
  CONSTRAINT symbol_config_mode_ck CHECK (sl_tp_mode IN ('fixed','dynamic'))
);
ALTER TABLE symbol_config ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON symbol_config TO anon, authenticated;
DROP POLICY IF EXISTS "anon_select_symbol_config" ON symbol_config;
CREATE POLICY "anon_select_symbol_config" ON symbol_config FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_symbol_config" ON symbol_config;
CREATE POLICY "anon_insert_symbol_config" ON symbol_config FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_symbol_config" ON symbol_config;
CREATE POLICY "anon_update_symbol_config" ON symbol_config FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_symbol_config" ON symbol_config;
CREATE POLICY "anon_delete_symbol_config" ON symbol_config FOR DELETE TO anon, authenticated USING (true);
INSERT INTO symbol_config (symbol, category, enabled, timeframe, sl_tp_mode) VALUES
  ('EURUSD','forex',true,'M15','fixed'),
  ('GBPUSD','forex',true,'M15','fixed'),
  ('USDJPY','forex',true,'M15','fixed'),
  ('XAUUSD','metals',true,'M15','dynamic'),
  ('US30','indices',true,'M15','dynamic'),
  ('BTCUSD','crypto',true,'M15','dynamic')
ON CONFLICT (symbol) DO NOTHING;

-- 3. open_positions
CREATE TABLE IF NOT EXISTS open_positions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mt5_ticket bigint NOT NULL UNIQUE,
  symbol text NOT NULL,
  position_type text NOT NULL,
  volume numeric(10,2) NOT NULL,
  open_price numeric(12,5) NOT NULL,
  current_price numeric(12,5),
  stop_loss numeric(12,5),
  take_profit numeric(12,5),
  sl_tp_mode text NOT NULL DEFAULT 'fixed',
  profit numeric(12,2) DEFAULT 0,
  swap numeric(12,2) DEFAULT 0,
  open_time timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT op_type_ck CHECK (position_type IN ('buy','sell')),
  CONSTRAINT op_mode_ck CHECK (sl_tp_mode IN ('fixed','dynamic'))
);
ALTER TABLE open_positions ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON open_positions TO anon, authenticated;
DROP POLICY IF EXISTS "anon_select_open_positions" ON open_positions;
CREATE POLICY "anon_select_open_positions" ON open_positions FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_open_positions" ON open_positions;
CREATE POLICY "anon_insert_open_positions" ON open_positions FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_open_positions" ON open_positions;
CREATE POLICY "anon_update_open_positions" ON open_positions FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_open_positions" ON open_positions;
CREATE POLICY "anon_delete_open_positions" ON open_positions FOR DELETE TO anon, authenticated USING (true);
CREATE INDEX IF NOT EXISTS idx_open_positions_symbol ON open_positions(symbol);

-- 4. trade_history
CREATE TABLE IF NOT EXISTS trade_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mt5_ticket bigint NOT NULL UNIQUE,
  symbol text NOT NULL,
  position_type text NOT NULL,
  volume numeric(10,2) NOT NULL,
  open_price numeric(12,5) NOT NULL,
  close_price numeric(12,5) NOT NULL,
  stop_loss numeric(12,5),
  take_profit numeric(12,5),
  sl_tp_mode text NOT NULL DEFAULT 'fixed',
  profit numeric(12,2) NOT NULL DEFAULT 0,
  close_reason text NOT NULL DEFAULT 'manual',
  open_time timestamptz NOT NULL,
  close_time timestamptz NOT NULL DEFAULT now(),
  feat_trend numeric(8,4),
  feat_volatility numeric(8,4),
  feat_rsi numeric(8,4),
  feat_atr numeric(12,5),
  feat_macd numeric(12,5),
  feat_ema_fast numeric(12,5),
  feat_ema_slow numeric(12,5),
  feat_time_hour integer,
  feat_day_of_week integer,
  prediction_confidence numeric(5,2),
  created_at timestamptz DEFAULT now(),
  CONSTRAINT th_type_ck CHECK (position_type IN ('buy','sell')),
  CONSTRAINT th_reason_ck CHECK (close_reason IN ('tp_hit','sl_hit','model_signal','manual','error'))
);
ALTER TABLE trade_history ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON trade_history TO anon, authenticated;
DROP POLICY IF EXISTS "anon_select_trade_history" ON trade_history;
CREATE POLICY "anon_select_trade_history" ON trade_history FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_trade_history" ON trade_history;
CREATE POLICY "anon_insert_trade_history" ON trade_history FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_trade_history" ON trade_history;
CREATE POLICY "anon_update_trade_history" ON trade_history FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_trade_history" ON trade_history;
CREATE POLICY "anon_delete_trade_history" ON trade_history FOR DELETE TO anon, authenticated USING (true);
CREATE INDEX IF NOT EXISTS idx_trade_history_symbol ON trade_history(symbol);
CREATE INDEX IF NOT EXISTS idx_trade_history_close_time ON trade_history(close_time DESC);

-- 5. market_data
CREATE TABLE IF NOT EXISTS market_data (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol text NOT NULL,
  timeframe text NOT NULL,
  time timestamptz NOT NULL,
  open numeric(12,5) NOT NULL,
  high numeric(12,5) NOT NULL,
  low numeric(12,5) NOT NULL,
  close numeric(12,5) NOT NULL,
  volume bigint NOT NULL DEFAULT 0,
  rsi numeric(8,4),
  atr numeric(12,5),
  macd numeric(12,5),
  ema_fast numeric(12,5),
  ema_slow numeric(12,5),
  trend numeric(8,4),
  volatility numeric(8,4),
  created_at timestamptz DEFAULT now(),
  UNIQUE(symbol, timeframe, time)
);
ALTER TABLE market_data ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON market_data TO anon, authenticated;
DROP POLICY IF EXISTS "anon_select_market_data" ON market_data;
CREATE POLICY "anon_select_market_data" ON market_data FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_market_data" ON market_data;
CREATE POLICY "anon_insert_market_data" ON market_data FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_market_data" ON market_data;
CREATE POLICY "anon_update_market_data" ON market_data FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_market_data" ON market_data;
CREATE POLICY "anon_delete_market_data" ON market_data FOR DELETE TO anon, authenticated USING (true);
CREATE INDEX IF NOT EXISTS idx_market_data_symbol_tf_time ON market_data(symbol, timeframe, time DESC);

-- 6. predictions
CREATE TABLE IF NOT EXISTS predictions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol text NOT NULL,
  timeframe text NOT NULL,
  direction text NOT NULL,
  confidence numeric(5,2) NOT NULL,
  predicted_price numeric(12,5),
  current_price numeric(12,5),
  model_version text,
  features_snapshot jsonb,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT pred_dir_ck CHECK (direction IN ('up','down','neutral'))
);
ALTER TABLE predictions ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON predictions TO anon, authenticated;
DROP POLICY IF EXISTS "anon_select_predictions" ON predictions;
CREATE POLICY "anon_select_predictions" ON predictions FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_predictions" ON predictions;
CREATE POLICY "anon_insert_predictions" ON predictions FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_predictions" ON predictions;
CREATE POLICY "anon_update_predictions" ON predictions FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_predictions" ON predictions;
CREATE POLICY "anon_delete_predictions" ON predictions FOR DELETE TO anon, authenticated USING (true);
CREATE INDEX IF NOT EXISTS idx_predictions_symbol_created ON predictions(symbol, created_at DESC);

-- 7. learning_reports
CREATE TABLE IF NOT EXISTS learning_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  model_version text NOT NULL,
  training_samples integer NOT NULL DEFAULT 0,
  accuracy numeric(5,2) NOT NULL DEFAULT 0,
  precision numeric(5,2) DEFAULT 0,
  recall numeric(5,2) DEFAULT 0,
  win_rate numeric(5,2) DEFAULT 0,
  backtest_profit numeric(12,2) DEFAULT 0,
  backtest_trades integer DEFAULT 0,
  backtest_win_rate numeric(5,2) DEFAULT 0,
  notes text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE learning_reports ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON learning_reports TO anon, authenticated;
DROP POLICY IF EXISTS "anon_select_learning_reports" ON learning_reports;
CREATE POLICY "anon_select_learning_reports" ON learning_reports FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_learning_reports" ON learning_reports;
CREATE POLICY "anon_insert_learning_reports" ON learning_reports FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_learning_reports" ON learning_reports;
CREATE POLICY "anon_update_learning_reports" ON learning_reports FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_learning_reports" ON learning_reports;
CREATE POLICY "anon_delete_learning_reports" ON learning_reports FOR DELETE TO anon, authenticated USING (true);
CREATE INDEX IF NOT EXISTS idx_learning_reports_created ON learning_reports(created_at DESC);

-- 8. bot_logs
CREATE TABLE IF NOT EXISTS bot_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  level text NOT NULL DEFAULT 'info',
  message text NOT NULL,
  symbol text,
  details jsonb,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT bot_logs_level_ck CHECK (level IN ('info','warning','error'))
);
ALTER TABLE bot_logs ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON bot_logs TO anon, authenticated;
DROP POLICY IF EXISTS "anon_select_bot_logs" ON bot_logs;
CREATE POLICY "anon_select_bot_logs" ON bot_logs FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_bot_logs" ON bot_logs;
CREATE POLICY "anon_insert_bot_logs" ON bot_logs FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_bot_logs" ON bot_logs;
CREATE POLICY "anon_update_bot_logs" ON bot_logs FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_bot_logs" ON bot_logs;
CREATE POLICY "anon_delete_bot_logs" ON bot_logs FOR DELETE TO anon, authenticated USING (true);
CREATE INDEX IF NOT EXISTS idx_bot_logs_created ON bot_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bot_logs_level ON bot_logs(level);

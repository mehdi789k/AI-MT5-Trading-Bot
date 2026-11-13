/*
# Capital Management & Limit/Pending Orders

## Summary

Extends the trading bot schema with advanced capital/risk management fields
and support for limit (pending) orders alongside existing market orders.

## Changes

### 1. bot_settings — new capital management columns

- `daily_loss_limit_percent` (numeric, default 5): Maximum daily loss as
  percentage of starting day equity. When hit, the bot stops opening new
  trades for the rest of the day.
- `max_drawdown_percent` (numeric, default 10): Maximum drawdown from peak
  equity. When hit, bot pauses trading.
- `max_total_risk_percent` (numeric, default 20): Maximum sum of risk across
  all open positions as percentage of equity. Prevents over-exposure.
- `risk_per_trade_mode` (text, default 'percent'): How per-trade risk is
  calculated — 'percent' (X% of balance) or 'fixed' (fixed dollar amount).
- `fixed_risk_amount` (numeric, default 0): When mode is 'fixed', the dollar
  amount risked per trade.
- `enable_limit_orders` (boolean, default false): Whether the bot should use
  limit/pending orders when a predicted entry price differs from current price.
- `limit_order_offset_points` (integer, default 0): Minimum distance in points
  from current price to use a limit order instead of market.
- `daily_loss_reset_hour` (integer, default 0): UTC hour (0-23) at which the
  daily loss counter resets.
- `trading_paused` (boolean, default false): Set automatically by the engine
  when a safety limit is hit. Cleared on user action or reset time.

### 2. symbol_config — new limit order columns

- `order_type` (text, default 'market'): 'market' or 'limit'. When 'limit',
  the bot places a pending limit order at the predicted price instead of
  entering immediately at market.
- `limit_order_distance_mult` (numeric, default 1.0): Multiplier for ATR to
  determine how far from current price to place the limit order.
- `limit_order_expiry_hours` (integer, default 24): Hours after which an
  unfilled limit order is automatically cancelled.

### 3. pending_orders — new table

Tracks limit/pending orders placed by the bot that have not yet filled.

- `id` (uuid PK)
- `mt5_order_ticket` (bigint, unique): MT5 order ticket
- `symbol` (text)
- `order_type` (text): 'buy_limit', 'sell_limit', 'buy_stop', 'sell_stop'
- `volume` (numeric)
- `entry_price` (numeric): requested limit/stop price
- `stop_loss` (numeric, nullable)
- `take_profit` (numeric, nullable)
- `sl_tp_mode` (text)
- `status` (text, default 'pending'): 'pending', 'filled', 'cancelled', 'expired'
- `expires_at` (timestamptz): when to auto-cancel if unfilled
- `created_at` (timestamptz)
- `updated_at` (timestamptz)
- `filled_position_ticket` (bigint, nullable): MT5 position ticket after fill

### 4. open_positions — new column

- `order_type` (text, default 'market'): How the position was opened —
  'market' or 'limit'.

### 5. trade_history — new columns

- `order_type` (text, default 'market'): How the position was opened.
- `risk_amount` (numeric, nullable): Dollar amount risked on this trade.

### Security

- RLS enabled on pending_orders, CRUD granted to anon + authenticated
  (single-tenant, no auth).
- New columns on existing tables are covered by existing grants/policies.
*/

-- 1. bot_settings: add capital management columns
ALTER TABLE bot_settings
  ADD COLUMN IF NOT EXISTS daily_loss_limit_percent numeric NOT NULL DEFAULT 5;
ALTER TABLE bot_settings
  ADD COLUMN IF NOT EXISTS max_drawdown_percent numeric NOT NULL DEFAULT 10;
ALTER TABLE bot_settings
  ADD COLUMN IF NOT EXISTS max_total_risk_percent numeric NOT NULL DEFAULT 20;
ALTER TABLE bot_settings
  ADD COLUMN IF NOT EXISTS risk_per_trade_mode text NOT NULL DEFAULT 'percent'
  CHECK (risk_per_trade_mode IN ('percent', 'fixed'));
ALTER TABLE bot_settings
  ADD COLUMN IF NOT EXISTS fixed_risk_amount numeric NOT NULL DEFAULT 0;
ALTER TABLE bot_settings
  ADD COLUMN IF NOT EXISTS enable_limit_orders boolean NOT NULL DEFAULT false;
ALTER TABLE bot_settings
  ADD COLUMN IF NOT EXISTS limit_order_offset_points integer NOT NULL DEFAULT 0;
ALTER TABLE bot_settings
  ADD COLUMN IF NOT EXISTS daily_loss_reset_hour integer NOT NULL DEFAULT 0
  CHECK (daily_loss_reset_hour >= 0 AND daily_loss_reset_hour <= 23);
ALTER TABLE bot_settings
  ADD COLUMN IF NOT EXISTS trading_paused boolean NOT NULL DEFAULT false;

-- 2. symbol_config: add limit order columns
ALTER TABLE symbol_config
  ADD COLUMN IF NOT EXISTS order_type text NOT NULL DEFAULT 'market'
  CHECK (order_type IN ('market', 'limit'));
ALTER TABLE symbol_config
  ADD COLUMN IF NOT EXISTS limit_order_distance_mult numeric NOT NULL DEFAULT 1.0;
ALTER TABLE symbol_config
  ADD COLUMN IF NOT EXISTS limit_order_expiry_hours integer NOT NULL DEFAULT 24;

-- 3. pending_orders table
CREATE TABLE IF NOT EXISTS pending_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mt5_order_ticket bigint UNIQUE,
  symbol text NOT NULL,
  order_type text NOT NULL CHECK (order_type IN ('buy_limit', 'sell_limit', 'buy_stop', 'sell_stop')),
  volume numeric NOT NULL,
  entry_price numeric NOT NULL,
  stop_loss numeric,
  take_profit numeric,
  sl_tp_mode text NOT NULL DEFAULT 'fixed',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'filled', 'cancelled', 'expired')),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  filled_position_ticket bigint
);

ALTER TABLE pending_orders ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON pending_orders TO anon, authenticated;

DROP POLICY IF EXISTS "anon_select_pending_orders" ON pending_orders;
CREATE POLICY "anon_select_pending_orders" ON pending_orders FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_pending_orders" ON pending_orders;
CREATE POLICY "anon_insert_pending_orders" ON pending_orders FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_pending_orders" ON pending_orders;
CREATE POLICY "anon_update_pending_orders" ON pending_orders FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_pending_orders" ON pending_orders;
CREATE POLICY "anon_delete_pending_orders" ON pending_orders FOR DELETE
  TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_pending_orders_status ON pending_orders(status);
CREATE INDEX IF NOT EXISTS idx_pending_orders_symbol ON pending_orders(symbol);

-- 4. open_positions: add order_type
ALTER TABLE open_positions
  ADD COLUMN IF NOT EXISTS order_type text NOT NULL DEFAULT 'market';

-- 5. trade_history: add order_type and risk_amount
ALTER TABLE trade_history
  ADD COLUMN IF NOT EXISTS order_type text NOT NULL DEFAULT 'market';
ALTER TABLE trade_history
  ADD COLUMN IF NOT EXISTS risk_amount numeric;

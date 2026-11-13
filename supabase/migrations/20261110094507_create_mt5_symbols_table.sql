/*
# MT5 Available Symbols Table

## Purpose
Stores the list of symbols available in the user's MetaTrader 5 terminal,
synced by the Python trading engine via `mt5.symbols_get()`. The web dashboard
reads this table to let the user browse and select which symbols the bot should
trade — resolving the symbol name mismatch problem (e.g. broker uses "BTCUSD"
but config had "BTCUSD_L").

## New Table
- `mt5_symbols`
  - `symbol` (text, primary key) — exact MT5 symbol name from the broker
  - `description` (text) — broker-provided description
  - `category` (text) — inferred category (forex, metals, indices, crypto, stocks, energy)
  - `digits` (integer) — price precision
  - `volume_min` (numeric) — minimum lot size
  - `volume_step` (numeric) — lot size increment
  - `visible` (boolean) — whether the symbol is in Market Watch
  - `bid` (numeric) — current bid price
  - `ask` (numeric) — current ask price
  - `updated_at` (timestamptz) — last sync time

## Security
- RLS enabled; grants to anon, authenticated; policies USING(true) — single-tenant no-auth app, data is intentionally shared.
*/

CREATE TABLE IF NOT EXISTS mt5_symbols (
  symbol text PRIMARY KEY,
  description text DEFAULT '',
  category text DEFAULT 'forex',
  digits integer DEFAULT 5,
  volume_min numeric(10,4) DEFAULT 0.01,
  volume_step numeric(10,4) DEFAULT 0.01,
  visible boolean DEFAULT false,
  bid numeric(12,5),
  ask numeric(12,5),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE mt5_symbols ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON mt5_symbols TO anon, authenticated;

DROP POLICY IF EXISTS "anon_select_mt5_symbols" ON mt5_symbols;
CREATE POLICY "anon_select_mt5_symbols" ON mt5_symbols FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_mt5_symbols" ON mt5_symbols;
CREATE POLICY "anon_insert_mt5_symbols" ON mt5_symbols FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_mt5_symbols" ON mt5_symbols;
CREATE POLICY "anon_update_mt5_symbols" ON mt5_symbols FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_mt5_symbols" ON mt5_symbols;
CREATE POLICY "anon_delete_mt5_symbols" ON mt5_symbols FOR DELETE
  TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_mt5_symbols_category ON mt5_symbols(category);
CREATE INDEX IF NOT EXISTS idx_mt5_symbols_visible ON mt5_symbols(visible);

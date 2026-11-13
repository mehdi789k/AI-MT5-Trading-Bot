/*
# Strategy Optimizations Table

## Overview
Stores results of automated strategy parameter optimization runs. After a
backtest completes, the user can request optimization — the engine tries
multiple parameter combinations, scores them by risk-adjusted performance,
and saves the best result here for user review before applying.

Single-user app (no sign-in). All policies target anon, authenticated with
USING(true) since data is intentionally shared.

## New Tables
1. `strategy_optimizations` — optimization runs with before/after metrics
   and the optimized code for user review

## Security
- RLS enabled; grants to anon, authenticated; policies USING(true).
*/

CREATE TABLE IF NOT EXISTS strategy_optimizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  strategy_id uuid REFERENCES strategies(id) ON DELETE CASCADE,
  symbol text NOT NULL,
  timeframe text NOT NULL,
  from_date date,
  to_date date,

  -- reference backtest result for comparison
  reference_backtest_id uuid,

  -- before metrics (from original backtest)
  before_net_profit numeric(12,2) DEFAULT 0,
  before_win_rate numeric(5,2) DEFAULT 0,
  before_profit_factor numeric(8,2) DEFAULT 0,
  before_max_drawdown numeric(5,2) DEFAULT 0,
  before_sharpe_ratio numeric(8,2) DEFAULT 0,
  before_total_trades integer DEFAULT 0,

  -- after metrics (best optimization result)
  after_net_profit numeric(12,2) DEFAULT 0,
  after_win_rate numeric(5,2) DEFAULT 0,
  after_profit_factor numeric(8,2) DEFAULT 0,
  after_max_drawdown numeric(5,2) DEFAULT 0,
  after_sharpe_ratio numeric(8,2) DEFAULT 0,
  after_total_trades integer DEFAULT 0,

  -- what changed
  param_changes jsonb DEFAULT '[]',
  combinations_tried integer DEFAULT 0,
  best_score numeric(8,4) DEFAULT 0,
  optimized_code text NOT NULL DEFAULT '',

  status text NOT NULL DEFAULT 'pending',
  error_message text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE strategy_optimizations ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON strategy_optimizations TO anon, authenticated;

DROP POLICY IF EXISTS "anon_select_optimizations" ON strategy_optimizations;
CREATE POLICY "anon_select_optimizations" ON strategy_optimizations FOR SELECT
  TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_optimizations" ON strategy_optimizations;
CREATE POLICY "anon_insert_optimizations" ON strategy_optimizations FOR INSERT
  TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_optimizations" ON strategy_optimizations;
CREATE POLICY "anon_update_optimizations" ON strategy_optimizations FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_optimizations" ON strategy_optimizations;
CREATE POLICY "anon_delete_optimizations" ON strategy_optimizations FOR DELETE
  TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_optimizations_strategy ON strategy_optimizations(strategy_id);
CREATE INDEX IF NOT EXISTS idx_optimizations_created ON strategy_optimizations(created_at DESC);

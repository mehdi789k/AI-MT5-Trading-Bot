/*
# Add Extended Backtest Performance Metrics

## Overview
Adds professional performance metrics columns to the `strategy_backtest_results` table
to support realistic backtest reporting (spread, slippage, commission modeling).

## Modified Tables
- `strategy_backtest_results`: adds 8 new nullable columns for extended metrics

## New Columns
1. `avg_win` — average profit per winning trade
2. `avg_loss` — average loss per losing trade
3. `expectancy` — expected value per trade
4. `max_consecutive_wins` — longest winning streak
5. `max_consecutive_losses` — longest losing streak
6. `sharpe_ratio` — risk-adjusted return (annualized)
7. `sortino_ratio` — downside-risk-adjusted return
8. `total_commission` — sum of commission costs across all trades

## Security
- No new tables; existing RLS policies and grants remain unchanged.
*/

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'strategy_backtest_results' AND column_name = 'avg_win') THEN
    ALTER TABLE strategy_backtest_results ADD COLUMN avg_win numeric(12,2);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'strategy_backtest_results' AND column_name = 'avg_loss') THEN
    ALTER TABLE strategy_backtest_results ADD COLUMN avg_loss numeric(12,2);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'strategy_backtest_results' AND column_name = 'expectancy') THEN
    ALTER TABLE strategy_backtest_results ADD COLUMN expectancy numeric(12,2);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'strategy_backtest_results' AND column_name = 'max_consecutive_wins') THEN
    ALTER TABLE strategy_backtest_results ADD COLUMN max_consecutive_wins integer;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'strategy_backtest_results' AND column_name = 'max_consecutive_losses') THEN
    ALTER TABLE strategy_backtest_results ADD COLUMN max_consecutive_losses integer;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'strategy_backtest_results' AND column_name = 'sharpe_ratio') THEN
    ALTER TABLE strategy_backtest_results ADD COLUMN sharpe_ratio numeric(8,2);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'strategy_backtest_results' AND column_name = 'sortino_ratio') THEN
    ALTER TABLE strategy_backtest_results ADD COLUMN sortino_ratio numeric(8,2);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'strategy_backtest_results' AND column_name = 'total_commission') THEN
    ALTER TABLE strategy_backtest_results ADD COLUMN total_commission numeric(12,2);
  END IF;
END $$;

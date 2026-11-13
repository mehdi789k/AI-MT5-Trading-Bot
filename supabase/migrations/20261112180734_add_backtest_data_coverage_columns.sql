/*
# Add data coverage columns to backtest results

1. Modified Table
- `strategy_backtest_results`
  - `requested_from_date` (date): the start date the user asked for.
  - `requested_to_date` (date): the end date the user asked for.
  - `expected_candles` (integer): how many candles the timeframe should produce for the requested range.
  - `received_candles` (integer): how many candles the broker actually returned and were tested.

2. Notes
- Columns are nullable so existing results remain valid.
- The existing `from_date` and `to_date` now hold the period actually tested.
- No rows are changed and no existing grants or policies are modified.
*/

ALTER TABLE strategy_backtest_results ADD COLUMN IF NOT EXISTS requested_from_date date;
ALTER TABLE strategy_backtest_results ADD COLUMN IF NOT EXISTS requested_to_date date;
ALTER TABLE strategy_backtest_results ADD COLUMN IF NOT EXISTS expected_candles integer;
ALTER TABLE strategy_backtest_results ADD COLUMN IF NOT EXISTS received_candles integer;

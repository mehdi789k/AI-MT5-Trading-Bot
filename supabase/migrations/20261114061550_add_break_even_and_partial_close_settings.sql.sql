/*
# Add break-even and staged partial-close settings per symbol

1. Modified Tables
- `symbol_config`
  - `profit_target_mode` ('points' or 'percent'): how the profit targets below are measured.
  - `break_even_enabled` / `break_even_trigger`: when enabled, the stop loss of an open position moves to its entry price once profit reaches the trigger.
  - `partial_close_enabled`: turns on staged partial closes for the symbol.
  - `partial_stage1_trigger` / `partial_stage1_close_percent`: profit target and share of the volume to close at stage 1.
  - `partial_stage2_enabled` / `partial_stage2_trigger` / `partial_stage2_close_percent`: optional second stage.
- `open_positions`
  - `break_even_applied`: records that the stop loss was already moved to entry.
  - `partial_stages_done`: how many partial-close stages have already run for the position.
- `trade_history.close_reason` now also accepts `partial_close` for the portion closed in a partial stage.

2. Security
- No changes to RLS policies or grants. Existing grants already cover the modified tables.

3. Notes
- All new columns have safe defaults, so existing symbols keep their current behavior (both features are off).
- The close reason constraint is dropped and recreated with the extra value; existing rows are not modified.
*/

ALTER TABLE symbol_config
  ADD COLUMN IF NOT EXISTS profit_target_mode text NOT NULL DEFAULT 'points',
  ADD COLUMN IF NOT EXISTS break_even_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS break_even_trigger numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS partial_close_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS partial_stage1_trigger numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS partial_stage1_close_percent numeric NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS partial_stage2_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS partial_stage2_trigger numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS partial_stage2_close_percent numeric NOT NULL DEFAULT 50;

ALTER TABLE symbol_config DROP CONSTRAINT IF EXISTS symbol_config_profit_target_mode_ck;
ALTER TABLE symbol_config ADD CONSTRAINT symbol_config_profit_target_mode_ck
  CHECK (profit_target_mode IN ('points', 'percent'));

ALTER TABLE symbol_config DROP CONSTRAINT IF EXISTS symbol_config_break_even_trigger_ck;
ALTER TABLE symbol_config ADD CONSTRAINT symbol_config_break_even_trigger_ck
  CHECK (break_even_trigger >= 0);

ALTER TABLE symbol_config DROP CONSTRAINT IF EXISTS symbol_config_partial_triggers_ck;
ALTER TABLE symbol_config ADD CONSTRAINT symbol_config_partial_triggers_ck
  CHECK (partial_stage1_trigger >= 0 AND partial_stage2_trigger >= 0);

ALTER TABLE symbol_config DROP CONSTRAINT IF EXISTS symbol_config_partial_percent_ck;
ALTER TABLE symbol_config ADD CONSTRAINT symbol_config_partial_percent_ck
  CHECK (partial_stage1_close_percent BETWEEN 1 AND 99 AND partial_stage2_close_percent BETWEEN 1 AND 99);

ALTER TABLE open_positions
  ADD COLUMN IF NOT EXISTS break_even_applied boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS partial_stages_done integer NOT NULL DEFAULT 0;

ALTER TABLE open_positions DROP CONSTRAINT IF EXISTS op_partial_stages_ck;
ALTER TABLE open_positions ADD CONSTRAINT op_partial_stages_ck
  CHECK (partial_stages_done BETWEEN 0 AND 2);

ALTER TABLE trade_history DROP CONSTRAINT IF EXISTS th_reason_ck;
ALTER TABLE trade_history ADD CONSTRAINT th_reason_ck
  CHECK (close_reason IN ('tp_hit', 'sl_hit', 'model_signal', 'manual', 'error', 'partial_close'));

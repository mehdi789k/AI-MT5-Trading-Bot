/*
# Create AI prediction settings and change history

Moves the prediction model's tunable values out of the engine code and into the database so they can be edited from the dashboard.

1. New Tables
- `ai_prediction_settings`: single row (id = 1) holding every tunable prediction value with a safe default and a hard min/max range enforced by the database.
- `ai_prediction_settings_history`: one snapshot row each time the settings row is created or changed, with the full values and the time of change.

2. Modified Tables
- None.

3. Security
- Row level security enabled on both tables.
- Grants: anon and authenticated get SELECT, INSERT, UPDATE on the settings table and SELECT, INSERT on the history table (the app has no sign-in, matching the other tables).
- History rows are written by a trigger and are never edited or deleted by the app.

4. Important Notes
- Range checks live in the database, so out-of-range values are rejected even if the UI is bypassed.
- Defaults match the values currently hard-coded in the engine, so behavior is unchanged until someone edits a value.
*/

CREATE TABLE IF NOT EXISTS ai_prediction_settings (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  min_confidence_threshold numeric NOT NULL DEFAULT 60 CHECK (min_confidence_threshold BETWEEN 50 AND 100),
  neutral_threshold numeric NOT NULL DEFAULT 0.15 CHECK (neutral_threshold BETWEEN 0 AND 0.45),
  min_trades_for_model integer NOT NULL DEFAULT 10 CHECK (min_trades_for_model BETWEEN 2 AND 1000),
  retraining_interval_trades integer NOT NULL DEFAULT 20 CHECK (retraining_interval_trades BETWEEN 1 AND 500),
  gb_n_estimators integer NOT NULL DEFAULT 100 CHECK (gb_n_estimators BETWEEN 10 AND 1000),
  gb_max_depth integer NOT NULL DEFAULT 4 CHECK (gb_max_depth BETWEEN 1 AND 10),
  gb_learning_rate numeric NOT NULL DEFAULT 0.1 CHECK (gb_learning_rate BETWEEN 0.001 AND 1),
  gb_subsample numeric NOT NULL DEFAULT 0.8 CHECK (gb_subsample BETWEEN 0.1 AND 1),
  rule_rsi_oversold numeric NOT NULL DEFAULT 35 CHECK (rule_rsi_oversold BETWEEN 5 AND 49),
  rule_rsi_overbought numeric NOT NULL DEFAULT 65 CHECK (rule_rsi_overbought BETWEEN 51 AND 95),
  rule_trend_threshold numeric NOT NULL DEFAULT 0.5 CHECK (rule_trend_threshold BETWEEN 0 AND 5),
  rule_macd_weight numeric NOT NULL DEFAULT 0.5 CHECK (rule_macd_weight BETWEEN 0 AND 2),
  predicted_price_atr_mult numeric NOT NULL DEFAULT 2 CHECK (predicted_price_atr_mult BETWEEN 0 AND 10),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (rule_rsi_oversold < rule_rsi_overbought)
);

CREATE TABLE IF NOT EXISTS ai_prediction_settings_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot jsonb NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_prediction_settings_history_changed_at
  ON ai_prediction_settings_history (changed_at DESC);

INSERT INTO ai_prediction_settings (id) VALUES (1)
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION record_ai_prediction_settings_history()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  INSERT INTO ai_prediction_settings_history (snapshot)
  VALUES (to_jsonb(NEW));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ai_prediction_settings_history_trigger ON ai_prediction_settings;
CREATE TRIGGER ai_prediction_settings_history_trigger
AFTER INSERT OR UPDATE ON ai_prediction_settings
FOR EACH ROW EXECUTE FUNCTION record_ai_prediction_settings_history();

ALTER TABLE ai_prediction_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_prediction_settings_history ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON ai_prediction_settings TO anon, authenticated;
GRANT SELECT, INSERT ON ai_prediction_settings_history TO anon, authenticated;

DROP POLICY IF EXISTS anon_select_ai_prediction_settings ON ai_prediction_settings;
CREATE POLICY anon_select_ai_prediction_settings ON ai_prediction_settings FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS anon_insert_ai_prediction_settings ON ai_prediction_settings;
CREATE POLICY anon_insert_ai_prediction_settings ON ai_prediction_settings FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS anon_update_ai_prediction_settings ON ai_prediction_settings;
CREATE POLICY anon_update_ai_prediction_settings ON ai_prediction_settings FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS anon_select_ai_prediction_settings_history ON ai_prediction_settings_history;
CREATE POLICY anon_select_ai_prediction_settings_history ON ai_prediction_settings_history FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS anon_insert_ai_prediction_settings_history ON ai_prediction_settings_history;
CREATE POLICY anon_insert_ai_prediction_settings_history ON ai_prediction_settings_history FOR INSERT
  TO anon, authenticated WITH CHECK (true);

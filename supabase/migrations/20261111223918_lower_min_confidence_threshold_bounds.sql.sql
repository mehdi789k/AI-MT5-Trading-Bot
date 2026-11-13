ALTER TABLE ai_prediction_settings
  DROP CONSTRAINT IF EXISTS ai_prediction_settings_min_confidence_threshold_check;

ALTER TABLE ai_prediction_settings
  ADD CONSTRAINT ai_prediction_settings_min_confidence_threshold_check
  CHECK (min_confidence_threshold BETWEEN 10 AND 100);

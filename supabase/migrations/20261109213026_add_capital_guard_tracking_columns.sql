/*
# Capital guard tracking columns

## Summary

Adds three bookkeeping columns to bot_settings that the trading engine uses to
enforce the daily loss limit and maximum drawdown limit.

## Changes

### bot_settings
- `peak_equity` (numeric, nullable): highest account equity seen since the last
  resume. Drawdown is measured from this value. Null means "not yet recorded".
- `day_start_equity` (numeric, nullable): equity at the start of the current
  trading day. Daily loss is measured from this value.
- `day_start_key` (text, nullable): identifies the current trading day, based on
  the configured daily reset hour (UTC).

## Security

- No new tables or policies. Existing grants on bot_settings already cover these
  columns.

## Notes

1. All columns are nullable and additive, so existing rows and the engine stay
   valid before the first run.
2. No existing data is modified or removed.
*/

ALTER TABLE bot_settings ADD COLUMN IF NOT EXISTS peak_equity numeric;
ALTER TABLE bot_settings ADD COLUMN IF NOT EXISTS day_start_equity numeric;
ALTER TABLE bot_settings ADD COLUMN IF NOT EXISTS day_start_key text;

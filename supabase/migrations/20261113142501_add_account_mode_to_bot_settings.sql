/*
# Add account mode (demo / live) to bot settings

1. Modified Table
- `bot_settings`
  - `account_mode` (text, not null, default 'demo'): the account the dashboard wants the engine to trade on. Allowed values: 'demo' or 'live'.
  - `mt5_account_type` (text, nullable): the type of account the engine is actually logged into, reported by the engine on each heartbeat ('demo', 'real', 'contest', or null when unknown).

2. Security
- No new tables. Existing row policies on `bot_settings` are unchanged.

3. Notes
- Defaults to 'demo' so no existing installation switches to a live account by accident.
- The engine verifies that the connected account type matches `account_mode` before placing any trade.
*/

ALTER TABLE bot_settings
  ADD COLUMN IF NOT EXISTS account_mode text NOT NULL DEFAULT 'demo';

ALTER TABLE bot_settings
  ADD COLUMN IF NOT EXISTS mt5_account_type text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'bot_settings_account_mode_check'
  ) THEN
    ALTER TABLE bot_settings
      ADD CONSTRAINT bot_settings_account_mode_check CHECK (account_mode IN ('demo', 'live'));
  END IF;
END $$;

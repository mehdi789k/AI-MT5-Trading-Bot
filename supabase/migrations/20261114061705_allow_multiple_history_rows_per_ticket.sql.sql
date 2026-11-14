/*
# Allow several history rows per position ticket

1. Modified Tables
- `trade_history`
  - New column `close_seq` (integer, default 0). Each closed piece of a position gets its own sequence number: 0 for the final close, 1 and 2 for the staged partial closes.
  - The single-row-per-ticket uniqueness is replaced by uniqueness on (mt5_ticket, close_seq), so a position that is closed in parts keeps one history row per part.

2. Security
- No changes to RLS policies or grants.

3. Notes
- Existing rows get close_seq = 0, so their uniqueness is preserved.
- Re-inserting the same final close for a ticket is still rejected, which protects against duplicate history rows when a sync is retried.
*/

ALTER TABLE trade_history
  ADD COLUMN IF NOT EXISTS close_seq integer NOT NULL DEFAULT 0;

ALTER TABLE trade_history DROP CONSTRAINT IF EXISTS trade_history_mt5_ticket_key;

ALTER TABLE trade_history DROP CONSTRAINT IF EXISTS trade_history_ticket_close_seq_key;
ALTER TABLE trade_history ADD CONSTRAINT trade_history_ticket_close_seq_key UNIQUE (mt5_ticket, close_seq);

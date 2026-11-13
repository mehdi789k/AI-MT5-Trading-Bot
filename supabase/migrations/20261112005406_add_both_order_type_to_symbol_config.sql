/*
# Allow "both" order type on symbol_config

1. Modified Tables
- `symbol_config.order_type` now accepts `'both'` in addition to `'market'` and `'limit'`.
  - `market`: only a market order is sent (unchanged).
  - `limit`: only a pending limit order is sent (unchanged).
  - `both`: a market order and a limit order are sent together.

2. Security
- No change to RLS policies or grants.

3. Notes
- Existing rows keep their current values; no data is modified.
- The constraint is dropped and recreated idempotently.
*/

ALTER TABLE symbol_config DROP CONSTRAINT IF EXISTS symbol_config_order_type_check;

ALTER TABLE symbol_config
  ADD CONSTRAINT symbol_config_order_type_check
  CHECK (order_type IN ('market', 'limit', 'both'));

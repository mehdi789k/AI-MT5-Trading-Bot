/*
# Convert limit-order expiry to minutes

1. Modified Tables
- `symbol_config.limit_order_expiry_hours` now stores the limit-order expiry duration in minutes.
- Existing values are multiplied by 60 so their real-world expiry duration does not change.
- The default changes from 24 hours to 1,440 minutes.

2. Application Behavior
- The dashboard displays and saves this setting as minutes.
- The Python trading engine interprets the value as minutes when calculating the broker expiration timestamp.

3. Security
- No RLS policies, grants, tables, or access rules are changed.

4. Important Notes
- The column keeps its existing database name for data safety and compatibility; only its unit changes.
- The conversion is guarded by the previous default value and is safe to run again without multiplying values twice.
*/

DO $$
DECLARE
  current_default text;
BEGIN
  SELECT pg_get_expr(d.adbin, d.adrelid)
  INTO current_default
  FROM pg_attribute a
  JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
  WHERE a.attrelid = 'public.symbol_config'::regclass
    AND a.attname = 'limit_order_expiry_hours';

  IF current_default LIKE '%24%' THEN
    UPDATE public.symbol_config
    SET limit_order_expiry_hours = limit_order_expiry_hours * 60;
  END IF;
END $$;

ALTER TABLE public.symbol_config
  ALTER COLUMN limit_order_expiry_hours SET DEFAULT 1440;

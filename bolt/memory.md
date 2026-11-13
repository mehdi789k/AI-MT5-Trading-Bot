# Project memory

## Product intent & audience

- MT5 (MetaTrader 5) trading bot management dashboard.
- Python backend engine runs trading logic, sends heartbeat every ~5 seconds to Supabase.
- React (Vite) frontend dashboard monitors bot status, connection state, and settings in real time.
- Audience: traders managing automated bots; needs reliable live status visibility and configurable trading parameters.

## Brand personality & voice

- User communicates in Persian (Farsi); responses should remain in Persian.
- Tone: technical, diagnostic, concise — focused on root-cause analysis and fixes.

## Visual design & UX direction

- Dashboard UI built with Tailwind CSS + Lucide React icons.
- `StatusIndicator` component displays connection state (connected / disconnected).
- Status derived from heartbeat freshness: stale heartbeat (> 60 s) → "قطع اتصال".
- Dashboard exposes backup-rule parameter controls (RSI levels, trend threshold, MACD weight).
- Production-grade, non-cookie-cutter aesthetics per global instructions.

## Decisions, constraints & rationale

- **Polling fallback added** to `useBotSettings` and `useBotStatus` hooks (every 5 s) alongside Supabase realtime subscriptions.
- **Rationale**: Supabase realtime can silently disconnect; polling prevents false "disconnected" state while Python engine is active.
- Database fields confirmed: `is_running`, `mt5_connected`, heartbeat timestamp.
- Heartbeat staleness threshold: 60 seconds.
- Path alias `@/` → `src/` for all project imports.
- Stack: Vite + React, Tailwind CSS, Lucide React, Supabase (DB + realtime), Python engine for MT5.
- **Backup rules system** (`/python-engine/ai_model.py`, function `_rule_based_predict`):
  - Used before AI model has sufficient training data; also serves as permanent fallback when ML library unavailable.
  - Combines three scored signals: RSI (oversold → positive, overbought → negative), trend strength (above threshold → directional score), MACD (sign × MACD weight).
  - Sum of scores determines direction: high → bullish, low → bearish, mid → neutral.
  - Confidence calculated 50–90% based on score magnitude.
  - Dashboard-configurable parameters: RSI overbought/oversold levels, trend threshold, MACD weight.
  - Even after AI training, backup rules persist as fallback guidance.

## Open questions & assumptions

- Exact Supabase table names and schema not yet documented in memory.
- Whether other dashboard hooks/components lack polling fallback and are at risk of stale-status bugs.
- Full scope of bot settings and trading logic managed via dashboard not yet mapped.
- No error-boundary or reconnection-confirmation UX for realtime drops discussed yet.
- Whether dashboard surfaces AI model training status / trade count alongside backup-rule configuration.
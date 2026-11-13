"""
XRPUSD M5 scalper with multi-timeframe trend filter, RSI pullback entries,
support/resistance zones, session filter, and volume confirmation.

Designed specifically for XRP's higher volatility and tighter intraday ranges.

Entry logic (buy example, sell is mirror):
  - Trend: EMA50 above EMA200 and rising (multi-timeframe trend confirmation).
  - Trigger: EITHER a fresh 9/21 EMA cross in the last 3 candles,
    OR an RSI pullback bounce (RSI dipped below RSI_PULLBACK_LOW then turned back up).
  - Momentum: RSI in the buy zone (RSI_BUY_LOW to RSI_BUY_HIGH) and rising.
  - Not chasing: price within MAX_CHASE_PCT of the fast EMA.
  - Volatility: ATR at least MIN_ATR_PCT of price, and volume above avg.
  - Session: only trade during active hours (broker-local time via features["broker_hour"]).
  - Candle body: signal candle must have a real body (not a doji).
  - S/R: entry must have headroom to the next resistance/support level.

All UPPER_SNAKE constants are tunable by the optimizer.
"""

MIN_ATR_PCT = 0.015
MAX_CHASE_PCT = 0.6
RSI_BUY_LOW = 35.0
RSI_BUY_HIGH = 78.0
RSI_SELL_LOW = 22.0
RSI_SELL_HIGH = 65.0
RSI_PULLBACK_LOW = 40.0
RSI_PULLBACK_HIGH = 60.0
MIN_BODY_PCT = 0.01
MIN_VOL_RATIO = 0.3
SESSION_START_H = 6
SESSION_END_H = 22

# --- Support/Resistance tuning ---
SR_LOOKBACK = 112
SR_TOUCH_TOLERANCE = 0.15
SR_MIN_TOUCHES = 2
SR_HEADROOM_MIN = 0.08
SR_BREAKOUT_CONFIRM = 0.04


def _ema_series(values, period):
    k = 2.0 / (period + 1)
    ema = values[0]
    out = []
    for v in values:
        ema = v * k + ema * (1 - k)
        out.append(ema)
    return out


def _rsi_single(closes, period=14):
    if len(closes) < period + 1:
        return 50.0
    gains = 0.0
    losses = 0.0
    for j in range(1, period + 1):
        d = closes[j] - closes[j - 1]
        if d > 0:
            gains += d
        else:
            losses += -d
    avg_gain = gains / period
    avg_loss = losses / period
    for j in range(period + 1, len(closes)):
        d = closes[j] - closes[j - 1]
        if d > 0:
            avg_gain = (avg_gain * (period - 1) + d) / period
            avg_loss = (avg_loss * (period - 1)) / period
        else:
            avg_gain = (avg_gain * (period - 1)) / period
            avg_loss = (avg_loss * (period - 1) + (-d)) / period
    if avg_loss == 0:
        return 100.0
    rs = avg_gain / avg_loss
    return 100.0 - (100.0 / (1.0 + rs))


def _find_sr_levels(candles, lookback, tolerance_pct, min_touches):
    window = candles[-lookback:]
    highs = [c["high"] for c in window]
    lows = [c["low"] for c in window]
    n = len(window)

    swing_highs = []
    swing_lows = []
    for i in range(2, n - 2):
        if highs[i] >= highs[i - 1] and highs[i] >= highs[i - 2] \
                and highs[i] >= highs[i + 1] and highs[i] >= highs[i + 2]:
            swing_highs.append(highs[i])
        if lows[i] <= lows[i - 1] and lows[i] <= lows[i - 2] \
                and lows[i] <= lows[i + 1] and lows[i] <= lows[i + 2]:
            swing_lows.append(lows[i])

    def cluster(levels):
        if not levels:
            return []
        levels = sorted(levels)
        tol = tolerance_pct / 100.0
        groups = [[levels[0]]]
        for lv in levels[1:]:
            if abs(lv - groups[-1][-1]) / lv <= tol:
                groups[-1].append(lv)
            else:
                groups.append([lv])
        return [sum(g) / len(g) for g in groups if len(g) >= min_touches]

    return cluster(swing_lows), cluster(swing_highs)


def _sr_bias(close, supports, resistances, tolerance_pct,
             headroom_min, breakout_confirm):
    tol = tolerance_pct / 100.0
    near_res = [r for r in resistances if r > close * (1 - tol)]
    near_sup = [s for s in supports if s < close * (1 + tol)]

    nearest_res = min(near_res) if near_res else None
    nearest_sup = max(near_sup) if near_sup else None

    ok_buy = True
    ok_sell = True
    buy_bonus = 0
    sell_bonus = 0
    notes = []

    if nearest_res is not None:
        dist_res_pct = (nearest_res - close) / close * 100
        if dist_res_pct < headroom_min:
            if dist_res_pct > -breakout_confirm:
                ok_buy = False
                notes.append(f"under resistance {nearest_res:.4f}")
            else:
                buy_bonus = 8
                notes.append(f"resistance {nearest_res:.4f} broken out")

    if nearest_sup is not None:
        dist_sup_pct = (close - nearest_sup) / close * 100
        if dist_sup_pct < headroom_min:
            if dist_sup_pct > -breakout_confirm:
                ok_sell = False
                notes.append(f"on support {nearest_sup:.4f}")
            else:
                sell_bonus = 8
                notes.append(f"support {nearest_sup:.4f} broken down")

    if nearest_sup is not None and nearest_res is not None:
        room_pct = (nearest_res - nearest_sup) / close * 100
        if room_pct > headroom_min * 3:
            buy_bonus += 2
            sell_bonus += 2

    return ok_buy, ok_sell, buy_bonus, sell_bonus, "; ".join(notes)


def _neutral(reason):
    return {"direction": "neutral", "confidence": 0, "reason": reason}


def evaluate(candles, features):
    closes = [c["close"] for c in candles if "close" in c]
    if len(closes) < 60:
        return _neutral("Not enough data")

    close = closes[-1]
    if close <= 0:
        return _neutral("Invalid price")

    # Session filter — use broker-local hour from features (set by engine/backtest)
    broker_hour = features.get("broker_hour", -1)
    if broker_hour >= 0 and not (SESSION_START_H <= broker_hour < SESSION_END_H):
        return _neutral(f"Outside active session (hour={broker_hour})")

    atr = features.get("atr") or 0
    rsi = features.get("rsi", 50) or 50
    rsi_prev = features.get("rsi_prev", rsi) or rsi
    if atr / close * 100 < MIN_ATR_PCT:
        return _neutral("Volatility too low for XRP scalp")

    # Volume confirmation
    volumes = [c.get("volume", 0) for c in candles[-20:]]
    avg_vol = sum(volumes) / len(volumes) if volumes else 0
    current_vol = candles[-1].get("volume", 0)
    if avg_vol > 0 and current_vol < avg_vol * MIN_VOL_RATIO:
        return _neutral("Volume below average")

    # Candle body filter — skip dojis
    last_candle = candles[-1]
    body = abs(last_candle["close"] - last_candle["open"])
    body_pct = body / close * 100 if close > 0 else 0
    if body_pct < MIN_BODY_PCT:
        return _neutral("Signal candle is a doji")

    ema50 = _ema_series(closes, 50)
    ema200 = _ema_series(closes, 200)
    if ema50[-1] > ema200[-1] and ema50[-1] > ema50[-6]:
        trend = 1
    elif ema50[-1] < ema200[-1] and ema50[-1] < ema50[-6]:
        trend = -1
    else:
        return _neutral("Higher trend is flat or unclear")

    fast = _ema_series(closes, 9)
    slow = _ema_series(closes, 21)
    macd_line = [a - b for a, b in zip(_ema_series(closes, 12), _ema_series(closes, 26))]
    signal_line = _ema_series(macd_line, 9)
    hist = [m - s for m, s in zip(macd_line, signal_line)]

    last = len(closes) - 1
    recent = range(last - 2, last + 1)
    bull_cross = any(fast[i - 1] <= slow[i - 1] and fast[i] > slow[i] for i in recent)
    bear_cross = any(fast[i - 1] >= slow[i - 1] and fast[i] < slow[i] for i in recent)
    chase_pct = abs(close - fast[-1]) / close * 100

    # RSI pullback: check if RSI dipped into oversold/overbought zone in last 10 candles
    # Uses a single-pass rolling computation — O(n) per call, not O(n²)
    rsi_dipped_low = False
    rsi_dipped_high = False
    if len(closes) >= 25:
        for j in range(max(15, len(closes) - 10), len(closes)):
            r = _rsi_single(closes[:j + 1])
            if r < RSI_PULLBACK_LOW:
                rsi_dipped_low = True
            if r > RSI_PULLBACK_HIGH:
                rsi_dipped_high = True

    # --- support/resistance context ---
    supports, resistances = _find_sr_levels(
        candles, SR_LOOKBACK, SR_TOUCH_TOLERANCE, SR_MIN_TOUCHES
    )
    ok_buy, ok_sell, buy_bonus, sell_bonus, sr_note = _sr_bias(
        close, supports, resistances, SR_TOUCH_TOLERANCE,
        SR_HEADROOM_MIN, SR_BREAKOUT_CONFIRM
    )

    # Entry triggers: EMA cross OR RSI pullback bounce
    buy_trigger = bull_cross or (rsi_dipped_low and rsi > rsi_prev and rsi > RSI_BUY_LOW)
    sell_trigger = bear_cross or (rsi_dipped_high and rsi < rsi_prev and rsi < RSI_SELL_HIGH)

    if trend == 1:
        if not buy_trigger or hist[-1] <= 0 or hist[-1] <= hist[-2]:
            return _neutral("No fresh bullish trigger")
        if not (RSI_BUY_LOW < rsi < RSI_BUY_HIGH and rsi > rsi_prev):
            return _neutral("RSI not in buy zone")
        if chase_pct > MAX_CHASE_PCT:
            return _neutral("Price too extended from fast EMA")
        if not ok_buy:
            return _neutral(f"Buy blocked by S/R: {sr_note or 'no headroom to resistance'}")

        confidence = 68 + buy_bonus
        if ema50[-1] - ema50[-6] > 0:
            confidence += 10
        if hist[-1] > hist[-2] * 1.2:
            confidence += 5
        if rsi_dipped_low:
            confidence += 7
        return {
            "direction": "buy",
            "confidence": min(confidence, 92),
            "reason": f"Uptrend + {'EMA cross' if bull_cross else 'RSI pullback bounce'} | RSI {rsi:.1f} | ATR {atr:.4f}"
                      + (f" | S/R: {sr_note}" if sr_note else ""),
        }

    if not sell_trigger or hist[-1] >= 0 or hist[-1] >= hist[-2]:
        return _neutral("No fresh bearish trigger")
    if not (RSI_SELL_LOW < rsi < RSI_SELL_HIGH and rsi < rsi_prev):
        return _neutral("RSI not in sell zone")
    if chase_pct > MAX_CHASE_PCT:
        return _neutral("Price too extended from fast EMA")
    if not ok_sell:
        return _neutral(f"Sell blocked by S/R: {sr_note or 'no headroom to support'}")

    confidence = 68 + sell_bonus
    if ema50[-1] - ema50[-6] < 0:
        confidence += 10
    if hist[-1] < hist[-2] * 1.2:
        confidence += 5
    if rsi_dipped_high:
        confidence += 7
    return {
        "direction": "sell",
        "confidence": min(confidence, 92),
        "reason": f"Downtrend + {'EMA cross' if bear_cross else 'RSI pullback bounce'} | RSI {rsi:.1f} | ATR {atr:.4f}"
                  + (f" | S/R: {sr_note}" if sr_note else ""),
    }

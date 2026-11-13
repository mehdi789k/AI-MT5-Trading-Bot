"""
Gold (XAUUSD) M5 scalp with trend filter + support/resistance zones.

Buy only when all of these agree:
  - Trend: EMA50 above EMA200 and rising over the last 5 candles.
  - Trigger: a fresh 9/21 EMA cross up in the last 3 candles and MACD
    histogram positive and rising.
  - Momentum: RSI between 45 and 70 and rising (not overheated).
  - Not chasing: price is close to the fast EMA (within MAX_CHASE_PCT).
  - Volatility: ATR at least MIN_ATR_PCT of price.
  - Support/resistance: entry is NOT into a resistance ceiling — price must
    have headroom to the nearest resistance above; buying right under a
    strong resistance is skipped (or rewarded if resistance just broke out
    and price is riding the breakout). Mirror for sells.
Sell is the mirror image.

The optimizer can tune every constant below (module-level UPPER_SNAKE floats).
"""

MIN_ATR_PCT = 0.02
MAX_CHASE_PCT = 0.15

# --- Support/Resistance tuning ---
SR_LOOKBACK = 100          # candles scanned for swing highs/lows
SR_TOUCH_TOLERANCE = 0.12  # zone thickness around a level, % of price
SR_MIN_TOUCHES = 2         # touches needed for a level to count as real
SR_HEADROOM_MIN = 0.15     # min distance to next S/R level, % of price
SR_BREAKOUT_CONFIRM = 0.05 # close beyond level by this % = breakout, not rejection


def _ema_series(values, period):
    k = 2.0 / (period + 1)
    ema = values[0]
    out = []
    for v in values:
        ema = v * k + ema * (1 - k)
        out.append(ema)
    return out


def _find_sr_levels(candles, lookback, tolerance_pct, min_touches):
    """
    Detect support (below price) and resistance (above price) levels.

    A swing high is a candle whose high is the highest of its neighbours; a
    swing low mirrors it. Levels that neighbours cluster around (within
    tolerance) are merged and the ones with >= min_touches touches are kept.
    Returns (supports, resistances) as sorted lists of prices.
    """
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
        merged = [sum(g) / len(g) for g in groups if len(g) >= min_touches]
        return merged

    return cluster(swing_lows), cluster(swing_highs)


def _sr_bias(close, supports, resistances, tolerance_pct,
             headroom_min, breakout_confirm):
    """
    Judge the S/R context around `close`.

    Returns (ok_to_buy, ok_to_sell, buy_bonus, sell_bonus, note):
      ok_to_buy  — buying now has headroom (not pressing into resistance)
      ok_to_sell — selling now has headroom (not dropping onto support)
      bonus      — +confidence when a level was just cleanly broken
    """
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
            # Pressed right under resistance...
            if dist_res_pct > -breakout_confirm:
                # ...but only barely beyond it: unresolved breakout, stay flat
                ok_buy = False
                notes.append(f"under resistance {nearest_res:.2f}")
            else:
                # Clean breakout: resistance becomes support, ride it
                buy_bonus = 8
                notes.append(f"resistance {nearest_res:.2f} broken out")
        # else: plenty of headroom, no note needed

    if nearest_sup is not None:
        dist_sup_pct = (close - nearest_sup) / close * 100
        if dist_sup_pct < headroom_min:
            if dist_sup_pct > -breakout_confirm:
                ok_sell = False
                notes.append(f"on support {nearest_sup:.2f}")
            else:
                sell_bonus = 8
                notes.append(f"support {nearest_sup:.2f} broken down")

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

    atr = features.get("atr") or 0
    rsi = features.get("rsi", 50) or 50
    rsi_prev = features.get("rsi_prev", rsi)
    if atr / close * 100 < MIN_ATR_PCT:
        return _neutral("Volatility too low for gold scalp")

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

    # --- support/resistance context ---
    supports, resistances = _find_sr_levels(
        candles, SR_LOOKBACK, SR_TOUCH_TOLERANCE, SR_MIN_TOUCHES
    )
    ok_buy, ok_sell, buy_bonus, sell_bonus, sr_note = _sr_bias(
        close, supports, resistances, SR_TOUCH_TOLERANCE,
        SR_HEADROOM_MIN, SR_BREAKOUT_CONFIRM
    )

    if trend == 1:
        if not bull_cross or hist[-1] <= 0 or hist[-1] <= hist[-2]:
            return _neutral("No fresh bullish trigger")
        if not (45 < rsi < 70 and rsi > rsi_prev):
            return _neutral("RSI not in buy zone")
        if chase_pct > MAX_CHASE_PCT:
            return _neutral("Price too extended from fast EMA")
        if not ok_buy:
            return _neutral(f"Buy blocked by S/R: {sr_note or 'no headroom to resistance'}")

        confidence = 70 + buy_bonus
        if ema50[-1] - ema50[-6] > 0:
            confidence += 10
        if hist[-1] > hist[-2] * 1.2:
            confidence += 5
        return {
            "direction": "buy",
            "confidence": min(confidence, 92),
            "reason": f"Uptrend + bullish EMA cross | RSI {rsi:.1f} | ATR {atr:.2f}"
                      + (f" | S/R: {sr_note}" if sr_note else ""),
        }

    if not bear_cross or hist[-1] >= 0 or hist[-1] >= hist[-2]:
        return _neutral("No fresh bearish trigger")
    if not (30 < rsi < 55 and rsi < rsi_prev):
        return _neutral("RSI not in sell zone")
    if chase_pct > MAX_CHASE_PCT:
        return _neutral("Price too extended from fast EMA")
    if not ok_sell:
        return _neutral(f"Sell blocked by S/R: {sr_note or 'no headroom to support'}")

    confidence = 70 + sell_bonus
    if ema50[-1] - ema50[-6] < 0:
        confidence += 10
    if hist[-1] < hist[-2] * 1.2:
        confidence += 5
    return {
        "direction": "sell",
        "confidence": min(confidence, 92),
        "reason": f"Downtrend + bearish EMA cross | RSI {rsi:.1f} | ATR {atr:.2f}"
                  + (f" | S/R: {sr_note}" if sr_note else ""),
    }

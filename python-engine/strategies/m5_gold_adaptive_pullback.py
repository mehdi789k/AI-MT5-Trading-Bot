# Gold (XAUUSD) M5 Adaptive Pullback Scalper with support/resistance zones.
# Idea: trade WITH the short-term trend, but enter only after a pullback —
# never chase the initial move. S/R context filters where pullbacks are safe:
# a pullback onto support in an uptrend is a gift; a pullback into mid-range
# air is lower quality; a pullback straight through broken support is a trap.
#
# Buy setup (all must agree):
#   - Trend: fast EMA above slow EMA and both rising (no flat/mixed trend).
#   - Pullback: price dipped back near the fast EMA, RSI turned back up.
#   - Confirmation: latest candle closed bullish and MACD histogram is not falling.
#   - Support/resistance: pullback must land on real support (a cluster of
#     swing lows) or mid-range — skipped if price broke below a support and
#     is retesting it from underneath. Bonus if support and the fast EMA
#     coincide (confluence). Bonus headroom to the nearest resistance.
#   - Hygiene: ATR in the healthy band, no overextension, no spike candles.
# Sell is the mirror image.
#
# Confidence: starts at 62 and adds for each extra confirmation (stronger
# trend gap, deeper RSI turn, rising MACD, S/R confluence, clean headroom).
#
# All S/R constants are tunable by the optimizer (module-level UPPER_SNAKE).

MIN_ATR_PCT = 0.04
MAX_ATR_PCT = 0.5
SR_LOOKBACK = 100          # candles scanned for swing highs/lows
SR_TOUCH_TOLERANCE = 0.12  # zone thickness around a level, % of price
SR_MIN_TOUCHES = 2         # touches needed for a level to count as real
SR_HEADROOM_MIN = 0.15     # min distance to next S/R level, % of price
SR_CONFLUENCE_ATR = 0.25   # fast EMA within this ATR of support = confluence
SR_BREAKOUT_CONFIRM = 0.05 # close beyond level by this % = breakout, not rejection


def _find_sr_levels(candles, lookback, tolerance_pct, min_touches):
    """
    Detect support (below price) and resistance (above price) levels from
    swing highs/lows clustered within tolerance. Returns (supports, resistances).
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
        return [sum(g) / len(g) for g in groups if len(g) >= min_touches]

    return cluster(swing_lows), cluster(swing_highs)


def _sr_context(close, fast_ema, atr, supports, resistances,
                tolerance_pct, headroom_min, confluence_atr, breakout_confirm):
    """
    Judge the S/R context for a pullback entry at `close`.

    Returns (landed_on_support, landed_on_resistance, trap_buy, trap_sell,
             buy_bonus, sell_bonus, note).

      landed_on_support  — close sits on a real support (buy pullback quality)
      landed_on_resistance — close sits on real resistance (sell pullback quality)
      trap_buy  — price just broke BELOW support; longs are retesting from
                  underneath (broken support = new resistance). Block buys.
      trap_sell — price just broke ABOVE resistance; block sells.
      bonus     — confluence (support + fast EMA) and headroom rewards.
    """
    tol = tolerance_pct / 100.0
    # Keep recently-broken levels (within the trap window) so traps are detected
    trap_band = headroom_min * 4 / 100.0
    near_res = [r for r in resistances if r > close * (1 - trap_band)]
    near_sup = [s for s in supports if s < close * (1 + trap_band)]

    nearest_res = min(near_res) if near_res else None
    nearest_sup = max(near_sup) if near_sup else None

    on_support = False
    on_resistance = False
    trap_buy = False
    trap_sell = False
    buy_bonus = 0
    sell_bonus = 0
    notes = []

    if nearest_sup is not None:
        dist_sup = close - nearest_sup
        dist_sup_pct = dist_sup / close * 100
        if abs(dist_sup) <= atr * 0.35 or (0 <= dist_sup_pct <= tolerance_pct):
            on_support = True
            buy_bonus += 4
            notes.append(f"pullback onto support {nearest_sup:.2f}")
            if abs(fast_ema - nearest_sup) <= atr * confluence_atr:
                buy_bonus += 5
                notes.append("EMA+support confluence")
        elif dist_sup_pct < -breakout_confirm and dist_sup_pct > -headroom_min * 4:
            # Broke below support recently: broken support acts as resistance
            trap_buy = True
            notes.append(f"support {nearest_sup:.2f} broken below")

    if nearest_res is not None:
        dist_res = nearest_res - close
        dist_res_pct = dist_res / close * 100
        if abs(dist_res) <= atr * 0.35 or (-dist_res_pct <= tolerance_pct):
            on_resistance = True
            sell_bonus += 4
            notes.append(f"pullback onto resistance {nearest_res:.2f}")
            if abs(fast_ema - nearest_res) <= atr * confluence_atr:
                sell_bonus += 5
                notes.append("EMA+resistance confluence")
        elif dist_res_pct < -breakout_confirm and dist_res_pct > -headroom_min * 4:
            trap_sell = True
            notes.append(f"resistance {nearest_res:.2f} broken above")

    if nearest_res is not None:
        headroom_pct = (nearest_res - close) / close * 100
        if headroom_pct > headroom_min * 3:
            buy_bonus += 3
            notes.append("clear headroom to resistance")
    else:
        buy_bonus += 2  # no overhead resistance at all — open sky

    if nearest_sup is not None:
        room_below_pct = (close - nearest_sup) / close * 100
        if room_below_pct > headroom_min * 3:
            sell_bonus += 3
            notes.append("clear room to support")
    else:
        sell_bonus += 2

    return (on_support, on_resistance, trap_buy, trap_sell,
            buy_bonus, sell_bonus, "; ".join(notes))


def evaluate(candles, features):
    close = features.get("close", 0) or 0
    atr = features.get("atr", 0) or 0
    rsi = features.get("rsi", 50) or 50
    rsi_prev = features.get("rsi_prev", rsi)
    macd_hist = features.get("macd", 0) or 0
    macd_hist_prev = features.get("macd_prev", macd_hist)
    fast = features.get("ema_fast")
    slow = features.get("ema_slow")
    close_prev = features.get("close_prev", close)

    if len(candles) < 40 or close <= 0 or fast is None or slow is None or atr <= 0:
        return {"direction": "neutral", "confidence": 0, "reason": "Not enough data"}

    # --- market hygiene filters ---
    atr_pct = atr / close * 100
    if atr_pct < MIN_ATR_PCT:
        return {"direction": "neutral", "confidence": 0,
                "reason": "Volatility too low — gold scalps need movement"}
    if atr_pct > MAX_ATR_PCT:
        return {"direction": "neutral", "confidence": 0,
                "reason": "Volatility extreme (news spike) — standing aside"}

    last = candles[-1]
    candle_range = last["high"] - last["low"]
    if candle_range > atr * 3:
        return {"direction": "neutral", "confidence": 0,
                "reason": "Abnormally large candle — likely spike, skipping"}

    distance_to_fast = abs(close - fast)
    if distance_to_fast > atr * 0.6:
        return {"direction": "neutral", "confidence": 0,
                "reason": "Price overextended from fast EMA — waiting for pullback"}

    # --- trend regime ---
    bull_trend = fast > slow and close > slow
    bear_trend = fast < slow and close < slow
    if not bull_trend and not bear_trend:
        return {"direction": "neutral", "confidence": 0, "reason": "Trend unclear"}

    trend_gap_pct = abs(fast - slow) / close * 100
    if trend_gap_pct < 0.005:
        return {"direction": "neutral", "confidence": 0, "reason": "EMAs too close — no trend strength"}

    pullback_ok = distance_to_fast <= atr * 0.35

    # --- support/resistance context ---
    supports, resistances = _find_sr_levels(
        candles, SR_LOOKBACK, SR_TOUCH_TOLERANCE, SR_MIN_TOUCHES
    )
    (on_support, on_resistance, trap_buy, trap_sell,
     buy_bonus, sell_bonus, sr_note) = _sr_context(
        close, fast, atr, supports, resistances,
        SR_TOUCH_TOLERANCE, SR_HEADROOM_MIN, SR_CONFLUENCE_ATR,
        SR_BREAKOUT_CONFIRM
    )

    score = 0
    if pullback_ok:
        score += 1

    if bull_trend:
        candle_bullish = close > close_prev
        macd_ok = macd_hist >= macd_hist_prev * 0.5
        rsi_turned_up = rsi_prev < 50 and rsi > rsi_prev and rsi > 42

        if not (pullback_ok and candle_bullish and macd_ok and rsi_turned_up):
            return {"direction": "neutral", "confidence": 0,
                    "reason": "Uptrend but no completed pullback turn yet"}
        if trap_buy:
            return {"direction": "neutral", "confidence": 0,
                    "reason": f"Skip buy — broken support overhead: {sr_note}"}

        confidence = 62 + buy_bonus
        if trend_gap_pct > 0.02:
            confidence += 6
        if macd_hist > 0:
            confidence += 5
        if rsi_prev < 42:
            confidence += 4
        if last["close"] > last["open"] and (last["close"] - last["low"]) > candle_range * 0.6:
            confidence += 3
        return {"direction": "buy", "confidence": min(confidence, 90),
                "reason": f"Uptrend pullback on support zone | RSI {rsi:.0f} turned up"
                          + (f" | {sr_note}" if sr_note else "")}

    candle_bearish = close < close_prev
    macd_ok = macd_hist <= macd_hist_prev * 0.5
    rsi_turned_down = rsi_prev > 50 and rsi < rsi_prev and rsi < 58

    if not (pullback_ok and candle_bearish and macd_ok and rsi_turned_down):
        return {"direction": "neutral", "confidence": 0,
                "reason": "Downtrend but no completed pullback turn yet"}
    if trap_sell:
        return {"direction": "neutral", "confidence": 0,
                "reason": f"Skip sell — broken resistance below: {sr_note}"}

    confidence = 62 + sell_bonus
    if trend_gap_pct > 0.02:
        confidence += 6
    if macd_hist < 0:
        confidence += 5
    if rsi_prev > 58:
        confidence += 4
    if last["close"] < last["open"] and (last["high"] - last["close"]) > candle_range * 0.6:
        confidence += 3
    return {"direction": "sell", "confidence": min(confidence, 90),
            "reason": f"Downtrend pullback on resistance zone | RSI {rsi:.0f} turned down"
                      + (f" | {sr_note}" if sr_note else "")}

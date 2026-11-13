# M5 Scalping — EMA Stack Momentum Burst
# Idea (classic 8/21 EMA momentum scalping): enter when the fast EMA crosses the
# slow EMA in the direction of the candle, confirmed by a MACD histogram that has
# just flipped sign. Exits are handled by SL/TP from your symbol settings.
# Buy: fast EMA crosses above slow EMA, MACD histogram positive, candle closed up.
# Sell: mirror image.


def evaluate(candles, features):
    fast = features.get("ema_fast")
    slow = features.get("ema_slow")
    macd_hist = features.get("macd", 0) or 0
    macd_hist_prev = features.get("macd_prev", macd_hist)
    close = features.get("close", 0) or 0
    close_prev = features.get("close_prev", close)

    if fast is None or slow is None or close <= 0 or len(candles) < 30:
        return {"direction": "neutral", "confidence": 0, "reason": "Not enough data"}

    ema_cross_up = fast > slow
    ema_cross_down = fast < slow
    candle_bullish = close > close_prev
    candle_bearish = close < close_prev

    # Fresh momentum: histogram just flipped to positive (was <= 0 before)
    macd_flip_up = macd_hist > 0 and macd_hist_prev <= 0
    macd_flip_down = macd_hist < 0 and macd_hist_prev >= 0

    if ema_cross_up and candle_bullish and macd_flip_up:
        strength = abs(fast - slow) / close * 10000
        conf = min(60 + strength * 10, 85)
        return {"direction": "buy", "confidence": round(conf),
                "reason": "EMA crossed up with fresh bullish MACD momentum"}
    if ema_cross_down and candle_bearish and macd_flip_down:
        strength = abs(fast - slow) / close * 10000
        conf = min(60 + strength * 10, 85)
        return {"direction": "sell", "confidence": round(conf),
                "reason": "EMA crossed down with fresh bearish MACD momentum"}

    return {"direction": "neutral", "confidence": 0, "reason": "No fresh momentum cross"}

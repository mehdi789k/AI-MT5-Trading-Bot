# M5 Scalping — Range Breakout Fake-Out Re-entry
# Idea (liquidity-sweep scalping): price breaks out of a recent range, fails to
# hold (traps breakout traders), and closes back inside the range. Enter against
# the failed breakout. Stop goes beyond the sweep extreme; targets come from your
# symbol SL/TP settings.
# Buy: a candle closed below the 20-bar range low, then the latest candle closed
#      back above that low.
# Sell: a candle closed above the 20-bar range high, then the latest candle closed
#       back below that high.


def evaluate(candles, features):
    rsi = features.get("rsi", 50) or 50

    if len(candles) < 25:
        return {"direction": "neutral", "confidence": 0, "reason": "Not enough data"}

    lookback = candles[-25:-1]  # range defined before the trigger candle
    last = candles[-1]
    last_close = last["close"]

    range_high = max(c["high"] for c in lookback)
    range_low = min(c["low"] for c in lookback)
    if range_high <= range_low:
        return {"direction": "neutral", "confidence": 0, "reason": "Degenerate range"}

    prev = candles[-2]

    # Failed breakdown -> buy: previous candle closed below range low, we closed back inside
    if prev["close"] < range_low and last_close > range_low:
        swept = range_low - prev["close"]
        if swept <= 0:
            return {"direction": "neutral", "confidence": 0, "reason": "No meaningful sweep"}
        conf = min(62 + (50 - abs(rsi - 50)) * 0.5, 84)
        return {"direction": "buy", "confidence": round(conf),
                "reason": "Broke range low, failed to hold and closed back inside — bear trap buy"}

    # Failed breakout -> sell
    if prev["close"] > range_high and last_close < range_high:
        swept = prev["close"] - range_high
        if swept <= 0:
            return {"direction": "neutral", "confidence": 0, "reason": "No meaningful sweep"}
        conf = min(62 + (50 - abs(rsi - 50)) * 0.5, 84)
        return {"direction": "sell", "confidence": round(conf),
                "reason": "Broke range high, failed to hold and closed back inside — bull trap sell"}

    return {"direction": "neutral", "confidence": 0, "reason": "No failed breakout on range edges"}

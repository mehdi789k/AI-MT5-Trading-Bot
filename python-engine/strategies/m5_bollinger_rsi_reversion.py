# M5 Scalping — Bollinger Band + RSI Mean Reversion
# Idea (popular range scalping setup): in quiet, ranging markets, price sticking
# out of the 20-period Bollinger Band with an extreme RSI tends to snap back.
# Buy: candle closes below the lower band and RSI < 30.
# Sell: candle closes above the upper band and RSI > 70.
# Filters: skip when volatility is expanding (bands wide) — mean reversion works
# best in compression, not in strong trends.


def evaluate(candles, features):
    rsi = features.get("rsi", 50) or 50
    close = features.get("close", 0) or 0

    if len(candles) < 30 or close <= 0:
        return {"direction": "neutral", "confidence": 0, "reason": "Not enough data"}

    period = 20
    window = [c["close"] for c in candles[-period:]]
    mean = sum(window) / len(window)
    variance = sum((x - mean) ** 2 for x in window) / len(window)
    std = variance ** 0.5
    if std <= 0:
        return {"direction": "neutral", "confidence": 0, "reason": "No dispersion in closes"}

    upper = mean + 2 * std
    lower = mean - 2 * std
    band_width_pct = (upper - lower) / mean * 100
    if band_width_pct > 1.5:
        return {"direction": "neutral", "confidence": 0,
                "reason": "Bands too wide (trending/volatile) — mean reversion skipped"}

    deviation = (close - mean) / std

    if close < lower and rsi < 30:
        conf = min(60 + abs(rsi - 30) * 1.5, 88)
        return {"direction": "buy", "confidence": round(conf),
                "reason": f"Closed {abs(deviation):.1f} sigma below mean with RSI {rsi:.0f} — oversold snap-back"}
    if close > upper and rsi > 70:
        conf = min(60 + abs(rsi - 70) * 1.5, 88)
        return {"direction": "sell", "confidence": round(conf),
                "reason": f"Closed {deviation:.1f} sigma above mean with RSI {rsi:.0f} — overbought snap-back"}

    return {"direction": "neutral", "confidence": 0, "reason": "Price inside bands or RSI not extreme"}

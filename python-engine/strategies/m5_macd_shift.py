# M5 Scalping — MACD Momentum Shift with Volatility Filter
# Idea (MACD flip scalping): trade the moment the MACD histogram changes sign —
# momentum is turning now, not later. The flip must be meaningful (not a flat
# noise wiggle) and the market must have enough ATR movement to pay for spread.
# Buy: histogram flips to positive with a minimum size.
# Sell: histogram flips to negative with a minimum size.


def evaluate(candles, features):
    macd_hist = features.get("macd", 0) or 0
    macd_hist_prev = features.get("macd_prev", macd_hist)
    atr = features.get("atr", 0) or 0
    close = features.get("close", 0) or 0
    volatility = features.get("volatility", 0) or 0

    if close <= 0 or len(candles) < 35:
        return {"direction": "neutral", "confidence": 0, "reason": "Not enough data"}

    if atr / close * 100 < 0.02:
        return {"direction": "neutral", "confidence": 0, "reason": "Volatility too low for M5 scalp"}
    if volatility < 0.05:
        return {"direction": "neutral", "confidence": 0, "reason": "Market flat — no momentum to catch"}

    # Histogram magnitude must exceed a fraction of ATR to count as a real shift
    min_shift = atr * 0.05
    flipped_up = macd_hist > 0 and macd_hist_prev <= 0 and macd_hist >= min_shift
    flipped_down = macd_hist < 0 and macd_hist_prev >= 0 and abs(macd_hist) >= min_shift

    if flipped_up:
        strength = macd_hist / min_shift
        conf = min(58 + strength * 10, 82)
        return {"direction": "buy", "confidence": round(conf),
                "reason": "MACD histogram flipped positive with momentum above noise"}
    if flipped_down:
        strength = abs(macd_hist) / min_shift
        conf = min(58 + strength * 10, 82)
        return {"direction": "sell", "confidence": round(conf),
                "reason": "MACD histogram flipped negative with momentum above noise"}

    return {"direction": "neutral", "confidence": 0, "reason": "No MACD sign change"}

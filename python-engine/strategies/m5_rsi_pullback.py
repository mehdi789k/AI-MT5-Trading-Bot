# M5 Scalping — Trend Pullback with RSI Trigger
# Idea (common EMA+RSI scalping setup): trade only with the short-term trend,
# then enter on the RSI pullback turning back in the trend direction.
# Buy: fast EMA above slow EMA (uptrend) and RSI dipped below 40 then turns up.
# Sell: fast EMA below slow EMA (downtrend) and RSI climbed above 60 then turns down.
# Best on liquid symbols (major FX pairs, gold) during London/NY sessions.


def evaluate(candles, features):
    rsi = features.get("rsi", 50) or 50
    rsi_prev = features.get("rsi_prev", rsi)
    fast = features.get("ema_fast")
    slow = features.get("ema_slow")
    atr = features.get("atr", 0) or 0
    close = features.get("close", 0) or 0

    if fast is None or slow is None or close <= 0 or len(candles) < 30:
        return {"direction": "neutral", "confidence": 0, "reason": "Not enough data"}

    # Skip dead markets: a scalp needs room to move.
    atr_pct = atr / close * 100
    if atr_pct < 0.02:
        return {"direction": "neutral", "confidence": 0, "reason": "Volatility too low for M5 scalp"}

    trend_gap_pct = abs(fast - slow) / close * 100

    if fast > slow:
        if rsi_prev < 40 and rsi >= 40:
            conf = min(60 + trend_gap_pct * 20, 85)
            return {"direction": "buy", "confidence": round(conf),
                    "reason": "Uptrend pullback ended: RSI turned up through 40"}
        if rsi > 65:
            return {"direction": "neutral", "confidence": 0,
                    "reason": "Uptrend but overextended — wait for a pullback"}
        return {"direction": "neutral", "confidence": 0, "reason": "Uptrend, waiting for RSI pullback"}

    if fast < slow:
        if rsi_prev > 60 and rsi <= 60:
            conf = min(60 + trend_gap_pct * 20, 85)
            return {"direction": "sell", "confidence": round(conf),
                    "reason": "Downtrend pullback ended: RSI turned down through 60"}
        if rsi < 35:
            return {"direction": "neutral", "confidence": 0,
                    "reason": "Downtrend but overextended — wait for a pullback"}
        return {"direction": "neutral", "confidence": 0, "reason": "Downtrend, waiting for RSI pullback"}

    return {"direction": "neutral", "confidence": 0, "reason": "No clear trend"}

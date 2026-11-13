export const NEW_STRATEGY_TEMPLATE = `# Strategy template
# evaluate() runs on every engine cycle for the symbol this strategy is assigned to.
# candles: list of dicts with time, open, high, low, close, volume (the latest candle is last)
# features: rsi, rsi_prev, atr, macd, ema_fast, ema_slow, trend, volatility, close
# Return direction ("buy", "sell" or "neutral"), confidence (0-100) and a short reason.

def evaluate(candles, features):
    fast = features.get("ema_fast")
    slow = features.get("ema_slow")
    macd = features.get("macd", 0) or 0

    if fast is None or slow is None:
        return {"direction": "neutral", "confidence": 0, "reason": "Not enough data"}

    if fast > slow and macd > 0:
        return {"direction": "buy", "confidence": 65, "reason": "Fast EMA above slow EMA with positive MACD"}
    if fast < slow and macd < 0:
        return {"direction": "sell", "confidence": 65, "reason": "Fast EMA below slow EMA with negative MACD"}

    return {"direction": "neutral", "confidence": 0, "reason": "No clear trend"}
`;

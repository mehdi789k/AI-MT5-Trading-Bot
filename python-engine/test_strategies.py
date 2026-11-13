"""Syntax + sandbox-execution check for the bundled M5 strategies.

Reimplements the sandbox rules (restricted builtins, allowed imports) without
numpy, since this sandbox environment has no numpy installed. Indicators are
recomputed with a lightweight numpy-free feature extractor that matches the
feature keys the engine injects.
"""
import math
import os
import statistics
import sys


def rsi(closes, period=14):
    if len(closes) < period + 1:
        return 50.0
    deltas = [closes[i] - closes[i - 1] for i in range(1, len(closes))]
    gains = [max(d, 0.0) for d in deltas]
    losses = [max(-d, 0.0) for d in deltas]
    avg_gain = sum(gains[:period]) / period
    avg_loss = sum(losses[:period]) / period
    for i in range(period, len(deltas)):
        avg_gain = (avg_gain * (period - 1) + gains[i]) / period
        avg_loss = (avg_loss * (period - 1) + losses[i]) / period
    if avg_loss == 0:
        return 100.0
    return 100.0 - 100.0 / (1.0 + avg_gain / avg_loss)


def ema(values, period):
    if len(values) < period:
        return None
    k = 2 / (period + 1)
    e = sum(values[:period]) / period
    for v in values[period:]:
        e = v * k + e * (1 - k)
    return e


def macd_hist(closes):
    if len(closes) < 35:
        return 0.0
    fast_series = _ema_series(closes, 12)
    slow_series = _ema_series(closes, 26)
    macd_line = [f - s for f, s in zip(fast_series, slow_series)][-35:]
    k = 2 / (9 + 1)
    sig = sum(macd_line[:9]) / 9
    for v in macd_line[9:]:
        sig = v * k + sig * (1 - k)
    return macd_line[-1] - sig


def _ema_series(values, period):
    k = 2 / (period + 1)
    e = sum(values[:period]) / period
    out = [e]
    for v in values[period:]:
        e = v * k + e * (1 - k)
        out.append(e)
    return out


def extract_features(candles):
    closes = [c["close"] for c in candles]
    highs = [c["high"] for c in candles]
    lows = [c["low"] for c in candles]
    trs = [max(highs[i] - lows[i], abs(highs[i] - closes[i - 1]), abs(lows[i] - closes[i - 1]))
           for i in range(1, len(closes))]
    atr = sum(trs[-14:]) / len(trs[-14:]) if trs else 0.0
    sma = sum(closes[-20:]) / 20
    return {
        "rsi": rsi(closes),
        "atr": atr,
        "macd": macd_hist(closes),
        "ema_fast": ema(closes, 9),
        "ema_slow": ema(closes, 21),
        "trend": (closes[-1] - sma) / sma * 100 if sma else 0.0,
        "volatility": (statistics.pstdev(closes[-20:]) / sma * 100) if sma else 0.0,
        "close": closes[-1],
        "volume": candles[-1].get("volume", 0),
    }


def prev_features(candles):
    return extract_features(candles[:-1]) if len(candles) >= 2 else extract_features(candles)


SAFE_BUILTINS = {
    "abs": abs, "min": min, "max": max, "round": round, "sum": sum, "len": len,
    "range": range, "int": int, "float": float, "str": str, "bool": bool,
    "list": list, "dict": dict, "tuple": tuple, "set": set, "sorted": sorted,
    "reversed": reversed, "enumerate": enumerate, "zip": zip, "map": map,
    "filter": filter, "any": any, "all": all, "print": print,
    "True": True, "False": False, "None": None,
}


def make_candles(n=200, base=2400.0):
    candles = []
    price = base
    for i in range(n):
        drift = 0.3 * math.sin(i / 9) + (0.15 if i % 3 else -0.1)
        o = price
        c = o + drift
        candles.append({
            "time": f"2026-01-01T00:{i % 60:02d}:00Z",
            "open": o, "high": max(o, c) + 0.2, "low": min(o, c) - 0.2,
            "close": c, "volume": 100 + i,
        })
        price = c
    return candles


def main():
    strategies_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "strategies")
    candles = make_candles()
    feats = extract_features(candles)
    prev = prev_features(candles)
    feats.update({"rsi_prev": prev["rsi"], "close_prev": prev["close"], "macd_prev": prev["macd"]})

    names = sorted(f for f in os.listdir(strategies_dir) if f.endswith(".py"))
    ok = True
    for name in names:
        with open(os.path.join(strategies_dir, name), encoding="utf-8") as fh:
            code = fh.read()
        namespace = {"__builtins__": SAFE_BUILTINS}
        try:
            exec(compile(code, name, "exec"), namespace)
            signal = namespace["evaluate"](candles, feats)
            if not isinstance(signal, dict) or "direction" not in signal:
                raise ValueError("evaluate() must return a dict with 'direction'")
            if signal["direction"] not in ("buy", "sell", "neutral"):
                raise ValueError(f"invalid direction {signal['direction']!r}")
            print(f"OK   {name}: {signal['direction']} conf={signal['confidence']} — {signal['reason']}")
        except Exception as e:
            ok = False
            print(f"FAIL {name}: {e}")

    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()

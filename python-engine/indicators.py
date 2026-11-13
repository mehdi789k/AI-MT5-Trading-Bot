"""
Technical indicator calculations for feature extraction.
All functions accept a list of float values (oldest first, newest last)
and return the latest value or list of values.
"""

import numpy as np
from typing import List, Tuple


def ema(values: List[float], period: int) -> List[float]:
    """Exponential Moving Average."""
    if len(values) < period:
        return [np.nan] * len(values)
    arr = np.array(values, dtype=float)
    multiplier = 2 / (period + 1)
    result = np.full(len(arr), np.nan)
    result[period - 1] = np.mean(arr[:period])
    for i in range(period, len(arr)):
        result[i] = arr[i] * multiplier + result[i - 1] * (1 - multiplier)
    return result.tolist()


def rsi(values: List[float], period: int = 14) -> float:
    """Relative Strength Index — returns latest value (0-100)."""
    if len(values) < period + 1:
        return 50.0
    arr = np.array(values, dtype=float)
    deltas = np.diff(arr)
    gains = np.where(deltas > 0, deltas, 0.0)
    losses = np.where(deltas < 0, -deltas, 0.0)
    avg_gain = np.mean(gains[:period])
    avg_loss = np.mean(losses[:period])
    for i in range(period, len(deltas)):
        avg_gain = (avg_gain * (period - 1) + gains[i]) / period
        avg_loss = (avg_loss * (period - 1) + losses[i]) / period
    if avg_loss == 0:
        return 100.0
    rs = avg_gain / avg_loss
    return 100.0 - (100.0 / (1.0 + rs))


def atr(highs: List[float], lows: List[float], closes: List[float], period: int = 14) -> float:
    """Average True Range — returns latest value."""
    if len(closes) < period + 1:
        return 0.0
    tr_values = []
    for i in range(1, len(closes)):
        tr = max(
            highs[i] - lows[i],
            abs(highs[i] - closes[i - 1]),
            abs(lows[i] - closes[i - 1]),
        )
        tr_values.append(tr)
    if len(tr_values) < period:
        return np.mean(tr_values) if tr_values else 0.0
    return float(np.mean(tr_values[-period:]))


def macd(values: List[float], fast: int = 12, slow: int = 26, signal: int = 9) -> Tuple[float, float, float]:
    """MACD — returns (macd_line, signal_line, histogram) latest values."""
    if len(values) < slow + signal:
        return 0.0, 0.0, 0.0
    ema_fast = np.array(ema(values, fast))
    ema_slow = np.array(ema(values, slow))
    macd_line = ema_fast - ema_slow
    valid_macd = macd_line[~np.isnan(macd_line)]
    if len(valid_macd) < signal:
        return 0.0, 0.0, 0.0
    signal_line = np.array(ema(valid_macd.tolist(), signal))
    latest_macd = valid_macd[-1]
    latest_signal = signal_line[~np.isnan(signal_line)][-1] if not np.all(np.isnan(signal_line)) else 0.0
    histogram = latest_macd - latest_signal
    return float(latest_macd), float(latest_signal), float(histogram)


def trend_strength(values: List[float], period: int = 20) -> float:
    """Normalized trend strength: (current - SMA) / SMA. Positive = uptrend."""
    if len(values) < period:
        return 0.0
    sma = np.mean(values[-period:])
    if sma == 0:
        return 0.0
    return float((values[-1] - sma) / sma * 100)


def volatility(values: List[float], period: int = 20) -> float:
    """Normalized volatility: std / mean * 100."""
    if len(values) < period:
        return 0.0
    window = values[-period:]
    mean = np.mean(window)
    if mean == 0:
        return 0.0
    return float(np.std(window) / mean * 100)


def extract_features(candles: List[dict]) -> dict:
    """
    Extract all features from a list of OHLCV candle dicts.
    Each candle: {time, open, high, low, close, volume}
    Returns a dict of the latest feature values.
    """
    closes = [c["close"] for c in candles]
    highs = [c["high"] for c in candles]
    lows = [c["low"] for c in candles]
    volumes = [c.get("volume", 0) for c in candles]

    ema_fast_list = ema(closes, 9)
    ema_slow_list = ema(closes, 21)
    macd_line, macd_signal, macd_hist = macd(closes)

    latest = candles[-1]
    dt = latest.get("time", "")

    return {
        "rsi": round(rsi(closes, 14), 4),
        "atr": round(atr(highs, lows, closes, 14), 5),
        "macd": round(macd_hist, 5),
        "ema_fast": round(ema_fast_list[-1], 5) if ema_fast_list and not np.isnan(ema_fast_list[-1]) else None,
        "ema_slow": round(ema_slow_list[-1], 5) if ema_slow_list and not np.isnan(ema_slow_list[-1]) else None,
        "trend": round(trend_strength(closes, 20), 4),
        "volatility": round(volatility(closes, 20), 4),
        "close": round(latest["close"], 5),
        "volume": volumes[-1] if volumes else 0,
    }

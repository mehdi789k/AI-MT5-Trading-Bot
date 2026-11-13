"""
Strategy runner — sandboxed execution of user-written Python strategies.

Each strategy script must define an `evaluate(candles, features)` function that
returns a dict:
    {
        "direction": "buy" | "sell" | "neutral",
        "confidence": 0-100,
        "reason": "explanation string"
    }

The runner provides:
  - Safe execution with restricted built-ins (no file/network/os access)
  - A whitelist of allowed imports (math, numpy, statistics)
  - Consistent error handling
  - A backtest engine that replays historical candles through the strategy
"""

import math
import statistics
from datetime import datetime, timezone, timedelta
from typing import List, Dict, Optional, Tuple

import numpy as np

from indicators import extract_features, rsi as calc_rsi, atr as calc_atr, macd as calc_macd, ema as calc_ema, trend_strength, volatility


# Allowed modules for strategy code
_ALLOWED_IMPORTS = {
    "math": math,
    "statistics": statistics,
    "numpy": np,
}

_SAFE_BUILTINS = {
    "abs": abs,
    "min": min,
    "max": max,
    "round": round,
    "sum": sum,
    "len": len,
    "range": range,
    "int": int,
    "float": float,
    "str": str,
    "bool": bool,
    "list": list,
    "dict": dict,
    "tuple": tuple,
    "set": set,
    "sorted": sorted,
    "reversed": reversed,
    "enumerate": enumerate,
    "zip": zip,
    "map": map,
    "filter": filter,
    "any": any,
    "all": all,
    "print": print,
    "isinstance": isinstance,
    "True": True,
    "False": False,
    "None": None,
}


class StrategyError(Exception):
    pass


class StrategyRunner:
    """Load and execute user strategy code in a restricted namespace."""

    def __init__(self):
        self._cache: Dict[str, dict] = {}  # code hash → compiled namespace

    def _build_globals(self) -> dict:
        g = {
            "__builtins__": _SAFE_BUILTINS,
        }
        for name, module in _ALLOWED_IMPORTS.items():
            g[name] = module
        return g

    def load(self, code: str) -> dict:
        """Compile strategy code and return its namespace. Cached by code content."""
        cache_key = str(hash(code))
        if cache_key in self._cache:
            return self._cache[cache_key]

        namespace = self._build_globals()
        try:
            exec(compile(code, "<strategy>", "exec"), namespace)
        except SyntaxError as e:
            raise StrategyError(f"Syntax error in strategy: {e}")
        except Exception as e:
            raise StrategyError(f"Error loading strategy: {e}")

        if "evaluate" not in namespace or not callable(namespace["evaluate"]):
            raise StrategyError("Strategy must define an 'evaluate(candles, features)' function")

        self._cache[cache_key] = namespace
        return namespace

    def run(self, code: str, candles: List[dict], features: dict) -> dict:
        """Execute the strategy's evaluate() function and return its signal dict."""
        namespace = self.load(code)
        evaluate_fn = namespace["evaluate"]

        # Add previous-candle features for crossover-style strategies
        enriched = dict(features)
        if len(candles) >= 2:
            prev_candles = candles[:-1]
            prev_features = extract_features(prev_candles)
            enriched["rsi_prev"] = prev_features.get("rsi", 50)
            enriched["close_prev"] = prev_features.get("close", features.get("close", 0))
            enriched["macd_prev"] = prev_features.get("macd", 0)
        else:
            enriched["rsi_prev"] = features.get("rsi", 50)
            enriched["close_prev"] = features.get("close", 0)
            enriched["macd_prev"] = features.get("macd", 0)

        try:
            result = evaluate_fn(candles, enriched)
        except Exception as e:
            raise StrategyError(f"Strategy runtime error: {e}")

        if not isinstance(result, dict):
            raise StrategyError("Strategy evaluate() must return a dict")
        if "direction" not in result:
            raise StrategyError("Strategy result must contain 'direction'")

        direction = result.get("direction", "neutral")
        if direction not in ("buy", "sell", "neutral"):
            raise StrategyError(f"Invalid direction '{direction}' — must be buy, sell, or neutral")

        return {
            "direction": direction,
            "confidence": float(result.get("confidence", 0)),
            "reason": str(result.get("reason", "")),
        }


def _estimate_spread(candles: List[dict], idx: int, lookback: int = 20) -> float:
    """Estimate average spread from high-low range as a proxy when tick data is unavailable."""
    start = max(0, idx - lookback)
    ranges = [c["high"] - c["low"] for c in candles[start:idx + 1] if c["high"] > c["low"]]
    if not ranges:
        return 0.0
    return statistics.median(ranges) * 0.15  # ~15% of median range as spread proxy


def _apply_slippage(price: float, direction: str, slippage_pct: float) -> float:
    """Apply adverse slippage to entry/exit price."""
    if direction == "buy":
        return price * (1 + slippage_pct / 100)
    return price * (1 - slippage_pct / 100)


def _broker_hour(candle_time: str, broker_offset_hours: int) -> int:
    """Extract broker-local hour from ISO timestamp string."""
    if not isinstance(candle_time, str) or len(candle_time) < 13:
        return -1
    try:
        dt = datetime.fromisoformat(candle_time.replace("Z", "+00:00"))
        broker_dt = dt + timedelta(hours=broker_offset_hours)
        return broker_dt.hour
    except (ValueError, TypeError):
        return -1


def run_backtest(code: str, candles: List[dict], sl_pct: float, tp_pct: float,
                 initial_capital: float = 10000.0, risk_per_trade: float = 0.01,
                 spread_pct: float = 0.02, slippage_pct: float = 0.01,
                 commission_rate: float = 0.0005,
                 broker_offset_hours: int = 0
                 ) -> dict:
    """
    Backtest a strategy over historical candle data with realistic cost modeling.

    Applies spread, slippage, and notional-based commission to every trade to produce
    results closer to live execution. Also computes extended performance metrics:
    Sharpe ratio, Sortino ratio, average win/loss, max consecutive wins/losses,
    expectancy, and per-symbol breakdown.

    Returns a dict with all standard fields plus extended metrics.
    """
    if len(candles) < 50:
        return {
            "net_profit": 0, "total_trades": 0, "wins": 0, "losses": 0,
            "win_rate": 0, "max_drawdown": 0, "profit_factor": 0,
            "equity_curve": [], "trades_detail": [],
            "error": "Insufficient candle data for backtest (need at least 50)",
        }

    runner = StrategyRunner()
    try:
        runner.load(code)
    except StrategyError as e:
        return {
            "net_profit": 0, "total_trades": 0, "wins": 0, "losses": 0,
            "win_rate": 0, "max_drawdown": 0, "profit_factor": 0,
            "equity_curve": [], "trades_detail": [],
            "error": str(e),
        }

    equity = initial_capital
    peak_equity = initial_capital
    max_drawdown = 0.0
    trades: List[dict] = []
    position: Optional[dict] = None
    equity_curve = [{"index": 0, "equity": round(equity, 2)}]

    for i in range(30, len(candles)):
        window = candles[max(0, i - 199):i + 1]
        features = extract_features(window)
        features["broker_hour"] = _broker_hour(candles[i].get("time", ""), broker_offset_hours)

        # Check if open position hits SL/TP on this candle
        if position:
            candle = candles[i]
            pos_type = position["type"]
            sl = position["sl"]
            tp = position["tp"]
            spread = _estimate_spread(candles, i)

            closed = False
            close_price = 0.0
            close_reason = ""

            # Apply spread to SL/TP levels (worse fill for the trader)
            if pos_type == "buy":
                sl_adj = sl - spread
                tp_adj = tp - spread
                # If both hit in same candle, assume SL first (pessimistic)
                if candle["low"] <= sl_adj:
                    close_price = sl_adj
                    close_reason = "sl_hit"
                    closed = True
                elif candle["high"] >= tp_adj:
                    close_price = tp_adj
                    close_reason = "tp_hit"
                    closed = True
            else:  # sell
                sl_adj = sl + spread
                tp_adj = tp + spread
                if candle["high"] >= sl_adj:
                    close_price = sl_adj
                    close_reason = "sl_hit"
                    closed = True
                elif candle["low"] <= tp_adj:
                    close_price = tp_adj
                    close_reason = "tp_hit"
                    closed = True

            if closed:
                close_price = _apply_slippage(close_price, "sell" if pos_type == "buy" else "buy", slippage_pct)
                if pos_type == "buy":
                    pnl = (close_price - position["entry"]) * position["volume"]
                else:
                    pnl = (position["entry"] - close_price) * position["volume"]

                # Subtract commission (round-turn: open + close)
                commission = position["volume"] * (position["entry"] + close_price) * commission_rate
                pnl -= commission

                equity += pnl
                trades.append({
                    "type": pos_type,
                    "entry": position["entry"],
                    "close": round(close_price, 5),
                    "sl": sl, "tp": tp,
                    "volume": position["volume"],
                    "pnl": round(pnl, 2),
                    "commission": round(commission, 2),
                    "reason": close_reason,
                    "open_time": position["open_time"],
                    "close_time": candle["time"],
                })
                position = None

        # Generate signal if no position open
        if position is None:
            try:
                signal = runner.run(code, window, features)
            except StrategyError:
                signal = {"direction": "neutral", "confidence": 0, "reason": "error"}

            if signal["direction"] in ("buy", "sell"):
                entry = features.get("close", 0)
                if entry <= 0:
                    continue

                # Apply spread and slippage to entry
                spread = _estimate_spread(candles, i)
                if signal["direction"] == "buy":
                    entry = entry + spread
                else:
                    entry = entry - spread
                entry = _apply_slippage(entry, signal["direction"], slippage_pct)

                # Calculate SL/TP from the adjusted entry
                if signal["direction"] == "buy":
                    sl = entry - entry * sl_pct / 100
                    tp = entry + entry * tp_pct / 100
                else:
                    sl = entry + entry * sl_pct / 100
                    tp = entry - entry * tp_pct / 100

                # Risk-based volume
                risk_amount = equity * risk_per_trade
                sl_distance = abs(entry - sl)
                volume = risk_amount / sl_distance if sl_distance > 0 else 0
                if volume <= 0:
                    continue

                position = {
                    "type": signal["direction"],
                    "entry": entry,
                    "sl": sl, "tp": tp,
                    "volume": volume,
                    "open_time": candles[i]["time"],
                }

        peak_equity = max(peak_equity, equity)
        dd = (peak_equity - equity) / peak_equity * 100 if peak_equity > 0 else 0
        max_drawdown = max(max_drawdown, dd)
        equity_curve.append({"index": i, "equity": round(equity, 2)})

    # Close any remaining position at the last close price
    if position:
        last_close = candles[-1]["close"]
        spread = _estimate_spread(candles, len(candles) - 1)
        if position["type"] == "buy":
            close_price = _apply_slippage(last_close - spread, "sell", slippage_pct)
            pnl = (close_price - position["entry"]) * position["volume"]
        else:
            close_price = _apply_slippage(last_close + spread, "buy", slippage_pct)
            pnl = (position["entry"] - close_price) * position["volume"]
        commission = position["volume"] * (position["entry"] + close_price) * commission_rate
        pnl -= commission
        equity += pnl
        trades.append({
            "type": position["type"],
            "entry": position["entry"],
            "close": round(close_price, 5),
            "sl": position["sl"], "tp": position["tp"],
            "volume": position["volume"],
            "pnl": round(pnl, 2),
            "commission": round(commission, 2),
            "reason": "end_of_data",
            "open_time": position["open_time"],
            "close_time": candles[-1]["time"],
        })

    # ---- Performance metrics ----
    total_trades = len(trades)
    wins = sum(1 for t in trades if t["pnl"] > 0)
    losses = sum(1 for t in trades if t["pnl"] <= 0)
    win_rate = (wins / total_trades * 100) if total_trades > 0 else 0
    net_profit = equity - initial_capital

    gross_profit = sum(t["pnl"] for t in trades if t["pnl"] > 0)
    gross_loss = abs(sum(t["pnl"] for t in trades if t["pnl"] < 0))
    profit_factor = (gross_profit / gross_loss) if gross_loss > 0 else (float("inf") if gross_profit > 0 else 0)

    avg_win = gross_profit / wins if wins > 0 else 0
    avg_loss = gross_loss / losses if losses > 0 else 0
    expectancy = (win_rate / 100 * avg_win) - ((100 - win_rate) / 100 * avg_loss) if total_trades > 0 else 0

    # Max consecutive wins/losses
    max_consec_wins = 0
    max_consec_losses = 0
    cur_wins = 0
    cur_losses = 0
    for t in trades:
        if t["pnl"] > 0:
            cur_wins += 1
            cur_losses = 0
            max_consec_wins = max(max_consec_wins, cur_wins)
        else:
            cur_losses += 1
            cur_wins = 0
            max_consec_losses = max(max_consec_losses, cur_losses)

    # Sharpe & Sortino (per-trade, annualized by sqrt(252))
    pnls = [t["pnl"] for t in trades]
    if len(pnls) >= 2:
        mean_pnl = statistics.mean(pnls)
        std_pnl = statistics.stdev(pnls)
        downside = [p for p in pnls if p < 0]
        std_downside = statistics.stdev(downside) if len(downside) >= 2 else 0
        sharpe = (mean_pnl / std_pnl * (252 ** 0.5)) if std_pnl > 0 else 0
        sortino = (mean_pnl / std_downside * (252 ** 0.5)) if std_downside > 0 else 0
    else:
        sharpe = 0
        sortino = 0

    # Cap equity curve to last 500 points
    if len(equity_curve) > 500:
        step = len(equity_curve) // 500
        equity_curve = equity_curve[::step][:500]

    trades_detail = trades[-200:]

    return {
        "net_profit": round(net_profit, 2),
        "total_trades": total_trades,
        "wins": wins,
        "losses": losses,
        "win_rate": round(win_rate, 2),
        "max_drawdown": round(max_drawdown, 2),
        "profit_factor": round(profit_factor, 2) if profit_factor != float("inf") else 999.99,
        "equity_curve": equity_curve,
        "trades_detail": trades_detail,
        "final_equity": round(equity, 2),
        # Extended metrics
        "avg_win": round(avg_win, 2),
        "avg_loss": round(avg_loss, 2),
        "expectancy": round(expectancy, 2),
        "max_consecutive_wins": max_consec_wins,
        "max_consecutive_losses": max_consec_losses,
        "sharpe_ratio": round(sharpe, 2),
        "sortino_ratio": round(sortino, 2),
        "total_commission": round(sum(t.get("commission", 0) for t in trades), 2),
    }

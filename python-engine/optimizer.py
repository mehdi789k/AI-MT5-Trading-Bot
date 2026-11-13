"""
Strategy parameter optimizer.

Extracts tunable numeric constants from a strategy's source code and tunes them
one at a time (coordinate search). Every parameter is visited, each candidate is
backtested with the other parameters at their best values so far, and the
improvements are kept. Scored by a composite risk-adjusted metric.

Usage:
    result = optimize_strategy(code, candles, sl_pct, tp_pct, ...)
    # result["optimized_code"], result["param_changes"], result["best_score"], ...
"""

import re
import time
from typing import List, Tuple, Optional

from strategy_runner import run_backtest


# Pattern: module-level UPPER_SNAKE constants assigned a numeric literal
_PARAM_PATTERN = re.compile(
    r'^([A-Z][A-Z0-9_]*)\s*=\s*(-?\d+\.?\d*)',
    re.MULTILINE
)

# Relative offsets applied to each parameter's current value
DEFAULT_STEPS = [-0.2, 0.2, -0.4, 0.4]
# Wall-clock cap so a long optimization cannot stall the engine indefinitely
MAX_OPTIMIZE_SECONDS = 600


def extract_parameters(code: str) -> List[Tuple[str, float]]:
    """Return list of (name, current_value) for tunable numeric constants."""
    params = []
    for m in _PARAM_PATTERN.finditer(code):
        name = m.group(1)
        val = float(m.group(2))
        if val != 0:
            params.append((name, val))
    return params


def _replace_param(code: str, name: str, new_value: float) -> str:
    """Replace a module-level constant's value in the code string."""
    pattern = re.compile(
        r'^(' + re.escape(name) + r'\s*=\s*)(-?\d+\.?\d*)',
        re.MULTILINE
    )
    formatted = f"{new_value:.6g}"
    return pattern.sub(r'\g<1>' + formatted, code, count=1)


def _candidate_values(current: float, steps: List[float]) -> List[float]:
    """Nearby values for one parameter; integer-valued settings stay whole numbers."""
    is_whole = float(current).is_integer()
    seen = {current}
    candidates = []
    for s in steps:
        v = current * (1.0 + s)
        if is_whole:
            v = float(round(v))
        else:
            v = round(v, 6)
        if v <= 0 and current > 0:
            continue
        if v not in seen:
            seen.add(v)
            candidates.append(v)
    return candidates


def _score(result: dict) -> float:
    """Composite score: Sharpe (40%), profit factor (30%), drawdown penalty (20%), win rate (10%)."""
    if result.get("error") or result.get("total_trades", 0) < 3:
        return -999.0

    sharpe = result.get("sharpe_ratio", 0)
    pf = result.get("profit_factor", 0)
    if pf > 100:
        pf = 100
    dd = result.get("max_drawdown", 0)
    wr = result.get("win_rate", 0)

    return round(
        sharpe * 0.40
        + pf * 5.0 * 0.30
        - dd * 0.20
        + wr * 0.10,
        4
    )


def optimize_strategy(
    code: str,
    candles: List[dict],
    sl_pct: float = 1.0,
    tp_pct: float = 2.0,
    initial_capital: float = 10000.0,
    risk_per_trade: float = 0.01,
    steps: Optional[List[float]] = None,
    broker_offset_hours: int = 0,
) -> dict:
    """
    Tune every module-level numeric constant of a strategy, one at a time.

    Returns:
        {
            "optimized_code": str,
            "param_changes": [{name, before, after}, ...],
            "best_score": float,
            "combinations_tried": int,
            "before_result": dict,
            "after_result": dict,
            "error": Optional[str],
        }
    """
    if steps is None:
        steps = DEFAULT_STEPS

    before_result = run_backtest(
        code, candles, sl_pct=sl_pct, tp_pct=tp_pct,
        initial_capital=initial_capital, risk_per_trade=risk_per_trade,
        broker_offset_hours=broker_offset_hours,
    )
    if before_result.get("error"):
        return {
            "optimized_code": code,
            "param_changes": [],
            "best_score": 0,
            "combinations_tried": 0,
            "before_result": before_result,
            "after_result": before_result,
            "error": before_result["error"],
        }

    params = extract_parameters(code)
    best_code = code
    best_result = before_result
    best_score = _score(before_result)
    current_values = dict(params)
    tried = 0
    deadline = time.monotonic() + MAX_OPTIMIZE_SECONDS

    for name, original in params:
        for candidate in _candidate_values(current_values[name], steps):
            if time.monotonic() > deadline:
                break
            trial_code = _replace_param(best_code, name, candidate)
            result = run_backtest(
                trial_code, candles, sl_pct=sl_pct, tp_pct=tp_pct,
                initial_capital=initial_capital, risk_per_trade=risk_per_trade,
                broker_offset_hours=broker_offset_hours,
            )
            tried += 1
            if result.get("error"):
                continue

            s = _score(result)
            if s > best_score:
                best_score = s
                best_code = trial_code
                best_result = result
                current_values[name] = candidate

    changes = []
    for name, original in params:
        new_val = current_values[name]
        if abs(new_val - original) > 1e-9:
            changes.append({
                "name": name,
                "before": original,
                "after": round(new_val, 6),
            })

    return {
        "optimized_code": best_code,
        "param_changes": changes,
        "best_score": best_score,
        "combinations_tried": tried,
        "before_result": before_result,
        "after_result": best_result,
        "error": None,
    }

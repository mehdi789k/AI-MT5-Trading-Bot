import math
from datetime import datetime, timedelta
from typing import Optional, Tuple

import MetaTrader5 as mt5


def money_per_price_unit(symbol_info) -> float:
    if symbol_info.trade_tick_size > 0 and symbol_info.trade_tick_value > 0:
        return symbol_info.trade_tick_value / symbol_info.trade_tick_size
    return symbol_info.trade_contract_size


def calc_volume(risk_amount: float, entry_price: float, sl_price: float, symbol_info) -> float:
    sl_distance = abs(entry_price - sl_price)
    if risk_amount <= 0 or sl_distance <= 0:
        return symbol_info.volume_min

    value_per_lot = sl_distance * money_per_price_unit(symbol_info)
    raw_volume = risk_amount / value_per_lot
    step = symbol_info.volume_step
    volume = math.floor(raw_volume / step) * step
    volume = max(symbol_info.volume_min, min(volume, symbol_info.volume_max))
    digits = max(0, -int(math.floor(math.log10(step)))) if step > 0 else 2
    return round(volume, digits)


def total_open_risk(positions) -> float:
    total = 0.0
    for pos in positions:
        if not pos.sl:
            continue
        info = mt5.symbol_info(pos.symbol)
        if info is None:
            continue
        total += abs(pos.price_open - pos.sl) * pos.volume * money_per_price_unit(info)
    return total


def _day_key(now: datetime, reset_hour: int) -> str:
    return (now - timedelta(hours=reset_hour)).strftime("%Y-%m-%d")


def evaluate_capital(settings: dict, equity: float, open_risk: float, now: datetime) -> Tuple[Optional[str], dict]:
    """Return (block_reason, db_updates). A non-None block_reason means no new trades."""
    updates = {}

    day_key = _day_key(now, settings.get("daily_loss_reset_hour", 0))
    day_start_equity = settings.get("day_start_equity")
    if settings.get("day_start_key") != day_key or not day_start_equity:
        day_start_equity = equity
        updates["day_start_key"] = day_key
        updates["day_start_equity"] = equity

    peak = settings.get("peak_equity") or equity
    if equity > peak:
        peak = equity
    if peak != settings.get("peak_equity"):
        updates["peak_equity"] = peak

    drawdown_pct = (peak - equity) / peak * 100 if peak > 0 else 0.0
    if drawdown_pct >= settings["max_drawdown_percent"]:
        updates["trading_paused"] = True
        return f"max drawdown reached ({drawdown_pct:.2f}%)", updates

    daily_loss_pct = (day_start_equity - equity) / day_start_equity * 100 if day_start_equity > 0 else 0.0
    if daily_loss_pct >= settings["daily_loss_limit_percent"]:
        return f"daily loss limit reached ({daily_loss_pct:.2f}%)", updates

    exposure_pct = open_risk / equity * 100 if equity > 0 else 0.0
    if exposure_pct >= settings["max_total_risk_percent"]:
        return f"total exposure limit reached ({exposure_pct:.2f}%)", updates

    return None, updates

import math
from typing import Optional


def favorable_move(position_type: str, open_price: float, price: float) -> float:
    return price - open_price if position_type == "buy" else open_price - price


def target_reached(move: float, open_price: float, mode: str, target: float, point: float) -> bool:
    if target <= 0:
        return False
    if mode == "percent":
        return open_price > 0 and move / open_price * 100 >= target
    return point > 0 and move / point >= target


def break_even_needed(position_type: str, open_price: float, current_sl: float) -> bool:
    if not current_sl:
        return True
    if position_type == "buy":
        return current_sl < open_price
    return current_sl > open_price


def partial_close_volume(volume: float, percent: float, volume_min: float, volume_step: float) -> Optional[float]:
    if volume_step <= 0:
        return None
    digits = max(0, -int(math.floor(math.log10(volume_step))))
    steps = math.floor(volume * percent / 100 / volume_step + 1e-9)
    closed = round(steps * volume_step, digits)
    remaining = round(volume - closed, digits)
    if closed < volume_min or remaining < volume_min:
        return None
    return closed

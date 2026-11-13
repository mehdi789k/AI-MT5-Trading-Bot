from datetime import datetime
from typing import Optional

import MetaTrader5 as mt5

MAGIC_NUMBER = 20261109


def limit_entry_price(tick, direction: str, atr_val: float, distance_mult: float,
                      min_offset_points: float, symbol_info) -> float:
    distance = max(atr_val * distance_mult, min_offset_points * symbol_info.point, symbol_info.point)
    if direction == "buy":
        return round(tick.ask - distance, symbol_info.digits)
    return round(tick.bid + distance, symbol_info.digits)


def _resolve_filling(symbol_info) -> int:
    """Pick a filling mode the broker actually supports for this symbol."""
    filling = getattr(symbol_info, "filling_mode", 0)
    if filling & 1:
        return mt5.ORDER_FILLING_FOK
    if filling & 2:
        return mt5.ORDER_FILLING_IOC
    return mt5.ORDER_FILLING_RETURN


def _resolve_expiration(symbol_info, expires_at: datetime) -> dict:
    """Use a dated expiry only when the broker accepts it; otherwise good-till-cancel."""
    try:
        expiration_mode = getattr(symbol_info, "expiration_mode", 0) if symbol_info else 0
        specified_flag = getattr(mt5, "SYMBOL_EXPIRATION_SPECIFIED", None)
        specified_order_time = getattr(mt5, "ORDER_TIME_SPECIFIED", None)
    except Exception:
        return {"type_time": mt5.ORDER_TIME_GTC}
    if specified_flag is not None and specified_order_time is not None and expiration_mode & specified_flag:
        return {"type_time": specified_order_time, "expiration": int(expires_at.timestamp())}
    return {"type_time": mt5.ORDER_TIME_GTC}


def send_pending_order(symbol: str, direction: str, volume: float, price: float,
                       sl: float, tp: float, expires_at: datetime, comment: str) -> tuple[Optional[int], Optional[str]]:
    sym_info = mt5.symbol_info(symbol)
    filling_mode = _resolve_filling(sym_info) if sym_info else mt5.ORDER_FILLING_RETURN
    order_type = mt5.ORDER_TYPE_BUY_LIMIT if direction == "buy" else mt5.ORDER_TYPE_SELL_LIMIT
    base_request = {
        "action": mt5.TRADE_ACTION_PENDING,
        "symbol": symbol,
        "volume": float(volume),
        "type": order_type,
        "price": price,
        "sl": sl,
        "tp": tp,
        "magic": MAGIC_NUMBER,
        "comment": comment,
        "type_filling": filling_mode,
    }

    # First attempt: with expiration if broker supports it
    try:
        request = {**base_request, **_resolve_expiration(sym_info, expires_at)}
        result = mt5.order_send(request)
    except Exception as e:
        # Fallback: try without expiration (GTC) if the first attempt raised
        print(f"Pending order send exception for {symbol}: {e} — retrying as GTC")
        try:
            request = {**base_request, "type_time": mt5.ORDER_TIME_GTC}
            result = mt5.order_send(request)
        except Exception as e2:
            print(f"Pending order GTC retry also failed for {symbol}: {e2}")
            return None, str(e2)

    if result is not None and result.retcode == mt5.TRADE_RETCODE_DONE:
        return result.order, None

    # If expiration was rejected (retcode 10022), retry without expiration (GTC)
    if result is not None and result.retcode == 10022:
        try:
            request_gtc = {**base_request, "type_time": mt5.ORDER_TIME_GTC}
            result = mt5.order_send(request_gtc)
            if result is not None and result.retcode == mt5.TRADE_RETCODE_DONE:
                return result.order, None
        except Exception as e:
            print(f"Pending order GTC retry failed for {symbol}: {e}")
            return None, str(e)

    err = f"retcode={result.retcode if result else 'no response'} ({result.comment if result else mt5.last_error()}), filling={filling_mode}"
    print(f"Pending order failed for {symbol}: {err}")
    return None, err


def cancel_pending_order(ticket: int) -> bool:
    result = mt5.order_send({"action": mt5.TRADE_ACTION_REMOVE, "order": ticket})
    return result is not None and result.retcode == mt5.TRADE_RETCODE_DONE

"""
Main Trading Engine.

Connects to MetaTrader 5, reads market data, generates AI predictions,
opens/manages/closes positions automatically, and syncs everything
to the Supabase database for the web dashboard.
"""

import MetaTrader5 as mt5
import json
import time
import sys
import os
import threading
import webbrowser
from datetime import datetime, timezone, timedelta
from typing import List, Dict, Optional

from supabase_client import SupabaseClient
from indicators import extract_features, atr as calc_atr
from ai_model import PredictionModel
from risk import calc_volume, evaluate_capital, total_open_risk, money_per_price_unit
from profit_protection import break_even_needed, favorable_move, partial_close_volume, target_reached
from orders import limit_entry_price, send_pending_order, cancel_pending_order
from strategy_runner import StrategyRunner, StrategyError, run_backtest
from optimizer import optimize_strategy


def _load_env_file(path: str) -> None:
    """Populate os.environ from a KEY=value file without overriding existing values."""
    try:
        with open(path, "r") as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                key, _, value = line.partition("=")
                key, value = key.strip(), value.strip().strip('"').strip("'")
                if key and key not in os.environ:
                    os.environ[key] = value
    except FileNotFoundError:
        pass


# ---- Config ----

def load_config() -> dict:
    engine_dir = os.path.dirname(__file__)

    # Pick up Supabase credentials from the project .env when config.json has none
    _load_env_file(os.path.join(engine_dir, "..", ".env"))
    _load_env_file(os.path.join(engine_dir, ".env"))

    config_path = os.path.join(engine_dir, "config.json")
    with open(config_path, "r") as f:
        config = json.load(f)

    supabase_cfg = config.setdefault("supabase", {})
    if not supabase_cfg.get("url"):
        supabase_cfg["url"] = os.environ.get("SUPABASE_URL") or os.environ.get("VITE_SUPABASE_URL", "")
    if not supabase_cfg.get("anon_key"):
        supabase_cfg["anon_key"] = os.environ.get("SUPABASE_ANON_KEY") or os.environ.get("VITE_SUPABASE_ANON_KEY", "")
    if not supabase_cfg.get("url") or not supabase_cfg.get("anon_key"):
        print(
            "WARNING: Supabase url/anon_key are not set.\n"
            "The engine will run without database access: no logs, positions or settings "
            "will sync, and no new trades will be opened.\n"
            "Fix: copy the project's .env values (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY) "
            "into python-engine/config.json under \"supabase\"."
        )
    return config


def open_dashboard(config: dict) -> None:
    dashboard = config.get("dashboard", {})
    if dashboard.get("open_on_start", True) is False:
        return

    url = dashboard.get("url", "http://localhost:5173")
    delay = max(float(dashboard.get("open_delay_sec", 1.5)), 0)

    def launch() -> None:
        try:
            if webbrowser.open_new_tab(url):
                return
            print(f"Could not open dashboard in the default browser: {url}")
        except Exception as exc:
            print(f"Could not open dashboard in the default browser: {exc}")

    timer = threading.Timer(delay, launch)
    timer.daemon = True
    timer.start()
    print(f"Dashboard will open in the default browser: {url}")


# ---- MT5 Helpers ----

TF_MAP = {
    "M1": mt5.TIMEFRAME_M1,
    "M5": mt5.TIMEFRAME_M5,
    "M15": mt5.TIMEFRAME_M15,
    "M30": mt5.TIMEFRAME_M30,
    "H1": mt5.TIMEFRAME_H1,
    "H4": mt5.TIMEFRAME_H4,
    "D1": mt5.TIMEFRAME_D1,
}

TF_MINUTES = {"M1": 1, "M5": 5, "M15": 15, "M30": 30, "H1": 60, "H4": 240, "D1": 1440}


_mt5_cfg: dict = {}


def _account_type(info) -> Optional[str]:
    return {
        mt5.ACCOUNT_TRADE_MODE_DEMO: "demo",
        mt5.ACCOUNT_TRADE_MODE_CONTEST: "contest",
        mt5.ACCOUNT_TRADE_MODE_REAL: "real",
    }.get(info.trade_mode)


def connect_mt5(cfg: dict, mode: str) -> bool:
    """Log the MT5 terminal into the demo or live account configured for `mode`."""
    global _mt5_cfg
    mt5_cfg = cfg.get("mt5", {})
    _mt5_cfg = {
        "mode": mode,
        "terminal_path": mt5_cfg.get("terminal_path", ""),
        **mt5_cfg.get(mode, {}),
    }
    return _initialize_mt5()


def _initialize_mt5() -> bool:
    if not mt5.initialize(**_build_mt5_kwargs()):
        print(f"MT5 initialize failed: {mt5.last_error()}")
        return False

    info = mt5.account_info()
    if info is None:
        print("MT5: failed to get account info")
        mt5.shutdown()
        return False

    expected = _mt5_cfg["mode"]
    actual = _account_type(info)
    if actual != expected:
        print(f"MT5 account mismatch: selected {expected} mode but the terminal is logged into "
              f"a {actual or 'unknown'} account ({info.login}). Trading is blocked.")
        mt5.shutdown()
        return False

    print(f"MT5 connected ({expected}): {info.name} | Balance: {info.balance} {info.currency}")
    return True


def ensure_mt5_connected() -> bool:
    """Check MT5 connection and reinitialize if dropped or logged into the wrong account."""
    info = mt5.account_info() if mt5.terminal_info() is not None else None
    if info is not None and _account_type(info) == _mt5_cfg.get("mode"):
        return True
    print("MT5 connection lost or wrong account — attempting reinitialize...")
    mt5.shutdown()
    time.sleep(2)
    return _initialize_mt5()


def _build_mt5_kwargs() -> dict:
    kwargs = {}
    if _mt5_cfg.get("terminal_path"):
        kwargs["path"] = _mt5_cfg["terminal_path"]
    if _mt5_cfg.get("login"):
        kwargs["login"] = _mt5_cfg["login"]
    if _mt5_cfg.get("password"):
        kwargs["password"] = _mt5_cfg["password"]
    if _mt5_cfg.get("server"):
        kwargs["server"] = _mt5_cfg["server"]
    return kwargs


def get_candles(symbol: str, timeframe_str: str, count: int = 200) -> List[dict]:
    """Fetch OHLCV candles from MT5."""
    tf = TF_MAP.get(timeframe_str, mt5.TIMEFRAME_M15)
    rates = mt5.copy_rates_from_pos(symbol, tf, 0, count)
    if rates is None or len(rates) == 0:
        return []
    # Convert numpy structured array to plain dicts — numpy.void records
    # don't support .get(), and field names must be accessed via dtype.names
    field_names = rates.dtype.names
    candles = []
    for r in rates:
        row = {name: r[name] for name in field_names}
        candles.append({
            "time": datetime.fromtimestamp(float(row["time"]), tz=timezone.utc).isoformat(),
            "open": float(row["open"]),
            "high": float(row["high"]),
            "low": float(row["low"]),
            "close": float(row["close"]),
            "volume": int(row.get("tick_volume", row.get("real_volume", 0)) or 0),
        })
    return candles


def get_tick(symbol: str) -> Optional[dict]:
    """Get latest bid/ask for a symbol."""
    tick = mt5.symbol_info_tick(symbol)
    if tick is None:
        return None
    return {"bid": tick.bid, "ask": tick.ask, "last": tick.last}


def _resolve_filling(symbol: str, symbol_info) -> int:
    """Pick a filling mode the broker actually supports for this symbol."""
    filling = getattr(symbol_info, "filling_mode", 0)
    if filling & 1:
        return mt5.ORDER_FILLING_FOK
    if filling & 2:
        return mt5.ORDER_FILLING_IOC
    return mt5.ORDER_FILLING_RETURN


def send_order(symbol: str, direction: str, volume: float, sl: float, tp: float, comment: str = "AI Bot") -> tuple[Optional[int], Optional[str]]:
    """Send a market order to MT5. Returns (ticket, error_message)."""
    tick = mt5.symbol_info_tick(symbol)
    if tick is None:
        return None, "no tick data"

    sym_info = mt5.symbol_info(symbol)
    filling_mode = _resolve_filling(symbol, sym_info) if sym_info else mt5.ORDER_FILLING_IOC

    if direction == "buy":
        order_type = mt5.ORDER_TYPE_BUY
        price = tick.ask
    else:
        order_type = mt5.ORDER_TYPE_SELL
        price = tick.bid

    request = {
        "action": mt5.TRADE_ACTION_DEAL,
        "symbol": symbol,
        "volume": float(volume),
        "type": order_type,
        "price": price,
        "sl": sl,
        "tp": tp,
        "deviation": 20,
        "magic": 20261109,
        "comment": comment,
        "type_time": mt5.ORDER_TIME_GTC,
        "type_filling": filling_mode,
    }

    result = mt5.order_send(request)
    if result is None:
        err = str(mt5.last_error())
        print(f"Order send failed: {err}")
        return None, err

    if result.retcode != mt5.TRADE_RETCODE_DONE:
        err = f"retcode={result.retcode} ({result.comment}), filling={filling_mode}"
        print(f"Order failed: {err}")
        return None, err

    print(f"Order filled: {direction} {volume} {symbol} @ {price}, ticket={result.order}")
    return result.order, None


def close_position(ticket: int, symbol: str, position_type: str, volume: float) -> bool:
    """Close a position by ticket."""
    tick = mt5.symbol_info_tick(symbol)
    if tick is None:
        return False

    if position_type == "buy":
        order_type = mt5.ORDER_TYPE_SELL
        price = tick.bid
    else:
        order_type = mt5.ORDER_TYPE_BUY
        price = tick.ask

    sym_info = mt5.symbol_info(symbol)
    filling_mode = _resolve_filling(symbol, sym_info) if sym_info else mt5.ORDER_FILLING_IOC

    request = {
        "action": mt5.TRADE_ACTION_DEAL,
        "symbol": symbol,
        "volume": float(volume),
        "type": order_type,
        "position": ticket,
        "price": price,
        "deviation": 20,
        "magic": 20261109,
        "comment": "AI Bot Close",
        "type_time": mt5.ORDER_TIME_GTC,
        "type_filling": filling_mode,
    }

    result = mt5.order_send(request)
    if result is None or result.retcode != mt5.TRADE_RETCODE_DONE:
        print(f"Close failed for {ticket}: {result.retcode if result else mt5.last_error()}")
        return False

    print(f"Position closed: ticket={ticket}")
    return True


def _last_exit_deal(ticket: int):
    deals = mt5.history_deals_get(position=ticket) or []
    exits = [d for d in deals if d.position_id == ticket and d.entry == mt5.DEAL_ENTRY_OUT]
    return exits[-1] if exits else None


# ---- Engine ----

class TradingEngine:
    def __init__(self):
        self.config = load_config()
        supabase_url = self.config["supabase"]["url"]
        supabase_key = self.config["supabase"]["anon_key"]
        if supabase_url and supabase_key:
            self.db = SupabaseClient(supabase_url, supabase_key)
            try:
                self.ai_settings: dict = self.db.get_ai_prediction_settings()
            except Exception as e:
                self.ai_settings = {}
                print(f"WARNING: could not load AI settings from the database ({e}) — defaults will be used")
        else:
            # Keep the engine alive without a database: trading is disabled but
            # MT5 connection, heartbeats and error logging still work.
            self.db = None
            self.ai_settings = {
                "min_confidence_threshold": 45, "neutral_threshold": 0.02,
                "min_trades_for_model": 10, "retraining_interval_trades": 20,
                "rule_trend_threshold": 0.5, "rule_macd_weight": 0.5,
                "rule_rsi_oversold": 30, "rule_rsi_overbought": 70,
                "gb_n_estimators": 100, "gb_max_depth": 3,
                "gb_learning_rate": 0.1, "gb_subsample": 1.0,
                "predicted_price_atr_mult": 1.0,
            }
        self.model = PredictionModel()
        self.enabled_symbols: List[dict] = []
        self.trade_count_since_retrain = 0
        self.running = False
        self.block_reason: Optional[str] = None
        self.strategy_runner = StrategyRunner()
        self.strategy_cache: Dict[str, dict] = {}  # strategy_id → {code, name}
        self._recent_order_keys: Dict[str, float] = {}  # dedup key → timestamp
        self._shutdown_requested = False
        self._started_at = datetime.now(timezone.utc)
        self._log_throttle: Dict[str, float] = {}  # throttle key → last log time
        self._acted_signals: Dict[str, float] = {}  # strategy signal id → acted-on time
        self._db_ok = True
        self._db_fail_count = 0
        self._last_retrain_attempt = 0.0
        self._mt5_connected = False
        self.broker_offset_hours = self.config.get("broker", {}).get("timezone_offset_hours", 0)

    def log(self, level: str, message: str, symbol: str = "", details: dict = None):
        ts = datetime.now(timezone.utc).strftime("%H:%M:%S")
        print(f"[{ts}] [{level.upper()}] {symbol + ' | ' if symbol else ''}{message}")
        if self.db is None:
            return
        try:
            self.db.add_log(level, message, symbol, details)
        except Exception:
            pass

    def _log_throttled(self, key: str, level: str, message: str, symbol: str = "", throttle_sec: int = 900):
        """Log a message only when its key is new, or at most once per throttle period."""
        now = time.time()
        if now - self._log_throttle.get(key, 0) < throttle_sec:
            return
        self._log_throttle[key] = now
        self.log(level, message, symbol)

    def _db_available(self) -> bool:
        """Probe database connectivity. While it is down, new trades must not be placed
        (positions and pending orders can't be tracked, risking duplicates)."""
        if self.db is None:
            self._log_throttled("db:none", "warning", "No database configured — trading disabled", throttle_sec=900)
            return False
        try:
            self.db.get_pending_orders("pending")
        except Exception as e:
            self._db_fail_count += 1
            if self._db_ok or self._db_fail_count % 5 == 1:
                self.log("warning", f"Database unreachable — new trades paused until connection recovers: {e}")
            self._db_ok = False
            return False
        if not self._db_ok:
            self.log("info", "Database connection restored — trading resumed")
            self._db_ok = True
        self._db_fail_count = 0
        return True

    def refresh_ai_settings(self):
        try:
            self.ai_settings = self.db.get_ai_prediction_settings()
        except Exception as e:
            self.log("warning", f"AI settings reload failed, keeping last known values: {e}")

    def heartbeat(self, balance: float, equity: float, account_type: Optional[str]):
        if self.db is None:
            return
        try:
            self.db.update_heartbeat(balance, equity, True, account_type)
        except Exception as e:
            print(f"Heartbeat failed: {e}")

    def _desired_account_mode(self) -> str:
        if self.db is None:
            return "demo"
        return self.get_settings().get("account_mode") or "demo"

    def apply_account_mode(self):
        """Switch the MT5 login to the account selected in the dashboard, only when the bot is idle."""
        if self.db is None:
            return
        settings = self.get_settings()
        desired = settings.get("account_mode")
        if desired not in ("demo", "live") or desired == _mt5_cfg.get("mode"):
            return
        if settings.get("is_running"):
            self._log_throttled("mode:running", "warning",
                "Account switch requested but the bot is running — stop the bot first", throttle_sec=300)
            return
        open_positions = mt5.positions_get()
        open_orders = mt5.orders_get()
        if open_positions is None or open_orders is None:
            return
        if open_positions or open_orders:
            self._log_throttled("mode:open", "warning",
                "Account switch requested but there are open positions or orders — close them first", throttle_sec=300)
            return
        self.log("info", f"Switching MT5 to the {desired} account")
        mt5.shutdown()
        self._mt5_connected = connect_mt5(self.config, desired)

    def sync_enabled_symbols(self):
        if self.db is None:
            return
        try:
            self.enabled_symbols = self.db.get_enabled_symbols()
        except Exception as e:
            self.log("error", f"Failed to fetch symbol config: {e}")

    def sync_mt5_symbols(self):
        """Sync all available MT5 symbols to the database for the dashboard symbol browser."""
        all_symbols = mt5.symbols_get()
        if not all_symbols:
            self.log("warning", "No symbols returned from MT5")
            return

        sync_ts = datetime.now(timezone.utc).isoformat()
        rows = []
        for s in all_symbols:
            name = s.name

            # Infer category from symbol name
            upper = name.upper()
            if any(x in upper for x in ['XAU', 'XAG', 'XPT', 'XPD', 'GOLD', 'SILVER']):
                category = 'metals'
            elif any(x in upper for x in ['BTC', 'ETH', 'XRP', 'LTC', 'ZEC', 'DASH', 'DOGE', 'SOL', 'ADA', 'BNB', 'LINK', 'DOT']):
                category = 'crypto'
            elif any(x in upper for x in ['US30', 'NAS100', 'NAS', 'SPX', 'SP500', 'US500', 'GER30', 'DAX', 'UK100', 'JP225', 'HK50', 'AUS200', 'US2000']):
                category = 'indices'
            elif any(x in upper for x in ['OIL', 'WTI', 'BRENT', 'CRUDE', 'NGAS', 'NATGAS']):
                category = 'energy'
            else:
                category = 'forex'

            rows.append({
                "symbol": name,
                "description": getattr(s, 'description', '') or '',
                "category": category,
                "digits": int(getattr(s, 'digits', 5)),
                "volume_min": float(getattr(s, 'volume_min', 0.01)),
                "volume_step": float(getattr(s, 'volume_step', 0.01)),
                "visible": bool(getattr(s, 'visible', False)),
                "bid": float(getattr(s, 'bid', 0)) if getattr(s, 'bid', 0) else None,
                "ask": float(getattr(s, 'ask', 0)) if getattr(s, 'ask', 0) else None,
                "updated_at": sync_ts,
            })

        try:
            self.db.upsert_mt5_symbols(rows)
            self.db.delete_mt5_symbols_older_than(sync_ts)
            self.log("info", f"Synced {len(rows)} symbols from MT5 to database")
        except Exception as e:
            self.log("error", f"Failed to sync MT5 symbols: {e}")

    def select_symbol(self, requested: str) -> Optional[str]:
        """Select a symbol in MT5, resolving case mismatches (e.g. XAUUSD_L -> XAUUSD_l).
        Returns the broker's exact symbol name, or None if not found."""
        if mt5.symbol_select(requested, True):
            return requested

        all_symbols = mt5.symbols_get() or []
        requested_lower = requested.lower()
        for s in all_symbols:
            if s.name.lower() == requested_lower:
                mt5.symbol_select(s.name, True)
                return s.name

        self.log("warning",
            f"Symbol not found in MT5 broker — remove it from config and pick from the symbol browser in Settings",
            requested)
        return None

    def get_settings(self) -> dict:
        if self.db is None:
            return {}
        try:
            return self.db.get_settings()
        except Exception as e:
            self.log("error", f"Failed to fetch settings: {e}")
            return {}

    def store_market_data(self, symbol: str, timeframe: str, candles: List[dict], features: dict):
        """Store latest candle + features to market_data table."""
        if not candles:
            return
        latest = candles[-1]
        row = {
            "symbol": symbol,
            "timeframe": timeframe,
            "time": latest["time"],
            "open": latest["open"],
            "high": latest["high"],
            "low": latest["low"],
            "close": latest["close"],
            "volume": latest["volume"],
            "rsi": features.get("rsi"),
            "atr": features.get("atr"),
            "macd": features.get("macd"),
            "ema_fast": features.get("ema_fast"),
            "ema_slow": features.get("ema_slow"),
            "trend": features.get("trend"),
            "volatility": features.get("volatility"),
        }
        try:
            self.db.upsert_market_data([row])
        except Exception as e:
            self.log("warning", f"Failed to store market data for {symbol}: {e}", symbol)

    def sync_open_positions(self):
        """Sync MT5 positions to the database."""
        if self.db is None:
            return
        mt5_positions = mt5.positions_get()
        if mt5_positions is None:
            self._log_throttled("sync:positions_read", "warning",
                "Could not read open positions from MT5 — position sync skipped this cycle", throttle_sec=60)
            return

        db_positions = self.db.get_open_positions()
        db_tickets = {p["mt5_ticket"]: p for p in db_positions}
        mt5_tickets = {p.ticket: p for p in mt5_positions}

        # Update or insert current MT5 positions
        for pos in mt5_positions:
            tick = mt5.symbol_info_tick(pos.symbol)
            current_price = tick.bid if tick else pos.price_open
            profit = pos.profit
            ticket = pos.ticket

            if ticket in db_tickets:
                self.db.update_position(ticket,
                    current_price=current_price,
                    profit=profit,
                    swap=pos.swap,
                )
            else:
                # New position detected (opened externally or by us)
                pos_type = "buy" if pos.type == mt5.POSITION_TYPE_BUY else "sell"
                self.db.upsert_position({
                    "mt5_ticket": ticket,
                    "symbol": pos.symbol,
                    "position_type": pos_type,
                    "volume": float(pos.volume),
                    "open_price": pos.price_open,
                    "current_price": current_price,
                    "stop_loss": pos.sl if pos.sl > 0 else None,
                    "take_profit": pos.tp if pos.tp > 0 else None,
                    "sl_tp_mode": "fixed",
                    "order_type": "market",
                    "profit": profit,
                    "swap": pos.swap,
                    "open_time": datetime.fromtimestamp(pos.time, tz=timezone.utc).isoformat(),
                })

        # Remove positions from DB that no longer exist in MT5 (closed)
        closed_tickets = set(db_tickets.keys()) - set(mt5_tickets.keys())
        for ticket in closed_tickets:
            db_pos = db_tickets[ticket]
            self.handle_closed_position(ticket, db_pos)

    def handle_closed_position(self, ticket: int, db_pos: dict):
        """Move a closed position to trade_history."""
        close_price = db_pos.get("open_price", 0)
        profit = db_pos.get("profit", 0) or 0
        close_reason = "manual"

        exit_deal = _last_exit_deal(ticket)
        if exit_deal is not None:
            close_price = exit_deal.price
            profit = exit_deal.profit
            if db_pos.get("take_profit") and abs(exit_deal.price - db_pos["take_profit"]) < 1e-5:
                close_reason = "tp_hit"
            elif db_pos.get("stop_loss") and abs(exit_deal.price - db_pos["stop_loss"]) < 1e-5:
                close_reason = "sl_hit"
            else:
                close_reason = "model_signal"

        trade_row = self._history_row(ticket, db_pos, db_pos["volume"], close_price, profit, close_reason)

        try:
            self.db.add_trade_history(trade_row)
            self.db.delete_position(ticket)
            self.trade_count_since_retrain += 1
            self.log("info", f"Position {ticket} closed: P/L={profit:.2f}, reason={close_reason}", db_pos["symbol"])
        except Exception as e:
            self.log("warning",
                f"Position {ticket} closed at the broker (P/L={profit:.2f}, reason={close_reason}) but could not be "
                f"recorded in history yet ({e}) — it will be re-processed on the next sync", db_pos["symbol"])

    def _history_row(self, ticket: int, db_pos: dict, volume: float, close_price: float,
                     profit: float, close_reason: str, close_seq: int = 0) -> dict:
        now = datetime.now(timezone.utc)
        return {
            "mt5_ticket": ticket,
            "close_seq": close_seq,
            "symbol": db_pos["symbol"],
            "position_type": db_pos["position_type"],
            "volume": volume,
            "open_price": db_pos["open_price"],
            "close_price": close_price,
            "stop_loss": db_pos.get("stop_loss"),
            "take_profit": db_pos.get("take_profit"),
            "sl_tp_mode": db_pos.get("sl_tp_mode", "fixed"),
            "profit": profit,
            "close_reason": close_reason,
            "open_time": db_pos["open_time"],
            "close_time": now.isoformat(),
            "feat_rsi": None,
            "feat_atr": None,
            "feat_macd": None,
            "feat_trend": None,
            "feat_volatility": None,
            "feat_ema_fast": None,
            "feat_ema_slow": None,
            "feat_time_hour": now.hour,
            "feat_day_of_week": now.weekday(),
            "prediction_confidence": db_pos.get("prediction_confidence"),
        }

    def _apply_break_even(self, pos):
        if not break_even_needed("buy" if pos.type == mt5.POSITION_TYPE_BUY else "sell", pos.price_open, pos.sl):
            self.db.update_position(pos.ticket, break_even_applied=True)
            return
        request = {
            "action": mt5.TRADE_ACTION_SLTP,
            "symbol": pos.symbol,
            "position": pos.ticket,
            "sl": pos.price_open,
            "tp": pos.tp,
        }
        result = mt5.order_send(request)
        if result is None or result.retcode != mt5.TRADE_RETCODE_DONE:
            self.log("warning", f"Break-even move failed for position {pos.ticket}; will retry", pos.symbol)
            return
        self.db.update_position(pos.ticket, break_even_applied=True, stop_loss=pos.price_open)
        self.log("info", f"Stop loss of position {pos.ticket} moved to entry price (break-even)", pos.symbol)

    def _run_partial_stage(self, pos, pos_type: str, sym_cfg: dict, db_row: dict, info, move: float):
        done = db_row.get("partial_stages_done", 0) or 0
        stages = [(sym_cfg["partial_stage1_trigger"], sym_cfg["partial_stage1_close_percent"])]
        if sym_cfg.get("partial_stage2_enabled"):
            stages.append((sym_cfg["partial_stage2_trigger"], sym_cfg["partial_stage2_close_percent"]))
        if done >= len(stages):
            return

        trigger, percent = stages[done]
        mode = sym_cfg.get("profit_target_mode", "points")
        if not target_reached(move, pos.price_open, mode, trigger, info.point):
            return

        stage_no = done + 1
        volume = partial_close_volume(pos.volume, percent, info.volume_min, info.volume_step)
        if volume is None:
            self.db.update_position(pos.ticket, partial_stages_done=stage_no)
            self.log("warning", f"Partial close stage {stage_no} skipped for position {pos.ticket}: volume is too small to split", pos.symbol)
            return

        if not close_position(pos.ticket, pos.symbol, pos_type, volume):
            self.log("warning", f"Partial close stage {stage_no} failed for position {pos.ticket}; will retry", pos.symbol)
            return

        exit_deal = _last_exit_deal(pos.ticket)
        if exit_deal is not None:
            close_price, profit = exit_deal.price, exit_deal.profit
        else:
            close_price = pos.price_open + move if pos_type == "buy" else pos.price_open - move
            profit = move * volume * money_per_price_unit(info)

        remaining = round(pos.volume - volume, 8)
        self.db.update_position(pos.ticket, volume=remaining, partial_stages_done=stage_no)
        self.db.add_trade_history(self._history_row(
            pos.ticket, db_row, volume, close_price, profit, "partial_close", close_seq=stage_no))
        self.log("info", f"Closed {volume} lots of position {pos.ticket} at partial stage {stage_no} "
                         f"(P/L={profit:.2f}), {remaining} lots still open", pos.symbol)

    def _apply_profit_protection(self, pos, sym_cfg: dict, db_row: dict):
        info = mt5.symbol_info(pos.symbol)
        tick = mt5.symbol_info_tick(pos.symbol)
        if info is None or tick is None:
            return
        pos_type = "buy" if pos.type == mt5.POSITION_TYPE_BUY else "sell"
        price = tick.bid if pos_type == "buy" else tick.ask
        move = favorable_move(pos_type, pos.price_open, price)
        mode = sym_cfg.get("profit_target_mode", "points")

        if (sym_cfg.get("break_even_enabled") and not db_row.get("break_even_applied")
                and target_reached(move, pos.price_open, mode, sym_cfg["break_even_trigger"], info.point)):
            self._apply_break_even(pos)

        if sym_cfg.get("partial_close_enabled"):
            self._run_partial_stage(pos, pos_type, sym_cfg, db_row, info, move)

    def build_trade_levels(self, entry_price: float, direction: str, atr_val: float, sl_tp_mode: str,
                           sym: dict, sym_info, settings: dict, account, risk_percent: float):
        if sl_tp_mode == "dynamic":
            sl_mult = sym.get("dynamic_sl_mult", 1.5)
            tp_mult = sym.get("dynamic_tp_mult", 3.0)
            sl, tp = self.model.compute_dynamic_sl_tp(entry_price, direction, atr_val, sl_mult, tp_mult)
        else:
            sl_pct = sym.get("fixed_sl_percent", 1.0) / 100
            tp_pct = sym.get("fixed_tp_percent", 2.0) / 100
            if direction == "buy":
                sl = entry_price - entry_price * sl_pct
                tp = entry_price + entry_price * tp_pct
            else:
                sl = entry_price + entry_price * sl_pct
                tp = entry_price - entry_price * tp_pct
            sl = round(sl, 5)
            tp = round(tp, 5)

        stops_level = sym_info.trade_stops_level * sym_info.point
        if direction == "buy":
            if abs(entry_price - sl) < stops_level:
                sl = entry_price - stops_level * 2
            if abs(tp - entry_price) < stops_level:
                tp = entry_price + stops_level * 2
        else:
            if abs(sl - entry_price) < stops_level:
                sl = entry_price + stops_level * 2
            if abs(entry_price - tp) < stops_level:
                tp = entry_price - stops_level * 2

        if settings.get("risk_per_trade_mode") == "fixed":
            risk_amount = float(settings.get("fixed_risk_amount") or 0)
        else:
            risk_amount = account.balance * risk_percent / 100.0

        volume = calc_volume(risk_amount, entry_price, sl, sym_info)
        if volume < sym_info.volume_min:
            volume = sym_info.volume_min
        return sl, tp, volume

    def place_limit_order(self, symbol: str, direction: str, volume: float, price: float,
                          sl: float, tp: float, sl_tp_mode: str, sym: dict, confidence: float):
        expires_at = datetime.now(timezone.utc) + timedelta(minutes=sym.get("limit_order_expiry_hours", 1440))
        ticket, order_err = send_pending_order(symbol, direction, volume, price, sl, tp, expires_at,
                                    comment=f"AI Bot {confidence:.0f}% limit")
        if not ticket:
            self.log("error", f"Broker rejected limit order for {symbol}: {order_err}", symbol)
            return
        try:
            self.db.add_pending_order({
                "mt5_order_ticket": ticket,
                "symbol": symbol,
                "order_type": f"{direction}_limit",
                "volume": volume,
                "entry_price": price,
                "stop_loss": sl,
                "take_profit": tp,
                "sl_tp_mode": sl_tp_mode,
                "status": "pending",
                "expires_at": expires_at.isoformat(),
            })
        except Exception as db_err:
            # Order is live at the broker even if the dashboard record failed —
            # the broker-side expiry and the order-history sync keep it honest.
            self.log("warning",
                f"Limit order {ticket} was accepted by the broker but could not be saved to the database "
                f"({db_err}) — it will be reconciled by the next order sync", symbol)
        self.log("info", f"Limit order placed: {direction.upper()} {volume} @ {price}", symbol)

    def sync_pending_orders(self):
        """Reconcile pending orders in the database with their MT5 state.
        Also auto-cancels expired orders that the broker kept alive as GTC."""
        if self.db is None:
            return
        now_utc = datetime.now(timezone.utc)
        live_tickets = {o.ticket for o in (mt5.orders_get() or [])}

        for row in self.db.get_pending_orders("pending"):
            ticket = row["mt5_order_ticket"]

            # Auto-expire: if the DB says the order should have expired but MT5 still has it,
            # cancel it ourselves (broker didn't support dated expiration so it went out as GTC).
            expires_at_str = row.get("expires_at")
            if expires_at_str and ticket in live_tickets:
                try:
                    expires_at = datetime.fromisoformat(expires_at_str.replace("Z", "+00:00"))
                    if expires_at <= now_utc:
                        if cancel_pending_order(ticket):
                            self.db.update_pending_order(ticket, status="expired")
                            self.log("info", f"Limit order {ticket} auto-expired (broker kept as GTC)", row["symbol"])
                        else:
                            self.log("warning", f"Failed to auto-cancel expired order {ticket}", row["symbol"])
                        continue
                except Exception as e:
                    self.log("warning", f"Expiry check failed for order {ticket}: {e}")

            # If the order is no longer live in MT5, check its final state from history
            if ticket in live_tickets:
                continue
            history = mt5.history_orders_get(ticket=ticket) or []
            if not history:
                continue
            order = history[0]
            if order.state == mt5.ORDER_STATE_FILLED:
                self.db.update_pending_order(ticket, status="filled", filled_position_ticket=order.position_id)
                self.log("info", f"Limit order {ticket} filled", row["symbol"])
            elif order.state == mt5.ORDER_STATE_EXPIRED:
                self.db.update_pending_order(ticket, status="expired")
            else:
                self.db.update_pending_order(ticket, status="cancelled")

    def check_manual_requests(self):
        """Process close, cancel, and backtest requests written by the dashboard to bot_logs."""
        if self.db is None:
            return
        try:
            logs = self.db.get_request_logs(["close_position", "cancel_pending_order", "run_backtest", "run_optimize", "shutdown_engine"])
            for log_entry in logs:
                details = log_entry.get("details")
                if isinstance(details, str):
                    details = json.loads(details)
                if not details or details.get("_processed"):
                    continue
                action = details.get("action")
                if action == "close_position":
                    ticket = details.get("mt5_ticket")
                    if ticket:
                        self.handle_close_request(ticket)
                elif action == "cancel_pending_order":
                    ticket = details.get("mt5_ticket")
                    if ticket:
                        self.handle_cancel_request(ticket)
                elif action == "shutdown_engine":
                    if datetime.fromisoformat(log_entry["created_at"]) >= self._started_at:
                        self.request_shutdown()
                elif action == "run_backtest":
                    try:
                        self.handle_backtest_request(details)
                    except Exception as e:
                        self.log("error", f"Backtest request failed: {e}")
                elif action == "run_optimize":
                    try:
                        self.handle_optimize_request(details)
                    except Exception as e:
                        self.log("error", f"Optimization request failed: {e}")
                else:
                    continue
                self.db.mark_log_processed(log_entry["id"], details)
        except Exception as e:
            self.log("warning", f"Failed to check dashboard requests: {e}")

    def request_shutdown(self):
        self.db.update_settings(is_running=False)
        self.log("info", "Shutdown requested from the dashboard — stopping the engine")
        self._shutdown_requested = True

    def handle_close_request(self, ticket: int):
        positions = mt5.positions_get(ticket=ticket)
        if not positions:
            self.log("warning", f"Position {ticket} not found for manual close")
            return
        pos = positions[0]
        pos_type = "buy" if pos.type == mt5.POSITION_TYPE_BUY else "sell"
        if close_position(ticket, pos.symbol, pos_type, pos.volume):
            self.log("info", f"Manual close executed for {ticket}", pos.symbol)

    def handle_cancel_request(self, ticket: int):
        if cancel_pending_order(ticket):
            self.db.update_pending_order(ticket, status="cancelled")
            self.log("info", f"Pending order {ticket} cancelled")
        else:
            self.log("warning", f"Could not cancel pending order {ticket}")

    def fetch_history(self, bt_symbol: str, timeframe: str, from_date: str, to_date: str):
        """Return (candles, expected_count, error) for the range, using the broker's latest bars if the range is missing."""
        tf = TF_MAP.get(timeframe, mt5.TIMEFRAME_M15)
        start_dt = datetime.strptime(from_date, "%Y-%m-%d").replace(tzinfo=timezone.utc)
        end_dt = datetime.strptime(to_date, "%Y-%m-%d").replace(tzinfo=timezone.utc) + timedelta(days=1)
        expected = int((end_dt - start_dt).total_seconds() // (TF_MINUTES.get(timeframe, 15) * 60))

        rates = mt5.copy_rates_range(bt_symbol, tf, int(start_dt.timestamp()), int(end_dt.timestamp()))
        if rates is None or len(rates) < 50:
            rates = mt5.copy_rates_from_pos(bt_symbol, tf, 0, expected)
            if rates is not None and len(rates) >= 50:
                self.log("info",
                    f"Range {from_date}..{to_date} not available from broker — using latest {len(rates)} {timeframe} candles instead",
                    bt_symbol)

        if rates is None or len(rates) < 50:
            return None, expected, (
                f"Insufficient historical data for {bt_symbol}: got {0 if rates is None else len(rates)} candles "
                f"for {from_date}..{to_date} {timeframe} (expected about {expected}). "
                f"The broker may not keep this history — try a shorter range or higher timeframe."
            )

        field_names = rates.dtype.names
        candles = []
        for r in rates:
            row = {name: r[name] for name in field_names}
            candles.append({
                "time": datetime.fromtimestamp(float(row["time"]), tz=timezone.utc).isoformat(),
                "open": float(row["open"]), "high": float(row["high"]),
                "low": float(row["low"]), "close": float(row["close"]),
                "volume": int(row.get("tick_volume", row.get("real_volume", 0)) or 0),
            })

        if len(candles) < expected * 0.9:
            self.log("warning",
                f"Broker returned {len(candles)} of about {expected} {timeframe} candles; testing on available data "
                f"({candles[0]['time'][:10]} to {candles[-1]['time'][:10]})",
                bt_symbol)
        return candles, expected, None

    def handle_backtest_request(self, details: dict):
        """Run a strategy backtest and store results in the database."""
        strategy_id = details.get("strategy_id")
        symbol = details.get("symbol")
        timeframe = details.get("timeframe")
        from_date = details.get("from_date")
        to_date = details.get("to_date")
        initial_capital = float(details.get("initial_capital", 10000))

        if not strategy_id or not symbol:
            self.log("error", "Backtest request missing strategy_id or symbol")
            return

        self.sync_enabled_symbols()
        sym_cfg = next((s for s in self.enabled_symbols
                        if s["symbol"].lower() == str(symbol).lower()), None)

        try:
            risk_per_trade = float(self.get_settings().get("max_risk_percent", 1.0)) / 100
        except Exception:
            risk_per_trade = 0.01

        strat = self.db.get_strategy(strategy_id)
        if not strat:
            self.log("error", f"Strategy {strategy_id} not found for backtest")
            return

        self.log("info", f"Starting backtest: {strat['name']} on {symbol} {timeframe}")

        resolved = self.select_symbol(symbol)
        bt_symbol = resolved or symbol

        candles, expected, error = self.fetch_history(bt_symbol, timeframe, from_date, to_date)
        if error:
            self.log("warning", error, bt_symbol)
            self.db.add_backtest_result({
                "strategy_id": strategy_id, "symbol": bt_symbol, "timeframe": timeframe,
                "from_date": from_date, "to_date": to_date,
                "requested_from_date": from_date, "requested_to_date": to_date,
                "expected_candles": expected, "received_candles": 0,
                "status": "failed", "error_message": "Insufficient historical data",
            })
            return

        tested_from, tested_to = candles[0]["time"][:10], candles[-1]["time"][:10]
        sl_pct = float(sym_cfg.get("fixed_sl_percent", 1.0)) if sym_cfg else 1.0
        tp_pct = float(sym_cfg.get("fixed_tp_percent", 2.0)) if sym_cfg else 2.0
        result = run_backtest(strat["code"], candles,
                              sl_pct=sl_pct, tp_pct=tp_pct,
                              initial_capital=initial_capital,
                              risk_per_trade=risk_per_trade,
                              broker_offset_hours=self.broker_offset_hours)

        if result.get("error"):
            self.db.add_backtest_result({
                "strategy_id": strategy_id, "symbol": bt_symbol, "timeframe": timeframe,
                "from_date": tested_from, "to_date": tested_to,
                "requested_from_date": from_date, "requested_to_date": to_date,
                "expected_candles": expected, "received_candles": len(candles),
                "status": "failed", "error_message": result["error"],
            })
            self.log("warning", f"Backtest failed: {result['error']}")
        else:
            self.db.add_backtest_result({
                "strategy_id": strategy_id, "symbol": bt_symbol, "timeframe": timeframe,
                "from_date": tested_from, "to_date": tested_to,
                "requested_from_date": from_date, "requested_to_date": to_date,
                "expected_candles": expected, "received_candles": len(candles),
                "initial_capital": initial_capital,
                "net_profit": result["net_profit"],
                "total_trades": result["total_trades"],
                "wins": result["wins"], "losses": result["losses"],
                "win_rate": result["win_rate"],
                "max_drawdown": result["max_drawdown"],
                "profit_factor": result["profit_factor"],
                "equity_curve": result["equity_curve"],
                "trades_detail": result["trades_detail"],
                "status": "completed",
                "avg_win": result.get("avg_win", 0),
                "avg_loss": result.get("avg_loss", 0),
                "expectancy": result.get("expectancy", 0),
                "max_consecutive_wins": result.get("max_consecutive_wins", 0),
                "max_consecutive_losses": result.get("max_consecutive_losses", 0),
                "sharpe_ratio": result.get("sharpe_ratio", 0),
                "sortino_ratio": result.get("sortino_ratio", 0),
                "total_commission": result.get("total_commission", 0),
            })
            self.log("info",
                f"Backtest done: {strat['name']} — profit={result['net_profit']}, trades={result['total_trades']}, win={result['win_rate']}%, sharpe={result.get('sharpe_ratio', 0)}, PF={result['profit_factor']}")

    def handle_optimize_request(self, details: dict):
        """Run strategy optimization and store results in the database."""
        strategy_id = details.get("strategy_id")
        symbol = details.get("symbol")
        timeframe = details.get("timeframe")
        from_date = details.get("from_date")
        to_date = details.get("to_date")
        initial_capital = float(details.get("initial_capital", 10000))

        if not strategy_id or not symbol:
            self.log("error", "Optimization request missing strategy_id or symbol")
            return

        self.sync_enabled_symbols()
        sym_cfg = next((s for s in self.enabled_symbols
                        if s["symbol"].lower() == str(symbol).lower()), None)

        try:
            risk_per_trade = float(self.get_settings().get("max_risk_percent", 1.0)) / 100
        except Exception:
            risk_per_trade = 0.01

        strat = self.db.get_strategy(strategy_id)
        if not strat:
            self.log("error", f"Strategy {strategy_id} not found for optimization")
            return

        self.log("info", f"Starting optimization: {strat['name']} on {symbol} {timeframe}")

        resolved = self.select_symbol(symbol)
        bt_symbol = resolved or symbol

        candles, _, error = self.fetch_history(bt_symbol, timeframe, from_date, to_date)
        if error:
            self.log("warning", error, bt_symbol)
            self.db.add_optimization_result({
                "strategy_id": strategy_id, "symbol": bt_symbol, "timeframe": timeframe,
                "from_date": from_date, "to_date": to_date,
                "status": "failed", "error_message": "Insufficient historical data",
            })
            return

        sl_pct = float(sym_cfg.get("fixed_sl_percent", 1.0)) if sym_cfg else 1.0
        tp_pct = float(sym_cfg.get("fixed_tp_percent", 2.0)) if sym_cfg else 2.0

        opt_result = optimize_strategy(
            strat["code"], candles,
            sl_pct=sl_pct, tp_pct=tp_pct,
            initial_capital=initial_capital,
            risk_per_trade=risk_per_trade,
            broker_offset_hours=self.broker_offset_hours,
        )

        if opt_result.get("error"):
            self.db.add_optimization_result({
                "strategy_id": strategy_id, "symbol": bt_symbol, "timeframe": timeframe,
                "from_date": from_date, "to_date": to_date,
                "status": "failed", "error_message": opt_result["error"],
            })
            self.log("warning", f"Optimization failed: {opt_result['error']}")
            return

        before = opt_result["before_result"]
        after = opt_result["after_result"]

        self.db.add_optimization_result({
            "strategy_id": strategy_id,
            "symbol": bt_symbol,
            "timeframe": timeframe,
            "from_date": from_date,
            "to_date": to_date,
            "before_net_profit": before.get("net_profit", 0),
            "before_win_rate": before.get("win_rate", 0),
            "before_profit_factor": before.get("profit_factor", 0),
            "before_max_drawdown": before.get("max_drawdown", 0),
            "before_sharpe_ratio": before.get("sharpe_ratio", 0),
            "before_total_trades": before.get("total_trades", 0),
            "after_net_profit": after.get("net_profit", 0),
            "after_win_rate": after.get("win_rate", 0),
            "after_profit_factor": after.get("profit_factor", 0),
            "after_max_drawdown": after.get("max_drawdown", 0),
            "after_sharpe_ratio": after.get("sharpe_ratio", 0),
            "after_total_trades": after.get("total_trades", 0),
            "param_changes": opt_result["param_changes"],
            "combinations_tried": opt_result["combinations_tried"],
            "best_score": opt_result["best_score"],
            "optimized_code": opt_result["optimized_code"],
            "status": "completed",
        })
        self.log("info",
            f"Optimization done: {strat['name']} — tried {opt_result['combinations_tried']} combos, "
            f"score={opt_result['best_score']:.2f}, "
            f"profit {before.get('net_profit', 0)} -> {after.get('net_profit', 0)}, "
            f"sharpe {before.get('sharpe_ratio', 0)} -> {after.get('sharpe_ratio', 0)}")

    def refresh_strategies(self):
        """Load all active strategies from the database into the cache."""
        try:
            active = self.db.get_active_strategies()
            self.strategy_cache = {s["id"]: s for s in active}
        except Exception as e:
            self.log("warning", f"Failed to load strategies: {e}")

    def generate_predictions(self):
        """Generate AI predictions and strategy signals for all enabled symbols."""
        if not self.enabled_symbols:
            self.log("warning", "No enabled symbols found — predictions skipped")
            return

        self.refresh_strategies()

        for sym in self.enabled_symbols:
            symbol = sym["symbol"]
            timeframe = sym["timeframe"]

            # Resolve symbol name (handles case mismatches like XAUUSD_L vs XAUUSD_l)
            resolved = self.select_symbol(symbol)
            if not resolved:
                continue
            symbol = resolved

            candles = get_candles(symbol, timeframe, 200)
            if len(candles) < 30:
                self.log("warning", f"Insufficient candles ({len(candles)} < 30) — skipping prediction", symbol)
                continue

            features = extract_features(candles)
            self.store_market_data(symbol, timeframe, candles, features)

            # Add time features
            now = datetime.now(timezone.utc)
            features["hour"] = now.hour
            features["day_of_week"] = now.weekday()
            broker_now = now + timedelta(hours=self.broker_offset_hours)
            features["broker_hour"] = broker_now.hour

            prediction = self.model.predict(features, self.ai_settings)

            try:
                self.db.add_prediction({
                    "symbol": symbol,
                    "timeframe": timeframe,
                    "direction": prediction["direction"],
                    "confidence": prediction["confidence"],
                    "predicted_price": prediction.get("predicted_price"),
                    "current_price": features.get("close"),
                    "model_version": prediction.get("model_version", "1.0"),
                    "features_snapshot": features,
                })
                self._log_throttled(
                    f"pred:{symbol}:{prediction['direction']}:{prediction['confidence']}", "info",
                    f"Prediction: {prediction['direction'].upper()} conf={prediction['confidence']}% (model={prediction.get('model_version', '1.0')})",
                    symbol)
            except Exception as e:
                self.log("warning", f"Failed to store prediction for {symbol}: {e}", symbol)

            # Run strategy signal if this symbol has an assigned strategy
            strategy_id = sym.get("strategy_id")
            strategy_mode = sym.get("strategy_mode", "ai")
            if strategy_id and strategy_id in self.strategy_cache and strategy_mode in ("strategy", "both"):
                strat = self.strategy_cache[strategy_id]
                try:
                    signal = self.strategy_runner.run(strat["code"], candles, features)
                    self.db.add_strategy_signal({
                        "strategy_id": strategy_id,
                        "symbol": symbol,
                        "direction": signal["direction"],
                        "confidence": signal["confidence"],
                        "reason": signal["reason"],
                    })
                    self._log_throttled(
                        f"signal:{strategy_id}:{signal['direction']}:{signal['reason']}", "info",
                        f"Strategy '{strat['name']}': {signal['direction'].upper()} conf={signal['confidence']:.0f}% — {signal['reason']}",
                        symbol)
                except StrategyError as e:
                    self.log("warning", f"Strategy error for {symbol}: {e}", symbol)

    def maybe_retrain(self, force: bool = False):
        """Retrain the model if enough new trades have accumulated."""
        if self.db is None:
            return
        retrain_interval = self.ai_settings["retraining_interval_trades"]
        if not force and self.trade_count_since_retrain < retrain_interval:
            return
        # At most one training attempt every 15 minutes
        if time.time() - self._last_retrain_attempt < 900:
            return
        self._last_retrain_attempt = time.time()

        self.log("info", "Starting model retraining...")
        try:
            history = self.db.get_trade_history(limit=500)
            report = self.model.train(history, self.ai_settings)

            self.db.add_learning_report({
                "model_version": report["model_version"],
                "training_samples": report["training_samples"],
                "accuracy": report["accuracy"],
                "precision": report.get("precision", 0),
                "recall": report.get("recall", 0),
                "win_rate": report.get("win_rate", 0),
                "backtest_profit": report.get("backtest_profit", 0),
                "backtest_trades": report.get("backtest_trades", 0),
                "backtest_win_rate": report.get("backtest_win_rate", 0),
                "notes": report.get("notes", ""),
            })

            self.log("info", f"Model retrained: accuracy={report['accuracy']}%, samples={report['training_samples']}")
            self.trade_count_since_retrain = 0
        except Exception as e:
            self.log("error", f"Retraining failed: {e}")

    def execute_trades(self):
        """Check predictions and open positions if conditions are met."""
        settings = self.get_settings()
        account = mt5.account_info()
        if not settings or account is None:
            return

        if not self._db_available():
            return

        mt5_positions = mt5.positions_get()
        if mt5_positions is None:
            self._log_throttled("trade:positions_read", "warning",
                "Could not read open positions from MT5 — no new trades this cycle", throttle_sec=60)
            return
        block_reason, updates = evaluate_capital(
            settings, account.equity, total_open_risk(mt5_positions), datetime.now(timezone.utc)
        )
        if updates:
            try:
                self.db.update_settings(**updates)
            except Exception as e:
                self.log("warning", f"Could not persist capital-guard updates: {e}")
            settings.update(updates)
        if block_reason != self.block_reason:
            self.block_reason = block_reason
            if block_reason:
                self.log("warning", f"New trades blocked: {block_reason}")
            else:
                self.log("info", "Capital limits are back within range, trading allowed")

        if not settings.get("is_running", False) or not settings.get("auto_mode", True):
            return
        if settings.get("trading_paused") or block_reason:
            return

        max_positions = settings.get("max_concurrent_positions", 5)
        risk_percent = settings.get("max_risk_percent", 1.0)
        min_confidence = self.ai_settings["min_confidence_threshold"]

        current_count = len(mt5_positions)
        if current_count >= max_positions:
            return

        open_symbols = {p.symbol.lower() for p in mt5_positions}
        open_symbols |= {row["symbol"].lower() for row in self.db.get_pending_orders("pending")}

        # Get latest prediction per symbol (keyed case-insensitively)
        try:
            predictions = self.db.get_recent_predictions(limit=max(50, len(self.enabled_symbols) * 5))
        except Exception:
            return

        latest_pred_by_symbol = {}
        for pred in predictions:
            sym = pred["symbol"].lower()
            if sym not in latest_pred_by_symbol:
                latest_pred_by_symbol[sym] = pred

        for sym in self.enabled_symbols:
            if current_count >= max_positions:
                break

            symbol = sym["symbol"]
            if symbol.lower() in open_symbols:
                continue  # one position per symbol

            resolved = self.select_symbol(symbol)
            if not resolved:
                continue
            symbol = resolved

            pred = latest_pred_by_symbol.get(sym["symbol"].lower())
            if not pred:
                self.log("warning", f"No prediction found for {sym['symbol']} (resolved={symbol})", symbol)
                continue

            confidence = pred.get("confidence", 0)
            direction = pred.get("direction")

            # Strategy mode: use strategy signal instead of or alongside AI prediction
            strategy_mode = sym.get("strategy_mode", "ai")
            strategy_id = sym.get("strategy_id")
            strategy_signal = None
            if strategy_id and strategy_mode in ("strategy", "both"):
                try:
                    signals = self.db.get_recent_signals(limit=200)
                    cutoff = datetime.now(timezone.utc) - timedelta(seconds=120)
                    for sig in signals:
                        if datetime.fromisoformat(sig["created_at"]) < cutoff:
                            break
                        if sig.get("strategy_id") == strategy_id and sig.get("symbol", "").lower() == symbol.lower():
                            strategy_signal = sig
                            break
                except Exception:
                    pass

            if strategy_mode == "strategy" and strategy_id:
                if not strategy_signal:
                    self._log_throttled(f"skip:{symbol}:no_strat_sig", "info", "Trade skipped: no strategy signal in the last 2 minutes", symbol)
                    continue
                trade_direction = strategy_signal.get("direction")
                if trade_direction == "neutral":
                    self._log_throttled(f"skip:{symbol}:strat_neutral", "info",
                        f"Trade skipped: strategy says neutral — {strategy_signal.get('reason', 'no reason recorded')}", symbol)
                    continue
                confidence = strategy_signal.get("confidence", 0)
                if confidence < min_confidence:
                    self._log_throttled(f"skip:{symbol}:strat_conf", "info",
                        f"Trade skipped: strategy confidence {confidence}% is below the {min_confidence}% threshold", symbol)
                    continue
            elif strategy_mode == "both" and strategy_id:
                strat_dir = strategy_signal.get("direction") if strategy_signal else None
                strat_conf = strategy_signal.get("confidence", 0) if strategy_signal else 0
                strat_reason = strategy_signal.get("reason", "") if strategy_signal else ""
                if strat_dir == "neutral" or not strat_dir:
                    self._log_throttled(f"skip:{symbol}:both_strat_{strat_dir}", "info",
                        f"Trade skipped (Both mode): strategy is neutral — {strat_reason or 'no recent strategy signal within 2 minutes'}; "
                        f"AI wanted {direction}", symbol)
                    continue
                if direction == "neutral" or not direction:
                    self._log_throttled(f"skip:{symbol}:both_ai_neutral", "info",
                        f"Trade skipped (Both mode): AI prediction is neutral at {confidence}% — strategy wanted {strat_dir}", symbol)
                    continue
                ai_dir = "buy" if direction == "up" else "sell"
                if strat_dir != ai_dir:
                    self._log_throttled(f"skip:{symbol}:both_disagree", "info",
                        f"Trade skipped (Both mode): AI says {ai_dir} but strategy says {strat_dir} ({strat_reason or 'no reason recorded'})", symbol)
                    continue
                # Fresh-signal guard: a decision must never rest on a stale strategy signal.
                try:
                    sig_age = (datetime.now(timezone.utc) - datetime.fromisoformat(strategy_signal["created_at"])).total_seconds()
                except Exception:
                    sig_age = 10_000_000
                if sig_age > 120:
                    self._log_throttled(f"skip:{symbol}:both_stale", "info",
                        f"Trade skipped (Both mode): strategy signal is {int(sig_age)}s old (max 120s)", symbol)
                    continue
                if confidence < min_confidence and strat_conf < min_confidence:
                    self._log_throttled(f"skip:{symbol}:both_conf", "info",
                        f"Trade skipped (Both mode): both confidences below {min_confidence}% (AI={confidence}%, strategy={strat_conf}%)", symbol)
                    continue
                confidence = max(confidence, strat_conf)
                self._log_throttled(f"skip:{symbol}:both_ok", "info",
                    f"Both mode agree on {ai_dir.upper()}: AI={confidence}% + strategy={strat_conf}% -> using {confidence}%", symbol)
                trade_direction = ai_dir
            else:
                if strategy_mode in ("strategy", "both") and not strategy_id:
                    self._log_throttled(f"skip:{symbol}:no_strat_id", "info",
                        f"Strategy mode is '{strategy_mode}' but no strategy assigned — using AI prediction only", symbol)
                if confidence < min_confidence:
                    self._log_throttled(f"skip:{symbol}:ai_conf", "info",
                        f"Trade skipped: confidence {confidence}% is below the {min_confidence}% threshold", symbol)
                    continue
                if direction == "neutral":
                    self._log_throttled(f"skip:{symbol}:ai_neutral", "info", "Trade skipped: AI prediction is neutral", symbol)
                    continue
                trade_direction = "buy" if direction == "up" else "sell"

            # Get symbol info
            sym_info = mt5.symbol_info(symbol)
            if sym_info is None:
                continue

            if not sym_info.visible:
                mt5.symbol_select(symbol, True)
                sym_info = mt5.symbol_info(symbol)
                if sym_info is None:
                    continue

            tick = mt5.symbol_info_tick(symbol)
            if tick is None:
                continue

            market_price = tick.ask if trade_direction == "buy" else tick.bid

            sl_tp_mode = sym.get("sl_tp_mode", "fixed")
            candles = get_candles(symbol, sym["timeframe"], 200)
            features = extract_features(candles) if candles else {}
            atr_val = features.get("atr", 0) or 0

            order_type = sym.get("order_type")
            limit_enabled = settings.get("enable_limit_orders", False)
            use_limit = order_type == "limit" and limit_enabled
            use_both = order_type == "both" and limit_enabled

            send_market = True
            send_limit = False

            if use_limit:
                send_market = False
                send_limit = True
            elif use_both:
                limit_price = limit_entry_price(
                    tick, trade_direction, atr_val,
                    sym.get("limit_order_distance_mult", 1.0),
                    settings.get("limit_order_offset_points", 0),
                    sym_info,
                )
                price_distance = abs(market_price - limit_price)
                atr_ratio = price_distance / atr_val if atr_val > 0 else 0

                high_confidence = confidence >= 75
                close_to_market = atr_ratio < 0.3

                if high_confidence and close_to_market:
                    self.log("info",
                        f"Both mode -> market order: confidence={confidence}% high, limit distance={atr_ratio:.2f} ATR (close to market)",
                        symbol)
                    send_market = True
                    send_limit = False
                else:
                    self.log("info",
                        f"Both mode -> limit order: confidence={confidence}%, limit distance={atr_ratio:.2f} ATR",
                        symbol)
                    send_market = False
                    send_limit = True

            if send_limit:
                if self._check_duplicate_order(symbol, trade_direction, "limit"):
                    continue
                limit_price = limit_entry_price(
                    tick, trade_direction, atr_val,
                    sym.get("limit_order_distance_mult", 1.0),
                    settings.get("limit_order_offset_points", 0),
                    sym_info,
                )
                limit_sl, limit_tp, limit_volume = self.build_trade_levels(
                    limit_price, trade_direction, atr_val, sl_tp_mode, sym, sym_info,
                    settings, account, risk_percent,
                )
                self.place_limit_order(symbol, trade_direction, limit_volume, limit_price, limit_sl, limit_tp,
                                       sl_tp_mode, sym, confidence)
                current_count += 1
                time.sleep(1)
                continue

            entry_price = market_price
            sl, tp, volume = self.build_trade_levels(
                entry_price, trade_direction, atr_val, sl_tp_mode, sym, sym_info,
                settings, account, risk_percent,
            )

            self.log("info",
                f"Opening {trade_direction.upper()} {symbol}: vol={volume}, SL={sl}, TP={tp}, conf={confidence}%",
                symbol,
                {"direction": trade_direction, "volume": volume, "sl": sl, "tp": tp, "confidence": confidence}
            )

            if self._check_duplicate_order(symbol, trade_direction, volume):
                continue

            ticket, order_err = send_order(symbol, trade_direction, volume, sl, tp,
                                comment=f"AI Bot {confidence:.0f}%")
            if ticket:
                try:
                    self.db.upsert_position({
                        "mt5_ticket": ticket,
                        "symbol": symbol,
                        "position_type": trade_direction,
                        "volume": volume,
                        "open_price": entry_price,
                        "current_price": entry_price,
                        "stop_loss": sl,
                        "take_profit": tp,
                        "sl_tp_mode": sl_tp_mode,
                        "order_type": "market",
                        "profit": 0,
                        "swap": 0,
                        "open_time": datetime.now(timezone.utc).isoformat(),
                        "prediction_confidence": confidence,
                    })
                    self.log("info", f"Position opened: {ticket}", symbol)
                except Exception as db_err:
                    # Order is live at the broker even if the dashboard record failed —
                    # sync_open_positions reconciles it on the next cycle.
                    self.log("warning",
                        f"Position {ticket} is open at the broker but could not be saved to the database "
                        f"({db_err}) — it will be picked up by the next position sync", symbol)
            else:
                self.log("error", f"Broker rejected order for {symbol}: {order_err}", symbol)

            current_count += 1
            time.sleep(1)  # small delay between orders

    def manage_positions(self):
        """Update trailing stops and check model-based exit signals."""
        positions = mt5.positions_get()
        if not positions:
            return
        db_rows = {p["mt5_ticket"]: p for p in self.db.get_open_positions()} if self.db is not None else {}

        for pos in positions:
            symbol = pos.symbol
            # Check trailing stop from symbol config
            sym_cfg = None
            for s in self.enabled_symbols:
                if s["symbol"].lower() == symbol.lower():
                    sym_cfg = s
                    break

            if (sym_cfg and pos.ticket in db_rows
                    and (sym_cfg.get("break_even_enabled") or sym_cfg.get("partial_close_enabled"))):
                self._apply_profit_protection(pos, sym_cfg, db_rows[pos.ticket])

            if sym_cfg and sym_cfg.get("use_trailing_stop") and sym_cfg.get("trailing_stop_points", 0) > 0:
                tick = mt5.symbol_info_tick(symbol)
                if not tick:
                    continue

                trail_points = sym_cfg["trailing_stop_points"]
                point = mt5.symbol_info(symbol).point
                trail_dist = trail_points * point

                pos_type = "buy" if pos.type == mt5.POSITION_TYPE_BUY else "sell"
                current_sl = pos.sl

                if pos_type == "buy":
                    new_sl = tick.bid - trail_dist
                    if new_sl > current_sl and new_sl > pos.price_open:
                        # Modify SL
                        request = {
                            "action": mt5.TRADE_ACTION_SLTP,
                            "symbol": symbol,
                            "position": pos.ticket,
                            "sl": new_sl,
                            "tp": pos.tp,
                        }
                        mt5.order_send(request)

                elif pos_type == "sell":
                    new_sl = tick.ask + trail_dist
                    if (current_sl == 0 or new_sl < current_sl) and new_sl < pos.price_open:
                        request = {
                            "action": mt5.TRADE_ACTION_SLTP,
                            "symbol": symbol,
                            "position": pos.ticket,
                            "sl": new_sl,
                            "tp": pos.tp,
                        }
                        mt5.order_send(request)

    def _check_duplicate_order(self, symbol: str, direction: str, volume) -> bool:
        """Prevent duplicate orders within a 5-second window."""
        key = f"{symbol}:{direction}:{volume}"
        now = time.time()
        self._recent_order_keys = {k: v for k, v in self._recent_order_keys.items() if now - v < 5}
        if key in self._recent_order_keys:
            self.log("warning", f"Duplicate order suppressed: {key}", symbol)
            return True
        self._recent_order_keys[key] = now
        return False

    def run(self):
        """Main engine loop."""
        self.log("info", "Trading engine starting...")

        self._mt5_connected = connect_mt5(self.config, self._desired_account_mode())
        if not self._mt5_connected:
            self.log("error", "MT5 is not connected to the selected account — retrying automatically")
        self.sync_enabled_symbols()

        hb_interval = self.config["engine"].get("heartbeat_interval_sec", 5)
        decision_interval = self.config["engine"].get("decision_interval_sec", 10)
        pred_interval = self.config["engine"].get("prediction_interval_sec", 30)

        last_heartbeat = 0
        last_decision = 0
        last_prediction = 0
        last_sync = 0
        last_symbol_sync = 0
        last_reconnect_check = 0

        self.log("info", "Engine running. Press Ctrl+C to stop.")

        try:
            while True:
                if self._shutdown_requested:
                    break
                now = time.time()

                # Check MT5 connection every 10 seconds and reconnect if needed
                if now - last_reconnect_check >= 10:
                    self.apply_account_mode()
                    if not ensure_mt5_connected():
                        if self._mt5_connected:
                            self.log("error", "MT5 connection lost — reconnecting...")
                            self._mt5_connected = False
                    else:
                        if not self._mt5_connected:
                            self.log("info", "MT5 connection restored")
                            self._mt5_connected = True
                    last_reconnect_check = now

                # Heartbeat
                if now - last_heartbeat >= hb_interval:
                    try:
                        account = mt5.account_info()
                        if account:
                            self.heartbeat(account.balance, account.equity, _account_type(account))
                        else:
                            self.db.update_heartbeat(0, 0, False)
                    except Exception as e:
                        self.log("warning", f"Heartbeat failed: {e}")
                    last_heartbeat = now

                # Skip cycles if MT5 is not connected
                if not self._mt5_connected:
                    time.sleep(2)
                    continue

                # Sync positions every 5 seconds — each call isolated so one failure doesn't block the others
                if now - last_sync >= 5:
                    try:
                        self.sync_open_positions()
                    except Exception as e:
                        self.log("warning", f"Position sync failed: {e}")
                    try:
                        self.sync_pending_orders()
                    except Exception as e:
                        self.log("warning", f"Pending order sync failed: {e}")
                    try:
                        self.check_manual_requests()
                    except Exception as e:
                        self.log("warning", f"Dashboard request check failed: {e}")
                    last_sync = now

                # Sync MT5 symbols to database every 60 seconds
                if now - last_symbol_sync >= 60:
                    try:
                        self.sync_mt5_symbols()
                    except Exception as e:
                        self.log("warning", f"Symbol sync failed: {e}")
                    last_symbol_sync = now

                # Generate predictions
                if now - last_prediction >= pred_interval:
                    try:
                        self.sync_enabled_symbols()
                        self.refresh_ai_settings()
                        self.generate_predictions()
                    except Exception as e:
                        self.log("error", f"Prediction cycle failed: {e}")
                    last_prediction = now

                # Execute trades
                if now - last_decision >= decision_interval:
                    try:
                        self.execute_trades()
                        self.manage_positions()
                        # First-run training: the rule-based model never retrains on trade
                        # count alone until enough trades exist, so attempt a history-based
                        # train shortly after startup too.
                        self.maybe_retrain(force=(not self.model.is_trained))
                    except Exception as e:
                        self.log("error", f"Decision cycle failed: {e}")
                    last_decision = now

                time.sleep(1)

        except KeyboardInterrupt:
            self.log("info", "Engine stopping by user request...")
        except Exception as e:
            self.log("error", f"Engine crashed: {e}")
        finally:
            try:
                self.db.update_heartbeat(0, 0, False)
            except Exception:
                pass
            mt5.shutdown()
            self.log("info", "Engine stopped. MT5 connection closed.")


if __name__ == "__main__":
    config = load_config()
    open_dashboard(config)
    engine = TradingEngine()
    engine.run()

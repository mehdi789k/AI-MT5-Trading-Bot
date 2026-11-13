"""
Supabase client wrapper for the trading engine.
Handles all reads/writes to the cloud database.
"""

import requests
import time
from datetime import datetime, timezone
from typing import Optional

from urllib3.util.retry import Retry
from requests.adapters import HTTPAdapter


_MAX_DB_RETRIES = 3
_DB_RETRY_BASE_DELAY = 1.0


class SupabaseClient:
    def __init__(self, url: str, anon_key: str):
        self.url = url.rstrip("/")
        self.anon_key = anon_key
        self.headers = {
            "apikey": anon_key,
            "Authorization": f"Bearer {anon_key}",
            "Content-Type": "application/json",
        }

        retry_strategy = Retry(
            total=3,
            backoff_factor=1.5,
            status_forcelist=(500, 502, 503, 504),
            allowed_methods=("GET", "POST", "PATCH", "DELETE"),
            raise_on_status=False,
            connect=5,
            read=5,
        )
        adapter = HTTPAdapter(max_retries=retry_strategy, pool_connections=4, pool_maxsize=10)
        self.session = requests.Session()
        self.session.mount("http://", adapter)
        self.session.mount("https://", adapter)
        self.session.headers.update(self.headers)

    def _request_with_retry(self, method: str, url: str, **kwargs) -> requests.Response:
        """Execute an HTTP request with retry-on-connection-error."""
        last_exc = None
        for attempt in range(_MAX_DB_RETRIES):
            try:
                return self.session.request(method, url, **kwargs)
            except (requests.exceptions.ConnectionError, requests.exceptions.Timeout) as e:
                last_exc = e
                if attempt < _MAX_DB_RETRIES - 1:
                    delay = _DB_RETRY_BASE_DELAY * (2 ** attempt)
                    time.sleep(delay)
            except requests.exceptions.SSLError as e:
                last_exc = e
                if attempt < _MAX_DB_RETRIES - 1:
                    delay = _DB_RETRY_BASE_DELAY * (2 ** attempt)
                    time.sleep(delay)
        raise last_exc

    def _get(self, table: str, params: Optional[dict] = None) -> list:
        url = f"{self.url}/rest/v1/{table}"
        resp = self._request_with_retry("GET", url, params=params or {}, timeout=15)
        resp.raise_for_status()
        return resp.json()

    def _post(self, table: str, data: dict) -> dict:
        url = f"{self.url}/rest/v1/{table}"
        headers = {"Prefer": "return=representation"}
        resp = self._request_with_retry("POST", url, headers=headers, json=data, timeout=15)
        resp.raise_for_status()
        return resp.json()[0] if resp.json() else {}

    def _patch(self, table: str, filters: str, data: dict) -> list:
        url = f"{self.url}/rest/v1/{table}?{filters}"
        headers = {"Prefer": "return=representation"}
        resp = self._request_with_retry("PATCH", url, headers=headers, json=data, timeout=15)
        resp.raise_for_status()
        return resp.json()

    def _delete(self, table: str, filters: str) -> None:
        url = f"{self.url}/rest/v1/{table}?{filters}"
        resp = self._request_with_retry("DELETE", url, timeout=15)
        resp.raise_for_status()

    # ---- bot_settings ----

    def get_settings(self) -> dict:
        rows = self._get("bot_settings", {"id": "eq.1"})
        return rows[0] if rows else {}

    def update_heartbeat(self, balance: float, equity: float, mt5_connected: bool):
        self._patch(
            "bot_settings",
            "id=eq.1",
            {
                "last_heartbeat": datetime.now(timezone.utc).isoformat(),
                "account_balance": balance,
                "account_equity": equity,
                "mt5_connected": mt5_connected,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            },
        )

    def update_settings(self, **kwargs):
        kwargs["updated_at"] = datetime.now(timezone.utc).isoformat()
        self._patch("bot_settings", "id=eq.1", kwargs)

    # ---- ai_prediction_settings ----

    def get_ai_prediction_settings(self) -> dict:
        rows = self._get("ai_prediction_settings", {"id": "eq.1"})
        if not rows:
            raise RuntimeError("ai_prediction_settings row is missing")
        return rows[0]

    # ---- symbol_config ----

    def get_enabled_symbols(self) -> list:
        return self._get("symbol_config", {"enabled": "eq.true"})

    def get_all_symbols(self) -> list:
        return self._get("symbol_config", {})

    def update_symbol(self, symbol_id: str, **kwargs):
        kwargs["updated_at"] = datetime.now(timezone.utc).isoformat()
        self._patch("symbol_config", f"id=eq.{symbol_id}", kwargs)

    # ---- open_positions ----

    def get_open_positions(self) -> list:
        return self._get("open_positions", {})

    def upsert_position(self, data: dict) -> dict:
        return self._post("open_positions", data)

    def update_position(self, ticket: int, **kwargs):
        kwargs["updated_at"] = datetime.now(timezone.utc).isoformat()
        self._patch("open_positions", f"mt5_ticket=eq.{ticket}", kwargs)

    def delete_position(self, ticket: int):
        self._delete("open_positions", f"mt5_ticket=eq.{ticket}")

    # ---- pending_orders ----

    def add_pending_order(self, data: dict) -> dict:
        return self._post("pending_orders", data)

    def get_pending_orders(self, status: str) -> list:
        return self._get("pending_orders", {"status": f"eq.{status}"})

    def update_pending_order(self, ticket: int, **kwargs):
        kwargs["updated_at"] = datetime.now(timezone.utc).isoformat()
        self._patch("pending_orders", f"mt5_order_ticket=eq.{ticket}", kwargs)

    # ---- trade_history ----

    def add_trade_history(self, data: dict) -> dict:
        return self._post("trade_history", data)

    def get_trade_history(self, limit: int = 500) -> list:
        return self._get(
            "trade_history",
            {"order": "close_time.desc", "limit": str(limit)},
        )

    # ---- market_data ----

    def upsert_market_data(self, rows: list):
        if not rows:
            return
        url = f"{self.url}/rest/v1/market_data"
        headers = {"Prefer": "return=minimal,resolution=merge-duplicates"}
        # The table's primary key is a random UUID, so the conflict target must be the unique natural key.
        params = {"on_conflict": "symbol,timeframe,time"}
        resp = self._request_with_retry("POST", url, params=params, headers=headers, json=rows, timeout=20)
        resp.raise_for_status()

    def get_market_data(self, symbol: str, timeframe: str, limit: int = 200) -> list:
        return self._get(
            "market_data",
            {
                "symbol": f"eq.{symbol}",
                "timeframe": f"eq.{timeframe}",
                "order": "time.desc",
                "limit": str(limit),
            },
        )

    # ---- predictions ----

    def add_prediction(self, data: dict) -> dict:
        return self._post("predictions", data)

    def get_recent_predictions(self, limit: int = 50) -> list:
        return self._get("predictions", {"order": "created_at.desc", "limit": str(limit)})

    # ---- learning_reports ----

    def add_learning_report(self, data: dict) -> dict:
        return self._post("learning_reports", data)

    def get_learning_reports(self, limit: int = 20) -> list:
        return self._get("learning_reports", {"order": "created_at.desc", "limit": str(limit)})

    # ---- mt5_symbols ----

    def upsert_mt5_symbols(self, rows: list):
        if not rows:
            return
        url = f"{self.url}/rest/v1/mt5_symbols"
        headers = {"Prefer": "return=minimal,resolution=merge-duplicates"}
        resp = self._request_with_retry("POST", url, headers=headers, json=rows, timeout=30)
        resp.raise_for_status()

    def delete_mt5_symbols_older_than(self, sync_ts: str):
        resp = self._request_with_retry(
            "DELETE",
            f"{self.url}/rest/v1/mt5_symbols",
            params={"updated_at": f"lt.{sync_ts}"},
            timeout=15,
        )
        resp.raise_for_status()

    # ---- bot_logs ----

    def add_log(self, level: str, message: str, symbol: str = "", details: dict = None):
        self._post(
            "bot_logs",
            {
                "level": level,
                "message": message,
                "symbol": symbol or None,
                "details": details or None,
            },
        )

    def get_recent_logs(self, limit: int = 20) -> list:
        return self._get("bot_logs", {"order": "created_at.desc", "limit": str(limit)})

    def mark_log_processed(self, log_id: int, details: dict):
        self._patch("bot_logs", f"id=eq.{log_id}", {"details": {**details, "_processed": True}})

    # ---- strategies ----

    def get_strategies(self) -> list:
        return self._get("strategies", {"order": "created_at.desc"})

    def get_active_strategies(self) -> list:
        return self._get("strategies", {"is_active": "eq.true"})

    def get_strategy(self, strategy_id: str) -> dict:
        rows = self._get("strategies", {"id": f"eq.{strategy_id}"})
        return rows[0] if rows else {}

    def add_strategy(self, data: dict) -> dict:
        return self._post("strategies", data)

    def update_strategy(self, strategy_id: str, **kwargs):
        kwargs["updated_at"] = datetime.now(timezone.utc).isoformat()
        self._patch("strategies", f"id=eq.{strategy_id}", kwargs)

    def delete_strategy(self, strategy_id: str):
        self._delete("strategies", f"id=eq.{strategy_id}")

    # ---- strategy_signals ----

    def add_strategy_signal(self, data: dict) -> dict:
        return self._post("strategy_signals", data)

    def get_recent_signals(self, limit: int = 50) -> list:
        return self._get("strategy_signals", {"order": "created_at.desc", "limit": str(limit)})

    # ---- strategy_backtest_results ----

    def add_backtest_result(self, data: dict) -> dict:
        return self._post("strategy_backtest_results", data)

    def get_backtest_results(self, strategy_id: str = "", limit: int = 20) -> list:
        params = {"order": "created_at.desc", "limit": str(limit)}
        if strategy_id:
            params["strategy_id"] = f"eq.{strategy_id}"
        return self._get("strategy_backtest_results", params)

    # ---- strategy backtest requests (via bot_logs) ----

    def add_backtest_request(self, strategy_id: str, symbol: str, timeframe: str,
                             from_date: str, to_date: str, initial_capital: float) -> dict:
        return self._post("bot_logs", {
            "level": "info",
            "message": "Backtest request",
            "details": {
                "action": "run_backtest",
                "strategy_id": strategy_id,
                "symbol": symbol,
                "timeframe": timeframe,
                "from_date": from_date,
                "to_date": to_date,
                "initial_capital": initial_capital,
            },
        })

    # ---- strategy_optimizations ----

    def add_optimization_result(self, data: dict) -> dict:
        return self._post("strategy_optimizations", data)

    def get_optimizations(self, strategy_id: str = "", limit: int = 20) -> list:
        params = {"order": "created_at.desc", "limit": str(limit)}
        if strategy_id:
            params["strategy_id"] = f"eq.{strategy_id}"
        return self._get("strategy_optimizations", params)

    def update_optimization(self, opt_id: str, **kwargs):
        kwargs["updated_at"] = datetime.now(timezone.utc).isoformat()
        self._patch("strategy_optimizations", f"id=eq.{opt_id}", kwargs)

"""
Self-learning AI prediction model.

Uses a gradient boosting classifier (sklearn) to predict short-term
price direction (up/down/neutral) from technical indicator features.
Retrains automatically as new trade results are stored.
Also handles backtesting and dynamic SL/TP calculation.
"""

import numpy as np
import pickle
import os
from datetime import datetime, timezone
from typing import Tuple, List, Optional

try:
    from sklearn.ensemble import GradientBoostingClassifier
    from sklearn.model_selection import cross_val_score
    SKLEARN_AVAILABLE = True
except ImportError:
    SKLEARN_AVAILABLE = False

MODEL_PATH = os.path.join(os.path.dirname(__file__), "model.pkl")
MODEL_VERSION = "1.0"


class PredictionModel:
    def __init__(self):
        self.model: Optional[object] = None
        self.training_samples = 0
        self.last_accuracy = 0.0
        self.is_trained = False
        self.feature_names = [
            "rsi", "atr", "macd", "trend", "volatility",
            "ema_fast", "ema_slow", "hour", "day_of_week",
        ]
        self.load_model()

    def load_model(self):
        if os.path.exists(MODEL_PATH):
            try:
                with open(MODEL_PATH, "rb") as f:
                    data = pickle.load(f)
                self.model = data.get("model")
                self.training_samples = data.get("samples", 0)
                self.last_accuracy = data.get("accuracy", 0.0)
                self.is_trained = self.model is not None
            except Exception:
                self.model = None
                self.is_trained = False

    def save_model(self, accuracy: float, samples: int):
        if self.model is None:
            return
        with open(MODEL_PATH, "wb") as f:
            pickle.dump({
                "model": self.model,
                "samples": samples,
                "accuracy": accuracy,
                "version": MODEL_VERSION,
                "trained_at": datetime.now(timezone.utc).isoformat(),
            }, f)

    def _features_to_vector(self, features: dict) -> np.ndarray:
        """Convert feature dict to ordered numpy vector."""
        vec = []
        for name in self.feature_names:
            val = features.get(name, 0)
            if val is None or (isinstance(val, float) and np.isnan(val)):
                val = 0
            vec.append(float(val))
        return np.array(vec).reshape(1, -1)

    def _prepare_training_data(self, trade_history: List[dict]) -> Tuple[np.ndarray, np.ndarray]:
        """
        Build training X, y from trade_history rows.
        Label: 1 if trade was profitable, 0 if loss.
        Features come from the feat_* columns stored at trade entry.
        """
        X, y = [], []
        for trade in trade_history:
            row = [
                trade.get("feat_rsi") or 0,
                trade.get("feat_atr") or 0,
                trade.get("feat_macd") or 0,
                trade.get("feat_trend") or 0,
                trade.get("feat_volatility") or 0,
                trade.get("feat_ema_fast") or 0,
                trade.get("feat_ema_slow") or 0,
                trade.get("feat_time_hour") or 0,
                trade.get("feat_day_of_week") or 0,
            ]
            label = 1 if trade.get("profit", 0) > 0 else 0
            X.append(row)
            y.append(label)
        return np.array(X), np.array(y)

    def train(self, trade_history: List[dict], settings: dict) -> dict:
        """
        Retrain the model from trade history using the stored AI settings.
        Returns a report dict with accuracy, sample count, etc.
        """
        if not SKLEARN_AVAILABLE:
            return self._fallback_report(len(trade_history))

        min_samples = settings["min_trades_for_model"]
        if len(trade_history) < min_samples:
            return {
                "model_version": MODEL_VERSION,
                "training_samples": len(trade_history),
                "accuracy": 0.0,
                "precision": 0.0,
                "recall": 0.0,
                "win_rate": 0.0,
                "backtest_profit": 0.0,
                "backtest_trades": 0,
                "backtest_win_rate": 0.0,
                "notes": f"Need {min_samples} trades to train, have {len(trade_history)}",
            }

        X, y = self._prepare_training_data(trade_history)

        if len(np.unique(y)) < 2:
            return {
                "model_version": MODEL_VERSION,
                "training_samples": len(trade_history),
                "accuracy": 0.0,
                "precision": 0.0,
                "recall": 0.0,
                "win_rate": float(np.mean(y) * 100) if len(y) > 0 else 0,
                "backtest_profit": 0.0,
                "backtest_trades": 0,
                "backtest_win_rate": 0.0,
                "notes": "Not enough class diversity to train (all wins or all losses)",
            }

        self.model = GradientBoostingClassifier(
            n_estimators=settings["gb_n_estimators"],
            max_depth=settings["gb_max_depth"],
            learning_rate=settings["gb_learning_rate"],
            subsample=settings["gb_subsample"],
            random_state=42,
        )
        self.model.fit(X, y)

        # Cross-validate
        cv_scores = cross_val_score(self.model, X, y, cv=min(5, len(y) // 2), scoring="accuracy")
        accuracy = float(np.mean(cv_scores) * 100)

        # Simple backtest on training data
        predictions = self.model.predict(X)
        backtest_wins = np.sum(predictions == y)
        backtest_win_rate = float(backtest_wins / len(y) * 100)
        profits = np.where(predictions == 1, 1, -1)  # simplified unit profit
        backtest_profit = float(np.sum(profits))

        self.training_samples = len(trade_history)
        self.last_accuracy = accuracy
        self.is_trained = True
        self.save_model(accuracy, len(trade_history))

        from sklearn.metrics import precision_score, recall_score
        precision = float(precision_score(y, predictions, zero_division=0) * 100)
        recall = float(recall_score(y, predictions, zero_division=0) * 100)
        win_rate = float(np.mean(y) * 100)

        return {
            "model_version": MODEL_VERSION,
            "training_samples": len(trade_history),
            "accuracy": round(accuracy, 2),
            "precision": round(precision, 2),
            "recall": round(recall, 2),
            "win_rate": round(win_rate, 2),
            "backtest_profit": round(backtest_profit, 2),
            "backtest_trades": len(y),
            "backtest_win_rate": round(backtest_win_rate, 2),
            "notes": f"Model retrained on {len(trade_history)} samples",
        }

    def predict(self, features: dict, settings: dict) -> dict:
        """
        Predict price direction from current features.
        Returns: {direction, confidence, predicted_price}
        direction: 'up', 'down', or 'neutral'
        confidence: 0-100
        """
        if not self.is_trained or self.model is None:
            return self._rule_based_predict(features, settings)

        vec = self._features_to_vector(features)
        proba = self.model.predict_proba(vec)[0]
        # Class 1 = up (profitable buy), Class 0 = down
        up_prob = proba[1] if len(proba) > 1 else 0.5
        diff = up_prob - 0.5

        if abs(diff) < settings["neutral_threshold"]:
            direction = "neutral"
            confidence = round(abs(diff) * 100, 2)
        elif diff > 0:
            direction = "up"
            confidence = round(up_prob * 100, 2)
        else:
            direction = "down"
            confidence = round((1 - up_prob) * 100, 2)

        current_price = features.get("close", 0)
        predicted_price = None
        if current_price and direction != "neutral":
            atr_val = features.get("atr", 0) or 0
            offset = atr_val * settings["predicted_price_atr_mult"]
            if direction == "up":
                predicted_price = round(current_price + offset, 5)
            else:
                predicted_price = round(current_price - offset, 5)

        return {
            "direction": direction,
            "confidence": confidence,
            "predicted_price": predicted_price,
            "model_version": MODEL_VERSION,
        }

    def _rule_based_predict(self, features: dict, settings: dict) -> dict:
        """Fallback prediction when model isn't trained yet."""
        rsi_val = features.get("rsi", 50) or 50
        trend_val = features.get("trend", 0) or 0
        macd_val = features.get("macd", 0) or 0
        trend_threshold = settings["rule_trend_threshold"]
        macd_weight = settings["rule_macd_weight"]

        score = 0
        if rsi_val < settings["rule_rsi_oversold"]:
            score += 1  # oversold → up
        elif rsi_val > settings["rule_rsi_overbought"]:
            score -= 1  # overbought → down
        if trend_val > trend_threshold:
            score += 1
        elif trend_val < -trend_threshold:
            score -= 1
        if macd_val > 0:
            score += macd_weight
        elif macd_val < 0:
            score -= macd_weight

        if score >= 0.5:
            direction = "up"
            confidence = min(50 + abs(score) * 15, 90)
        elif score <= -0.5:
            direction = "down"
            confidence = min(50 + abs(score) * 15, 90)
        else:
            direction = "neutral"
            confidence = 50

        return {
            "direction": direction,
            "confidence": round(confidence, 2),
            "predicted_price": None,
            "model_version": "rule_based",
        }

    def _fallback_report(self, sample_count: int) -> dict:
        return {
            "model_version": "rule_based",
            "training_samples": sample_count,
            "accuracy": 0.0,
            "precision": 0.0,
            "recall": 0.0,
            "win_rate": 0.0,
            "backtest_profit": 0.0,
            "backtest_trades": 0,
            "backtest_win_rate": 0.0,
            "notes": "sklearn not installed — using rule-based predictions",
        }

    def compute_dynamic_sl_tp(
        self, entry_price: float, direction: str, atr_val: float,
        sl_mult: float, tp_mult: float
    ) -> Tuple[float, float]:
        """Compute dynamic SL/TP based on ATR."""
        if atr_val <= 0:
            atr_val = entry_price * 0.01  # fallback: 1% of price

        if direction == "buy":
            sl = entry_price - atr_val * sl_mult
            tp = entry_price + atr_val * tp_mult
        else:
            sl = entry_price + atr_val * sl_mult
            tp = entry_price - atr_val * tp_mult

        return round(sl, 5), round(tp, 5)

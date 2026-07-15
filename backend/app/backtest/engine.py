"""Backtester — look-ahead-free event simulation.

Integrity rules (the things that make backtests lie if you get them wrong):
  * At decision bar i the engine sees ONLY df.iloc[:i+1]. No future bars.
  * Entry fills at bar i+1 OPEN (you cannot fill instantly on the signal bar).
  * Exits are checked bar-by-bar using intrabar high/low against the plan's
    absolute SL / TP levels.
  * Same-bar SL+TP ambiguity is resolved as SL-first (conservative, removes the
    optimistic bias that inflates most amateur backtests).
  * Round-trip transaction cost + slippage subtracted from every trade.
  * A max-hold time-stop closes trades that stall (exit at market).
"""
from __future__ import annotations
import pandas as pd

from ..engine.service import AnalysisService
from ..config import THRESHOLDS


class Backtester:
    def __init__(self, service: AnalysisService | None = None,
                 cost_bps: float = 6.0, min_history: int = 210,
                 max_hold_bars: int = 24, exit_target: str = "tp1",
                 score_threshold: float | None = None):
        self.service = service or AnalysisService()
        self.cost = cost_bps / 10000.0          # round-trip fraction
        self.min_history = min_history
        self.max_hold = max_hold_bars
        self.exit_target = exit_target          # 'tp1' or 'tp2'
        # override the VALID threshold if the walk-forward optimizer set one
        self.score_threshold = score_threshold

    def run(self, symbol: str, timeframe: str, df: pd.DataFrame,
            decision_step: int = 13) -> dict:
        """Walk the series, decide at every `decision_step` bars, simulate."""
        n = len(df)
        trades = []
        i = self.min_history
        while i < n - 2:
            slice_df = df.iloc[: i + 1]
            try:
                dec = self.service.decide(symbol, timeframe, df=slice_df)
            except ValueError:
                i += decision_step
                continue

            if self._is_tradable(dec):
                trade = self._simulate(df, i, dec)
                if trade:
                    trades.append(trade)
            i += decision_step

        span_days = self._span_days(df)
        from .metrics import compute_metrics
        metrics = compute_metrics(trades, span_days=span_days)
        return {"symbol": symbol, "timeframe": timeframe,
                "decision_points": (n - self.min_history) // decision_step,
                "trades_detail": trades, "metrics": metrics}

    # ---- helpers --------------------------------------------------------
    def _is_tradable(self, dec: dict) -> bool:
        if not dec.get("trade_plan"):
            return False
        thr = self.score_threshold if self.score_threshold is not None else THRESHOLDS["valid"]
        return dec["score"] >= thr

    def _simulate(self, df: pd.DataFrame, i: int, dec: dict) -> dict | None:
        plan = dec["trade_plan"]
        direction = plan["direction"]
        stop = plan["stop_loss"]
        tp = plan["take_profit_1"] if self.exit_target == "tp1" else plan["take_profit_2"]

        entry_idx = i + 1
        if entry_idx >= len(df):
            return None
        entry = float(df["open"].iloc[entry_idx])   # fill at next bar open

        exit_price = None
        exit_reason = None
        exit_idx = None
        last = min(entry_idx + self.max_hold, len(df) - 1)
        for j in range(entry_idx, last + 1):
            hi = float(df["high"].iloc[j])
            lo = float(df["low"].iloc[j])
            if direction == "LONG":
                hit_sl = lo <= stop
                hit_tp = hi >= tp
            else:
                hit_sl = hi >= stop
                hit_tp = lo <= tp
            if hit_sl and hit_tp:
                exit_price, exit_reason, exit_idx = stop, "SL", j   # conservative
                break
            if hit_sl:
                exit_price, exit_reason, exit_idx = stop, "SL", j
                break
            if hit_tp:
                exit_price, exit_reason, exit_idx = tp, "TP", j
                break
        if exit_price is None:  # time stop at market
            exit_idx = last
            exit_price = float(df["close"].iloc[last])
            exit_reason = "TIME"

        gross = (exit_price - entry) / entry if direction == "LONG" else (entry - exit_price) / entry
        net = gross - self.cost

        return {
            "entry_time": df.index[entry_idx].isoformat(),
            "exit_time": df.index[exit_idx].isoformat(),
            "direction": direction,
            "entry": round(entry, 4),
            "exit": round(exit_price, 4),
            "stop": round(stop, 4),
            "target": round(tp, 4),
            "reason": exit_reason,
            "bars_held": exit_idx - entry_idx,
            "pnl": round(net, 6),
            "pnl_gross": round(gross, 6),
            "score": dec["score"],
            "tier": dec["decision"],
        }

    @staticmethod
    def _span_days(df: pd.DataFrame) -> float:
        try:
            delta = df.index[-1] - df.index[0]
            return max(delta.total_seconds() / 86400.0, 1e-9)
        except Exception:
            return None

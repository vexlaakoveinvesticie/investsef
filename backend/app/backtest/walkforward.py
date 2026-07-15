"""Walk-forward validation to guard against overfitting.

The rule-based engine has no fitted weights, so the one thing that CAN be
curve-fit is the score threshold at which we take trades. So the honest test is:
  1. On the TRAIN slice (first 70%), find the threshold that maximizes Expected
     Value (subject to a minimum trade count).
  2. Apply that threshold UNCHANGED to the TEST slice (last 30%).
  3. Compare in-sample vs out-of-sample. If OOS collapses relative to IS, the
     threshold was overfit and the "edge" isn't real.

An anchored multi-fold variant repeats this over rolling windows for robustness.
"""
from __future__ import annotations
import pandas as pd

from .engine import Backtester
from .metrics import compute_metrics


CANDIDATE_THRESHOLDS = [60, 65, 70, 75, 80, 85]


def _score_slice(service, symbol, timeframe, df, threshold, decision_step, min_trades):
    bt = Backtester(service=service, score_threshold=threshold)
    res = bt.run(symbol, timeframe, df, decision_step=decision_step)
    m = res["metrics"]
    if m["trades"] < min_trades:
        return None, res
    return m, res


def walk_forward(service, symbol: str, timeframe: str, df: pd.DataFrame,
                 train_frac: float = 0.70, decision_step: int = 13,
                 min_train_trades: int = 15, min_test_trades: int = 10) -> dict:
    n = len(df)
    split = int(n * train_frac)
    train_df = df.iloc[:split]
    test_df = df.iloc[split - 210:]  # keep 210 bars of warmup before test window

    # ---- optimize threshold on TRAIN by Expected Value ----
    best_thr, best_ev, best_train_m = None, -1e9, None
    train_scan = {}
    for thr in CANDIDATE_THRESHOLDS:
        m, _ = _score_slice(service, symbol, timeframe, train_df, thr, decision_step, min_train_trades)
        if m is None:
            train_scan[thr] = "insufficient trades"
            continue
        train_scan[thr] = {"trades": m["trades"], "EV%": m["expected_value_pct"],
                           "PF": m["profit_factor"], "win%": m["win_rate"]}
        if m["expected_value_pct"] > best_ev:
            best_ev, best_thr, best_train_m = m["expected_value_pct"], thr, m

    if best_thr is None:
        return {"symbol": symbol, "timeframe": timeframe,
                "status": "INSUFFICIENT_TRAIN_DATA", "train_scan": train_scan}

    # ---- validate on TEST with the frozen threshold ----
    bt = Backtester(service=service, score_threshold=best_thr)
    test_res = bt.run(symbol, timeframe, test_df, decision_step=decision_step)
    test_m = test_res["metrics"]

    degradation = None
    if best_train_m and test_m["trades"] >= 1 and best_train_m["expected_value_pct"] != 0:
        degradation = round(
            (test_m["expected_value_pct"] - best_train_m["expected_value_pct"]), 4)

    status = "OK"
    if test_m["trades"] < min_test_trades:
        status = "INSUFFICIENT_TEST_DATA"

    return {
        "symbol": symbol,
        "timeframe": timeframe,
        "status": status,
        "chosen_threshold": best_thr,
        "train_scan": train_scan,
        "in_sample": best_train_m,
        "out_of_sample": test_m,
        "ev_change_oos_minus_is": degradation,
        "test_trades_detail": test_res["trades_detail"],
    }

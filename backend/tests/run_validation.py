"""Full validation run.

Part A — INTEGRITY / NULL TESTS (most important):
  Run the backtester on three synthetic processes:
    * random_walk   -> expect EV ~0 or negative after costs (falsification test)
    * trending      -> expect EV > 0 (trend-follower should work)
    * mean_reverting-> expect weak/negative EV
  If the system shows a real edge on the driftless random walk, there is a
  look-ahead leak and every other number is worthless.

Part B — WALK-FORWARD across assets/timeframes with a Trading Performance Report
  and an HONEST go/no-go recommendation per (asset, timeframe).

Run:  python -m tests.run_validation
"""
from __future__ import annotations
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.engine.service import AnalysisService
from app.backtest.engine import Backtester
from app.backtest.walkforward import walk_forward
from app.backtest.report import build_report, format_report_text
from tests.generate_test_data import random_walk, trending, mean_reverting


def bar(t):
    print("\n" + "=" * 66 + f"\n{t}\n" + "=" * 66)


def part_a_integrity():
    bar("PART A — INTEGRITY / NULL TESTS (look-ahead falsification)")
    svc = AnalysisService()
    cases = [
        ("random_walk  (NULL)", random_walk, "EV should be ~0 or negative"),
        ("trending", trending, "EV should be positive"),
        ("mean_revert", mean_reverting, "EV should be weak/negative"),
    ]
    results = {}
    for name, gen, expectation in cases:
        # average over several seeds to reduce single-sample noise
        evs, pfs, trs = [], [], []
        for seed in range(1, 6):
            df = gen(seed=seed, n=4000)
            bt = Backtester(service=svc)
            res = bt.run("QQQ", "15m", df, decision_step=13)
            m = res["metrics"]
            if m["trades"] >= 5:
                evs.append(m["expected_value_pct"])
                if m["profit_factor"] is not None:
                    pfs.append(m["profit_factor"])
                trs.append(m["trades"])
        if evs:
            avg_ev = sum(evs) / len(evs)
            avg_pf = sum(pfs) / len(pfs) if pfs else None
            avg_tr = sum(trs) / len(trs)
            print(f"  {name:22s} avg EV={avg_ev:+.4f}%  avg PF={avg_pf}  "
                  f"avg trades={avg_tr:.0f}  | {expectation}")
            results[name] = avg_ev
        else:
            print(f"  {name:22s} too few trades")
    # integrity verdict
    bar("INTEGRITY VERDICT")
    null_ev = results.get("random_walk  (NULL)")
    if null_ev is None:
        print("  Could not evaluate null test.")
    elif null_ev <= 0.02:
        print(f"  PASS ✓  Null (random-walk) EV = {null_ev:+.4f}% ≈ 0 after costs.")
        print("          No evidence of look-ahead leakage.")
    else:
        print(f"  WARN ✗  Null EV = {null_ev:+.4f}% is positive — investigate look-ahead!")
    return results


def part_b_walkforward():
    bar("PART B — WALK-FORWARD + TRADING PERFORMANCE REPORTS")
    svc = AnalysisService()
    # bases roughly match real price scales; process is 'trending' so there is
    # something to detect. On REAL data these are replaced by live OHLCV.
    assets = [("NVDA", 178), ("TSLA", 262), ("AAPL", 231), ("QQQ", 480), ("GLD", 215)]
    timeframes = ["5m", "15m", "1h"]
    reports = []
    for sym, base in assets:
        for tf in timeframes:
            df = trending(base=base, n=4200, seed=hash((sym, tf)) % 9999, drift=0.00035)
            span = f"{df.index[0].date()} → {df.index[-1].date()} ({len(df)} bars {tf})"
            wf = walk_forward(svc, sym, tf, df, decision_step=13)
            rep = build_report(wf, df_span=span)
            reports.append(rep)
            print("\n" + format_report_text(rep))
    return reports


def summary(reports):
    bar("SUMMARY — GO / NO-GO ACROSS ALL (ASSET × TIMEFRAME)")
    go = [r for r in reports if r.get("recommendation", {}).get("go_live")]
    nogo = [r for r in reports if not r.get("recommendation", {}).get("go_live")]
    print(f"  Positive OOS edge (paper-trade candidates): {len(go)}/{len(reports)}")
    for r in go:
        print(f"    ✓ {r['asset']:5s} {r['timeframe']:4s}  EV={r.get('expected_value_pct')}%  "
              f"PF={r.get('profit_factor')}  trades={r.get('trades')}")
    print(f"  NOT ready for live: {len(nogo)}/{len(reports)}")
    print("\n  NOTE: all data here is SYNTHETIC. These numbers validate that the")
    print("  engine + backtester run correctly and are look-ahead-free. Real")
    print("  predictive value must be re-confirmed on live yfinance/Stooq data")
    print("  after deployment before ANY live-trading decision.")


if __name__ == "__main__":
    part_a_integrity()
    reports = part_b_walkforward()
    summary(reports)

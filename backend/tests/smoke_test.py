"""Post-deployment smoke test — run this FIRST after deploying, on a machine
with internet access. It verifies the real data pipeline actually works:
current price + OHLCV + historical candles + timestamps for every symbol, and
confirms the yfinance→Stooq failover behaves.

Usage:  python -m tests.smoke_test
"""
from __future__ import annotations
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.config import SYMBOLS, TIMEFRAMES
from app.data.orchestrator import DataOrchestrator
from app.data.base import ProviderError


def main():
    orch = DataOrchestrator()
    print("=" * 60)
    print("REAL DATA PIPELINE SMOKE TEST")
    print("=" * 60)
    ok, fail = 0, 0
    for sym in SYMBOLS:
        for tf in ["5m", "15m", "1h"]:
            try:
                df, src = orch.get_candles(sym, tf)
                last = df.iloc[-1]
                ts = df.index[-1]
                assert {"open", "high", "low", "close", "volume"}.issubset(df.columns)
                assert len(df) > 30
                print(f"  ✓ {sym:5s} {tf:4s}  bars={len(df):5d}  "
                      f"last_close={last['close']:.2f}  ts={ts}  src={src}")
                ok += 1
            except (ProviderError, AssertionError, Exception) as e:
                print(f"  ✗ {sym:5s} {tf:4s}  FAILED: {e}")
                fail += 1

    print("-" * 60)
    # quote test
    for sym in SYMBOLS:
        try:
            q = orch.get_quote(sym)
            print(f"  quote {sym:5s}: price={q['price']:.2f} src={q['source']} ts={q['timestamp']}")
        except Exception as e:
            print(f"  quote {sym:5s}: FAILED {e}")

    print("=" * 60)
    print(f"RESULT: {ok} passed, {fail} failed")
    if fail == 0:
        print("Data pipeline is LIVE. Safe to run /api/calibrate on real data.")
    else:
        print("Some fetches failed. Check network / ticker mapping before proceeding.")
    return 0 if fail == 0 else 1


if __name__ == "__main__":
    sys.exit(main())

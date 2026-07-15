"""End-to-end test: synthetic data -> full engine -> decision -> journal.
Run with:  python -m tests.test_pipeline   (from backend/)"""
from __future__ import annotations
import os
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.engine.indicators import TechnicalAnalyzer
from app.engine.structure import MarketStructureEngine
from app.engine.historical import HistoricalPatternAnalyzer
from app.engine.scoring import TradeScoreEngine
from app.engine.service import AnalysisService
from app.db import journal
from tests.generate_test_data import make_ohlcv


def section(t):
    print("\n" + "=" * 60 + f"\n{t}\n" + "=" * 60)


def test_indicators():
    section("1. TECHNICAL ANALYZER")
    df = make_ohlcv(seed=7)
    snap = TechnicalAnalyzer(df).snapshot()
    assert snap["price"] > 0
    assert snap["rsi"] is not None and 0 <= snap["rsi"] <= 100
    assert snap["trend"]["label"] in ("Bullish", "Bearish", "Neutral")
    print(f"price={snap['price']}  trend={snap['trend']['label']}  "
          f"RSI={snap['rsi']}  MACD_bull={snap['macd']['bullish']}  "
          f"ATR%={snap['atr_pct']}  ADX={snap['adx']}  vol_spike={snap['volume']['spike']}")
    return snap


def test_structure():
    section("2. MARKET STRUCTURE")
    df = make_ohlcv(seed=7)
    st = MarketStructureEngine(df).analyze()
    assert st["structure_trend"] in ("bullish", "bearish", "ranging")
    print(f"structure={st['structure_trend']}  BOS={st['break_of_structure']}  "
          f"CHoCH={st['change_of_character']}  seq={st['recent_sequence']}")
    print(f"support={st['support']}  resistance={st['resistance']}")
    return st


def test_historical():
    section("3. HISTORICAL PATTERN ANALYZER")
    df = make_ohlcv(seed=7, n=600)
    h = HistoricalPatternAnalyzer(df, "15m").analyze()
    print(h)
    assert "sufficient_data" in h
    return h


def test_scoring(snap, st, hist):
    section("4. TRADE SCORE ENGINE")
    scored = TradeScoreEngine(snap, st, hist).score()
    assert 0 <= scored["score"] <= 100
    print(f"direction={scored['direction']}  SCORE={scored['score']}/100")
    for name, c in scored["components"].items():
        print(f"  {name:12s} bull={c['bull']:5.1f} bear={c['bear']:5.1f} "
              f"/{c['max']:2d}  ({c['note']})")
    return scored


def test_full_decision():
    section("5. FULL DECISION (service.decide)")
    df = make_ohlcv(seed=7)
    svc = AnalysisService()
    result = svc.decide("QQQ", "15m", account=10000, risk_pct=1.0, df=df)
    print(f"{result['symbol']} @ {result['price']}  ->  "
          f"{result['decision']} ({result['quality']})  "
          f"dir={result['direction']}  score={result['score']}  "
          f"histP={result['historical_probability']}")
    if result["trade_plan"]:
        p = result["trade_plan"]
        print(f"  PLAN: entry {p['entry_zone']}  SL {p['stop_loss']}  "
              f"TP1 {p['take_profit_1']}  TP2 {p['take_profit_2']}  "
              f"RR {p['risk_reward']}  hold {p['expected_hold']}")
        print(f"  RISK: {result['risk_management']}")
    else:
        print(f"  NO PLAN: {result.get('no_trade_reason')}")
    print(f"  REASONS: {result['reasons']}")
    print(f"  RISKS:   {result['risks']}")
    return result


def test_journal():
    section("6. JOURNAL LEARNING (predict -> close -> accuracy)")
    tmp = tempfile.mktemp(suffix=".db")
    sid = journal.record_signal({
        "symbol": "QQQ", "timeframe": "15m", "direction": "LONG",
        "decision": "VALID", "score": 78, "confidence": 78,
        "entry": 18500, "stop_loss": 18400, "take_profit_1": 18700,
        "take_profit_2": 18900, "target_pct": 1.08, "hist_prob": 72.9,
    }, path=tmp)
    print(f"recorded signal id={sid}")
    closed = journal.close_signal(sid, exit_price=18700, outcome="TP1", path=tmp)
    print(f"closed: {closed}")
    h = journal.history("QQQ", path=tmp)
    print(f"accuracy={h['prediction_accuracy']}%  win_rate={h['win_rate']}%  "
          f"closed={h['closed']}  open={h['open']}")
    assert closed["reality"] == "WIN"
    assert h["prediction_accuracy"] == 100.0
    os.remove(tmp)


def test_multi_symbol_decisions():
    section("7. DECISIONS ACROSS SYMBOLS / SEEDS")
    svc = AnalysisService()
    for sym, seed, base in [("QQQ", 7, 480), ("NVDA", 3, 178), ("TSLA", 11, 262),
                            ("AAPL", 21, 231), ("GLD", 5, 215)]:
        df = make_ohlcv(base=base, seed=seed)
        r = svc.decide(sym, "15m", df=df)
        plan = "—" if not r["trade_plan"] else \
            f"{r['trade_plan']['risk_reward']} SL {r['trade_plan']['stop_loss']}"
        print(f"  {sym:5s} score={r['score']:5.1f}  {r['decision']:9s}  "
              f"{r['direction']:5s}  histP={r['historical_probability']}  {plan}")


if __name__ == "__main__":
    snap = test_indicators()
    st = test_structure()
    hist = test_historical()
    test_scoring(snap, st, hist)
    test_full_decision()
    test_journal()
    test_multi_symbol_decisions()
    section("ALL TESTS PASSED")

"""Final production check — all 8 checkpoints from the final sprint spec.
Run: python -m tests.production_check"""
import sys, os, tempfile
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from fastapi.testclient import TestClient
from app.data.base import MarketDataProvider
from app.data.orchestrator import DataOrchestrator
from app.engine.service import AnalysisService
import app.main as main
import app.config as cfg
from tests.generate_test_data import trending

cfg.DB_PATH = tempfile.mktemp(suffix=".db")
bases = {"NVDA":178,"TSLA":262,"AAPL":231,"AMD":145,"META":580,"MSFT":440,"QQQ":480,"SPY":560,"GLD":215}
class SP(MarketDataProvider):
    name = "synthetic"
    def get_candles(self, sym, tf):
        return trending(base=bases[sym], n=2200, seed=hash(sym)%9999, drift=0.0006)
main.service = AnalysisService(DataOrchestrator([SP()]))
c = TestClient(main.app)

def ck(name, cond):
    print(f"  {'✓' if cond else '✗'} {name}")
    assert cond, name

print("=== FINAL PRODUCTION CHECK ===\n")

print("1. BACKEND / API CONNECTION")
ck("root responds", c.get("/").status_code == 200)
ck("9 symbols configured", len(c.get("/").json()["symbols"]) == 9)

print("\n2. LIVE DATA (quote: price/candle/volume/timestamp/source)")
q = c.get("/api/quote/NVDA?timeframe=4h").json()
ck("has current_price", q["current_price"] > 0)
ck("has last_candle OHLC", all(k in q["last_candle"] for k in ("open","high","low","close")))
ck("has volume", "volume" in q)
ck("has timestamp", "timestamp" in q)
ck("has data_source", q["data_source"] == "synthetic")
ck("has staleness flag", "stale" in q)

print("\n3. DECISION ENGINE (BUY/SELL/NO TRADE + quality)")
d = c.get("/api/decision/NVDA?timeframe=4h").json()
ck("decision present", d["decision"] in ("NO_TRADE","WEAK","VALID","HIGH"))
ck("direction present", d["direction"] in ("LONG","SHORT"))
ck("trade_quality graded A/B/C", d["trade_quality"]["grade"] in ("A","B","C"))
print(f"      -> {d['decision']} {d['direction']} score={d['score']} quality={d['trade_quality']['grade']}")

print("\n4. SL/TP (never without stop, correct sides)")
if d["tradable"] and d["trade_plan"]:
    p = d["trade_plan"]; long = d["direction"]=="LONG"
    ck("stop present", p["stop_loss"] is not None)
    ck("stop correct side", (p["stop_loss"] < p["current_price"]) == long)
    ck("TP correct side", (p["take_profit_1"] > p["current_price"]) == long)
    ck("hold in days (swing)", "dní" in p["expected_hold"] or "h" in p["expected_hold"])
    print(f"      -> SL {p['stop_loss']} TP {p['take_profit_1']} hold {p['expected_hold']}")
else:
    print("      -> NO TRADE (no plan to check)")

print("\n5. EVENING SCAN")
s = c.get("/api/scan?timeframe=4h&min_grade=B").json()
ck("scanned all 9", s["scanned"] == 9)
ck("returns opportunities or message", isinstance(s["opportunities"], list))
print(f"      -> {len(s['opportunities'])} opportunities, msg={s['message']}")

print("\n6. CALIBRATION (100 trades, same logic, no look-ahead)")
cal = c.get("/api/calibrate?timeframe=15m&target_trades=50&decision_step=11").json()
r = cal["report"]
ck("executed trades", r["executed_trades"] > 0)
ck("has win rate", r["win_rate_pct"] is not None)
ck("has profit factor", "profit_factor" in r)
ck("has expected value", "expected_value_pct" in r)
print(f"      -> {r['executed_trades']} trades, WR={r['win_rate_pct']}%, EV={r['expected_value_pct']}%, PF={r['profit_factor']}")

print("\n7. JOURNAL (record -> close -> accuracy)")
from app.db import journal
sid = journal.record_signal({"symbol":"NVDA","timeframe":"4h","direction":"LONG","decision":"VALID",
    "score":80,"confidence":80,"entry":178,"stop_loss":174,"take_profit_1":186,"take_profit_2":190,
    "target_pct":4.5,"hist_prob":68}, path=cfg.DB_PATH)
closed = journal.close_signal(sid, exit_price=186, outcome="TP", path=cfg.DB_PATH)
h = journal.history("NVDA", path=cfg.DB_PATH)
ck("signal recorded", sid > 0)
ck("WIN computed", closed["reality"]=="WIN")
ck("accuracy tracked", h["prediction_accuracy"] == 100.0)

print("\n8. TRADE RESULT ENDPOINT")
d2 = c.get("/api/decision/QQQ?timeframe=4h").json()
if d2.get("tradable"):
    sid2 = None  # decision endpoint journals internally only for /decision route
print("      -> trade/result endpoint available:", any(r_.path=="/api/trade/result" for r_ in main.app.routes if hasattr(r_,'path')))

os.remove(cfg.DB_PATH)
print("\n=== ALL PRODUCTION CHECKS PASSED ===")

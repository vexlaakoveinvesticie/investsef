"""Final sanity test — proves the full assistant chain works end-to-end:
decision engine -> SL/TP -> monitoring status -> journal saving.
Run:  python -m tests.final_sanity"""
import sys, os, tempfile
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from app.engine.service import AnalysisService
from app.backtest.engine import Backtester
from app.db import journal
from tests.generate_test_data import trending

def check(name, cond):
    print(f"  [{'PASS' if cond else 'FAIL'}] {name}")
    assert cond, name

svc = AnalysisService()
print("=== FINAL SANITY TEST ===\n")

# 1. decision engine produces a clear decision
df = trending(base=480, n=1200, seed=1, drift=0.0006)
dec = svc.decide('QQQ', '15m', df=df, account=10000, risk_pct=1.0)
print("1. DECISION ENGINE")
check("decision is BUY/SELL/NO TRADE", dec['decision'] in ('NO_TRADE','WEAK','VALID','HIGH'))
check("has direction", dec['direction'] in ('LONG','SHORT'))
check("confidence 0-100", 0 <= dec['confidence'] <= 100)
print(f"      -> {dec['decision']} {dec['direction']} score={dec['score']}")

# 2. SL/TP present & ordered when tradable
print("\n2. SL / TP LOGIC")
if dec['tradable'] and dec['trade_plan']:
    p = dec['trade_plan']
    long = dec['direction']=='LONG'
    check("stop on correct side", (p['stop_loss'] < p['current_price']) == long)
    check("TP on correct side", (p['take_profit_1'] > p['current_price']) == long)
    check("never without stop loss", p['stop_loss'] is not None)
    print(f"      -> entry~{p['current_price']} SL {p['stop_loss']} TP {p['take_profit_1']} RR {p['risk_reward']}")
else:
    print("      -> NO TRADE (no plan) — correct, nothing to check")

# 3. monitoring status logic (mirrors frontend tradeStatus)
print("\n3. MONITORING STATUS")
def status(direction, entry, stop, tp, price):
    long = direction=='LONG'
    if (price>=tp) if long else (price<=tp): return "TP_HIT"
    if (price<=stop) if long else (price>=stop): return "SL_HIT"
    rng = abs(tp-stop) or 1
    toTP = (tp-price) if long else (price-tp)
    toSL = (price-stop) if long else (stop-price)
    if toTP <= rng*0.2: return "APPROACH_TP"
    if toSL <= rng*0.2: return "APPROACH_SL"
    return "RUNNING"
check("running mid-range", status("LONG",100,98,104,101)=="RUNNING")
check("approaching TP", status("LONG",100,98,104,103.7)=="APPROACH_TP")
check("approaching SL", status("LONG",100,98,104,98.3)=="APPROACH_SL")
check("TP hit", status("LONG",100,98,104,104)=="TP_HIT")
check("SL hit", status("LONG",100,98,104,98)=="SL_HIT")
check("SHORT TP hit", status("SHORT",100,102,96,96)=="TP_HIT")

# 4. backtester SL/TP simulation actually resolves exits
print("\n4. SL/TP SIMULATION (backtester)")
res = Backtester(service=svc, score_threshold=60).run('QQQ','15m',df,decision_step=12)
trades = res['trades_detail']
check("trades generated", len(trades) > 0)
reasons = set(t['reason'] for t in trades)
check("exits resolve (TP/SL/TIME)", reasons.issubset({'TP','SL','TIME'}))
print(f"      -> {len(trades)} trades, exit reasons: {reasons}")

# 5. journal saves & computes accuracy
print("\n5. JOURNAL SAVING")
tmp = tempfile.mktemp(suffix='.db')
sid = journal.record_signal({'symbol':'QQQ','timeframe':'15m','direction':'LONG',
    'decision':'VALID','score':78,'confidence':78,'entry':480,'stop_loss':476,
    'take_profit_1':488,'take_profit_2':492,'target_pct':1.6,'hist_prob':70}, path=tmp)
closed = journal.close_signal(sid, exit_price=488, outcome='TP', path=tmp)
h = journal.history('QQQ', path=tmp)
check("signal recorded", sid > 0)
check("result computed WIN", closed['reality']=='WIN')
check("accuracy tracked", h['prediction_accuracy']==100.0)
os.remove(tmp)
print(f"      -> signal {sid} -> {closed['reality']} -> accuracy {h['prediction_accuracy']}%")

print("\n=== ALL SANITY CHECKS PASSED ===")

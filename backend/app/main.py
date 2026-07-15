"""FastAPI application exposing the analytical engine.

Endpoints
---------
GET  /api/analyze/{symbol}    full indicator + structure + historical analysis
GET  /api/decision/{symbol}   BUY / SELL / WAIT decision + trade plan (+journals it)
GET  /api/history/{symbol}    stored signals + realized accuracy for a symbol
POST /api/trade/result        record a closed trade's outcome
GET  /api/webhook/tradingview TradingView alert receiver (push channel)
"""
from __future__ import annotations
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from .config import SYMBOLS, TIMEFRAMES, CORS_ORIGINS
from .data.orchestrator import DataOrchestrator
from .data.base import ProviderError
from .engine.service import AnalysisService
from .db import journal
from .db.database import init_db
from .schemas import TradeResultIn, TradeResultOut


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(title="AI Trade Decision Engine", version="1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware, allow_origins=CORS_ORIGINS, allow_methods=["*"], allow_headers=["*"],
)

service = AnalysisService(DataOrchestrator())


def _validate(symbol: str, timeframe: str):
    if symbol not in SYMBOLS:
        raise HTTPException(404, f"unknown symbol '{symbol}'. Known: {list(SYMBOLS)}")
    if timeframe not in TIMEFRAMES:
        raise HTTPException(400, f"unknown timeframe '{timeframe}'. Known: {list(TIMEFRAMES)}")


@app.get("/api/info")
def api_info():
    return {"service": "AI Trade Decision Engine", "symbols": list(SYMBOLS),
            "timeframes": list(TIMEFRAMES)}


@app.get("/api/analyze/{symbol}")
def analyze(symbol: str, timeframe: str = Query("15m")):
    _validate(symbol, timeframe)
    try:
        return service.analyze(symbol, timeframe)
    except ProviderError as e:
        raise HTTPException(503, f"data unavailable: {e}")
    except ValueError as e:
        raise HTTPException(422, str(e))


@app.get("/api/decision/{symbol}")
def decision(symbol: str, timeframe: str = Query("15m"),
             account: float = Query(10000.0, gt=0), risk_pct: float = Query(1.0, gt=0, le=100),
             journal_it: bool = Query(True)):
    _validate(symbol, timeframe)
    try:
        result = service.decide(symbol, timeframe, account=account, risk_pct=risk_pct)
    except ProviderError as e:
        raise HTTPException(503, f"data unavailable: {e}")
    except ValueError as e:
        raise HTTPException(422, str(e))

    # journal only actionable setups
    if journal_it and result.get("tradable") and result.get("trade_plan"):
        plan = result["trade_plan"]
        sid = journal.record_signal({
            "symbol": symbol, "timeframe": timeframe,
            "direction": result["direction"], "decision": result["decision"],
            "score": result["score"], "confidence": result["confidence"],
            "entry": plan["current_price"], "stop_loss": plan["stop_loss"],
            "take_profit_1": plan["take_profit_1"], "take_profit_2": plan["take_profit_2"],
            "target_pct": result.get("target_pct"),
            "hist_prob": result.get("historical_probability"),
        })
        result["signal_id"] = sid
    return result


@app.get("/api/history/{symbol}")
def get_history(symbol: str):
    if symbol != "ALL" and symbol not in SYMBOLS:
        raise HTTPException(404, f"unknown symbol '{symbol}'")
    return journal.history(None if symbol == "ALL" else symbol)


@app.post("/api/trade/result", response_model=TradeResultOut)
def trade_result(payload: TradeResultIn):
    try:
        return journal.close_signal(payload.signal_id, payload.exit_price, payload.outcome)
    except ValueError as e:
        raise HTTPException(404, str(e))


@app.post("/api/webhook/tradingview")
def tradingview_webhook(payload: dict):
    """Receives a TradingView alert (JSON body configured in the alert).
    Stored as a lightweight event; a real deployment would trigger a re-decision."""
    return {"received": True, "payload_keys": list(payload.keys())}


@app.get("/api/quote/{symbol}")
def quote(symbol: str, timeframe: str = Query("4h")):
    """Live data verification: current price, last candle, volume, timestamp,
    data source, and a staleness flag."""
    _validate(symbol, timeframe)
    import pandas as pd
    from datetime import datetime, timezone
    try:
        df, src = service.data.get_candles(symbol, timeframe)
    except ProviderError as e:
        raise HTTPException(503, f"data unavailable: {e}")
    last = df.iloc[-1]
    ts = df.index[-1]

    # Real-time price: Finnhub first (orchestrator quote chain), candle close
    # only as a fallback. Candles may lag ~15 min (Yahoo); the quote does not.
    price = float(last["close"])
    price_src = src
    price_ts = ts
    try:
        q = service.data.get_quote(symbol)
        price = float(q["price"])
        price_src = q["source"]
        price_ts = pd.Timestamp(q["timestamp"])
    except ProviderError:
        pass

    age_h = (datetime.now(timezone.utc) - ts.to_pydatetime()).total_seconds() / 3600
    # a candle older than ~3 bars of the timeframe is considered stale
    tf_h = TIMEFRAMES[timeframe]["minutes"] / 60
    stale = age_h > tf_h * 3
    return {
        "symbol": symbol, "name": SYMBOLS[symbol]["name"],
        "current_price": round(price, 4),
        "price_source": price_src,
        "price_timestamp": price_ts.isoformat(),
        "last_candle": {"open": round(float(last["open"]), 4), "high": round(float(last["high"]), 4),
                        "low": round(float(last["low"]), 4), "close": round(float(last["close"]), 4)},
        "volume": float(last["volume"]),
        "timestamp": ts.isoformat(),
        "data_source": src,
        "age_hours": round(age_h, 1),
        "stale": stale,
    }


@app.get("/api/scan")
def scan(timeframe: str = Query("4h"), account: float = Query(10000.0, gt=0),
         risk_pct: float = Query(1.0, gt=0, le=100), min_grade: str = Query("B")):
    """Evening Market Scan — runs the decision engine across the whole universe
    and returns ranked TOP OPPORTUNITIES (quality A/B only by default)."""
    if timeframe not in TIMEFRAMES:
        raise HTTPException(400, f"unknown timeframe '{timeframe}'")
    from .engine.quality import grade_trade  # noqa
    grade_rank = {"A": 0, "B": 1, "C": 2}
    opportunities = []
    errors = {}
    for sym in SYMBOLS:
        try:
            d = service.decide(sym, timeframe, account=account, risk_pct=risk_pct)
        except (ProviderError, ValueError) as e:
            errors[sym] = str(e)
            continue
        q = d.get("trade_quality", {})
        if d.get("tradable") and d.get("trade_plan") and grade_rank.get(q.get("grade"), 3) <= grade_rank.get(min_grade, 1):
            plan = d["trade_plan"]
            opportunities.append({
                "asset": sym, "name": d["name"], "direction": d["direction"],
                "quality": q.get("grade"), "confidence": round(d["confidence"]),
                "entry_zone": plan["entry_zone"], "stop_loss": plan["stop_loss"],
                "take_profit": plan["take_profit_1"], "risk_reward": plan["risk_reward"],
                "expected_hold": plan["expected_hold"],
                "historical_probability": d.get("historical_probability"),
                "current_price": d["price"],
            })
    # rank: quality first, then confidence
    opportunities.sort(key=lambda o: (grade_rank.get(o["quality"], 3), -o["confidence"]))
    return {
        "timeframe": timeframe,
        "scanned": len(SYMBOLS),
        "opportunities": opportunities,
        "message": None if opportunities else "NO HIGH QUALITY SETUP TODAY",
        "errors": errors or None,
    }


@app.get("/api/calibrate")
def calibrate(timeframe: str = Query("15m"), target_trades: int = Query(100, ge=10, le=500),
              decision_step: int = Query(10, ge=1)):
    """AI Calibration Test — runs the EXACT live decision logic over history and
    reports whether the engine has a positive historical edge. No future-data
    leakage; uses the same look-ahead-free backtester as production."""
    if timeframe not in TIMEFRAMES:
        raise HTTPException(400, f"unknown timeframe '{timeframe}'")
    from .backtest.calibration import run_calibration, calibration_verdict
    try:
        out = run_calibration(service, target_trades=target_trades,
                              timeframe=timeframe, decision_step=decision_step)
    except ProviderError as e:
        raise HTTPException(503, f"data unavailable: {e}")
    out["verdict"] = calibration_verdict(out["report"])
    return out


@app.get("/api/backtest/{symbol}")
def backtest(symbol: str, timeframe: str = Query("15m"),
             decision_step: int = Query(13, ge=1),
             score_threshold: float = Query(75.0, ge=0, le=100)):
    """Run a look-ahead-free backtest on live-fetched history for one symbol.
    On deployment this pulls real yfinance/Stooq data; the metrics include
    Expected Value, profit factor, drawdown and Sharpe."""
    _validate(symbol, timeframe)
    from .backtest.engine import Backtester
    try:
        df, _src = service.data.get_candles(symbol, timeframe)
    except ProviderError as e:
        raise HTTPException(503, f"data unavailable: {e}")
    bt = Backtester(service=service, score_threshold=score_threshold)
    res = bt.run(symbol, timeframe, df, decision_step=decision_step)
    # drop the heavy per-trade detail from the default response
    res.pop("trades_detail", None)
    return res


@app.get("/api/validate/{symbol}")
def validate(symbol: str, timeframe: str = Query("15m"),
             decision_step: int = Query(13, ge=1)):
    """Walk-forward validation + Trading Performance Report with an honest
    go/no-go recommendation. Uses live-fetched history on deployment."""
    _validate(symbol, timeframe)
    from .backtest.walkforward import walk_forward
    from .backtest.report import build_report
    try:
        df, _src = service.data.get_candles(symbol, timeframe)
    except ProviderError as e:
        raise HTTPException(503, f"data unavailable: {e}")
    span = f"{df.index[0].date()} → {df.index[-1].date()} ({len(df)} bars {timeframe})"
    wf = walk_forward(service, symbol, timeframe, df, decision_step=decision_step)
    return build_report(wf, df_span=span)


# ── Servovanie frontendu (ak existuje zbuildovaný priečinok static) ─────────
# Pri nasadení cez root Dockerfile sa sem skopíruje frontend/dist ako static/.
# Pri lokálnom behu bez frontendu vráti koreň informačný JSON.
from pathlib import Path as _Path
from fastapi.staticfiles import StaticFiles as _StaticFiles

_static_dir = _Path(__file__).resolve().parent.parent / "static"
if _static_dir.is_dir():
    app.mount("/", _StaticFiles(directory=str(_static_dir), html=True), name="frontend")
else:
    @app.get("/")
    def root():
        return {"service": "AI Trade Decision Engine", "symbols": list(SYMBOLS),
                "timeframes": list(TIMEFRAMES), "hint": "frontend nie je pribalený — API beží na /api/*"}

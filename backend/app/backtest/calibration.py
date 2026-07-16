"""AI Calibration — answers one question honestly: does the LIVE decision engine
have a positive statistical edge on history?

It uses the *exact* same logic as live trading (same TechnicalAnalyzer, structure,
score engine, entry/SL/TP), the same look-ahead-free Backtester, and the same
VALID score threshold the live system uses. No separate 'backtest strategy',
no future-data leakage. It simply keeps collecting executed trades across the
symbol universe until it has `target` of them, then reports — including the
calibration-specific signal: average confidence of winners vs losers."""
from __future__ import annotations
from statistics import mean

from ..config import SYMBOLS, THRESHOLDS
from ..engine.service import AnalysisService
from .engine import Backtester
from .metrics import compute_metrics


def run_calibration(service: AnalysisService, target_trades: int = 100,
                    timeframe: str = "15m", decision_step: int = 10,
                    symbols: list[str] | None = None,
                    data_provider=None) -> dict:
    """data_provider(symbol_key, timeframe) -> DataFrame lets callers inject
    synthetic data for offline runs; when None, live data is fetched."""
    from ..config import TRADE_UNIVERSE
    symbols = symbols or (TRADE_UNIVERSE or list(SYMBOLS))
    # live tradable floor: score >= 75 (VALID or HIGH), exactly like production.
    # THRESHOLDS['weak']=75 is the boundary above which classify_score marks a
    # setup tradable, so that is the correct calibration threshold.
    bt = Backtester(service=service, score_threshold=THRESHOLDS["weak"])

    all_trades = []
    opportunities = 0
    per_symbol = {}
    for sym in symbols:
        if data_provider is not None:
            df = data_provider(sym, timeframe)
        else:
            df, _ = service.data.get_candles(sym, timeframe)
        res = bt.run(sym, timeframe, df, decision_step=decision_step)
        opportunities += res["decision_points"]
        for t in res["trades_detail"]:
            t["asset"] = sym
        per_symbol[sym] = len(res["trades_detail"])
        all_trades.extend(res["trades_detail"])

    # chronological order, then take the first `target` executed trades
    all_trades.sort(key=lambda t: t["entry_time"])
    executed = all_trades[:target_trades]

    metrics = compute_metrics(executed)
    winners = [t for t in executed if t["pnl"] > 0]
    losers = [t for t in executed if t["pnl"] <= 0]
    avg_conf_win = round(mean([t["score"] for t in winners]), 1) if winners else None
    avg_conf_los = round(mean([t["score"] for t in losers]), 1) if losers else None
    avg_hold = round(mean([t["bars_held"] for t in executed]), 1) if executed else None

    report = {
        "tested_opportunities": opportunities,
        "executed_trades": len(executed),
        "winning_trades": len(winners),
        "losing_trades": len(losers),
        "win_rate_pct": metrics.get("win_rate"),
        "avg_winning_trade_pct": metrics.get("avg_win_pct"),
        "avg_losing_trade_pct": metrics.get("avg_loss_pct"),
        "profit_factor": metrics.get("profit_factor"),
        "max_drawdown_pct": metrics.get("max_drawdown_pct"),
        "expected_value_pct": metrics.get("expected_value_pct"),
        "expectancy_positive": metrics.get("expectancy_positive"),
        "avg_confidence_winners": avg_conf_win,
        "avg_confidence_losers": avg_conf_los,
        "confidence_calibrated": (avg_conf_win is not None and avg_conf_los is not None
                                  and avg_conf_win > avg_conf_los),
        "avg_holding_bars": avg_hold,
        "trades_per_symbol": per_symbol,
        "threshold_used": THRESHOLDS["weak"],
        "timeframe": timeframe,
    }
    return {"report": report, "trades": executed}


def calibration_verdict(report: dict, min_trades: int = 30) -> dict:
    """Honest go/no-go for paper trading based on the calibration."""
    reasons = []
    n = report["executed_trades"]
    ev = report["expected_value_pct"]
    pf = report["profit_factor"]

    ok = True
    if n < min_trades:
        ok = False
        reasons.append(f"málo obchodov ({n} < {min_trades})")
    if ev is None or ev <= 0:
        ok = False
        reasons.append(f"Expected Value nie je kladné (EV={ev}%)")
    if pf is None or pf < 1.2:
        ok = False
        reasons.append(f"profit factor pod prahom (PF={pf} < 1.2)")
    if not report.get("confidence_calibrated"):
        reasons.append("confidence nie je kalibrované (víťazi nemajú vyššiu istotu než porazení)")

    if ok:
        verdict = "Historicky KLADNÁ štatistická výhoda — odporúčam pokračovať na PAPER TRADING"
    else:
        verdict = "BEZ dostatočnej výhody — neprechádzať na paper trading, najprv optimalizovať"
    return {"recommend_paper_trading": ok, "verdict": verdict, "reasons": reasons or ["všetky kritériá splnené"]}

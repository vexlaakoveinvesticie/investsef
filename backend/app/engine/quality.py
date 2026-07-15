"""Trade Quality filter — grades a decision A / B / C from signals the engine
already computed (no new indicators). A = high quality, B = acceptable,
C = avoid. Only A and B are recommended for trading."""
from __future__ import annotations


def grade_trade(decision: dict) -> dict:
    """decision = output of AnalysisService.decide(). Returns quality grade +
    the component checks behind it."""
    snap = decision.get("_snapshot", {})
    score = decision.get("score", 0)
    hist_prob = decision.get("historical_probability")
    breakdown = decision.get("score_breakdown", {})
    direction = decision.get("direction")

    checks = {}

    # trend quality: how much of the trend weight was earned in trade direction
    tw = breakdown.get("trend", {})
    trend_pts = (tw.get("bull", 0) if direction == "LONG" else tw.get("bear", 0))
    checks["trend_quality"] = _band(trend_pts / max(tw.get("max", 20), 1))

    # liquidity: volume component earned
    vw = breakdown.get("volume", {})
    vol_pts = (vw.get("bull", 0) if direction == "LONG" else vw.get("bear", 0))
    checks["liquidity"] = _band(vol_pts / max(vw.get("max", 15), 1))

    # volatility: ATR% in a healthy swing band (not dead, not chaotic)
    atr_pct = snap.get("atr_pct")
    if atr_pct is None:
        checks["volatility"] = "mid"
    else:
        checks["volatility"] = "good" if 0.3 <= atr_pct <= 4.0 else "poor"

    # market condition: ADX trend strength
    adx = snap.get("adx")
    checks["market_condition"] = "good" if (adx and adx > 25) else ("mid" if (adx and adx > 18) else "poor")

    # risk/reward feasibility
    rrw = breakdown.get("risk_reward", {})
    rr_pts = rrw.get("bull", 0) + rrw.get("bear", 0)
    checks["risk_reward"] = _band(rr_pts / max(rrw.get("max", 10), 1))

    # historical performance
    if hist_prob is None:
        checks["historical"] = "mid"
    else:
        checks["historical"] = "good" if hist_prob >= 60 else ("mid" if hist_prob >= 50 else "poor")

    # ---- aggregate to a letter grade ----
    good = sum(1 for v in checks.values() if v in ("good", "high"))
    poor = sum(1 for v in checks.values() if v in ("poor", "low"))

    if score >= 85 and good >= 4 and poor == 0:
        grade = "A"
    elif score >= 75 and poor <= 1:
        grade = "B"
    else:
        grade = "C"

    return {
        "grade": grade,
        "recommended": grade in ("A", "B"),
        "checks": checks,
        "label": {"A": "High quality", "B": "Acceptable", "C": "Avoid"}[grade],
    }


def _band(frac: float) -> str:
    if frac >= 0.66:
        return "good"
    if frac >= 0.33:
        return "mid"
    return "poor"

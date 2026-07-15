"""Entry decision logic + TradePlanGenerator.
Maps the score to NO_TRADE / WEAK / VALID / HIGH, and when tradable builds a
full plan: ATR-based stop, RR-based TP1/TP2, expected hold time. Never emits a
plan without a stop loss."""
from __future__ import annotations

from ..config import THRESHOLDS, PLAN, TIMEFRAMES


def classify_score(score: float) -> dict:
    t = THRESHOLDS
    if score < t["no_trade"]:
        return {"decision": "NO_TRADE", "quality": "No trade", "tradable": False}
    if score < t["weak"]:
        return {"decision": "WEAK", "quality": "Wait / weak setup", "tradable": False}
    if score < t["valid"]:
        return {"decision": "VALID", "quality": "Valid setup", "tradable": True}
    return {"decision": "HIGH", "quality": "High quality setup", "tradable": True}


class TradePlanGenerator:
    def __init__(self, snapshot: dict, timeframe: str = "15m"):
        self.s = snapshot
        self.tf = timeframe

    def build(self, direction: str, score: float) -> dict | None:
        price = self.s["price"]
        atr = self.s["atr"]
        if not price or not atr:
            return None

        long = direction == "LONG"
        stop_dist = atr * PLAN["sl_atr_mult"]
        stop = price - stop_dist if long else price + stop_dist
        tp1 = price + stop_dist * PLAN["tp1_rr"] if long else price - stop_dist * PLAN["tp1_rr"]
        tp2 = price + stop_dist * PLAN["tp2_rr"] if long else price - stop_dist * PLAN["tp2_rr"]

        # enforce minimum RR (by construction tp1_rr already >= min, kept as guard)
        rr = PLAN["tp1_rr"]
        if rr < PLAN["min_rr"]:
            return None

        entry_low = price * (0.9992 if long else 1.0008)
        entry_high = price * (1.0008 if long else 0.9992)

        return {
            "direction": direction,
            "entry_zone": [round(min(entry_low, entry_high), 4), round(max(entry_low, entry_high), 4)],
            "current_price": round(price, 4),
            "stop_loss": round(stop, 4),
            "take_profit_1": round(tp1, 4),
            "take_profit_2": round(tp2, 4),
            "risk_reward": f"1:{rr:g}",
            "risk_per_unit": round(stop_dist, 4),
            "expected_hold": self._hold_time(stop_dist, atr),
        }

    def _hold_time(self, stop_dist: float, atr: float) -> str:
        # estimate bars to reach ~2.5R at current ATR pace, then convert to a
        # human range. Swing timeframes (4h/1d) are expressed in days.
        bars = (stop_dist * 2.5) / max(atr * 0.55, 1e-9)
        minutes = bars * TIMEFRAMES.get(self.tf, {"minutes": 15})["minutes"]
        days = minutes / (60 * 24)
        if days >= 1:
            lo = max(1, round(days * 0.7))
            hi = max(lo + 1, round(days * 1.4))
            return f"{lo}–{hi} dní"
        if minutes < 45:
            return "15–45 min"
        if minutes < 180:
            return "1–3 h"
        if minutes < 600:
            return "3–8 h"
        return "8–24 h"


def position_size(account: float, risk_pct: float, risk_per_unit: float) -> dict:
    risk_amount = account * (risk_pct / 100.0)
    size = risk_amount / risk_per_unit if risk_per_unit > 0 else 0.0
    return {
        "risk_amount": round(risk_amount, 2),
        "position_size": round(size, 4),
        "max_loss": round(risk_amount, 2),
    }

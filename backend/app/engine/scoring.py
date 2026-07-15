"""TradeScoreEngine — replaces the frontend's manual score with a real
weighted computation summing to 100.

Design: components split into two groups.
  * DIRECTIONAL (trend, momentum, volume, structure): each awards points to
    the bull OR bear side. The dominant side sets the trade direction.
  * QUALITY (volatility, risk_reward, conditions): these don't pick a side.
    They credit the ALREADY-winning direction, because good volatility / RR /
    trend-strength make the chosen setup better, not more ambiguous. Awarding
    them to both sides equally (an earlier bug) made every setup un-tradable.

Final score = winning direction's total (0-100) = setup quality / confidence.
"""
from __future__ import annotations

from ..config import WEIGHTS


class TradeScoreEngine:
    def __init__(self, snapshot: dict, structure: dict, historical: dict | None = None):
        self.s = snapshot
        self.st = structure
        self.hist = historical or {}

    def score(self) -> dict:
        comps = {}
        comps["trend"] = self._trend()
        comps["momentum"] = self._momentum()
        comps["volume"] = self._volume()
        comps["structure"] = self._structure()

        bull = sum(c["bull"] for c in comps.values())
        bear = sum(c["bear"] for c in comps.values())
        direction = "LONG" if bull >= bear else "SHORT"

        # quality components credit the winning side only
        for name, qc in (("volatility", self._volatility()),
                         ("risk_reward", self._risk_reward()),
                         ("conditions", self._conditions(direction))):
            pts = qc["pts"]
            comps[name] = {
                "bull": pts if direction == "LONG" else 0.0,
                "bear": pts if direction == "SHORT" else 0.0,
                "max": qc["max"], "note": qc["note"],
            }

        bull = sum(c["bull"] for c in comps.values())
        bear = sum(c["bear"] for c in comps.values())
        total = bull if direction == "LONG" else bear

        return {
            "direction": direction,
            "score": round(min(total, 100.0), 1),
            "bull_points": round(bull, 1),
            "bear_points": round(bear, 1),
            "components": comps,
        }

    # ---- directional components ----------------------------------------
    def _trend(self):
        w = WEIGHTS["trend"]
        t = self.s["trend"]
        e20, e50, price = t["ema20"], t["ema50"], t["price"]
        above200 = t.get("above_ema200")
        bull = bear = 0.0
        if None not in (e20, e50, price):
            if e20 > e50:
                bull += w * 0.5
            else:
                bear += w * 0.5
            if price > e20:
                bull += w * 0.3
            else:
                bear += w * 0.3
            if above200 is True:
                bull += w * 0.2
            elif above200 is False:
                bear += w * 0.2
        return _c(bull, bear, w, f"EMA trend {t['label']}")

    def _momentum(self):
        w = WEIGHTS["momentum"]
        rsi = self.s["rsi"]
        macd = self.s["macd"]
        bull = bear = 0.0
        if rsi is not None:
            if 50 <= rsi <= 68:
                bull += w * 0.4
            elif rsi > 68:
                bull += w * 0.15   # bullish but extended
            elif 32 <= rsi < 50:
                bear += w * 0.4
            else:
                bear += w * 0.15
        if macd.get("bullish"):
            bull += w * 0.6
        else:
            bear += w * 0.6
        return _c(bull, bear, w, f"RSI {rsi}, MACD {'bull' if macd.get('bullish') else 'bear'}")

    def _volume(self):
        w = WEIGHTS["volume"]
        v = self.s["volume"]
        macd_bull = self.s["macd"].get("bullish")
        bull = bear = 0.0
        if v["spike"]:
            if macd_bull:
                bull += w * 0.7
            else:
                bear += w * 0.7
        elif v["ratio"] and v["ratio"] > 1.15:
            if macd_bull:
                bull += w * 0.45
            else:
                bear += w * 0.45
        else:
            if macd_bull:
                bull += w * 0.15
            else:
                bear += w * 0.15
        return _c(bull, bear, w, f"vol x{v['ratio']} spike={v['spike']}")

    def _structure(self):
        w = WEIGHTS["structure"]
        st = self.st
        bull = bear = 0.0
        if st["structure_trend"] == "bullish":
            bull += w * 0.4
        elif st["structure_trend"] == "bearish":
            bear += w * 0.4
        if st["break_of_structure"] == "bullish":
            bull += w * 0.4
        elif st["break_of_structure"] == "bearish":
            bear += w * 0.4
        if st["change_of_character"] == "bullish":
            bull += w * 0.2
        elif st["change_of_character"] == "bearish":
            bear += w * 0.2
        return _c(bull, bear, w, f"struct {st['structure_trend']} BOS={st['break_of_structure']}")

    # ---- quality components (return {"pts","max","note"}) ---------------
    def _volatility(self):
        w = WEIGHTS["volatility"]
        atr_pct = self.s.get("atr_pct")
        pts = 0.0
        if atr_pct is not None:
            if 0.15 <= atr_pct <= 1.6:
                pts = w * 1.0
            elif atr_pct < 0.15:
                pts = w * 0.4
            else:
                pts = w * 0.3
        return {"pts": round(pts, 2), "max": w, "note": f"ATR {atr_pct}%"}

    def _risk_reward(self):
        w = WEIGHTS["risk_reward"]
        st, price, atr = self.st, self.s["price"], self.s["atr"]
        pts = 0.0
        if atr and price:
            up = st.get("resistance") or []
            dn = st.get("support") or []
            room_up = (up[0] - price) if up else atr * 4
            room_dn = (price - dn[0]) if dn else atr * 4
            stop = atr * 1.5
            best_room = max(room_up, room_dn)
            if best_room >= stop * 2:
                pts = w * 1.0
            elif best_room >= stop * 1.3:
                pts = w * 0.5
            else:
                pts = w * 0.2
        return {"pts": round(pts, 2), "max": w, "note": "RR feasibility"}

    def _conditions(self, direction):
        w = WEIGHTS["conditions"]
        adx = self.s.get("adx")
        prob = self.hist.get("historical_probability")
        pts = 0.0
        if adx is not None:
            pts += w * 0.5 if adx > 25 else (w * 0.25 if adx > 18 else 0.0)
        if prob is not None:
            exp = self.hist.get("expected_direction")
            if exp == direction and prob >= 55:
                pts += w * 0.5
            elif exp == direction and prob >= 45:
                pts += w * 0.25
        return {"pts": round(min(pts, w), 2), "max": w, "note": f"ADX {adx}, histP {prob}"}


def _c(bull, bear, w, note):
    return {"bull": round(min(bull, w), 2), "bear": round(min(bear, w), 2),
            "max": w, "note": note}

"""MarketStructureEngine — price-action structure without indicators.
Detects swing pivots, labels the sequence (HH/HL/LH/LL), and flags
Break of Structure (BOS, trend continuation) and Change of Character
(CHoCH, first break against the prevailing trend). Support/resistance
come from clustering recent pivots."""
from __future__ import annotations
import numpy as np
import pandas as pd

from ..config import IND


class MarketStructureEngine:
    def __init__(self, df: pd.DataFrame):
        self.df = df
        self.high = df["high"].values
        self.low = df["low"].values
        self.close = df["close"].values
        self.k = IND["swing_lookback"]

    # ---- swing pivots ---------------------------------------------------
    def _pivots(self):
        """Return two lists of (index, price): swing highs and swing lows.
        A swing high is a bar whose high is the max of its +/-k neighborhood."""
        highs, lows = [], []
        n = len(self.df)
        k = self.k
        for i in range(k, n - k):
            hwin = self.high[i - k:i + k + 1]
            lwin = self.low[i - k:i + k + 1]
            if self.high[i] == hwin.max():
                highs.append((i, float(self.high[i])))
            if self.low[i] == lwin.min():
                lows.append((i, float(self.low[i])))
        return highs, lows

    # ---- structure labels ----------------------------------------------
    def analyze(self) -> dict:
        highs, lows = self._pivots()
        labels = []

        # label swing highs relative to the previous swing high
        for j in range(1, len(highs)):
            labels.append(("HH" if highs[j][1] > highs[j - 1][1] else "LH", highs[j][0]))
        for j in range(1, len(lows)):
            labels.append(("HL" if lows[j][1] > lows[j - 1][1] else "LL", lows[j][0]))
        labels.sort(key=lambda x: x[1])
        recent = [lab for lab, _ in labels[-6:]]

        trend_structure = self._classify(recent)
        bos, choch = self._bos_choch(highs, lows)
        support, resistance = self._levels(highs, lows)

        return {
            "recent_sequence": recent,
            "structure_trend": trend_structure,   # bullish / bearish / ranging
            "break_of_structure": bos,            # None / "bullish" / "bearish"
            "change_of_character": choch,         # None / "bullish" / "bearish"
            "last_swing_high": _f(highs[-1][1]) if highs else None,
            "last_swing_low": _f(lows[-1][1]) if lows else None,
            "support": support,
            "resistance": resistance,
        }

    @staticmethod
    def _classify(recent: list[str]) -> str:
        if not recent:
            return "ranging"
        bull = recent.count("HH") + recent.count("HL")
        bear = recent.count("LH") + recent.count("LL")
        if bull > bear:
            return "bullish"
        if bear > bull:
            return "bearish"
        return "ranging"

    def _bos_choch(self, highs, lows):
        """BOS: latest close breaks the most recent swing high (bull) or low
        (bear) in the SAME direction as prevailing structure.
        CHoCH: it breaks AGAINST the prevailing structure -> possible reversal."""
        if len(highs) < 2 or len(lows) < 2:
            return None, None
        price = self.close[-1]
        prev_high = highs[-1][1]
        prev_low = lows[-1][1]
        recent_seq = self._classify(
            [lab for lab, _ in sorted(
                [("HH" if highs[j][1] > highs[j-1][1] else "LH", highs[j][0]) for j in range(1, len(highs))]
                + [("HL" if lows[j][1] > lows[j-1][1] else "LL", lows[j][0]) for j in range(1, len(lows))],
                key=lambda x: x[1])[-6:]]
        )
        bos = choch = None
        broke_up = price > prev_high
        broke_down = price < prev_low
        if broke_up:
            if recent_seq == "bullish":
                bos = "bullish"
            elif recent_seq == "bearish":
                choch = "bullish"
        elif broke_down:
            if recent_seq == "bearish":
                bos = "bearish"
            elif recent_seq == "bullish":
                choch = "bearish"
        return bos, choch

    def _levels(self, highs, lows, tol=0.004):
        """Cluster recent pivots into support (from lows) and resistance
        (from highs) zones; return the nearest few price levels."""
        price = self.close[-1]
        res = sorted({round(p, 4) for _, p in highs[-8:] if p > price})
        sup = sorted({round(p, 4) for _, p in lows[-8:] if p < price}, reverse=True)
        return [_f(x) for x in sup[:3]], [_f(x) for x in res[:3]]


def _f(x):
    try:
        xf = float(x)
        if np.isnan(xf) or np.isinf(xf):
            return None
        return round(xf, 6)
    except (TypeError, ValueError):
        return None

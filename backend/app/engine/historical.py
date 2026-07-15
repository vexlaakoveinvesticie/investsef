"""HistoricalPatternAnalyzer — the core statistical edge.
Given the CURRENT feature state (RSI bucket, EMA relationship, MACD sign,
volume-change bucket), it scans the same series' history for bars where those
same conditions held, then looks FORWARD a fixed window to measure what
actually happened. Returns sample count, success rate, average move, average
time — with guards against overfitting (minimum sample size, fixed forward
window, no parameter fitting to the target)."""
from __future__ import annotations
import numpy as np
import pandas as pd

from ..config import HIST, IND, TIMEFRAMES
from .indicators import TechnicalAnalyzer


class HistoricalPatternAnalyzer:
    def __init__(self, df: pd.DataFrame, timeframe: str = "15m"):
        self.df = df
        self.tf = timeframe
        self.ta = TechnicalAnalyzer(df)

    def _feature_frame(self) -> pd.DataFrame:
        close = self.df["close"]
        ema20 = close.ewm(span=IND["ema_fast"], adjust=False).mean()
        ema50 = close.ewm(span=IND["ema_mid"], adjust=False).mean()
        rsi = self.ta.rsi()
        macd = self.ta.macd()["hist_series"]
        vol = self.df["volume"]
        vol_avg = vol.rolling(IND["vol_avg"]).mean()
        vol_chg = (vol / vol_avg - 1.0) * 100

        feat = pd.DataFrame({
            "close": close,
            "rsi_bucket": (rsi // HIST["rsi_bucket"]).astype("float"),
            "ema_bull": (ema20 > ema50).astype(int),
            "macd_bull": (macd > 0).astype(int),
            "vol_bucket": (vol_chg // HIST["vol_bucket_pct"]).astype("float"),
        })
        return feat.dropna()

    def analyze(self) -> dict:
        feat = self._feature_frame()
        fwd = HIST["forward_bars"]
        if len(feat) < fwd + HIST["min_samples"]:
            return self._insufficient(len(feat))

        cur = feat.iloc[-1]
        # match current pattern across history (exclude the last `fwd` bars so
        # every match has a full forward window available)
        usable = feat.iloc[:-fwd]
        mask = (
            (usable["rsi_bucket"] == cur["rsi_bucket"]) &
            (usable["ema_bull"] == cur["ema_bull"]) &
            (usable["macd_bull"] == cur["macd_bull"]) &
            (usable["vol_bucket"] == cur["vol_bucket"])
        )
        matches = usable[mask]
        n = len(matches)
        if n < HIST["min_samples"]:
            # relax: drop the volume bucket (most granular dimension)
            mask2 = (
                (usable["rsi_bucket"] == cur["rsi_bucket"]) &
                (usable["ema_bull"] == cur["ema_bull"]) &
                (usable["macd_bull"] == cur["macd_bull"])
            )
            matches = usable[mask2]
            n = len(matches)
            relaxed = True
        else:
            relaxed = False

        if n < HIST["min_samples"]:
            return self._insufficient(n)

        # expected direction from current EMA/MACD alignment
        long_bias = bool(cur["ema_bull"] and cur["macd_bull"])
        exp_dir = "LONG" if long_bias else ("SHORT" if (not cur["ema_bull"] and not cur["macd_bull"]) else "LONG")

        closes = feat["close"].values
        idx_positions = [feat.index.get_loc(ix) for ix in matches.index]
        moves = []
        successes = 0
        for pos in idx_positions:
            entry = closes[pos]
            future = closes[pos + fwd]
            move_pct = (future - entry) / entry * 100
            if exp_dir == "SHORT":
                move_pct = -move_pct  # measure in trade direction
            moves.append(move_pct)
            if move_pct >= HIST["success_move_pct"]:
                successes += 1

        moves = np.array(moves)
        prob = successes / n * 100
        avg_move = float(np.mean(moves))
        minutes = fwd * TIMEFRAMES.get(self.tf, {"minutes": 15})["minutes"]

        return {
            "similar_situations": int(n),
            "successful": int(successes),
            "historical_probability": round(prob, 1),
            "average_move_pct": round(avg_move, 3),
            "average_time": _fmt_time(minutes),
            "max_favorable_pct": round(float(moves.max()), 3),
            "max_adverse_pct": round(float(moves.min()), 3),
            "expected_direction": exp_dir,
            "relaxed_match": relaxed,
            "sufficient_data": True,
        }

    @staticmethod
    def _insufficient(n):
        return {
            "similar_situations": int(n),
            "historical_probability": None,
            "sufficient_data": False,
            "note": f"insufficient history ({n} < {HIST['min_samples']} samples)",
        }


def _fmt_time(minutes: float) -> str:
    if minutes < 90:
        return f"{minutes/60:.1f} h"
    return f"{minutes/60:.1f} h"

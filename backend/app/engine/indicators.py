"""TechnicalAnalyzer — real indicator math on an OHLCV DataFrame.
Every method returns full series so the historical engine can reuse them.
`snapshot()` collapses the latest bar into a compact dict for scoring."""
from __future__ import annotations
import numpy as np
import pandas as pd

from ..config import IND


class TechnicalAnalyzer:
    def __init__(self, df: pd.DataFrame):
        if df is None or len(df) < 30:
            raise ValueError("need at least 30 candles for analysis")
        self.df = df.copy()
        self.close = self.df["close"]
        self.high = self.df["high"]
        self.low = self.df["low"]
        self.vol = self.df["volume"]

    # ---- trend ----------------------------------------------------------
    def ema(self, period: int) -> pd.Series:
        return self.close.ewm(span=period, adjust=False).mean()

    def trend(self) -> dict:
        e20 = self.ema(IND["ema_fast"]).iloc[-1]
        e50 = self.ema(IND["ema_mid"]).iloc[-1]
        e200 = self.ema(IND["ema_slow"]).iloc[-1] if len(self.df) >= IND["ema_slow"] else np.nan
        price = self.close.iloc[-1]
        # classification
        if e20 > e50 and price > e20:
            label = "Bullish"
        elif e20 < e50 and price < e20:
            label = "Bearish"
        else:
            label = "Neutral"
        return {
            "ema20": _f(e20), "ema50": _f(e50), "ema200": _f(e200),
            "price": _f(price), "label": label,
            "above_ema200": bool(price > e200) if not np.isnan(e200) else None,
        }

    # ---- momentum -------------------------------------------------------
    def rsi(self, period: int | None = None) -> pd.Series:
        period = period or IND["rsi"]
        delta = self.close.diff()
        gain = delta.clip(lower=0)
        loss = -delta.clip(upper=0)
        # Wilder's smoothing
        avg_gain = gain.ewm(alpha=1 / period, adjust=False).mean()
        avg_loss = loss.ewm(alpha=1 / period, adjust=False).mean()
        rs = avg_gain / avg_loss.replace(0, np.nan)
        rsi = 100 - (100 / (1 + rs))
        return rsi.fillna(50)

    def macd(self) -> dict:
        fast = self.close.ewm(span=IND["macd_fast"], adjust=False).mean()
        slow = self.close.ewm(span=IND["macd_slow"], adjust=False).mean()
        macd_line = fast - slow
        signal = macd_line.ewm(span=IND["macd_signal"], adjust=False).mean()
        hist = macd_line - signal
        return {
            "macd": _f(macd_line.iloc[-1]),
            "signal": _f(signal.iloc[-1]),
            "hist": _f(hist.iloc[-1]),
            "bullish": bool(hist.iloc[-1] > 0),
            "hist_series": hist,
        }

    def stoch_rsi(self) -> dict:
        rsi = self.rsi(IND["stoch_rsi"])
        window = IND["stoch_rsi"]
        min_r = rsi.rolling(window).min()
        max_r = rsi.rolling(window).max()
        stoch = (rsi - min_r) / (max_r - min_r).replace(0, np.nan) * 100
        k = stoch.rolling(IND["stoch_k"]).mean()
        d = k.rolling(IND["stoch_d"]).mean()
        return {"k": _f(k.iloc[-1]), "d": _f(d.iloc[-1])}

    # ---- volatility -----------------------------------------------------
    def atr(self, period: int | None = None) -> pd.Series:
        period = period or IND["atr"]
        prev_close = self.close.shift(1)
        tr = pd.concat([
            self.high - self.low,
            (self.high - prev_close).abs(),
            (self.low - prev_close).abs(),
        ], axis=1).max(axis=1)
        return tr.ewm(alpha=1 / period, adjust=False).mean()

    def bollinger(self) -> dict:
        period, k = IND["bb"], IND["bb_std"]
        mid = self.close.rolling(period).mean()
        std = self.close.rolling(period).std()
        upper = mid + k * std
        lower = mid - k * std
        price = self.close.iloc[-1]
        width = (upper.iloc[-1] - lower.iloc[-1]) / mid.iloc[-1] if mid.iloc[-1] else np.nan
        return {
            "upper": _f(upper.iloc[-1]), "mid": _f(mid.iloc[-1]),
            "lower": _f(lower.iloc[-1]), "width_pct": _f(width * 100),
            "position": _bb_pos(price, lower.iloc[-1], upper.iloc[-1]),
        }

    def adx(self, period: int | None = None) -> float:
        period = period or IND["adx"]
        up = self.high.diff()
        down = -self.low.diff()
        plus_dm = np.where((up > down) & (up > 0), up, 0.0)
        minus_dm = np.where((down > up) & (down > 0), down, 0.0)
        atr = self.atr(period)
        plus_di = 100 * pd.Series(plus_dm, index=self.df.index).ewm(alpha=1/period, adjust=False).mean() / atr
        minus_di = 100 * pd.Series(minus_dm, index=self.df.index).ewm(alpha=1/period, adjust=False).mean() / atr
        dx = 100 * (plus_di - minus_di).abs() / (plus_di + minus_di).replace(0, np.nan)
        adx = dx.ewm(alpha=1/period, adjust=False).mean()
        return _f(adx.iloc[-1])

    # ---- volume ---------------------------------------------------------
    def vwap(self) -> float:
        typical = (self.high + self.low + self.close) / 3
        cum_pv = (typical * self.vol).cumsum()
        cum_v = self.vol.cumsum().replace(0, np.nan)
        return _f((cum_pv / cum_v).iloc[-1])

    def volume_spike(self) -> dict:
        avg = self.vol.rolling(IND["vol_avg"]).mean().iloc[-1]
        last = self.vol.iloc[-1]
        ratio = float(last / avg) if avg else 0.0
        return {
            "last": _f(last), "avg": _f(avg), "ratio": _f(ratio),
            "spike": bool(ratio >= IND["vol_spike_mult"]),
        }

    # ---- compact snapshot for scoring ----------------------------------
    def snapshot(self) -> dict:
        trend = self.trend()
        macd = self.macd()
        vol = self.volume_spike()
        rsi_last = _f(self.rsi().iloc[-1])
        atr_last = _f(self.atr().iloc[-1])
        price = trend["price"]
        return {
            "price": price,
            "timestamp": self.df.index[-1].isoformat(),
            "trend": trend,
            "rsi": rsi_last,
            "macd": {k: v for k, v in macd.items() if k != "hist_series"},
            "stoch_rsi": self.stoch_rsi(),
            "atr": atr_last,
            "atr_pct": _f(atr_last / price * 100) if price else None,
            "bollinger": self.bollinger(),
            "adx": self.adx(),
            "vwap": self.vwap(),
            "volume": vol,
        }


def _f(x):
    """Safe float: NaN/inf -> None so JSON stays clean."""
    try:
        xf = float(x)
        if np.isnan(xf) or np.isinf(xf):
            return None
        return round(xf, 6)
    except (TypeError, ValueError):
        return None


def _bb_pos(price, lower, upper):
    if lower is None or upper is None or upper == lower:
        return None
    return _f((price - lower) / (upper - lower))

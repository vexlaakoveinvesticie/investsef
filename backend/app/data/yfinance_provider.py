"""Primary provider: Yahoo Finance via yfinance (no API key).
Unofficial and occasionally flaky -> the orchestrator has Stooq as fallback."""
from __future__ import annotations
import pandas as pd

from .base import MarketDataProvider, ProviderError
from ..config import SYMBOLS, TIMEFRAMES


class YFinanceProvider(MarketDataProvider):
    name = "yfinance"
    requires_key = False

    def get_candles(self, symbol_key: str, timeframe: str) -> pd.DataFrame:
        if symbol_key not in SYMBOLS:
            raise ProviderError(f"unknown symbol {symbol_key}")
        if timeframe not in TIMEFRAMES:
            raise ProviderError(f"unknown timeframe {timeframe}")

        try:
            import yfinance as yf
        except ImportError as e:  # pragma: no cover
            raise ProviderError(f"yfinance not installed: {e}")

        ticker = SYMBOLS[symbol_key]["yf"]
        tf = TIMEFRAMES[timeframe]
        # 4h isn't a native yfinance interval -> pull 1h and resample below.
        interval = tf["yf_interval"]

        # Include pre-market / after-hours candles for intraday timeframes.
        # (prepost only affects intraday data; daily/weekly ignore it.)
        prepost = timeframe in ("1m", "5m", "15m", "1h", "4h")

        try:
            df = yf.download(
                ticker, interval=interval, period=tf["yf_period"],
                auto_adjust=False, progress=False, threads=False,
                prepost=prepost,
            )
        except Exception as e:  # network / parsing / rate-limit
            raise ProviderError(f"yfinance download failed: {e}")

        if df is None or df.empty:
            raise ProviderError("yfinance returned empty data")

        df = self._normalize(df)

        if timeframe == "4h":
            df = self._resample(df, "4h")

        return df

    @staticmethod
    def _normalize(df: pd.DataFrame) -> pd.DataFrame:
        # yfinance may return a MultiIndex column frame for single tickers.
        if isinstance(df.columns, pd.MultiIndex):
            df.columns = df.columns.get_level_values(0)
        df = df.rename(columns=str.lower)
        cols = ["open", "high", "low", "close", "volume"]
        missing = [c for c in cols if c not in df.columns]
        if missing:
            raise ProviderError(f"yfinance missing columns {missing}")
        df = df[cols].dropna()
        if df.index.tz is None:
            df.index = df.index.tz_localize("UTC")
        return df

    @staticmethod
    def _resample(df: pd.DataFrame, rule: str) -> pd.DataFrame:
        agg = {"open": "first", "high": "max", "low": "min",
               "close": "last", "volume": "sum"}
        out = df.resample(rule).agg(agg).dropna()
        return out

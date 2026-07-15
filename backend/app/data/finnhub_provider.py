"""Primary provider: Finnhub (real-time US quotes, intraday candles).

Free tier notes (2026):
- /quote is free and near real-time for US stocks/ETFs -> great primary quote.
- /stock/candle may return 403 on the free tier for some symbols; in that
  case we raise ProviderError and the orchestrator silently fails over to
  Yahoo (yfinance) -> Stooq. Nothing else in the system changes.
"""
from __future__ import annotations
import time as _time

import pandas as pd
import requests

from .base import MarketDataProvider, ProviderError
from ..config import SYMBOLS, TIMEFRAMES, FINNHUB_API_KEY

_BASE = "https://finnhub.io/api/v1"

# our timeframe -> (finnhub resolution, how many days of history to request)
_RESOLUTION = {
    "1m":  ("1", 7),
    "5m":  ("5", 30),
    "15m": ("15", 60),
    "1h":  ("60", 365),
    "4h":  ("60", 365),   # fetched as 1h, resampled below
    "1d":  ("D", 3650),
}


class FinnhubProvider(MarketDataProvider):
    name = "finnhub"
    requires_key = True

    def __init__(self, api_key: str | None = None, timeout: int = 10):
        self.api_key = api_key or FINNHUB_API_KEY
        self.timeout = timeout

    # -- helpers --------------------------------------------------------------
    def _get(self, path: str, params: dict) -> dict:
        if not self.api_key:
            raise ProviderError("finnhub: no API key configured")
        params = dict(params, token=self.api_key)
        try:
            r = requests.get(f"{_BASE}/{path}", params=params, timeout=self.timeout)
        except requests.RequestException as e:
            raise ProviderError(f"finnhub network error: {e}")
        if r.status_code == 429:
            raise ProviderError("finnhub rate limit (60/min) exceeded")
        if r.status_code == 403:
            raise ProviderError("finnhub: endpoint not available on this plan")
        if r.status_code != 200:
            raise ProviderError(f"finnhub HTTP {r.status_code}")
        try:
            return r.json()
        except ValueError as e:
            raise ProviderError(f"finnhub bad JSON: {e}")

    # -- candles ---------------------------------------------------------------
    def get_candles(self, symbol_key: str, timeframe: str) -> pd.DataFrame:
        if symbol_key not in SYMBOLS:
            raise ProviderError(f"unknown symbol {symbol_key}")
        if timeframe not in TIMEFRAMES:
            raise ProviderError(f"unknown timeframe {timeframe}")

        ticker = SYMBOLS[symbol_key]["yf"]  # same US tickers as Yahoo
        resolution, days = _RESOLUTION[timeframe]
        now = int(_time.time())
        data = self._get("stock/candle", {
            "symbol": ticker, "resolution": resolution,
            "from": now - days * 86400, "to": now,
        })

        if data.get("s") != "ok" or not data.get("t"):
            raise ProviderError(f"finnhub candles unavailable ({data.get('s')})")

        df = pd.DataFrame({
            "open": data["o"], "high": data["h"], "low": data["l"],
            "close": data["c"], "volume": data["v"],
        }, index=pd.to_datetime(data["t"], unit="s", utc=True))
        df = df[~df.index.duplicated(keep="last")].sort_index()

        if timeframe == "4h":  # resample 1h -> 4h
            df = df.resample("4h").agg({
                "open": "first", "high": "max", "low": "min",
                "close": "last", "volume": "sum",
            }).dropna()

        if df.empty:
            raise ProviderError("finnhub returned empty frame")
        return df

    # -- real-time quote ---------------------------------------------------------
    def get_quote(self, symbol_key: str) -> dict:
        if symbol_key not in SYMBOLS:
            raise ProviderError(f"unknown symbol {symbol_key}")
        data = self._get("quote", {"symbol": SYMBOLS[symbol_key]["yf"]})
        price = data.get("c")
        if not price:  # 0 or None -> symbol not served
            raise ProviderError("finnhub quote empty")
        ts = data.get("t") or int(_time.time())
        return {
            "price": float(price),
            "timestamp": pd.to_datetime(ts, unit="s", utc=True).isoformat(),
            "source": self.name,
        }

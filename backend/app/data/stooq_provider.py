"""Fallback provider: Stooq CSV (no API key). Reliable for DAILY data going
back 20+ years. Stooq has no real intraday API, so for intraday timeframes we
serve the best available (daily) and let the engine flag reduced resolution."""
from __future__ import annotations
import io
import pandas as pd

from .base import MarketDataProvider, ProviderError
from ..config import SYMBOLS

STOOQ_CSV = "https://stooq.com/q/d/l/?s={sym}&i=d"


class StooqProvider(MarketDataProvider):
    name = "stooq"
    requires_key = False

    # Stooq only serves daily reliably; map every timeframe to daily candles.
    def get_candles(self, symbol_key: str, timeframe: str) -> pd.DataFrame:
        if symbol_key not in SYMBOLS:
            raise ProviderError(f"unknown symbol {symbol_key}")
        sym = SYMBOLS[symbol_key]["stooq"]

        try:
            import requests
        except ImportError as e:  # pragma: no cover
            raise ProviderError(f"requests not installed: {e}")

        url = STOOQ_CSV.format(sym=sym)
        try:
            resp = requests.get(url, timeout=15)
            resp.raise_for_status()
        except Exception as e:
            raise ProviderError(f"stooq request failed: {e}")

        text = resp.text.strip()
        if not text or text.lower().startswith("<") or "no data" in text.lower():
            raise ProviderError("stooq returned no usable data")

        try:
            df = pd.read_csv(io.StringIO(text))
        except Exception as e:
            raise ProviderError(f"stooq parse failed: {e}")

        return self._normalize(df)

    @staticmethod
    def _normalize(df: pd.DataFrame) -> pd.DataFrame:
        df.columns = [c.strip().lower() for c in df.columns]
        needed = {"date", "open", "high", "low", "close"}
        if not needed.issubset(df.columns):
            raise ProviderError(f"stooq unexpected columns {list(df.columns)}")
        if "volume" not in df.columns:
            df["volume"] = 0.0
        df["date"] = pd.to_datetime(df["date"], utc=True)
        df = df.set_index("date")[["open", "high", "low", "close", "volume"]]
        df = df.dropna(subset=["open", "high", "low", "close"])
        return df

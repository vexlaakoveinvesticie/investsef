"""Common interface every market-data provider implements. Swapping providers
(or adding a paid one later) means writing one class, nothing else changes."""
from __future__ import annotations
from abc import ABC, abstractmethod
import pandas as pd


class MarketDataProvider(ABC):
    """Returns OHLCV as a DataFrame indexed by timezone-aware timestamp with
    columns: open, high, low, close, volume."""

    name: str = "base"
    requires_key: bool = False

    @abstractmethod
    def get_candles(self, symbol_key: str, timeframe: str) -> pd.DataFrame:
        """Fetch historical candles for our internal symbol key + timeframe.
        Must raise ProviderError on failure so the orchestrator can fail over."""
        raise NotImplementedError

    def get_quote(self, symbol_key: str) -> dict:
        """Latest price snapshot. Default derives it from the last daily candle."""
        df = self.get_candles(symbol_key, "1d")
        last = df.iloc[-1]
        return {
            "price": float(last["close"]),
            "timestamp": df.index[-1].isoformat(),
            "source": self.name,
        }


class ProviderError(Exception):
    """Raised when a provider cannot serve the request (network, empty, limit)."""

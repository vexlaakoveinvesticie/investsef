"""Failover orchestrator + cache. Tries providers in order; first success wins.
Aggressive caching is mandatory with unofficial sources (protects against
rate-limits / IP blocks). A synthetic provider can be injected for offline
testing without touching the rest of the system."""
from __future__ import annotations
import time
import pandas as pd

from .base import MarketDataProvider, ProviderError
from .finnhub_provider import FinnhubProvider
from .yfinance_provider import YFinanceProvider
from .stooq_provider import StooqProvider
from ..config import CACHE_TTL_SECONDS


class DataOrchestrator:
    def __init__(self, providers: list[MarketDataProvider] | None = None):
        # Order defines the failover chain: primary first.
        # Finnhub (real-time, key from env) -> Yahoo (no key) -> Stooq (no key)
        self.providers = providers or [FinnhubProvider(), YFinanceProvider(), StooqProvider()]
        self._cache: dict[tuple[str, str], tuple[float, pd.DataFrame, str]] = {}

    def get_candles(self, symbol_key: str, timeframe: str, use_cache: bool = True):
        key = (symbol_key, timeframe)
        now = time.time()
        if use_cache and key in self._cache:
            ts, df, src = self._cache[key]
            if now - ts < CACHE_TTL_SECONDS:
                return df, src

        errors = []
        for provider in self.providers:
            try:
                df = provider.get_candles(symbol_key, timeframe)
                if df is None or df.empty:
                    raise ProviderError("empty frame")
                self._cache[key] = (now, df, provider.name)
                return df, provider.name
            except ProviderError as e:
                errors.append(f"{provider.name}: {e}")
                continue
        raise ProviderError("all providers failed -> " + " | ".join(errors))

    def get_quote(self, symbol_key: str):
        for provider in self.providers:
            try:
                return provider.get_quote(symbol_key)
            except ProviderError:
                continue
        raise ProviderError("no provider could serve a quote")

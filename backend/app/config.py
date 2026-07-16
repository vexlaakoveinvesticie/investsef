"""Central configuration: symbol mapping, indicator params, scoring weights,
decision thresholds. Everything tunable lives here so the engine stays clean.
Values can be overridden via environment variables (see .env.example)."""
from __future__ import annotations
import os

# ---- symbol mapping: our key -> (yfinance ticker, stooq ticker) -------------
# ETFs (QQQ/GLD) chosen over index/futures because free sources serve them
# with clean, complete OHLCV. stooq uses e.g. "aapl.us", "qqq.us", "gld.us".
SYMBOLS: dict[str, dict] = {
    "NVDA": {"name": "NVIDIA",        "yf": "NVDA", "stooq": "nvda.us", "class": "stock"},
    "TSLA": {"name": "Tesla",         "yf": "TSLA", "stooq": "tsla.us", "class": "stock"},
    "AAPL": {"name": "Apple",         "yf": "AAPL", "stooq": "aapl.us", "class": "stock"},
    "AMD":  {"name": "AMD",           "yf": "AMD",  "stooq": "amd.us",  "class": "stock"},
    "META": {"name": "Meta Platforms", "yf": "META", "stooq": "meta.us", "class": "stock"},
    "MSFT": {"name": "Microsoft",     "yf": "MSFT", "stooq": "msft.us", "class": "stock"},
    "QQQ":  {"name": "Nasdaq 100 ETF", "yf": "QQQ", "stooq": "qqq.us",  "class": "etf"},
    "SPY":  {"name": "S&P 500 ETF",   "yf": "SPY",  "stooq": "spy.us",  "class": "etf"},
    "GLD":  {"name": "Gold ETF",      "yf": "GLD",  "stooq": "gld.us",  "class": "etf"},
}

# ---- timeframe mapping to yfinance interval + period ------------------------
# yfinance limits intraday history (1m ~7d, others ~60d), so period is capped.
TIMEFRAMES: dict[str, dict] = {
    "1m":  {"yf_interval": "1m",  "yf_period": "7d",   "minutes": 1},
    "5m":  {"yf_interval": "5m",  "yf_period": "60d",  "minutes": 5},
    "15m": {"yf_interval": "15m", "yf_period": "60d",  "minutes": 15},
    "1h":  {"yf_interval": "60m", "yf_period": "730d", "minutes": 60},
    "4h":  {"yf_interval": "60m", "yf_period": "730d", "minutes": 240},  # resampled from 1h
    "1d":  {"yf_interval": "1d",  "yf_period": "max",  "minutes": 1440},
}

# ---- indicator parameters --------------------------------------------------
IND = {
    "ema_fast": 20, "ema_mid": 50, "ema_slow": 200,
    "rsi": 14, "macd_fast": 12, "macd_slow": 26, "macd_signal": 9,
    "stoch_rsi": 14, "stoch_k": 3, "stoch_d": 3,
    "atr": 14, "bb": 20, "bb_std": 2.0,
    "adx": 14, "vol_avg": 20, "vol_spike_mult": 1.8,
    "swing_lookback": 3,  # bars each side for pivot detection
}

# ---- TradeScoreEngine component weights (sum = 100) ------------------------
WEIGHTS = {
    "trend": 20,
    "momentum": 15,
    "volume": 15,
    "structure": 20,
    "volatility": 10,
    "risk_reward": 10,
    "conditions": 10,
}

# ---- decision thresholds ---------------------------------------------------
THRESHOLDS = {
    "no_trade": 60,   # < 60  -> NO TRADE
    "weak": 75,       # 60-75 -> WAIT / WEAK
    "valid": 85,      # 75-85 -> VALID
    # 85+ -> HIGH QUALITY
}

# ---- trade plan params -----------------------------------------------------
PLAN = {
    "sl_atr_mult": 1.5,     # stop distance = ATR * this
    "tp1_rr": 2.0,          # TP1 at RR 1:2
    "tp2_rr": 3.0,          # TP2 at RR 1:3
    "min_rr": 2.0,          # reject setups that can't reach 1:2
}

# ---- SWING TRADING configuration -------------------------------------------
# The assistant is tuned for SHORT SWING TRADING (2-7 day holds), not scalping.
SWING = {
    "main_tf": "4h",        # main analysis timeframe
    "trend_tf": "1d",       # trend confirmation
    "entry_tf": "1h",       # entry timing
    "hold_days_min": 2,
    "hold_days_max": 7,
}
DEFAULT_TIMEFRAME = SWING["main_tf"]

# ---- historical engine -----------------------------------------------------
HIST = {
    "forward_bars": 12,        # look this many bars ahead to measure outcome
    "min_samples": 20,         # below this, probability is "insufficient data"
    "success_move_pct": 0.3,   # move >= this % in expected dir counts as success
    "rsi_bucket": 15,          # bucket width for RSI matching (wider = more matches)
    "vol_bucket_pct": 25,      # bucket width for volume-change matching
}

# ---- active trade universe ---------------------------------------------------
# Symbols the system actively TRADES (scan + calibration). Based on the first
# real-data 4h calibration (2026-07): trend-followed names + gold carried the
# edge, while slow index ETFs (QQQ/SPY) and AMD/MSFT bled small stop-losses.
# All SYMBOLS stay viewable/analyzable; this only narrows what gets traded.
# Override with env TRADE_UNIVERSE="NVDA,TSLA,..." after your own walk-forward.
TRADE_UNIVERSE = [s.strip() for s in os.getenv(
    "TRADE_UNIVERSE", "NVDA,TSLA,AAPL,META,GLD").split(",") if s.strip() in SYMBOLS]

DB_PATH = os.getenv("DB_PATH", "trading.db")
CACHE_TTL_SECONDS = int(os.getenv("CACHE_TTL_SECONDS", "900"))  # re-fetch at most this often

# ---- optional free API keys (system works fully without them) --------------
FINNHUB_API_KEY = os.getenv("FINNHUB_API_KEY", "")  # primary real-time source; set via env / .env only — never hardcode
ALPHAVANTAGE_API_KEY = os.getenv("ALPHAVANTAGE_API_KEY", "")  # optional, 25 req/day only

# ---- CORS: comma-separated allowed origins for the frontend ----------------
CORS_ORIGINS = os.getenv("CORS_ORIGINS", "*").split(",")

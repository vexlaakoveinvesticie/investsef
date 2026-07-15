"""SQLite persistence (zero-server, free). Stores every generated signal and,
after the trade closes, its realized outcome so we can compute prediction
accuracy over time (Trade Journal Learning)."""
from __future__ import annotations
import sqlite3
from contextlib import contextmanager

from ..config import DB_PATH

SCHEMA = """
CREATE TABLE IF NOT EXISTS signals (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    symbol        TEXT NOT NULL,
    timeframe     TEXT NOT NULL,
    created_at    TEXT NOT NULL,
    direction     TEXT NOT NULL,
    decision      TEXT NOT NULL,
    score         REAL NOT NULL,
    confidence    REAL,
    entry         REAL,
    stop_loss     REAL,
    take_profit_1 REAL,
    take_profit_2 REAL,
    target_pct    REAL,
    hist_prob     REAL,
    -- filled in later on close:
    reality       TEXT,          -- 'WIN' | 'LOSS' | NULL
    exit_price    REAL,
    pnl_pct       REAL,
    outcome       TEXT,          -- 'TP1' | 'TP2' | 'SL' | 'MANUAL'
    prediction_correct INTEGER,  -- 1 / 0 / NULL
    closed_at     TEXT
);
CREATE INDEX IF NOT EXISTS idx_signals_symbol ON signals(symbol);
"""


def init_db(path: str = DB_PATH):
    with sqlite3.connect(path) as conn:
        conn.executescript(SCHEMA)


@contextmanager
def get_conn(path: str = DB_PATH):
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()

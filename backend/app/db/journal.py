"""Trade Journal Learning — persist predictions, record realized outcomes,
and compute rolling prediction accuracy per symbol / overall."""
from __future__ import annotations
from datetime import datetime, timezone

from .database import get_conn, init_db


def _now():
    return datetime.now(timezone.utc).isoformat()


def record_signal(sig: dict, path=None) -> int:
    init_db(*( [path] if path else [] ))
    with get_conn(*( [path] if path else [] )) as conn:
        cur = conn.execute(
            """INSERT INTO signals
               (symbol, timeframe, created_at, direction, decision, score,
                confidence, entry, stop_loss, take_profit_1, take_profit_2,
                target_pct, hist_prob)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (
                sig["symbol"], sig["timeframe"], _now(),
                sig["direction"], sig["decision"], sig["score"],
                sig.get("confidence"), sig.get("entry"), sig.get("stop_loss"),
                sig.get("take_profit_1"), sig.get("take_profit_2"),
                sig.get("target_pct"), sig.get("hist_prob"),
            ),
        )
        return cur.lastrowid


def close_signal(signal_id: int, exit_price: float, outcome: str, path=None) -> dict:
    with get_conn(*( [path] if path else [] )) as conn:
        row = conn.execute("SELECT * FROM signals WHERE id=?", (signal_id,)).fetchone()
        if row is None:
            raise ValueError(f"signal {signal_id} not found")
        entry = row["entry"]
        direction = row["direction"]
        pnl_pct = ((exit_price - entry) / entry * 100) if direction == "LONG" \
            else ((entry - exit_price) / entry * 100)
        win = pnl_pct > 0
        # prediction correct = realized direction matched predicted direction
        pred_correct = (direction == "LONG" and exit_price > entry) or \
                       (direction == "SHORT" and exit_price < entry)
        conn.execute(
            """UPDATE signals SET reality=?, exit_price=?, pnl_pct=?,
               outcome=?, prediction_correct=?, closed_at=? WHERE id=?""",
            ("WIN" if win else "LOSS", exit_price, round(pnl_pct, 4),
             outcome, 1 if pred_correct else 0, _now(), signal_id),
        )
        return {
            "id": signal_id, "reality": "WIN" if win else "LOSS",
            "pnl_pct": round(pnl_pct, 4), "prediction_correct": pred_correct,
        }


def history(symbol: str | None = None, path=None) -> dict:
    with get_conn(*( [path] if path else [] )) as conn:
        q = "SELECT * FROM signals"
        args = ()
        if symbol:
            q += " WHERE symbol=?"
            args = (symbol,)
        q += " ORDER BY id DESC"
        rows = [dict(r) for r in conn.execute(q, args).fetchall()]

    closed = [r for r in rows if r["reality"] is not None]
    wins = [r for r in closed if r["reality"] == "WIN"]
    correct = [r for r in closed if r["prediction_correct"] == 1]
    return {
        "total_signals": len(rows),
        "closed": len(closed),
        "open": len(rows) - len(closed),
        "win_rate": round(len(wins) / len(closed) * 100, 1) if closed else None,
        "prediction_accuracy": round(len(correct) / len(closed) * 100, 1) if closed else None,
        "signals": rows,
    }

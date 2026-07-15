"""Performance metrics computed from a list of closed trades.
Everything is honest by construction: costs are already baked into each trade's
net pnl before it reaches here, Expected Value is reported explicitly (and may
be negative), and Sharpe annualization assumptions are stated, not hidden."""
from __future__ import annotations
import math
from statistics import mean, pstdev


def compute_metrics(trades: list[dict], span_days: float | None = None) -> dict:
    """trades: list of dicts with at least 'pnl' (net fraction, e.g. 0.012 = +1.2%).
    span_days: calendar span the trades cover, for Sharpe annualization."""
    n = len(trades)
    if n == 0:
        return {"trades": 0, "note": "no trades generated"}

    pnls = [t["pnl"] for t in trades]
    wins = [p for p in pnls if p > 0]
    losses = [p for p in pnls if p <= 0]

    win_rate = len(wins) / n
    avg_win = mean(wins) if wins else 0.0
    avg_loss = mean(losses) if losses else 0.0            # <= 0
    gross_profit = sum(wins)
    gross_loss = -sum(losses)                             # >= 0
    profit_factor = (gross_profit / gross_loss) if gross_loss > 0 else (math.inf if gross_profit > 0 else 0.0)

    # Expected value per trade (the number that actually matters)
    p_win = win_rate
    p_loss = 1 - win_rate
    expected_value = p_win * avg_win - p_loss * abs(avg_loss)

    # equity curve (compounding) + max drawdown
    equity = 1.0
    peak = 1.0
    max_dd = 0.0
    curve = []
    for p in pnls:
        equity *= (1 + p)
        peak = max(peak, equity)
        dd = equity / peak - 1
        max_dd = min(max_dd, dd)
        curve.append(equity)
    total_return = equity - 1

    # Sharpe: per-trade, then annualized by estimated trades/year
    sd = pstdev(pnls) if n > 1 else 0.0
    sharpe_per_trade = (mean(pnls) / sd) if sd > 0 else 0.0
    trades_per_year = None
    sharpe_annual = None
    if span_days and span_days > 0:
        trades_per_year = n / (span_days / 365.0)
        sharpe_annual = sharpe_per_trade * math.sqrt(trades_per_year) if trades_per_year > 0 else None

    return {
        "trades": n,
        "wins": len(wins),
        "losses": len(losses),
        "win_rate": round(win_rate * 100, 2),
        "avg_win_pct": round(avg_win * 100, 3),
        "avg_loss_pct": round(avg_loss * 100, 3),
        "profit_factor": round(profit_factor, 3) if profit_factor != math.inf else None,
        "expected_value_pct": round(expected_value * 100, 4),
        "expectancy_positive": bool(expected_value > 0),
        "total_return_pct": round(total_return * 100, 2),
        "max_drawdown_pct": round(max_dd * 100, 2),
        "sharpe_per_trade": round(sharpe_per_trade, 3),
        "sharpe_annualized": round(sharpe_annual, 3) if sharpe_annual is not None else None,
        "trades_per_year_est": round(trades_per_year, 1) if trades_per_year else None,
        "equity_curve": [round(x, 5) for x in curve],
    }


def breakdown_by(trades: list[dict], key: str) -> dict:
    """Group trades by a categorical key (e.g. 'tier', 'direction') and compute
    a mini metric set per group -> used for best/worst setup identification."""
    groups: dict[str, list[dict]] = {}
    for t in trades:
        groups.setdefault(str(t.get(key)), []).append(t)
    out = {}
    for g, ts in groups.items():
        m = compute_metrics(ts)
        out[g] = {
            "trades": m["trades"], "win_rate": m.get("win_rate"),
            "profit_factor": m.get("profit_factor"),
            "expected_value_pct": m.get("expected_value_pct"),
        }
    return out

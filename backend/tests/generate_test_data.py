"""Generate realistic synthetic OHLCV for offline testing of the engine.
Uses a regime-switching random walk (trend up / trend down / range) so that
structure, momentum and historical patterns actually have signal to detect.
This lets us validate the full pipeline without live network access."""
from __future__ import annotations
import numpy as np
import pandas as pd


def make_ohlcv(base=18500.0, n=600, seed=7, tf_minutes=15,
               drift_regimes=((0.00008, 0.9), (-0.00006, 0.6), (0.0, 0.5))) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    prices = [base]
    vol_base = 3000
    volumes = []
    regime_len = n // 6
    regime_cycle = []
    for i in range(n):
        regime = drift_regimes[(i // regime_len) % len(drift_regimes)]
        regime_cycle.append(regime)

    for i in range(1, n):
        drift, vol_mult = regime_cycle[i]
        shock = rng.normal(drift, 0.0018) * vol_mult
        prices.append(max(0.01, prices[-1] * (1 + shock)))

    prices = np.array(prices)
    # build candles around the closes
    rows = []
    ts = pd.date_range(end=pd.Timestamp.utcnow().floor("min"),
                       periods=n, freq=f"{tf_minutes}min", tz="UTC")
    for i in range(n):
        close = prices[i]
        openp = prices[i - 1] if i > 0 else close
        hi = max(openp, close) * (1 + abs(rng.normal(0, 0.0009)))
        lo = min(openp, close) * (1 - abs(rng.normal(0, 0.0009)))
        # volume spikes near regime turns
        spike = 2.4 if (i % regime_len) in (0, 1, 2) else 1.0
        vol = max(1, int(rng.normal(vol_base * spike, vol_base * 0.25)))
        rows.append((ts[i], openp, hi, lo, close, vol))

    df = pd.DataFrame(rows, columns=["date", "open", "high", "low", "close", "volume"])
    return df.set_index("date")


if __name__ == "__main__":
    df = make_ohlcv()
    print(df.tail())
    print("rows:", len(df))


# ---- additional processes for rigorous validation -------------------------
def _candles_from_closes(prices, seed, tf_minutes, vol_base=3000):
    import numpy as np
    rng = np.random.default_rng(seed + 999)
    n = len(prices)
    ts = pd.date_range(end=pd.Timestamp.now("UTC").floor("min"),
                       periods=n, freq=f"{tf_minutes}min", tz="UTC")
    rows = []
    for i in range(n):
        c = prices[i]
        o = prices[i - 1] if i > 0 else c
        hi = max(o, c) * (1 + abs(rng.normal(0, 0.0008)))
        lo = min(o, c) * (1 - abs(rng.normal(0, 0.0008)))
        vol = max(1, int(rng.normal(vol_base * (2.2 if i % 80 < 4 else 1), vol_base * 0.25)))
        rows.append((ts[i], o, hi, lo, c, vol))
    return pd.DataFrame(rows, columns=["date", "open", "high", "low", "close", "volume"]).set_index("date")


def random_walk(base=100.0, n=4000, seed=1, tf_minutes=15, sigma=0.0012):
    """NULL PROCESS: driftless random walk. A correct, look-ahead-free system
    should show ~zero or slightly-negative EV here after costs. If it shows a
    real edge on this, the backtester has a bug."""
    import numpy as np
    rng = np.random.default_rng(seed)
    p = [base]
    for _ in range(1, n):
        p.append(max(0.01, p[-1] * (1 + rng.normal(0.0, sigma))))
    return _candles_from_closes(np.array(p), seed, tf_minutes)


def trending(base=100.0, n=4000, seed=1, tf_minutes=15, drift=0.0004, sigma=0.0011):
    """Persistent-trend process (regime-switching drift). A trend-follower
    should show positive EV here."""
    import numpy as np
    rng = np.random.default_rng(seed)
    p = [base]
    regime_len = max(50, n // 12)
    for i in range(1, n):
        d = drift if (i // regime_len) % 2 == 0 else -drift
        p.append(max(0.01, p[-1] * (1 + rng.normal(d, sigma))))
    return _candles_from_closes(np.array(p), seed, tf_minutes)


def mean_reverting(base=100.0, n=4000, seed=1, tf_minutes=15, kappa=0.02, sigma=0.0012):
    """Mean-reverting (Ornstein-Uhlenbeck-like) process. A trend-follower should
    struggle here — useful to confirm the system isn't magically always-positive."""
    import numpy as np
    rng = np.random.default_rng(seed)
    log_base = np.log(base)
    x = [log_base]
    for _ in range(1, n):
        x.append(x[-1] + kappa * (log_base - x[-1]) + rng.normal(0, sigma))
    return _candles_from_closes(np.exp(np.array(x)), seed, tf_minutes)

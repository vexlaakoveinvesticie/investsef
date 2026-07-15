# AI Trading Intelligence Terminal — Backend

Analytický „mozog" systému. Z reálnych trhových dát (free-first: yfinance →
Stooq, bez platených kľúčov) vytvára obchodné rozhodnutie **BUY / SELL / NO
TRADE** s kompletným plánom, a vie sa historicky skalibrovať.

> Rozhodovacia podpora, nie investičné poradenstvo. Výstupy sú pravdepodobnostné
> scenáre, nie garantované predikcie.

---

## Rýchly štart

```bash
cd backend
cp .env.example .env            # voliteľné úpravy
pip install -r requirements.txt

# 1) NAJPRV over reálny dátový tok (potrebuje internet):
python -m tests.smoke_test

# 2) Spusti API:
uvicorn app.main:app --reload --port 8000
#    → http://localhost:8000/docs  (Swagger)

# 3) Kalibrácia na reálnych dátach:
#    GET http://localhost:8000/api/calibrate?timeframe=15m&target_trades=100
```

Docker:

```bash
docker build -t trade-engine .
docker run -p 8000:8000 --env-file .env trade-engine
```

## Nasadenie (free tier)

Railway / Render / Fly.io — nasaď `Dockerfile`, nastav env premenné z
`.env.example`, a `CORS_ORIGINS` na URL tvojho frontendu. SQLite súbor stačí pre
jedného používateľa; pre viac prejdi na PostgreSQL v `app/db/database.py`.

## Symboly a timeframy

`NVDA, TSLA, AAPL, QQQ, GLD` · `1m, 5m, 15m, 1h, 4h, 1d`.

## API

| Metóda | Endpoint | Popis |
|---|---|---|
| GET | `/api/analyze/{symbol}?timeframe=15m` | indikátory + štruktúra + história |
| GET | `/api/decision/{symbol}?timeframe=15m&account=10000&risk_pct=1` | BUY/SELL/NO TRADE + plán |
| GET | `/api/calibrate?timeframe=15m&target_trades=100` | 100-trade kalibrácia + verdikt |
| GET | `/api/backtest/{symbol}` | look-ahead-free backtest + metriky |
| GET | `/api/validate/{symbol}` | walk-forward + Trading Performance Report |
| GET | `/api/history/{symbol}` | uložené signály + presnosť predikcií |
| POST | `/api/trade/result` | uzavrie obchod, počíta WIN/LOSS |
| POST | `/api/webhook/tradingview` | prijímač TradingView alertov |

## Štruktúra projektu

```
backend/
  app/
    config.py              # symboly, váhy, prahy, env premenné
    main.py                # FastAPI endpointy
    schemas.py             # Pydantic modely
    data/                  # dátová vrstva (failover + cache)
      base.py  yfinance_provider.py  stooq_provider.py  orchestrator.py
    engine/                # analytický engine
      indicators.py        # TechnicalAnalyzer (EMA/RSI/MACD/ATR/BB/ADX/VWAP)
      structure.py         # MarketStructureEngine (HH/HL/LH/LL/BOS/CHoCH)
      historical.py        # HistoricalPatternAnalyzer
      scoring.py           # TradeScoreEngine (100 bodov)
      decision.py          # klasifikácia + TradePlanGenerator
      service.py           # AnalysisService (spája pipeline)
    db/                    # SQLite + Trade Journal Learning
      database.py  journal.py
    backtest/              # validácia
      engine.py            # Backtester (bez look-ahead)
      metrics.py           # win rate, PF, Expected Value, Sharpe, drawdown
      walkforward.py       # 70/30 split + optimalizácia prahu
      calibration.py       # 100-trade kalibrácia
      report.py            # Trading Performance Report
  tests/
    smoke_test.py          # over reálny dátový tok PO nasadení
    run_validation.py      # null testy + walk-forward reporty
    generate_test_data.py  # syntetické dáta (offline vývoj)
  Dockerfile  requirements.txt  .env.example
```

## Integrita (prečo veriť číslam)

- **Žiadny look-ahead:** engine v bare `i` vidí len `df[:i+1]`, vstup sa plní na
  otvorení `i+1`, exity sa kontrolujú bar po bare, konflikt SL+TP = SL prvý.
- **Náklady:** round-trip transakčný náklad sa odpočíta z každého obchodu.
- **Null test:** na čistom náhodnom pohybe systém po nákladoch *stráca*
  (EV −0.13 %) — dôkaz, že nemá únik budúcich dát. Na trendových dátach zarába.
- **Overfitting:** walk-forward zamrazí prah z tréningu a testuje out-of-sample.

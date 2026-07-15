"""AnalysisService — the brain's top-level orchestrator. One call runs the
whole pipeline: fetch -> indicators -> structure -> historical -> score ->
decision -> trade plan. Returns a single structured result the API serializes."""
from __future__ import annotations
import pandas as pd

from ..config import SYMBOLS
from ..data.orchestrator import DataOrchestrator
from .indicators import TechnicalAnalyzer
from .structure import MarketStructureEngine
from .historical import HistoricalPatternAnalyzer
from .scoring import TradeScoreEngine
from .decision import classify_score, TradePlanGenerator, position_size


class AnalysisService:
    def __init__(self, orchestrator: DataOrchestrator | None = None):
        self.data = orchestrator or DataOrchestrator()

    def analyze(self, symbol: str, timeframe: str = "15m",
                df: pd.DataFrame | None = None, source: str = "injected") -> dict:
        if symbol not in SYMBOLS:
            raise ValueError(f"unknown symbol {symbol}")
        if df is None:
            df, source = self.data.get_candles(symbol, timeframe)

        ta = TechnicalAnalyzer(df)
        snapshot = ta.snapshot()
        structure = MarketStructureEngine(df).analyze()
        historical = HistoricalPatternAnalyzer(df, timeframe).analyze()

        return {
            "symbol": symbol,
            "name": SYMBOLS[symbol]["name"],
            "timeframe": timeframe,
            "source": source,
            "candles": int(len(df)),
            "snapshot": snapshot,
            "structure": structure,
            "historical": historical,
        }

    def decide(self, symbol: str, timeframe: str = "15m",
               account: float = 10000.0, risk_pct: float = 1.0,
               df: pd.DataFrame | None = None) -> dict:
        base = self.analyze(symbol, timeframe, df=df)
        snapshot, structure, historical = base["snapshot"], base["structure"], base["historical"]

        scored = TradeScoreEngine(snapshot, structure, historical).score()
        cls = classify_score(scored["score"])
        direction = scored["direction"]

        result = {
            **{k: base[k] for k in ("symbol", "name", "timeframe", "source", "candles")},
            "price": snapshot["price"],
            "timestamp": snapshot["timestamp"],
            "direction": direction,
            "score": scored["score"],
            "confidence": scored["score"],       # score doubles as confidence 0-100
            "decision": cls["decision"],
            "quality": cls["quality"],
            "tradable": cls["tradable"],
            "score_breakdown": scored["components"],
            "historical_probability": historical.get("historical_probability"),
            "reasons": self._reasons(snapshot, structure, historical, direction),
            "risks": self._risks(snapshot, structure, direction),
            "_snapshot": snapshot,   # for quality grading (stripped by API layer)
        }

        # trade quality grade (A/B/C) from signals already computed
        from .quality import grade_trade
        result["trade_quality"] = grade_trade(result)

        if cls["tradable"]:
            plan = TradePlanGenerator(snapshot, timeframe).build(direction, scored["score"])
            result["trade_plan"] = plan
            if plan:
                sizing = position_size(account, risk_pct, plan["risk_per_unit"])
                result["risk_management"] = {
                    "account": account, "risk_pct": risk_pct, **sizing,
                }
                # target % for journal
                tp1 = plan["take_profit_1"]
                result["target_pct"] = round(abs(tp1 - snapshot["price"]) / snapshot["price"] * 100, 3)
        else:
            result["trade_plan"] = None
            result["no_trade_reason"] = self._no_trade_reason(scored["score"], base)

        result.pop("_snapshot", None)  # keep response clean
        return result

    # ---- explanation helpers -------------------------------------------
    @staticmethod
    def _reasons(s, st, hist, direction):
        long = direction == "LONG"
        out = []
        t = s["trend"]
        if long and t["ema20"] and t["ema50"] and t["ema20"] > t["ema50"]:
            out.append("Trend zarovnaný (EMA20 > EMA50)")
        if not long and t["ema20"] and t["ema50"] and t["ema20"] < t["ema50"]:
            out.append("Trend zarovnaný (EMA20 < EMA50)")
        if (long and s["macd"]["bullish"]) or (not long and not s["macd"]["bullish"]):
            out.append("MACD momentum na strane obchodu")
        if s["price"] and s["vwap"] and ((long and s["price"] > s["vwap"]) or (not long and s["price"] < s["vwap"])):
            out.append("VWAP podpora/odpor na strane obchodu")
        if s["volume"]["spike"]:
            out.append("Nezvyčajný objem potvrdzuje pohyb")
        if st["break_of_structure"]:
            out.append(f"Break of Structure ({st['break_of_structure']})")
        if hist.get("historical_probability") and hist["historical_probability"] >= 55:
            out.append(f"Historická pravdepodobnosť {hist['historical_probability']}%")
        if s["adx"] and s["adx"] > 25:
            out.append(f"Silný trend (ADX {s['adx']:.0f})")
        return out

    @staticmethod
    def _risks(s, st, direction):
        long = direction == "LONG"
        out = []
        if s.get("atr_pct") and s["atr_pct"] > 1.6:
            out.append("Vysoká volatilita")
        if s["adx"] is not None and s["adx"] < 20:
            out.append("Slabý / rozkolísaný trend (ADX < 20)")
        if long and s["rsi"] and s["rsi"] > 70:
            out.append("RSI v prekúpenom pásme")
        if not long and s["rsi"] and s["rsi"] < 30:
            out.append("RSI v prepredanom pásme")
        if st["change_of_character"]:
            out.append(f"Change of Character ({st['change_of_character']}) — možný obrat")
        levels = st["resistance"] if long else st["support"]
        if levels and s["atr"]:
            dist = abs(levels[0] - s["price"])
            if dist < s["atr"] * 1.5:
                out.append("Kľúčová úroveň blízko vstupu")
        return out

    @staticmethod
    def _no_trade_reason(score, base):
        if score < 60:
            return "Skóre pod 60 — nedostatočná zhoda faktorov."
        return "Skóre v pásme WEAK/WAIT — počkaj na silnejší setup."

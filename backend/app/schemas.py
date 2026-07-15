"""Pydantic models for request/response validation. Response models are kept
permissive (dict passthrough for nested engine output) so the engine can evolve
without breaking the API, while the trade-result POST is strictly validated."""
from __future__ import annotations
from typing import Any, Optional
from pydantic import BaseModel, Field


class TradeResultIn(BaseModel):
    signal_id: int = Field(..., description="ID returned when the signal was created")
    exit_price: float = Field(..., gt=0)
    outcome: str = Field("MANUAL", pattern="^(TP1|TP2|SL|MANUAL)$")


class TradeResultOut(BaseModel):
    id: int
    reality: str
    pnl_pct: float
    prediction_correct: bool


class DecisionOut(BaseModel):
    symbol: str
    name: str
    timeframe: str
    source: str
    price: Optional[float]
    timestamp: Optional[str]
    direction: str
    score: float
    confidence: float
    decision: str
    quality: str
    tradable: bool
    historical_probability: Optional[float]
    reasons: list[str]
    risks: list[str]
    trade_plan: Optional[dict[str, Any]] = None
    risk_management: Optional[dict[str, Any]] = None
    no_trade_reason: Optional[str] = None
    score_breakdown: dict[str, Any]
    signal_id: Optional[int] = None

import React, { useState, useEffect, useMemo } from "react";
import {
  ComposedChart, Area, Line, Bar, BarChart, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Cell,
} from "recharts";
import {
  TrendingUp, TrendingDown, Activity, BarChart3, Brain, BookOpen,
  Wallet, Search, AlertTriangle, Target, Shield, Clock, Plus,
  Trash2, Gauge, Minus, Database, Zap, CheckCircle2,
  Radio, Wifi, WifiOff, Bell, KeyRound, Check, X, ClipboardCheck, CircleSlash, ArrowRight,
} from "lucide-react";

/* =========================================================================
   MATH / MOCK-DATA UTILITIES
   All numbers on this page are computed client-side from a seeded random
   walk, using real technical-analysis formulas (EMA/RSI/MACD/ATR/ADX).
   There is no live broker feed wired in here — see the "DEMO DATA" tags.
   ========================================================================= */

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function generateCandles(basePrice, volatility, count, seed) {
  const rand = mulberry32(seed);
  let price = basePrice;
  const candles = [];
  for (let i = 0; i < count; i++) {
    const drift = (rand() - 0.5) * volatility * price * 0.55;
    const open = price;
    const close = Math.max(0.01, open + drift + (rand() - 0.5) * volatility * price * 0.35);
    const high = Math.max(open, close) + rand() * volatility * price * 0.3;
    const low = Math.max(0.01, Math.min(open, close) - rand() * volatility * price * 0.3);
    const volume = Math.round(800 + rand() * 4200);
    candles.push({ i, open, high, low, close, volume });
    price = close;
  }
  return candles;
}

function computeEMA(values, period) {
  const k = 2 / (period + 1);
  const out = [];
  let ema;
  values.forEach((v, idx) => {
    ema = idx === 0 ? v : v * k + ema * (1 - k);
    out.push(ema);
  });
  return out;
}

function computeRSI(values, period = 14) {
  const rsi = new Array(values.length).fill(50);
  if (values.length <= period) return rsi;
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const diff = values[i] - values[i - 1];
    if (diff > 0) gains += diff; else losses -= diff;
  }
  let avgGain = gains / period, avgLoss = losses / period;
  rsi[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  for (let i = period + 1; i < values.length; i++) {
    const diff = values[i] - values[i - 1];
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    rsi[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  for (let i = 0; i < period; i++) rsi[i] = rsi[period];
  return rsi;
}

function computeMACD(values) {
  const ema12 = computeEMA(values, 12);
  const ema26 = computeEMA(values, 26);
  const macdLine = values.map((_, i) => ema12[i] - ema26[i]);
  const signalLine = computeEMA(macdLine, 9);
  const histogram = macdLine.map((v, i) => v - signalLine[i]);
  return { macdLine, signalLine, histogram };
}

function computeATR(candles, period = 14) {
  const trs = candles.map((c, i) => {
    if (i === 0) return c.high - c.low;
    const pc = candles[i - 1].close;
    return Math.max(c.high - c.low, Math.abs(c.high - pc), Math.abs(c.low - pc));
  });
  const atr = new Array(candles.length).fill(0);
  let sum = 0;
  for (let i = 0; i < Math.min(period, trs.length); i++) { sum += trs[i]; atr[i] = sum / (i + 1); }
  for (let i = period; i < trs.length; i++) atr[i] = (atr[i - 1] * (period - 1) + trs[i]) / period;
  return atr;
}

function computeADX(candles, period = 14) {
  const len = candles.length;
  const plusDM = new Array(len).fill(0), minusDM = new Array(len).fill(0), tr = new Array(len).fill(0);
  for (let i = 1; i < len; i++) {
    const up = candles[i].high - candles[i - 1].high;
    const down = candles[i - 1].low - candles[i].low;
    plusDM[i] = up > down && up > 0 ? up : 0;
    minusDM[i] = down > up && down > 0 ? down : 0;
    tr[i] = Math.max(candles[i].high - candles[i].low, Math.abs(candles[i].high - candles[i - 1].close), Math.abs(candles[i].low - candles[i - 1].close));
  }
  const smooth = (arr) => {
    const out = new Array(len).fill(0);
    let sum = 0;
    for (let i = 1; i <= period && i < len; i++) sum += arr[i];
    if (period < len) out[period] = sum;
    for (let i = period + 1; i < len; i++) out[i] = out[i - 1] - out[i - 1] / period + arr[i];
    return out;
  };
  const trS = smooth(tr), plusDMS = smooth(plusDM), minusDMS = smooth(minusDM);
  const plusDI = trS.map((v, i) => (v === 0 ? 0 : (100 * plusDMS[i]) / v));
  const minusDI = trS.map((v, i) => (v === 0 ? 0 : (100 * minusDMS[i]) / v));
  const dx = plusDI.map((v, i) => { const s = v + minusDI[i]; return s === 0 ? 0 : (100 * Math.abs(v - minusDI[i])) / s; });
  const adx = new Array(len).fill(0);
  let sum = 0, started = false;
  for (let i = period + 1; i <= period * 2 && i < len; i++) { sum += dx[i]; adx[i] = sum / (i - period); started = true; }
  for (let i = period * 2 + 1; i < len; i++) adx[i] = (adx[i - 1] * (period - 1) + dx[i]) / period;
  return adx;
}

function computeMarketData(candles, times) {
  const closes = candles.map((c) => c.close);
  const ema20 = computeEMA(closes, 20);
  const ema50 = computeEMA(closes, 50);
  const rsi14 = computeRSI(closes, 14);
  const { histogram } = computeMACD(closes);
  const atr14 = computeATR(candles, 14);
  const adx14 = computeADX(candles, 14);
  const last = candles.length - 1;
  const windowStart = Math.max(0, last - 20);
  const avgVol20 = candles.slice(windowStart).reduce((s, c) => s + c.volume, 0) / (last - windowStart + 1);
  const unusualVolume = candles[last].volume > avgVol20 * 1.8;
  const srWindow = candles.slice(Math.max(0, last - 40));
  const resistance = Math.max(...srWindow.map((c) => c.high));
  const support = Math.min(...srWindow.map((c) => c.low));
  return { candles, closes, ema20, ema50, rsi14, histogram, atr14, adx14, avgVol20, unusualVolume, resistance, support, times };
}

function buildMarketData(assetKey, count = 180, stepMinutes = 15) {
  const a = ASSETS[assetKey];
  const volScale = Math.sqrt(stepMinutes / 15);
  const candles = generateCandles(a.base, a.vol * volScale, count, a.seed);
  const now = new Date();
  const times = [];
  for (let i = count - 1; i >= 0; i--) {
    const t = new Date(now.getTime() - i * stepMinutes * 60000);
    times.push(t.toLocaleTimeString("sk-SK", { hour: "2-digit", minute: "2-digit" }));
  }
  return computeMarketData(candles, times);
}

/* Reálne sviečky z backendu (/api/candles) -> rovnaká štruktúra ako demo. */
function buildMarketDataFromApi(apiCandles) {
  const candles = apiCandles.map((c) => ({
    open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume,
  }));
  const times = apiCandles.map((c) =>
    new Date(c.time).toLocaleTimeString("sk-SK", { hour: "2-digit", minute: "2-digit" }));
  return computeMarketData(candles, times);
}

function deriveAnalysis(d) {
  const last = d.closes.length - 1;
  const price = d.closes[last];
  const ema20 = d.ema20[last], ema50 = d.ema50[last];
  const rsi = d.rsi14[last], hist = d.histogram[last];
  const atr = d.atr14[last], adx = d.adx14[last];

  let score = 0;
  score += price > ema20 ? 1 : -1;
  score += ema20 > ema50 ? 1.5 : -1.5;
  score += price > ema50 ? 0.5 : -0.5;
  if (rsi > 70) score -= 1.5; else if (rsi > 55) score += 1; else if (rsi < 30) score -= 2; else if (rsi < 45) score -= 0.5;
  score += hist > 0 ? 1 : -1;
  if (adx > 25) score += score > 0 ? 0.6 : -0.6;

  const bias = score > 1 ? "bullish" : score < -1 ? "bearish" : "neutral";
  const confidence = Math.max(35, Math.min(94, Math.round(58 + score * 8)));
  const probBull = Math.max(5, Math.min(95, Math.round(50 + score * 8)));
  const probBear = 100 - probBull;
  const atrPct = atr / price;
  const riskLevel = atrPct < 0.006 ? "Nízke" : atrPct < 0.016 ? "Stredné" : "Vysoké";

  const upMove = 0.006 + Math.min(atrPct, 0.02);
  const downMove = 0.004 + Math.min(atrPct, 0.015);
  const scenarioA = bias === "bearish"
    ? { label: "Pokračovanie poklesu", prob: probBear, target: price * (1 - upMove), dir: "down" }
    : { label: "Bullish pokračovanie", prob: probBull, target: price * (1 + upMove), dir: "up" };
  const scenarioB = bias === "bearish"
    ? { label: "Technický odraz", prob: probBull, target: price * (1 + downMove * 0.6), dir: "up" }
    : { label: "Pullback / korekcia", prob: probBear, target: price * (1 - downMove), dir: "down" };

  const reasoning = [
    price > ema20 ? `Cena obchoduje nad EMA20 (${ema20.toFixed(2)})` : `Cena je pod EMA20 (${ema20.toFixed(2)})`,
    ema20 > ema50 ? "krátkodobý priemer je nad dlhodobým, čo potvrdzuje rastúcu štruktúru" : "krátkodobý priemer je pod dlhodobým, čo naznačuje slabosť trendu",
    `RSI(14) je na úrovni ${rsi.toFixed(1)}` + (rsi > 70 ? " (prekúpené pásmo)" : rsi < 30 ? " (prepredané pásmo)" : " (neutrálne pásmo)"),
    hist > 0 ? "MACD histogram je pozitívny, momentum podporuje býkov" : "MACD histogram je negatívny, momentum podporuje medveďov",
    adx > 25 ? `ADX ${adx.toFixed(0)} potvrdzuje silu trendu` : `ADX ${adx.toFixed(0)} naznačuje slabý alebo rozkolísaný trend`,
  ].join(". ") + ".";

  return { price, ema20, ema50, rsi, hist, atr, adx, bias, confidence, probBull, probBear, riskLevel, scenarioA, scenarioB, reasoning, resistance: d.resistance, support: d.support, unusualVolume: d.unusualVolume };
}

function deriveTradeIdea(a) {
  const long = a.bias !== "bearish";
  const riskDist = Math.max(a.atr * 1.3, a.price * 0.004);
  const stop = long ? a.price - riskDist : a.price + riskDist;
  const target = long ? a.price + riskDist * 2 : a.price - riskDist * 2;
  const entryLow = long ? a.price * 0.999 : a.price * 1.001;
  const entryHigh = long ? a.price * 1.001 : a.price * 0.999;
  const probability = long ? a.probBull : a.probBear;
  return { direction: long ? "LONG" : "SHORT", entryLow, entryHigh, stop, target, rr: "1:2", probability };
}

function computeVWAP(candles) {
  let cumPV = 0, cumV = 0;
  return candles.map((c) => {
    const typical = (c.high + c.low + c.close) / 3;
    cumPV += typical * c.volume;
    cumV += c.volume;
    return cumV === 0 ? c.close : cumPV / cumV;
  });
}

function confidenceTier(conf) {
  if (conf < 50) return { key: "NO_TRADE", label: "NO TRADE", color: "var(--bear)", quality: "Žiadny obchod" };
  if (conf < 70) return { key: "WEAK", label: "WEAK SETUP", color: "#e0a13a", quality: "Slabý setup" };
  if (conf < 85) return { key: "VALID", label: "VALID SETUP", color: "var(--bull)", quality: "Platný setup" };
  return { key: "HIGH", label: "HIGH QUALITY SETUP", color: "var(--bull)", quality: "Vysoko kvalitný setup" };
}

/* Core AI Trade Decision engine.
   Combines bias, momentum, VWAP, volume, structure & historical prob into a
   single go / no-go decision with a full trade plan. All logic is rule-based
   on top of the (currently simulated) indicators. */
function deriveTradeDecision(assetKey, a, d, account, riskPct, tfMinutes = 15) {
  const last = d.closes.length - 1;
  const price = a.price;
  const long = a.bias !== "bearish";
  const vwap = computeVWAP(d.candles)[last];
  const atrPct = a.atr / price;
  const prob = long ? a.probBull : a.probBear;

  // ----- reasons FOR (only real, satisfied conditions) -----
  const reasonsFor = [];
  const trendAligned = (long && a.ema20 > a.ema50) || (!long && a.ema20 < a.ema50);
  if (trendAligned) reasonsFor.push("Trend zarovnaný (EMA20 vs EMA50)");
  const emaConfirm = (long && price > a.ema20) || (!long && price < a.ema20);
  if (emaConfirm) reasonsFor.push("EMA potvrdenie (cena na správnej strane EMA20)");
  const vwapSupport = (long && price > vwap) || (!long && price < vwap);
  if (vwapSupport) reasonsFor.push(long ? "VWAP podpora (cena nad VWAP)" : "VWAP odpor (cena pod VWAP)");
  const momentumOk = (long && a.hist > 0) || (!long && a.hist < 0);
  if (momentumOk) reasonsFor.push("MACD momentum na strane obchodu");
  if (a.unusualVolume) reasonsFor.push("Rastúci / nezvyčajný objem");
  if (prob >= 55) reasonsFor.push(`Historická pravdepodobnosť pozitívna (${prob}%)`);
  if (a.adx > 25) reasonsFor.push(`Silný trend (ADX ${a.adx.toFixed(0)})`);

  // ----- RISKS against -----
  const risks = [];
  if (atrPct > 0.016) risks.push("Vysoká volatilita (široký ATR)");
  if (a.adx < 20) risks.push("Slabý / rozkolísaný trend (ADX < 20)");
  if (long && a.rsi > 70) risks.push("RSI v prekúpenom pásme");
  if (!long && a.rsi < 30) risks.push("RSI v prepredanom pásme");
  const riskDist = Math.max(a.atr * 1.3, price * 0.004);
  const distToLevel = long ? a.resistance - price : price - a.support;
  if (distToLevel > 0 && distToLevel < riskDist * 0.9) risks.push(long ? "Resistance blízko nad cenou" : "Support blízko pod cenou");
  if (!trendAligned) risks.push("Trend nie je jednoznačne zarovnaný");

  // ----- trade plan (1R stop / 2R TP1 / 3R TP2 → blended R:R ~1:2.5) -----
  const stop = long ? price - riskDist : price + riskDist;
  const tp1 = long ? price + riskDist * 2 : price - riskDist * 2;
  const tp2 = long ? price + riskDist * 3 : price - riskDist * 3;
  const entryLow = long ? price * 0.9992 : price * 1.0008;
  const entryHigh = long ? price * 1.0008 : price * 0.9992;
  const rrValue = 2.5; // blended 50% TP1 (2R) + 50% TP2 (3R)

  // expected hold time from ATR / timeframe
  const barsToTarget = (riskDist * 2.5) / Math.max(a.atr * 0.55, 1e-9);
  const holdMin = Math.round(barsToTarget * tfMinutes);
  const loH = Math.max(1, Math.round((holdMin * 0.7) / 60 * 10) / 10);
  const hiH = Math.max(loH + 0.5, Math.round((holdMin * 1.3) / 60 * 10) / 10);

  // ----- decision gating -----
  const tier = confidenceTier(a.confidence);
  const enoughReasons = reasonsFor.length >= 3;
  const badRR = rrValue < 1.5;
  let decision, noTradeReason = null;
  if (a.confidence < 50 || !enoughReasons || badRR) {
    decision = "NO_TRADE";
    if (a.confidence < 50) noTradeReason = "Nedostatočná AI confidence (< 50).";
    else if (!enoughReasons) noTradeReason = "Príliš málo potvrdzujúcich faktorov pre vstup.";
    else noTradeReason = "Nevýhodný pomer risk/reward.";
  } else {
    decision = "SETUP";
  }

  // ----- risk / position sizing -----
  const riskAmount = account * (riskPct / 100);
  const riskPerUnit = Math.abs(entryLow - stop);
  const positionSize = riskPerUnit > 0 ? riskAmount / riskPerUnit : 0;

  return {
    assetKey, decision, tier, direction: long ? "LONG" : "SHORT",
    price, entryLow, entryHigh, stop, tp1, tp2, rr: `1:${rrValue}`, rrValue,
    holdRange: `${loH}–${hiH} h`, confidence: a.confidence, probability: prob,
    reasonsFor, risks, noTradeReason, vwap,
    riskAmount, positionSize, riskPerUnit,
  };
}

function deriveHistoricalStat(assetKey, bias, offset) {
  const rand = mulberry32(ASSETS[assetKey].seed * 7 + offset);
  const n = 780 + Math.floor(rand() * 950);
  const base = bias === "bullish" ? 69 : bias === "bearish" ? 65 : 53;
  const success = Math.min(89, Math.max(44, Math.round(base + (rand() - 0.5) * 12)));
  const avgMove = (bias === "bearish" ? -1 : 1) * (0.35 + rand() * 0.85);
  const maxDD = -(0.2 + rand() * 0.55);
  return { n, success, avgMove, maxDD };
}

/* Free data-source registry — reflects real July 2026 status.
   In production each "provider" is a backend adapter; here it drives the
   Data Sources status panel so the user sees the failover chain. */
const DATA_SOURCES = [
  { id: "yfinance", name: "Yahoo Finance (yfinance)", key: false, role: "Primárny", detail: "OHLCV + intraday, delay ~15–20 min", status: "online" },
  { id: "stooq", name: "Stooq (CSV)", key: false, role: "Záloha", detail: "Denné dáta 20+ rokov, bez API kľúča", status: "online" },
  { id: "finnhub", name: "Finnhub (free tier)", key: true, role: "Voliteľný", detail: "~60 req/min, real-time quote + news", status: "optional" },
  { id: "alphavantage", name: "Alpha Vantage (free)", key: true, role: "Fallback", detail: "Len 25 req/deň — šetrí sa na výnimky", status: "limited" },
  { id: "tvwebhook", name: "TradingView webhook", key: false, role: "Push", detail: "Alert → webhook → terminál", status: "listening" },
];

function mockWebhookAlerts(assetKey) {
  const rand = mulberry32(ASSETS[assetKey].seed * 5 + 9);
  const kinds = ["Cross EMA20/50", "RSI reset", "Breakout test", "Volume spike"];
  const out = [];
  const n = 2 + Math.floor(rand() * 2);
  for (let i = 0; i < n; i++) {
    const t = new Date(Date.now() - Math.floor(rand() * 90) * 60000);
    out.push({
      id: i,
      time: t.toLocaleTimeString("sk-SK", { hour: "2-digit", minute: "2-digit" }),
      symbol: ASSETS[assetKey].short,
      kind: kinds[Math.floor(rand() * kinds.length)],
      dir: rand() > 0.5 ? "up" : "down",
    });
  }
  return out;
}

function backtestReport(assetKey) {
  const rand = mulberry32(ASSETS[assetKey].seed * 13 + 3);
  const totalTrades = 180 + Math.floor(rand() * 260);
  const winRate = 48 + rand() * 22;
  const avgWin = 0.6 + rand() * 1.1;
  const avgLoss = -(0.4 + rand() * 0.7);
  const profitFactor = (winRate / 100) * avgWin / (((100 - winRate) / 100) * Math.abs(avgLoss));
  const maxDD = -(4 + rand() * 9);
  const sharpe = 0.6 + rand() * 1.6;
  const months = ["Jan", "Feb", "Mar", "Apr", "Máj", "Jún", "Júl", "Aug", "Sep", "Okt", "Nov", "Dec"];
  const monthly = months.map((m) => ({ month: m, ret: +(((rand() - 0.42) * 6)).toFixed(2) }));
  return { totalTrades, winRate, avgWin, avgLoss, profitFactor, maxDD, sharpe, monthly };
}

/* =========================================================================
   ASSETS & FORMATTERS
   ========================================================================= */

const ASSETS = {
  NVDA: { symbol: "NVIDIA Corp", short: "NVDA", base: 178.4, vol: 0.018, seed: 22 },
  TSLA: { symbol: "Tesla Inc", short: "TSLA", base: 261.7, vol: 0.024, seed: 33 },
  AAPL: { symbol: "Apple Inc", short: "AAPL", base: 231.2, vol: 0.012, seed: 44 },
  AMD: { symbol: "AMD", short: "AMD", base: 145.0, vol: 0.021, seed: 66 },
  META: { symbol: "Meta Platforms", short: "META", base: 580.0, vol: 0.016, seed: 77 },
  MSFT: { symbol: "Microsoft", short: "MSFT", base: 440.0, vol: 0.011, seed: 88 },
  QQQ: { symbol: "Nasdaq 100 ETF", short: "QQQ", base: 480.0, vol: 0.009, seed: 11 },
  SPY: { symbol: "S&P 500 ETF", short: "SPY", base: 560.0, vol: 0.008, seed: 99 },
  GLD: { symbol: "Gold ETF", short: "GLD", base: 215.0, vol: 0.007, seed: 55 },
};

// swing trading default: 4H main analysis
const SWING_TF = "4h";

/* ── API CLIENT ──────────────────────────────────────────────────────────
   Talks to the FastAPI backend. If no backend URL is configured, or the call
   fails, callers fall back to the local simulation (clearly labelled in the UI
   as DEMO). Set the backend URL in Settings once you deploy it. */
const API = {
  getBase() {
    try {
      const saved = localStorage.getItem("apiBase");
      if (saved) return saved;
    } catch {}
    // Na hostingu (frontend + backend na jednej adrese) použi automaticky
    // rovnakú doménu. Pri lokálnom vývoji (localhost) zostáva DEMO režim.
    if (typeof window !== "undefined" &&
        !["localhost", "127.0.0.1"].includes(window.location.hostname)) {
      return window.location.origin;
    }
    return "";
  },
  setBase(url) {
    try { localStorage.setItem("apiBase", url.replace(/\/$/, "")); } catch {}
  },
  async _get(path) {
    const base = this.getBase();
    if (!base) throw new Error("NO_BACKEND");
    const res = await fetch(base + path, { headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error(`API ${res.status}`);
    return res.json();
  },
  decision(symbol, tf, account, riskPct) {
    return this._get(`/api/decision/${symbol}?timeframe=${tf}&account=${account}&risk_pct=${riskPct}`);
  },
  analyze(symbol, tf) { return this._get(`/api/analyze/${symbol}?timeframe=${tf}`); },
  candles(symbol, tf, limit = 180) { return this._get(`/api/candles/${symbol}?timeframe=${tf}&limit=${limit}`); },
  calibrate(tf, target) { return this._get(`/api/calibrate?timeframe=${tf}&target_trades=${target}`); },
  quote(symbol, tf) { return this._get(`/api/quote/${symbol}?timeframe=${tf}`); },
  scan(tf, account, riskPct, minGrade) {
    return this._get(`/api/scan?timeframe=${tf}&account=${account}&risk_pct=${riskPct}&min_grade=${minGrade}`);
  },
};

function fmtPrice(v, assetKey) {
  const decimals = 2;
  return v.toLocaleString("sk-SK", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}
function fmtPct(v) { return `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`; }
function fmtEUR(v) { return v.toLocaleString("sk-SK", { style: "currency", currency: "EUR", maximumFractionDigits: 2 }); }

/* =========================================================================
   SMALL UI PRIMITIVES
   ========================================================================= */

function Sim({ children = "DEMO DATA" }) {
  return <span className="sim-badge">{children}</span>;
}

function Panel({ title, icon: Icon, right, children, className = "" }) {
  return (
    <div className={`panel rounded-2xl p-4 md:p-5 ${className}`}>
      {(title || right) && (
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            {Icon && <Icon size={15} className="text-accent" />}
            {title && <h3 className="text-xs tracking-wide uppercase text-secondary font-mono">{title}</h3>}
          </div>
          {right}
        </div>
      )}
      {children}
    </div>
  );
}

function BiasTag({ bias }) {
  const map = {
    bullish: { label: "BULLISH", cls: "bull-tag", Icon: TrendingUp },
    bearish: { label: "BEARISH", cls: "bear-tag", Icon: TrendingDown },
    neutral: { label: "NEUTRAL", cls: "neutral-tag", Icon: Minus },
  };
  const m = map[bias];
  return (
    <span className={`tag ${m.cls}`}>
      <m.Icon size={12} /> {m.label}
    </span>
  );
}

function ConfidenceBar({ value }) {
  const color = value >= 70 ? "var(--bull)" : value >= 50 ? "var(--accent)" : "var(--bear)";
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[11px] text-secondary font-mono">CONFIDENCE</span>
        <span className="text-sm font-mono font-semibold" style={{ color }}>{value}/100</span>
      </div>
      <div className="h-1.5 rounded-full bg-raised overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${value}%`, background: color }} />
      </div>
    </div>
  );
}

function ProbSplit({ probBull, probBear }) {
  return (
    <div>
      <div className="flex h-2 rounded-full overflow-hidden bg-raised">
        <div style={{ width: `${probBull}%`, background: "var(--bull)" }} />
        <div style={{ width: `${probBear}%`, background: "var(--bear)" }} />
      </div>
      <div className="flex justify-between mt-1 text-[11px] font-mono">
        <span style={{ color: "var(--bull)" }}>Bull {probBull}%</span>
        <span style={{ color: "var(--bear)" }}>Bear {probBear}%</span>
      </div>
    </div>
  );
}

/* =========================================================================
   TABS
   ========================================================================= */

/* ── ACTIVE TRADE MONITOR + NOTIFICATIONS ─────────────────────────────────
   Tracks a simulated position against SL/TP using the live price. Pure UI
   monitoring — no auto-trading. */
function tradeStatus(trade, price) {
  const long = trade.direction === "LONG";
  const toTP = long ? (trade.tp1 - price) : (price - trade.tp1);
  const toSL = long ? (price - trade.stop) : (trade.stop - price);
  const range = Math.abs(trade.tp1 - trade.stop) || 1;
  // hit conditions
  if (long ? price >= trade.tp1 : price <= trade.tp1) return { key: "TP_HIT", label: "TP HIT", color: "var(--bull)" };
  if (long ? price <= trade.stop : price >= trade.stop) return { key: "SL_HIT", label: "SL HIT", color: "var(--bear)" };
  if (toTP <= range * 0.2) return { key: "APPROACH_TP", label: "Approaching TP", color: "var(--bull)" };
  if (toSL <= range * 0.2) return { key: "APPROACH_SL", label: "Approaching SL", color: "#e0a13a" };
  return { key: "RUNNING", label: "Running", color: "var(--text-secondary)" };
}

function AssistantTab({ assetKey, setSelectedAsset, marketData, a, openTrades, setOpenTrades, closedTrades, setClosedTrades }) {
  const [phase, setPhase] = useState("idle");   // idle | analyzing | result
  const [dec, setDec] = useState(null);
  const [live, setLive] = useState(false);
  const [account] = useState(10000);
  const [riskPct] = useState(1);
  const [notes, setNotes] = useState([]);       // notification feed
  const [tick, setTick] = useState(0);

  // live price simulation for the monitor (or last price)
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 2500);
    return () => clearInterval(id);
  }, []);
  const jitter = useMemo(() => (mulberry32(tick * 131 + ASSETS[assetKey].seed)() - 0.5) * 0.0008 * a.price, [tick, assetKey, a.price]);
  const livePrice = a.price + jitter;

  const analyze = async () => {
    setPhase("analyzing"); setDec(null);
    // try live backend, fall back to local engine
    try {
      const res = await API.decision(assetKey, SWING_TF, account, riskPct);
      setDec(mapApiDecision(res, assetKey)); setLive(true);
    } catch {
      const d = deriveTradeDecision(assetKey, a, marketData, account, riskPct, 15);
      d.quality = localQuality(d);
      setDec(d); setLive(false);
    }
    setTimeout(() => setPhase("result"), 350); // brief "analyzing" beat
  };

  const isSetup = dec && dec.decision === "SETUP";
  // only recommend Quality A/B; a C-grade setup is downgraded to NO TRADE
  const recommended = isSetup && (!dec.quality || dec.quality.recommended);
  const statusLabel = !dec ? null
    : (isSetup && recommended)
      ? (dec.direction === "LONG"
          ? { icon: "🟢", text: "VALID LONG SETUP", color: "var(--bull)" }
          : { icon: "🔴", text: "VALID SHORT SETUP", color: "var(--bear)" })
      : { icon: "⚪", text: "NO TRADE", color: "var(--text-secondary)" };

  // active trade for THIS asset (monitor one at a time in the assistant)
  const active = openTrades.find((t) => t.assetKey === assetKey);
  const status = active ? tradeStatus(active, livePrice) : null;

  // notification logic: when status changes for the active trade, push a note
  const prevStatusRef = React.useRef(null);
  useEffect(() => {
    if (!active || !status) { prevStatusRef.current = null; return; }
    const prev = prevStatusRef.current;
    if (prev && prev !== status.key) {
      let msg = null;
      if (status.key === "TP_HIT") msg = "TP dosiahnutý. Zváž zatvorenie pozície.";
      else if (status.key === "SL_HIT") msg = "SL dosiahnutý. Zváž zatvorenie pozície.";
      else if (status.key === "APPROACH_TP") msg = "Cena sa blíži k TP. Review position.";
      else if (status.key === "APPROACH_SL") msg = "Cena sa blíži k SL. Review position.";
      if (msg) setNotes((n) => [{ id: Date.now(), t: new Date().toLocaleTimeString("sk-SK"), msg }, ...n].slice(0, 6));
    }
    prevStatusRef.current = status.key;
  }, [status?.key, active]);

  const saveOpen = async (arr) => {
    setOpenTrades(arr);
    try { await window.storage.set("decisions:open", JSON.stringify(arr), false); } catch {}
  };
  const saveClosed = async (arr) => {
    setClosedTrades(arr);
    try { await window.storage.set("decisions:closed", JSON.stringify(arr), false); } catch {}
  };

  const simulateEntry = () => {
    if (!isSetup || active) return;
    const trade = {
      id: Date.now(), assetKey, symbol: ASSETS[assetKey].symbol, short: ASSETS[assetKey].short,
      direction: dec.direction, entry: (dec.entryLow + dec.entryHigh) / 2,
      stop: dec.stop, tp1: dec.tp1, tp2: dec.tp2,
      confidence: dec.confidence, probability: dec.probability, predictedDir: dec.direction,
      openedAt: new Date().toLocaleString("sk-SK"),
    };
    saveOpen([trade, ...openTrades]);
    setNotes((n) => [{ id: Date.now(), t: new Date().toLocaleTimeString("sk-SK"), msg: "Simulovaný vstup vytvorený. Monitor je aktívny." }, ...n]);
  };

  const closeActive = (outcome) => {
    if (!active) return;
    let exit = outcome === "TP" ? active.tp1 : outcome === "SL" ? active.stop : livePrice;
    const pnlPct = (active.direction === "LONG" ? (exit - active.entry) / active.entry : (active.entry - exit) / active.entry) * 100;
    const win = pnlPct > 0;
    const record = { ...active, closedAt: new Date().toLocaleString("sk-SK"), exit, outcome, pnlPct, win, predictionCorrect: win };
    saveOpen(openTrades.filter((t) => t.id !== active.id));
    saveClosed([record, ...closedTrades]);
    setNotes((n) => [{ id: Date.now(), t: new Date().toLocaleTimeString("sk-SK"), msg: `Obchod uzavretý: ${win ? "WIN" : "LOSS"} (${pnlPct >= 0 ? "+" : ""}${pnlPct.toFixed(2)}%).` }, ...n]);
  };

  const distTo = (target) => {
    const d = Math.abs(livePrice - target);
    const pct = (d / livePrice) * 100;
    return `${fmtPrice(d, assetKey)} (${pct.toFixed(2)}%)`;
  };

  return (
    <div className="space-y-4 max-w-3xl mx-auto">
      {/* STEP 1+2: select + analyze */}
      <Panel right={live ? <span className="tag bull-tag"><Wifi size={11} /> LIVE</span> : <span className="tag" style={{ background: "var(--accent-soft)", color: "var(--accent)" }}><WifiOff size={11} /> DEMO</span>}>
        <div className="text-center py-2">
          <div className="text-[11px] text-secondary font-mono uppercase tracking-wide mb-2">Vyber aktívum</div>
          <div className="flex justify-center gap-2 flex-wrap mb-4">
            {Object.keys(ASSETS).map((k) => (
              <button key={k} onClick={() => { setSelectedAsset(k); setPhase("idle"); setDec(null); }}
                className={`px-4 py-2 rounded-xl text-sm font-semibold border transition-colors ${assetKey === k ? "border-accent text-accent bg-accent-soft" : "border-hairline text-secondary hover:text-primary"}`}>
                {ASSETS[k].short}
              </button>
            ))}
          </div>
          <div className="text-2xl font-mono font-bold mb-1">{ASSETS[assetKey].symbol}</div>
          <div className="text-sm font-mono text-secondary mb-4">{fmtPrice(livePrice, assetKey)}</div>
          <button onClick={analyze} disabled={phase === "analyzing"}
            className={phase === "analyzing" ? "btn-disabled px-8 py-3 rounded-xl font-bold text-sm" : "btn-enter px-8 py-3 rounded-xl font-bold text-sm"}>
            {phase === "analyzing" ? "Analyzujem trh…" : "ANALYZE MARKET"}
          </button>
        </div>
      </Panel>

      {/* STEP 3: decision card */}
      {phase === "result" && dec && statusLabel && (
        <Panel>
          <div className="text-center py-3 rounded-xl mb-3" style={{ background: "var(--bg-raised)" }}>
            <div className="text-3xl mb-1">{statusLabel.icon}</div>
            <div className="text-xl font-bold" style={{ color: statusLabel.color }}>{statusLabel.text}</div>
            <div className="text-[12px] text-secondary font-mono mt-1">{ASSETS[assetKey].symbol} · {new Date().toLocaleString("sk-SK")}</div>
            {dec.quality && <div className="mt-2 flex justify-center"><QualityBadge q={dec.quality} /></div>}
          </div>

          {recommended ? (
            <>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2 font-mono text-center">
                <div className="rounded-lg bg-raised p-2.5"><div className="text-[10px] text-secondary">ENTRY</div><div className="text-sm font-bold">{fmtPrice(Math.min(dec.entryLow, dec.entryHigh), assetKey)}–{fmtPrice(Math.max(dec.entryLow, dec.entryHigh), assetKey)}</div></div>
                <div className="rounded-lg bg-raised p-2.5"><div className="text-[10px] text-secondary">STOP LOSS</div><div className="text-sm font-bold" style={{ color: "var(--bear)" }}>{fmtPrice(dec.stop, assetKey)}</div></div>
                <div className="rounded-lg bg-raised p-2.5"><div className="text-[10px] text-secondary">TAKE PROFIT</div><div className="text-sm font-bold" style={{ color: "var(--bull)" }}>{fmtPrice(dec.tp1, assetKey)}</div></div>
                <div className="rounded-lg bg-raised p-2.5"><div className="text-[10px] text-secondary">RISK/REWARD</div><div className="text-sm font-bold">{dec.rr}</div></div>
                <div className="rounded-lg bg-raised p-2.5"><div className="text-[10px] text-secondary">CONFIDENCE</div><div className="text-sm font-bold" style={{ color: dec.tier.color }}>{dec.confidence}/100</div></div>
                <div className="rounded-lg bg-raised p-2.5"><div className="text-[10px] text-secondary">EXPECTED HOLD</div><div className="text-sm font-bold">{dec.holdRange}</div></div>
              </div>
              {dec.reasonsFor && dec.reasonsFor.length > 0 && (
                <p className="text-[12px] text-secondary mt-3 leading-relaxed"><b style={{ color: "var(--bull)" }}>Why this trade:</b> {dec.reasonsFor.slice(0, 4).join(" · ")}</p>
              )}
              {dec.risks && dec.risks.length > 0 && (
                <p className="text-[12px] text-secondary mt-1 leading-relaxed"><b style={{ color: "var(--bear)" }}>Why not:</b> {dec.risks.slice(0, 3).join(" · ")}</p>
              )}
              <button onClick={simulateEntry} disabled={!!active}
                className={active ? "btn-disabled w-full py-3 rounded-xl font-bold text-sm mt-4" : "btn-enter w-full py-3 rounded-xl font-bold text-sm mt-4"}>
                {active ? "Pozícia už je otvorená" : "SIMULATE ENTRY"}
              </button>
              {!active && <Trading212Checklist trade={dec} assetKey={assetKey} />}
            </>
          ) : (
            <p className="text-[13px] text-secondary text-center leading-relaxed">
              {dec.quality && dec.quality.grade === "C" && isSetup
                ? "Setup nedosahuje kvalitu A/B — systém ho neodporúča. Počkaj na lepšiu príležitosť."
                : (dec.noTradeReason || "Podmienky pre kvalitný vstup nie sú splnené. Počkaj na lepší setup.")}
            </p>
          )}
        </Panel>
      )}

      {/* STEP 4: active trade monitor */}
      {active && status && (
        <Panel title="Active Trade Monitor" icon={Activity} right={<span className="tag" style={{ background: "var(--bg-raised)", color: status.color }}>{status.label}</span>}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className={`tag ${active.direction === "LONG" ? "bull-tag" : "bear-tag"}`}>{active.direction}</span>
              <span className="text-sm font-medium">{active.short}</span>
            </div>
            <div className="text-right">
              <div className="text-lg font-mono font-bold">{fmtPrice(livePrice, assetKey)}</div>
              <div className="text-[11px] font-mono" style={{ color: (active.direction === "LONG" ? livePrice >= active.entry : livePrice <= active.entry) ? "var(--bull)" : "var(--bear)" }}>
                {fmtPct((active.direction === "LONG" ? (livePrice - active.entry) / active.entry : (active.entry - livePrice) / active.entry) * 100)}
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 font-mono text-[12px] mb-3">
            <div className="rounded-lg bg-raised p-2.5"><div className="text-[10px] text-secondary">VZDIALENOSŤ K TP</div><div className="font-semibold" style={{ color: "var(--bull)" }}>{distTo(active.tp1)}</div></div>
            <div className="rounded-lg bg-raised p-2.5"><div className="text-[10px] text-secondary">VZDIALENOSŤ K SL</div><div className="font-semibold" style={{ color: "var(--bear)" }}>{distTo(active.stop)}</div></div>
          </div>
          <div className="flex gap-1.5">
            <button onClick={() => closeActive("TP")} className="chip-bull">Zavrieť na TP</button>
            <button onClick={() => closeActive("SL")} className="chip-bear">Zavrieť na SL</button>
            <button onClick={() => closeActive("MANUAL")} className="chip-neutral">Zavrieť teraz</button>
          </div>
        </Panel>
      )}

      {/* STEP 5: notifications */}
      {notes.length > 0 && (
        <Panel title="Upozornenia" icon={Bell}>
          <div className="space-y-1.5">
            {notes.map((nt) => (
              <div key={nt.id} className="flex items-start gap-2 rounded-lg border border-hairline px-3 py-2">
                <Bell size={13} className="text-accent mt-0.5 shrink-0" />
                <div><span className="text-[13px]">{nt.msg}</span><span className="text-[10px] text-secondary font-mono ml-2">{nt.t}</span></div>
              </div>
            ))}
          </div>
        </Panel>
      )}
    </div>
  );
}

function EveningScanTab({ setSelectedAsset, setActiveTab }) {
  const [state, setState] = useState("idle");  // idle | scanning | done | demo
  const [opps, setOpps] = useState([]);
  const [msg, setMsg] = useState(null);

  const runScan = async () => {
    setState("scanning"); setOpps([]); setMsg(null);
    try {
      const res = await API.scan(SWING_TF, 10000, 1, "B");
      setOpps(res.opportunities || []);
      setMsg(res.message);
      setState("done");
    } catch (e) {
      // DEMO: scan the local engine across assets
      const found = [];
      for (const k of Object.keys(ASSETS)) {
        const d = buildMarketData(k, 160, 240); // 4h-ish
        const an = deriveAnalysis(d);
        const dec = deriveTradeDecision(k, an, d, 10000, 1, 240);
        const q = localQuality(dec);
        if (dec.decision === "SETUP" && q.recommended) {
          found.push({
            asset: k, name: ASSETS[k].symbol, direction: dec.direction, quality: q.grade,
            confidence: dec.confidence, entry_zone: [dec.entryLow, dec.entryHigh],
            stop_loss: dec.stop, take_profit: dec.tp1, risk_reward: dec.rr,
            expected_hold: dec.holdRange, historical_probability: dec.probability,
            current_price: an.price,
          });
        }
      }
      found.sort((x, y) => (x.quality > y.quality ? 1 : x.quality < y.quality ? -1 : y.confidence - x.confidence));
      setOpps(found);
      setMsg(found.length ? null : "NO HIGH QUALITY SETUP TODAY");
      setState("demo");
    }
  };

  const openAsset = (k) => { setSelectedAsset(k); setActiveTab("assistant"); };

  return (
    <div className="space-y-4 max-w-3xl mx-auto">
      <Panel right={state === "demo" ? <span className="tag" style={{ background: "var(--accent-soft)", color: "var(--accent)" }}><WifiOff size={11} /> DEMO</span> : state === "done" ? <span className="tag bull-tag"><Wifi size={11} /> LIVE</span> : null}>
        <div className="text-center py-3">
          <div className="text-lg font-bold mb-1">Evening Market Scan</div>
          <p className="text-[13px] text-secondary leading-relaxed mb-4 max-w-md mx-auto">
            Príď večer po práci, spusti sken. Systém prejde všetky sledované aktíva na 4H swing
            timeframe a zobrazí len kvalitné príležitosti (Quality A/B).
          </p>
          <button onClick={runScan} disabled={state === "scanning"}
            className={state === "scanning" ? "btn-disabled px-8 py-3 rounded-xl font-bold text-sm" : "btn-enter px-8 py-3 rounded-xl font-bold text-sm"}>
            {state === "scanning" ? "Skenujem trh…" : "RUN EVENING SCAN"}
          </button>
        </div>
      </Panel>

      {(state === "done" || state === "demo") && (
        msg ? (
          <Panel>
            <div className="text-center py-6">
              <div className="text-2xl mb-2">⚪</div>
              <div className="text-base font-semibold text-secondary">{msg}</div>
              <div className="text-[12px] text-secondary mt-1">Žiadny kvalitný setup — dnes sa neobchoduje. To je v poriadku.</div>
            </div>
          </Panel>
        ) : (
          <Panel title={`Top opportunities (${opps.length})`} icon={Target}>
            <div className="space-y-2">
              {opps.map((o) => (
                <button key={o.asset} onClick={() => openAsset(o.asset)}
                  className="w-full text-left rounded-xl border border-hairline p-3 hover:bg-raised transition-colors">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className={`tag ${o.direction === "LONG" ? "bull-tag" : "bear-tag"}`}>{o.direction}</span>
                      <span className="text-sm font-semibold">{o.asset}</span>
                      <QualityBadge q={{ grade: o.quality, label: o.quality === "A" ? "High quality" : "Acceptable" }} />
                    </div>
                    <span className="text-sm font-mono font-bold" style={{ color: o.confidence >= 85 ? "var(--bull)" : "var(--accent)" }}>{o.confidence}%</span>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 font-mono text-[11px] text-secondary">
                    <div>Entry<br /><span className="text-primary">{fmtPrice(Math.min(o.entry_zone[0], o.entry_zone[1]), o.asset)}</span></div>
                    <div>SL<br /><span style={{ color: "var(--bear)" }}>{fmtPrice(o.stop_loss, o.asset)}</span></div>
                    <div>TP<br /><span style={{ color: "var(--bull)" }}>{fmtPrice(o.take_profit, o.asset)}</span></div>
                    <div>RR / Hold<br /><span className="text-primary">{o.risk_reward} · {o.expected_hold}</span></div>
                  </div>
                </button>
              ))}
            </div>
            <p className="text-[11px] text-secondary mt-3 text-center">Klikni na kandidáta → otvorí sa v Assistant na detailnú analýzu.</p>
          </Panel>
        )
      )}
    </div>
  );
}

function CalibrationTab() {
  const [state, setState] = useState("idle"); // idle | running | done | error
  const [report, setReport] = useState(null);
  const [verdict, setVerdict] = useState(null);
  const [trades, setTrades] = useState([]);
  const [err, setErr] = useState(null);

  const run = async () => {
    setState("running"); setErr(null);
    try {
      const res = await API.calibrate("15m", 100);
      setReport(res.report); setVerdict(res.verdict); setTrades(res.trades || []);
      setState("done");
    } catch (e) {
      setErr(e.message === "NO_BACKEND"
        ? "Backend nie je pripojený. Nastav API URL v Nastaveniach a spusti backend (/api/calibrate)."
        : `Chyba: ${e.message}`);
      setState("error");
    }
  };

  const Row = ({ label, value, color }) => (
    <div className="flex justify-between py-1.5 border-b border-hairline/50">
      <span className="text-[12px] text-secondary">{label}</span>
      <span className="text-sm font-mono font-semibold" style={color ? { color } : {}}>{value}</span>
    </div>
  );

  return (
    <div className="space-y-4">
      <Panel title="AI Calibration Test" icon={Zap}>
        <p className="text-[13px] text-secondary leading-relaxed mb-3">
          Spustí 100 historických obchodov <b>rovnakou logikou</b> ako live AI Decision Engine
          (Technical → Structure → Score → Entry → SL/TP), bez future-data leakage. Cieľ nie je
          marketingové číslo, ale odpoveď: má engine historicky kladnú štatistickú výhodu?
        </p>
        <button onClick={run} disabled={state === "running"}
          className={state === "running" ? "btn-disabled w-full py-3 rounded-xl font-bold text-sm" : "btn-enter w-full py-3 rounded-xl font-bold text-sm"}>
          {state === "running" ? "Prebieha test… (môže trvať ~30 s)" : "RUN 100 HISTORICAL TRADES TEST"}
        </button>
        {state === "error" && (
          <div className="mt-3 rounded-xl bg-bear-soft border border-hairline p-3 text-[13px]" style={{ color: "var(--bear)" }}>
            {err}
          </div>
        )}
      </Panel>

      {state === "done" && report && (
        <>
          <Panel title="AI Calibration Results" icon={CheckCircle2} right={<span className="text-[11px] text-secondary font-mono">threshold {report.threshold_used} · {report.timeframe}</span>}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
              <div>
                <Row label="Tested opportunities" value={report.tested_opportunities} />
                <Row label="Executed trades" value={report.executed_trades} />
                <Row label="Winning trades" value={report.winning_trades} color="var(--bull)" />
                <Row label="Losing trades" value={report.losing_trades} color="var(--bear)" />
                <Row label="Win rate" value={`${report.win_rate_pct}%`} />
              </div>
              <div>
                <Row label="Avg winning trade" value={`${report.avg_winning_trade_pct}%`} color="var(--bull)" />
                <Row label="Avg losing trade" value={`${report.avg_losing_trade_pct}%`} color="var(--bear)" />
                <Row label="Profit factor" value={report.profit_factor} />
                <Row label="Max drawdown" value={`${report.max_drawdown_pct}%`} color="var(--bear)" />
                <Row label="Expected value / trade" value={`${report.expected_value_pct}%`}
                  color={report.expectancy_positive ? "var(--bull)" : "var(--bear)"} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 mt-3">
              <div className="rounded-lg bg-raised p-3">
                <div className="text-[10px] text-secondary font-mono">AVG CONFIDENCE — WINNERS</div>
                <div className="text-lg font-mono font-semibold" style={{ color: "var(--bull)" }}>{report.avg_confidence_winners}</div>
              </div>
              <div className="rounded-lg bg-raised p-3">
                <div className="text-[10px] text-secondary font-mono">AVG CONFIDENCE — LOSERS</div>
                <div className="text-lg font-mono font-semibold" style={{ color: "var(--bear)" }}>{report.avg_confidence_losers}</div>
              </div>
            </div>
          </Panel>

          {verdict && (
            <Panel title="Odporúčanie" icon={Shield}>
              <div className="flex items-start gap-2">
                {verdict.recommend_paper_trading
                  ? <CheckCircle2 size={18} className="text-bull mt-0.5 shrink-0" />
                  : <AlertTriangle size={18} className="text-bear mt-0.5 shrink-0" />}
                <div>
                  <div className="text-sm font-semibold" style={{ color: verdict.recommend_paper_trading ? "var(--bull)" : "var(--bear)" }}>
                    {verdict.verdict}
                  </div>
                  <div className="text-[12px] text-secondary mt-1">{verdict.reasons.join(" · ")}</div>
                </div>
              </div>
            </Panel>
          )}

          {trades.length > 0 && (
            <Panel title={`Obchody (prvých ${Math.min(trades.length, 20)} z ${trades.length})`} icon={BookOpen}>
              <div className="overflow-x-auto">
                <table className="w-full text-sm font-mono">
                  <thead>
                    <tr className="text-left text-[11px] text-secondary border-b border-hairline">
                      <th className="py-2 pr-3">Asset</th><th className="py-2 pr-3">Dir</th>
                      <th className="py-2 pr-3">Entry</th><th className="py-2 pr-3">Exit</th>
                      <th className="py-2 pr-3">Reason</th><th className="py-2 pr-3">PnL</th>
                      <th className="py-2 pr-3">Bars</th><th className="py-2 pr-3">Conf</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trades.slice(0, 20).map((t, i) => (
                      <tr key={i} className="border-b border-hairline/60">
                        <td className="py-2 pr-3">{t.asset}</td>
                        <td className="py-2 pr-3">{t.direction}</td>
                        <td className="py-2 pr-3">{t.entry}</td>
                        <td className="py-2 pr-3">{t.exit}</td>
                        <td className="py-2 pr-3 text-secondary">{t.reason}</td>
                        <td className="py-2 pr-3" style={{ color: t.pnl >= 0 ? "var(--bull)" : "var(--bear)" }}>{fmtPct(t.pnl * 100)}</td>
                        <td className="py-2 pr-3">{t.bars_held}</td>
                        <td className="py-2 pr-3">{Math.round(t.score)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
          )}
        </>
      )}
    </div>
  );
}

function DecisionRow({ ok, text }) {
  return (
    <div className="flex items-start gap-2 py-1">
      {ok
        ? <Check size={15} className="text-bull mt-0.5 shrink-0" />
        : <X size={15} className="text-bear mt-0.5 shrink-0" />}
      <span className="text-[13px] leading-snug">{text}</span>
    </div>
  );
}

function mapApiDecision(api, assetKey) {
  // maps backend /api/decision response into the shape DecisionTab renders
  const plan = api.trade_plan;
  const tier = api.decision === "HIGH"
    ? { key: "HIGH", label: "HIGH QUALITY SETUP", color: "var(--bull)" }
    : api.decision === "VALID"
    ? { key: "VALID", label: "VALID SETUP", color: "var(--bull)" }
    : api.decision === "WEAK"
    ? { key: "WEAK", label: "WEAK SETUP", color: "#e0a13a" }
    : { key: "NO_TRADE", label: "NO TRADE", color: "var(--bear)" };
  return {
    decision: api.tradable ? "SETUP" : "NO_TRADE",
    tier,
    direction: api.direction,
    price: api.price,
    entryLow: plan ? plan.entry_zone[0] : api.price,
    entryHigh: plan ? plan.entry_zone[1] : api.price,
    stop: plan ? plan.stop_loss : null,
    tp1: plan ? plan.take_profit_1 : null,
    tp2: plan ? plan.take_profit_2 : null,
    rr: plan ? plan.risk_reward : "—",
    holdRange: plan ? plan.expected_hold : "—",
    confidence: Math.round(api.confidence),
    probability: api.historical_probability ?? Math.round(api.confidence),
    reasonsFor: api.reasons || [],
    risks: api.risks || [],
    noTradeReason: api.no_trade_reason,
    quality: api.trade_quality || null,
    riskAmount: api.risk_management ? api.risk_management.max_loss : (10000 * 0.01),
    positionSize: api.risk_management ? api.risk_management.position_size : 0,
    riskPerUnit: plan ? plan.risk_per_unit : 0,
  };
}

// local A/B/C grade for DEMO mode (mirrors backend quality logic, simplified)
function localQuality(dec) {
  if (dec.decision !== "SETUP") return { grade: "C", label: "Avoid", recommended: false };
  const conf = dec.confidence;
  const grade = conf >= 85 ? "A" : conf >= 75 ? "B" : "C";
  return { grade, label: { A: "High quality", B: "Acceptable", C: "Avoid" }[grade], recommended: grade !== "C" };
}

function QualityBadge({ q }) {
  if (!q) return null;
  const color = q.grade === "A" ? "var(--bull)" : q.grade === "B" ? "#e0a13a" : "var(--bear)";
  return (
    <span className="tag" style={{ background: "var(--bg-raised)", color }}>
      Quality {q.grade} · {q.label}
    </span>
  );
}

function Trading212Checklist({ trade, assetKey }) {
  const items = [
    "Správne aktívum",
    "Entry cena skontrolovaná",
    "Stop Loss nastavený",
    "Take Profit nastavený",
    "Position size vypočítaná",
    "Riziko akceptované",
  ];
  const [checked, setChecked] = useState(items.map(() => false));
  const toggle = (i) => setChecked((c) => c.map((v, idx) => (idx === i ? !v : v)));
  const allDone = checked.every(Boolean);
  return (
    <div className="rounded-xl border border-hairline p-3 mt-3">
      <div className="flex items-center gap-2 mb-2">
        <ClipboardCheck size={14} className="text-accent" />
        <span className="text-sm font-semibold">Trading212 checklist — pred vstupom</span>
      </div>
      <div className="space-y-1.5">
        {items.map((label, i) => (
          <button key={i} onClick={() => toggle(i)} className="flex items-center gap-2 w-full text-left">
            <span className="w-4 h-4 rounded border flex items-center justify-center shrink-0"
              style={{ borderColor: checked[i] ? "var(--bull)" : "var(--hairline)", background: checked[i] ? "var(--bull)" : "transparent" }}>
              {checked[i] && <Check size={11} style={{ color: "#04140a" }} />}
            </span>
            <span className="text-[13px]" style={{ color: checked[i] ? "var(--text-secondary)" : "var(--text-primary)" }}>{label}</span>
          </button>
        ))}
      </div>
      <p className="text-[11px] mt-2" style={{ color: allDone ? "var(--bull)" : "var(--text-secondary)" }}>
        {allDone ? "✓ Všetko skontrolované — obchod vykonaj manuálne v Trading212." : "Systém obchod nikdy nevykonáva automaticky."}
      </p>
    </div>
  );
}

function DecisionTab({ assetKey, a, marketData, openTrades, setOpenTrades, closedTrades, setClosedTrades }) {
  const [account, setAccount] = useState(10000);
  const [riskPct, setRiskPct] = useState(1);
  const [entered, setEntered] = useState(null); // holds the just-entered trade for checklist
  const [exitInputs, setExitInputs] = useState({});
  const [apiDec, setApiDec] = useState(null);   // live decision from backend
  const [apiState, setApiState] = useState("idle"); // idle | loading | live | demo

  const localDec = useMemo(
    () => deriveTradeDecision(assetKey, a, marketData, account, riskPct, 15),
    [assetKey, a, marketData, account, riskPct]
  );

  // fetch a real decision from the backend whenever inputs change
  useEffect(() => {
    let alive = true;
    setApiState("loading");
    API.decision(assetKey, "15m", account, riskPct)
      .then((res) => { if (alive) { setApiDec(mapApiDecision(res, assetKey)); setApiState("live"); } })
      .catch(() => { if (alive) { setApiDec(null); setApiState("demo"); } });
    return () => { alive = false; };
  }, [assetKey, account, riskPct]);

  const dec = apiDec || localDec;
  const isSetup = dec.decision === "SETUP";

  const saveOpen = async (arr) => {
    setOpenTrades(arr);
    try { await window.storage.set("decisions:open", JSON.stringify(arr), false); } catch (e) { console.error(e); }
  };
  const saveClosed = async (arr) => {
    setClosedTrades(arr);
    try { await window.storage.set("decisions:closed", JSON.stringify(arr), false); } catch (e) { console.error(e); }
  };

  const enterTrade = () => {
    if (!isSetup) return;
    const trade = {
      id: Date.now(),
      assetKey, symbol: ASSETS[assetKey].symbol, short: ASSETS[assetKey].short,
      direction: dec.direction,
      entry: (dec.entryLow + dec.entryHigh) / 2,
      stop: dec.stop, tp1: dec.tp1, tp2: dec.tp2,
      positionSize: dec.positionSize, riskAmount: dec.riskAmount,
      confidence: dec.confidence, probability: dec.probability,
      predictedDir: dec.direction, rr: dec.rr,
      openedAt: new Date().toLocaleString("sk-SK"),
    };
    saveOpen([trade, ...openTrades]);
    setEntered(trade);
  };

  const closeTrade = (trade, outcome, manualExit) => {
    let exit;
    if (outcome === "TP1") exit = trade.tp1;
    else if (outcome === "TP2") exit = trade.tp2;
    else if (outcome === "SL") exit = trade.stop;
    else exit = manualExit;
    if (exit == null || isNaN(exit)) return;
    const pnlPct = (trade.direction === "LONG" ? (exit - trade.entry) / trade.entry : (trade.entry - exit) / trade.entry) * 100;
    const win = pnlPct > 0;
    const predictionCorrect = (trade.predictedDir === "LONG" && exit > trade.entry) || (trade.predictedDir === "SHORT" && exit < trade.entry);
    const record = { ...trade, closedAt: new Date().toLocaleString("sk-SK"), exit, outcome, pnlPct, win, predictionCorrect };
    saveOpen(openTrades.filter((t) => t.id !== trade.id));
    saveClosed([record, ...closedTrades]);
    if (entered && entered.id === trade.id) setEntered(null);
  };

  const accuracy = closedTrades.length
    ? Math.round((closedTrades.filter((t) => t.predictionCorrect).length / closedTrades.length) * 100)
    : null;

  return (
    <div className="space-y-4">
      {/* ---------- DECISION HEADER ---------- */}
      <Panel right={
        apiState === "live"
          ? <span className="tag bull-tag"><Wifi size={11} /> LIVE API</span>
          : apiState === "loading"
          ? <span className="text-[11px] text-secondary font-mono">načítavam…</span>
          : <span className="tag" style={{ background: "var(--accent-soft)", color: "var(--accent)" }}><WifiOff size={11} /> DEMO (backend nepripojený)</span>
      }>
        <div className="flex items-start justify-between flex-wrap gap-3 mb-4">
          <div>
            <div className="text-[11px] text-secondary font-mono uppercase tracking-wide">Asset · Čas · Cena</div>
            <div className="text-lg font-semibold mt-0.5">{ASSETS[assetKey].symbol}</div>
            <div className="text-[12px] text-secondary font-mono">{new Date().toLocaleString("sk-SK")} · {fmtPrice(a.price, assetKey)}</div>
          </div>
          <div className="text-right">
            <div className="text-[11px] text-secondary font-mono uppercase tracking-wide mb-1">AI Decision</div>
            {isSetup ? (
              <div className="flex items-center gap-2 justify-end">
                <span className="text-2xl">🟢</span>
                <span className="text-lg font-bold" style={{ color: "var(--bull)" }}>
                  POTENTIAL {dec.direction} SETUP
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-2 justify-end">
                <span className="text-2xl">🔴</span>
                <span className="text-lg font-bold" style={{ color: "var(--bear)" }}>NO TRADE</span>
              </div>
            )}
          </div>
        </div>

        {/* confidence + tier */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="rounded-xl border border-hairline p-3 md:col-span-2">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] text-secondary font-mono">AI CONFIDENCE</span>
              <span className="text-sm font-mono font-bold" style={{ color: dec.tier.color }}>{dec.confidence}/100 · {dec.tier.label}</span>
            </div>
            <div className="h-2 rounded-full bg-raised overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${dec.confidence}%`, background: dec.tier.color }} />
            </div>
            <div className="flex justify-between mt-1.5 text-[10px] text-secondary font-mono">
              <span>0–50 NO TRADE</span><span>50–70 WEAK</span><span>70–85 VALID</span><span>85–100 HIGH</span>
            </div>
          </div>
          <div className="rounded-xl border border-hairline p-3 flex flex-col justify-center">
            <div className="text-[11px] text-secondary font-mono">PROBABILITY</div>
            <div className="text-xl font-mono font-bold" style={{ color: dec.tier.color }}>{dec.probability}%</div>
          </div>
        </div>

        {!isSetup && (
          <div className="mt-3 rounded-xl bg-bear-soft border border-hairline p-3 flex items-start gap-2">
            <CircleSlash size={16} className="text-bear mt-0.5 shrink-0" />
            <div>
              <div className="text-sm font-medium" style={{ color: "var(--bear)" }}>Dôvod: obchod sa neodporúča</div>
              <div className="text-[13px] text-secondary mt-0.5">{dec.noTradeReason} Počkajte na lepšie zarovnanie podmienok.</div>
            </div>
          </div>
        )}
      </Panel>

      {/* ---------- TRADE PLAN (only when setup) ---------- */}
      {isSetup && (
        <>
          <Panel title="Obchodný plán" icon={Target} right={<Sim />}>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 font-mono text-center">
              <div className="rounded-lg bg-raised p-2.5">
                <div className="text-[10px] text-secondary">DIRECTION</div>
                <div className="text-sm font-bold" style={{ color: dec.direction === "LONG" ? "var(--bull)" : "var(--bear)" }}>{dec.direction}</div>
              </div>
              <div className="rounded-lg bg-raised p-2.5">
                <div className="text-[10px] text-secondary">ENTRY</div>
                <div className="text-sm font-bold">{fmtPrice(Math.min(dec.entryLow, dec.entryHigh), assetKey)}–{fmtPrice(Math.max(dec.entryLow, dec.entryHigh), assetKey)}</div>
              </div>
              <div className="rounded-lg bg-raised p-2.5">
                <div className="text-[10px] text-secondary">STOP LOSS</div>
                <div className="text-sm font-bold" style={{ color: "var(--bear)" }}>{fmtPrice(dec.stop, assetKey)}</div>
              </div>
              <div className="rounded-lg bg-raised p-2.5">
                <div className="text-[10px] text-secondary">R / R</div>
                <div className="text-sm font-bold">{dec.rr}</div>
              </div>
              <div className="rounded-lg bg-raised p-2.5">
                <div className="text-[10px] text-secondary">TAKE PROFIT 1</div>
                <div className="text-sm font-bold" style={{ color: "var(--bull)" }}>{fmtPrice(dec.tp1, assetKey)}</div>
              </div>
              <div className="rounded-lg bg-raised p-2.5">
                <div className="text-[10px] text-secondary">TAKE PROFIT 2</div>
                <div className="text-sm font-bold" style={{ color: "var(--bull)" }}>{fmtPrice(dec.tp2, assetKey)}</div>
              </div>
              <div className="rounded-lg bg-raised p-2.5">
                <div className="text-[10px] text-secondary">HOLD TIME</div>
                <div className="text-sm font-bold">{dec.holdRange}</div>
              </div>
              <div className="rounded-lg bg-raised p-2.5">
                <div className="text-[10px] text-secondary">CONFIDENCE</div>
                <div className="text-sm font-bold" style={{ color: dec.tier.color }}>{dec.confidence}</div>
              </div>
            </div>
          </Panel>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Panel title="Prečo vstúpiť" icon={CheckCircle2}>
              {dec.reasonsFor.length === 0
                ? <p className="text-sm text-secondary">Žiadne silné potvrdenia.</p>
                : dec.reasonsFor.map((r, i) => <DecisionRow key={i} ok text={r} />)}
            </Panel>
            <Panel title="Riziká" icon={AlertTriangle}>
              {dec.risks.length === 0
                ? <p className="text-sm text-secondary">Bez výrazných rizík v aktuálnom pohľade.</p>
                : dec.risks.map((r, i) => <DecisionRow key={i} ok={false} text={r} />)}
            </Panel>
          </div>
        </>
      )}

      {/* ---------- RISK MANAGEMENT (always) ---------- */}
      <Panel title="Risk management — pred vstupom" icon={Shield}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[11px] text-secondary font-mono block mb-1">Account (EUR)</label>
              <input type="number" value={account} onChange={(e) => setAccount(parseFloat(e.target.value) || 0)} className="input w-full" />
            </div>
            <div>
              <label className="text-[11px] text-secondary font-mono block mb-1">Risk (%)</label>
              <input type="number" step="0.1" value={riskPct} onChange={(e) => setRiskPct(parseFloat(e.target.value) || 0)} className="input w-full" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-lg bg-raised p-3">
              <div className="text-[10px] text-secondary font-mono">MAX. STRATA</div>
              <div className="text-lg font-mono font-bold" style={{ color: "var(--bear)" }}>{fmtEUR(dec.riskAmount)}</div>
            </div>
            <div className="rounded-lg bg-raised p-3">
              <div className="text-[10px] text-secondary font-mono">POSITION SIZE</div>
              <div className="text-lg font-mono font-bold">{isSetup ? dec.positionSize.toFixed(2) : "—"}</div>
              <div className="text-[10px] text-secondary">jednotiek</div>
            </div>
          </div>
        </div>
        <p className="text-[11px] text-secondary mt-3 flex items-center gap-1.5">
          <Shield size={12} className="text-accent" /> Systém nikdy nenavrhne obchod bez Stop Loss. Pri NO TRADE sa veľkosť pozície nepočíta.
        </p>
      </Panel>

      {/* ---------- EXECUTION ASSISTANT ---------- */}
      <Panel title="Trade Execution Assistant" icon={ClipboardCheck}>
        <button
          onClick={enterTrade}
          disabled={!isSetup}
          className={`w-full py-3 rounded-xl font-bold text-sm transition-colors ${isSetup ? "btn-enter" : "btn-disabled"}`}>
          {isSetup ? "I ENTER THIS TRADE" : "Vstup nie je odporúčaný"}
        </button>

        {entered && (
          <div className="mt-4 rounded-xl border border-hairline p-4">
            <div className="flex items-center gap-2 mb-3">
              <ClipboardCheck size={15} className="text-accent" />
              <span className="text-sm font-semibold">Trading212 order checklist</span>
            </div>
            <table className="w-full text-sm font-mono">
              <tbody>
                {[
                  ["Asset", entered.symbol],
                  ["Direction", entered.direction],
                  ["Position size", `${entered.positionSize.toFixed(2)} jedn.`],
                  ["Entry", fmtPrice(entered.entry, entered.assetKey)],
                  ["Stop Loss", fmtPrice(entered.stop, entered.assetKey)],
                  ["Take Profit 1", fmtPrice(entered.tp1, entered.assetKey)],
                  ["Take Profit 2", fmtPrice(entered.tp2, entered.assetKey)],
                  ["Max strata", fmtEUR(entered.riskAmount)],
                ].map(([k, v]) => (
                  <tr key={k} className="border-b border-hairline/50">
                    <td className="py-1.5 text-secondary">{k}</td>
                    <td className="py-1.5 text-right font-semibold">{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-[11px] text-secondary mt-3 flex items-center gap-1.5">
              <ArrowRight size={12} /> Obchod vykonáte manuálne v Trading212. Terminál nezadáva príkazy za vás.
            </p>
          </div>
        )}
      </Panel>

      {/* ---------- FOLLOW-UP: open trades ---------- */}
      <Panel title="Trade follow-up — otvorené" icon={Activity}>
        {openTrades.length === 0 ? (
          <p className="text-sm text-secondary">Žiadne otvorené obchody. Po vstupe sa tu objaví sledovanie.</p>
        ) : (
          <div className="space-y-3">
            {openTrades.map((t) => {
              const current = ASSETS[t.assetKey]?.base ?? t.entry;
              const livePnl = (t.direction === "LONG" ? (current - t.entry) / t.entry : (t.entry - current) / t.entry) * 100;
              const onTrack = livePnl >= 0;
              return (
                <div key={t.id} className="rounded-xl border border-hairline p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className={`tag ${t.direction === "LONG" ? "bull-tag" : "bear-tag"}`}>{t.direction}</span>
                      <span className="text-sm font-medium">{t.short}</span>
                      <span className="text-[11px] text-secondary font-mono">{t.openedAt}</span>
                    </div>
                    <span className="text-sm font-mono font-semibold" style={{ color: onTrack ? "var(--bull)" : "var(--bear)" }}>{fmtPct(livePnl)}</span>
                  </div>
                  <div className="grid grid-cols-4 gap-2 text-center font-mono text-[11px] text-secondary mb-2">
                    <div>Entry<br /><span className="text-primary">{fmtPrice(t.entry, t.assetKey)}</span></div>
                    <div>SL<br /><span style={{ color: "var(--bear)" }}>{fmtPrice(t.stop, t.assetKey)}</span></div>
                    <div>TP1<br /><span style={{ color: "var(--bull)" }}>{fmtPrice(t.tp1, t.assetKey)}</span></div>
                    <div>TP2<br /><span style={{ color: "var(--bull)" }}>{fmtPrice(t.tp2, t.assetKey)}</span></div>
                  </div>
                  <div className="text-[11px] text-secondary mb-2">
                    {onTrack ? "Cena sa vyvíja podľa scenára." : "Cena ide proti scenáru — zváž kontrolu SL."}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <button onClick={() => closeTrade(t, "TP1")} className="chip-bull">Zasiahol TP1</button>
                    <button onClick={() => closeTrade(t, "TP2")} className="chip-bull">Zasiahol TP2</button>
                    <button onClick={() => closeTrade(t, "SL")} className="chip-bear">Zasiahol SL</button>
                    <input
                      type="number" placeholder="exit"
                      value={exitInputs[t.id] || ""}
                      onChange={(e) => setExitInputs({ ...exitInputs, [t.id]: e.target.value })}
                      className="input w-24 py-1" />
                    <button onClick={() => closeTrade(t, "MANUAL", parseFloat(exitInputs[t.id]))} className="chip-neutral">Zavrieť</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Panel>

      {/* ---------- FOLLOW-UP: closed history ---------- */}
      <Panel title="Výsledky — predikcia vs. realita" icon={BookOpen} right={accuracy != null ? <span className="text-xs font-mono text-secondary">Presnosť predikcie: <span className="text-accent font-semibold">{accuracy}%</span></span> : null}>
        {closedTrades.length === 0 ? (
          <p className="text-sm text-secondary">Zatiaľ žiadne uzavreté obchody.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm font-mono">
              <thead>
                <tr className="text-left text-[11px] text-secondary border-b border-hairline">
                  <th className="py-2 pr-3">Nástroj</th><th className="py-2 pr-3">Smer</th>
                  <th className="py-2 pr-3">Predikcia</th><th className="py-2 pr-3">Realita</th>
                  <th className="py-2 pr-3">PnL</th><th className="py-2 pr-3">Presnosť</th>
                </tr>
              </thead>
              <tbody>
                {closedTrades.map((t) => (
                  <tr key={t.id} className="border-b border-hairline/60">
                    <td className="py-2 pr-3">{t.short}</td>
                    <td className="py-2 pr-3">{t.direction}</td>
                    <td className="py-2 pr-3 text-secondary">{t.predictedDir} @ {t.confidence}</td>
                    <td className="py-2 pr-3">{t.win ? <span style={{ color: "var(--bull)" }}>WIN</span> : <span style={{ color: "var(--bear)" }}>LOSS</span>} ({t.outcome})</td>
                    <td className="py-2 pr-3" style={{ color: t.pnlPct >= 0 ? "var(--bull)" : "var(--bear)" }}>{fmtPct(t.pnlPct)}</td>
                    <td className="py-2 pr-3">{t.predictionCorrect ? <Check size={14} className="text-bull" /> : <X size={14} className="text-bear" />}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}

function SourceStatusDot({ status }) {
  const map = {
    online: { c: "var(--bull)", Icon: Wifi },
    optional: { c: "var(--accent)", Icon: KeyRound },
    limited: { c: "#e0a13a", Icon: AlertTriangle },
    listening: { c: "#5aa9e6", Icon: Radio },
    offline: { c: "var(--bear)", Icon: WifiOff },
  };
  const m = map[status] || map.online;
  return <m.Icon size={13} style={{ color: m.c }} />;
}

function DataSourcesTab({ assetKey }) {
  const alerts = useMemo(() => mockWebhookAlerts(assetKey), [assetKey]);
  return (
    <div className="space-y-4">
      <Panel title="Dátové zdroje — failover reťazec" icon={Database} right={<Sim>STAV K 07/2026</Sim>}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] text-secondary border-b border-hairline font-mono">
                <th className="py-2 pr-3">Zdroj</th>
                <th className="py-2 pr-3">API kľúč</th>
                <th className="py-2 pr-3">Rola</th>
                <th className="py-2 pr-3">Poznámka</th>
                <th className="py-2 pr-3">Stav</th>
              </tr>
            </thead>
            <tbody>
              {DATA_SOURCES.map((s) => (
                <tr key={s.id} className="border-b border-hairline/60">
                  <td className="py-2.5 pr-3 font-medium">{s.name}</td>
                  <td className="py-2.5 pr-3 font-mono text-xs">
                    {s.key
                      ? <span className="tag neutral-tag"><KeyRound size={11} /> voliteľný</span>
                      : <span className="tag bull-tag"><CheckCircle2 size={11} /> bez kľúča</span>}
                  </td>
                  <td className="py-2.5 pr-3 text-secondary text-xs font-mono">{s.role}</td>
                  <td className="py-2.5 pr-3 text-secondary text-xs">{s.detail}</td>
                  <td className="py-2.5 pr-3"><SourceStatusDot status={s.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-secondary mt-3 leading-relaxed">
          Terminál nikdy nevyžaduje, aby ste zadali platený kľúč. yfinance a Stooq fungujú úplne bez kľúča;
          Finnhub/Alpha Vantage sú voliteľné bezplatné doplnky pre real-time quote a news. Ak primárny zdroj
          zlyhá alebo narazí na limit, systém sa automaticky prepne na ďalší v poradí.
        </p>
      </Panel>

      <Panel title="TradingView webhook inbox" icon={Bell} right={<Sim />}>
        <p className="text-[12px] text-secondary mb-3 leading-relaxed">
          Vo vašom TradingView alerte nastavíte Webhook URL na endpoint terminálu. Alerty prídu sem
          a spustia prepočet analýzy — bez plateného TradingView API.
        </p>
        <div className="rounded-lg bg-raised p-2.5 font-mono text-[11px] text-secondary mb-3 break-all">
          POST https://vas-terminal.app/api/v1/webhook/tradingview
        </div>
        {alerts.length === 0 ? (
          <p className="text-sm text-secondary">Zatiaľ žiadne alerty.</p>
        ) : (
          <div className="space-y-1.5">
            {alerts.map((al) => (
              <div key={al.id} className="flex items-center justify-between rounded-lg border border-hairline px-3 py-2">
                <div className="flex items-center gap-2">
                  {al.dir === "up" ? <TrendingUp size={14} className="text-bull" /> : <TrendingDown size={14} className="text-bear" />}
                  <span className="text-sm font-medium">{al.symbol}</span>
                  <span className="text-xs text-secondary">{al.kind}</span>
                </div>
                <span className="text-[11px] text-secondary font-mono">{al.time}</span>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}

function DashboardTab({ assetKey, a, marketData }) {
  const chartData = marketData.candles.map((c, i) => ({
    time: marketData.times[i], close: c.close, ema20: marketData.ema20[i], ema50: marketData.ema50[i], volume: c.volume,
  }));
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <Panel title="Cena & EMA 20 / EMA 50" icon={BarChart3} right={<Sim />} className="lg:col-span-2">
        <ResponsiveContainer width="100%" height={230}>
          <ComposedChart data={chartData} margin={{ left: -18, right: 8, top: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#232839" vertical={false} />
            <XAxis dataKey="time" tick={{ fontSize: 10, fill: "#8992a8" }} interval={Math.floor(chartData.length / 5)} />
            <YAxis domain={["auto", "auto"]} tick={{ fontSize: 10, fill: "#8992a8" }} width={54} />
            <Tooltip contentStyle={{ background: "#12151d", border: "1px solid #242938", fontSize: 12, borderRadius: 8 }} labelStyle={{ color: "#8992a8" }} />
            <Area type="monotone" dataKey="close" stroke="#c9a227" fill="rgba(201,162,39,0.08)" strokeWidth={1.6} dot={false} />
            <Line type="monotone" dataKey="ema20" stroke="#33d17a" dot={false} strokeWidth={1.3} />
            <Line type="monotone" dataKey="ema50" stroke="#ff5c6c" dot={false} strokeWidth={1.3} />
            <ReferenceLine y={a.resistance} stroke="#5b6478" strokeDasharray="4 4" />
            <ReferenceLine y={a.support} stroke="#5b6478" strokeDasharray="4 4" />
          </ComposedChart>
        </ResponsiveContainer>
        <div className="flex gap-4 mt-2 text-[11px] font-mono text-secondary">
          <span><span className="inline-block w-2 h-2 rounded-full mr-1" style={{ background: "#c9a227" }} />Cena</span>
          <span><span className="inline-block w-2 h-2 rounded-full mr-1" style={{ background: "#33d17a" }} />EMA20</span>
          <span><span className="inline-block w-2 h-2 rounded-full mr-1" style={{ background: "#ff5c6c" }} />EMA50</span>
        </div>
      </Panel>

      <Panel title="AI Trhový bias" icon={Brain} right={<Sim />}>
        <div className="flex items-center justify-between mb-3">
          <BiasTag bias={a.bias} />
          <span className="text-xs text-secondary font-mono">Riziko: {a.riskLevel}</span>
        </div>
        <ConfidenceBar value={a.confidence} />
        <p className="text-[13px] leading-relaxed text-primary/90 mt-3">{a.reasoning}</p>
      </Panel>

      <Panel title="RSI (14)" icon={Activity}>
        <div className="text-2xl font-mono font-semibold">{a.rsi.toFixed(1)}</div>
        <div className="h-1.5 rounded-full bg-raised mt-2 overflow-hidden">
          <div className="h-full rounded-full" style={{ width: `${a.rsi}%`, background: a.rsi > 70 ? "var(--bear)" : a.rsi < 30 ? "var(--bull)" : "var(--accent)" }} />
        </div>
        <p className="text-[11px] text-secondary mt-2">{a.rsi > 70 ? "Prekúpené pásmo" : a.rsi < 30 ? "Prepredané pásmo" : "Neutrálne pásmo"}</p>
      </Panel>

      <Panel title="MACD histogram" icon={Activity}>
        <div className="text-2xl font-mono font-semibold" style={{ color: a.hist > 0 ? "var(--bull)" : "var(--bear)" }}>
          {a.hist > 0 ? "+" : ""}{a.hist.toFixed(2)}
        </div>
        <p className="text-[11px] text-secondary mt-2">{a.hist > 0 ? "Pozitívne momentum" : "Negatívne momentum"}</p>
      </Panel>

      <Panel title="ATR (14) / ADX (14)" icon={Gauge}>
        <div className="flex justify-between">
          <div><div className="text-lg font-mono font-semibold">{a.atr.toFixed(2)}</div><div className="text-[11px] text-secondary">ATR</div></div>
          <div><div className="text-lg font-mono font-semibold">{a.adx.toFixed(0)}</div><div className="text-[11px] text-secondary">ADX</div></div>
        </div>
        <p className="text-[11px] text-secondary mt-2">{a.adx > 25 ? "Silný trend" : "Slabý / rozkolísaný trend"}{a.unusualVolume ? " · nezvyčajný objem" : ""}</p>
      </Panel>

      <Panel title="Support / Resistance" icon={Shield}>
        <div className="flex justify-between text-sm font-mono">
          <span style={{ color: "var(--bear)" }}>R {fmtPrice(a.resistance, assetKey)}</span>
          <span style={{ color: "var(--bull)" }}>S {fmtPrice(a.support, assetKey)}</span>
        </div>
        <p className="text-[11px] text-secondary mt-2">Odvodené z posledných 40 sviečok (rolling min/max)</p>
      </Panel>

      <Panel title="Zdroj dát (free-first)" icon={Database} right={<Sim>DEMO</Sim>} className="lg:col-span-3">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
          <div className="rounded-lg bg-raised p-3 border border-bull/30" style={{ borderColor: "var(--bull-soft)" }}>
            <div className="flex items-center gap-1.5 mb-1"><CheckCircle2 size={13} className="text-bull" /><span className="text-xs font-medium">Yahoo Finance</span></div>
            <div className="text-[10px] text-secondary font-mono">Primárny · bez kľúča · ~15 min oneskorenie</div>
          </div>
          <div className="rounded-lg bg-raised p-3">
            <div className="flex items-center gap-1.5 mb-1"><Database size={13} className="text-accent" /><span className="text-xs font-medium">Stooq CSV</span></div>
            <div className="text-[10px] text-secondary font-mono">Fallback · bez kľúča · EOD/hodinové</div>
          </div>
          <div className="rounded-lg bg-raised p-3">
            <div className="flex items-center gap-1.5 mb-1"><Zap size={13} className="text-accent" /><span className="text-xs font-medium">Binance WS</span></div>
            <div className="text-[10px] text-secondary font-mono">Real-time · len krypto · bez kľúča</div>
          </div>
          <div className="rounded-lg bg-raised p-3 opacity-70">
            <div className="flex items-center gap-1.5 mb-1"><AlertTriangle size={13} className="text-secondary" /><span className="text-xs font-medium">Finnhub / Alpha Vantage</span></div>
            <div className="text-[10px] text-secondary font-mono">Voliteľné · vyžaduje serverový kľúč</div>
          </div>
        </div>
        <p className="text-[11px] text-secondary mt-3 leading-relaxed">
          Používateľ webu <span className="text-primary">nezadáva žiadny API kľúč</span>. Ceny sa ťahajú serverom (Yahoo → pri chybe Stooq), cachujú sa a rozvádzajú všetkým. Kým nie je backend napojený, hodnoty vyššie sú simulované.
        </p>
      </Panel>
    </div>
  );
}

function AIAnalysisTab({ assetKey, a }) {
  const idea = deriveTradeIdea(a);
  const hist1 = deriveHistoricalStat(assetKey, a.bias, 1);
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Panel title="Scenáre pravdepodobnosti" icon={Target} right={<Sim />} className="lg:col-span-2">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[a.scenarioA, a.scenarioB].map((s, idx) => (
            <div key={idx} className="rounded-xl border border-hairline p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">{idx === 0 ? "Scenár A" : "Scenár B"}: {s.label}</span>
                {s.dir === "up" ? <TrendingUp size={16} className="text-bull" /> : <TrendingDown size={16} className="text-bear" />}
              </div>
              <div className="text-2xl font-mono font-semibold mb-1" style={{ color: s.dir === "up" ? "var(--bull)" : "var(--bear)" }}>
                {s.prob}%
              </div>
              <div className="text-[12px] text-secondary font-mono">Cieľ: {fmtPrice(s.target, assetKey)}</div>
            </div>
          ))}
        </div>
        <div className="mt-4"><ProbSplit probBull={a.probBull} probBear={a.probBear} /></div>
      </Panel>

      <Panel title="Trade Idea Generator" icon={Target} right={<Sim />}>
        <div className="flex items-center justify-between mb-3">
          <span className={`tag ${idea.direction === "LONG" ? "bull-tag" : "bear-tag"}`}>{idea.direction}</span>
          <span className="text-xs text-secondary font-mono">R:R {idea.rr} · Prob {idea.probability}%</span>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center font-mono">
          <div className="rounded-lg bg-raised p-2">
            <div className="text-[10px] text-secondary">ENTRY</div>
            <div className="text-sm font-semibold">{fmtPrice(Math.min(idea.entryLow, idea.entryHigh), assetKey)}–{fmtPrice(Math.max(idea.entryLow, idea.entryHigh), assetKey)}</div>
          </div>
          <div className="rounded-lg bg-raised p-2">
            <div className="text-[10px] text-secondary">STOP</div>
            <div className="text-sm font-semibold" style={{ color: "var(--bear)" }}>{fmtPrice(idea.stop, assetKey)}</div>
          </div>
          <div className="rounded-lg bg-raised p-2">
            <div className="text-[10px] text-secondary">TARGET</div>
            <div className="text-sm font-semibold" style={{ color: "var(--bull)" }}>{fmtPrice(idea.target, assetKey)}</div>
          </div>
        </div>
        <p className="text-[12px] text-secondary mt-3 leading-relaxed">Odvodené z ATR(14) a aktuálnej AI bias. Nejde o investičné odporúčanie.</p>
      </Panel>

      <Panel title="Štatistický predikčný model" icon={Activity} right={<Sim>SIMULÁCIA</Sim>}>
        <p className="text-[12px] text-secondary mb-3 leading-relaxed">
          Keď RSI je v pásme {a.rsi > 55 ? "55–70" : a.rsi < 45 ? "30–45" : "45–55"}, EMA20 {a.ema20 > a.ema50 ? "nad" : "pod"} EMA50 a ADX {a.adx > 25 ? "&gt; 25" : "&lt; 25"}, historicky (simulovaná séria):
        </p>
        <div className="grid grid-cols-2 gap-3 font-mono">
          <div><div className="text-lg font-semibold">{hist1.n.toLocaleString("sk-SK")}</div><div className="text-[11px] text-secondary">Počet prípadov</div></div>
          <div><div className="text-lg font-semibold" style={{ color: "var(--bull)" }}>{hist1.success}%</div><div className="text-[11px] text-secondary">Úspešnosť</div></div>
          <div><div className="text-lg font-semibold">{fmtPct(hist1.avgMove)}</div><div className="text-[11px] text-secondary">Priem. pohyb</div></div>
          <div><div className="text-lg font-semibold" style={{ color: "var(--bear)" }}>{fmtPct(hist1.maxDD)}</div><div className="text-[11px] text-secondary">Max. drawdown</div></div>
        </div>
      </Panel>
    </div>
  );
}

function ScannerTab({ selectedAsset, onSelect }) {
  const rows = Object.keys(ASSETS).map((key) => {
    const d = buildMarketData(key, 120, 15);
    const a = deriveAnalysis(d);
    return { key, a };
  });
  return (
    <Panel title="Market Scanner" icon={Search} right={<Sim />}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm font-mono">
          <thead>
            <tr className="text-left text-[11px] text-secondary border-b border-hairline">
              <th className="py-2 pr-3">Nástroj</th>
              <th className="py-2 pr-3">Cena</th>
              <th className="py-2 pr-3">Bias</th>
              <th className="py-2 pr-3">Confidence</th>
              <th className="py-2 pr-3">Prob. Bull/Bear</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ key, a }) => (
              <tr key={key} onClick={() => onSelect(key)}
                  className={`border-b border-hairline/60 cursor-pointer hover:bg-raised transition-colors ${selectedAsset === key ? "bg-raised" : ""}`}>
                <td className="py-2.5 pr-3 font-sans font-medium">{ASSETS[key].symbol}</td>
                <td className="py-2.5 pr-3">{fmtPrice(a.price, key)}</td>
                <td className="py-2.5 pr-3"><BiasTag bias={a.bias} /></td>
                <td className="py-2.5 pr-3">{a.confidence}/100</td>
                <td className="py-2.5 pr-3">
                  <span style={{ color: "var(--bull)" }}>{a.probBull}%</span> / <span style={{ color: "var(--bear)" }}>{a.probBear}%</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function ChartsTab({ assetKey, a }) {
  const TF = { "1m": 1, "5m": 5, "15m": 15, "1H": 60, "4H": 240, "1D": 1440 };
  const API_TF = { "1m": "1m", "5m": "5m", "15m": "15m", "1H": "1h", "4H": "4h", "1D": "1d" };
  const [tf, setTf] = useState("15m");
  const [liveMD, setLiveMD] = useState(null);
  useEffect(() => {
    let mounted = true;
    setLiveMD(null);
    (async () => {
      try {
        const r = await API.candles(assetKey, API_TF[tf], 150);
        if (mounted && r?.candles?.length > 30)
          setLiveMD({ md: buildMarketDataFromApi(r.candles), source: r.source });
      } catch {}
    })();
    return () => { mounted = false; };
  }, [assetKey, tf]);
  const marketData = useMemo(
    () => (liveMD ? liveMD.md : buildMarketData(assetKey, 150, TF[tf])),
    [assetKey, tf, liveMD]
  );
  const chartData = marketData.candles.map((c, i) => ({ time: marketData.times[i], close: c.close, ema20: marketData.ema20[i], ema50: marketData.ema50[i], volume: c.volume }));
  return (
    <Panel title={`${ASSETS[assetKey].symbol} — ${tf}`} icon={BarChart3}
      right={liveMD
        ? <span className="tag bull-tag"><Wifi size={11} /> LIVE · {liveMD.source}</span>
        : <Sim />}>
      <div className="flex gap-1.5 mb-3 flex-wrap">
        {Object.keys(TF).map((k) => (
          <button key={k} onClick={() => setTf(k)}
            className={`px-2.5 py-1 rounded-lg text-xs font-mono border ${tf === k ? "border-accent text-accent bg-accent-soft" : "border-hairline text-secondary"}`}>
            {k}
          </button>
        ))}
      </div>
      <ResponsiveContainer width="100%" height={240}>
        <ComposedChart data={chartData} margin={{ left: -18, right: 8, top: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#232839" vertical={false} />
          <XAxis dataKey="time" tick={{ fontSize: 10, fill: "#8992a8" }} interval={Math.floor(chartData.length / 6)} />
          <YAxis domain={["auto", "auto"]} tick={{ fontSize: 10, fill: "#8992a8" }} width={54} />
          <Tooltip contentStyle={{ background: "#12151d", border: "1px solid #242938", fontSize: 12, borderRadius: 8 }} labelStyle={{ color: "#8992a8" }} />
          <Area type="monotone" dataKey="close" stroke="#c9a227" fill="rgba(201,162,39,0.08)" strokeWidth={1.6} dot={false} />
          <Line type="monotone" dataKey="ema20" stroke="#33d17a" dot={false} strokeWidth={1.2} />
          <Line type="monotone" dataKey="ema50" stroke="#ff5c6c" dot={false} strokeWidth={1.2} />
        </ComposedChart>
      </ResponsiveContainer>
      <ResponsiveContainer width="100%" height={90}>
        <BarChart data={chartData} margin={{ left: -18, right: 8, top: 8 }}>
          <XAxis dataKey="time" hide />
          <YAxis hide />
          <Bar dataKey="volume" fill="#242938" radius={[2, 2, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </Panel>
  );
}

function JournalTab({ journal, setJournal, storageReady }) {
  const [form, setForm] = useState({ asset: "QQQ", dir: "LONG", entry: "", exit: "", notes: "" });

  const save = async (updated) => {
    setJournal(updated);
    try { await window.storage.set("journal:entries", JSON.stringify(updated), false); }
    catch (e) { console.error("Uloženie zlyhalo:", e); }
  };

  const addEntry = () => {
    if (!form.entry) return;
    const entry = { id: Date.now(), asset: form.asset, dir: form.dir, entry: parseFloat(form.entry), exit: form.exit ? parseFloat(form.exit) : null, notes: form.notes, date: new Date().toLocaleDateString("sk-SK") };
    save([entry, ...journal]);
    setForm({ ...form, entry: "", exit: "", notes: "" });
  };

  const removeEntry = (id) => save(journal.filter((e) => e.id !== id));

  const closed = journal.filter((e) => e.exit != null);
  const wins = closed.filter((e) => (e.dir === "LONG" ? e.exit > e.entry : e.exit < e.entry));
  const winRate = closed.length ? Math.round((wins.length / closed.length) * 100) : 0;
  const totalPnlPct = closed.reduce((s, e) => s + (e.dir === "LONG" ? (e.exit - e.entry) / e.entry : (e.entry - e.exit) / e.entry) * 100, 0);

  return (
    <div className="space-y-4">
      <Panel title="Nový záznam" icon={Plus}>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
          <select value={form.asset} onChange={(e) => setForm({ ...form, asset: e.target.value })} className="input">
            {Object.keys(ASSETS).map((k) => <option key={k} value={k}>{ASSETS[k].short}</option>)}
          </select>
          <select value={form.dir} onChange={(e) => setForm({ ...form, dir: e.target.value })} className="input">
            <option value="LONG">LONG</option><option value="SHORT">SHORT</option>
          </select>
          <input type="number" placeholder="Entry" value={form.entry} onChange={(e) => setForm({ ...form, entry: e.target.value })} className="input" />
          <input type="number" placeholder="Exit (voliteľné)" value={form.exit} onChange={(e) => setForm({ ...form, exit: e.target.value })} className="input" />
          <button onClick={addEntry} className="btn-accent">Pridať</button>
        </div>
        <input type="text" placeholder="Poznámka (voliteľné)" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="input w-full mt-2" />
        {!storageReady && <p className="text-[11px] text-secondary mt-2">Ukladanie záznamov sa pripravuje…</p>}
      </Panel>

      <div className="grid grid-cols-3 gap-3">
        <Panel><div className="text-lg font-mono font-semibold">{journal.length}</div><div className="text-[11px] text-secondary">Záznamov</div></Panel>
        <Panel><div className="text-lg font-mono font-semibold">{winRate}%</div><div className="text-[11px] text-secondary">Win rate</div></Panel>
        <Panel><div className="text-lg font-mono font-semibold" style={{ color: totalPnlPct >= 0 ? "var(--bull)" : "var(--bear)" }}>{fmtPct(totalPnlPct)}</div><div className="text-[11px] text-secondary">Súčet PnL</div></Panel>
      </div>

      <Panel title="História" icon={BookOpen}>
        {journal.length === 0 ? (
          <p className="text-sm text-secondary">Zatiaľ žiadne záznamy. Pridajte prvý obchod vyššie.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm font-mono">
              <thead><tr className="text-left text-[11px] text-secondary border-b border-hairline">
                <th className="py-2 pr-3">Dátum</th><th className="py-2 pr-3">Nástroj</th><th className="py-2 pr-3">Smer</th>
                <th className="py-2 pr-3">Entry</th><th className="py-2 pr-3">Exit</th><th className="py-2 pr-3">PnL</th><th></th>
              </tr></thead>
              <tbody>
                {journal.map((e) => {
                  const pnl = e.exit != null ? (e.dir === "LONG" ? (e.exit - e.entry) / e.entry : (e.entry - e.exit) / e.entry) * 100 : null;
                  return (
                    <tr key={e.id} className="border-b border-hairline/60">
                      <td className="py-2 pr-3">{e.date}</td>
                      <td className="py-2 pr-3">{ASSETS[e.asset]?.short || e.asset}</td>
                      <td className="py-2 pr-3">{e.dir}</td>
                      <td className="py-2 pr-3">{e.entry}</td>
                      <td className="py-2 pr-3">{e.exit ?? "—"}</td>
                      <td className="py-2 pr-3" style={{ color: pnl == null ? "#8992a8" : pnl >= 0 ? "var(--bull)" : "var(--bear)" }}>{pnl == null ? "—" : fmtPct(pnl)}</td>
                      <td className="py-2"><button onClick={() => removeEntry(e.id)}><Trash2 size={14} className="text-secondary hover:text-bear" /></button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}

function BacktestTab({ assetKey }) {
  const r = useMemo(() => backtestReport(assetKey), [assetKey]);
  return (
    <div className="space-y-4">
      <Panel title={`Backtest report — ${ASSETS[assetKey].symbol}`} icon={Activity} right={<Sim>UKÁŽKOVÝ REPORT</Sim>}>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 font-mono">
          <div><div className="text-lg font-semibold">{r.totalTrades}</div><div className="text-[11px] text-secondary">Obchodov</div></div>
          <div><div className="text-lg font-semibold">{r.winRate.toFixed(1)}%</div><div className="text-[11px] text-secondary">Win rate</div></div>
          <div><div className="text-lg font-semibold">{r.profitFactor.toFixed(2)}</div><div className="text-[11px] text-secondary">Profit factor</div></div>
          <div><div className="text-lg font-semibold">{r.sharpe.toFixed(2)}</div><div className="text-[11px] text-secondary">Sharpe ratio</div></div>
          <div><div className="text-lg font-semibold" style={{ color: "var(--bull)" }}>{fmtPct(r.avgWin)}</div><div className="text-[11px] text-secondary">Priem. výhra</div></div>
          <div><div className="text-lg font-semibold" style={{ color: "var(--bear)" }}>{fmtPct(r.avgLoss)}</div><div className="text-[11px] text-secondary">Priem. strata</div></div>
          <div className="col-span-2"><div className="text-lg font-semibold" style={{ color: "var(--bear)" }}>{fmtPct(r.maxDD)}</div><div className="text-[11px] text-secondary">Max drawdown</div></div>
        </div>
      </Panel>
      <Panel title="Mesačná výkonnosť" icon={BarChart3}>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={r.monthly} margin={{ left: -18, right: 8, top: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#232839" vertical={false} />
            <XAxis dataKey="month" tick={{ fontSize: 10, fill: "#8992a8" }} />
            <YAxis tick={{ fontSize: 10, fill: "#8992a8" }} width={40} />
            <Tooltip contentStyle={{ background: "#12151d", border: "1px solid #242938", fontSize: 12, borderRadius: 8 }} />
            <Bar dataKey="ret" radius={[3, 3, 0, 0]}>
              {r.monthly.map((m, i) => <Cell key={i} fill={m.ret >= 0 ? "#33d17a" : "#ff5c6c"} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </Panel>
    </div>
  );
}

function PortfolioTab({ assetKey, a, positions, setPositions }) {
  const [account, setAccount] = useState(20000);
  const [riskPct, setRiskPct] = useState(1);
  const idea = deriveTradeIdea(a);
  const riskAmount = account * (riskPct / 100);
  const riskPerUnit = Math.abs(idea.entryLow - idea.stop);
  const positionSize = riskPerUnit > 0 ? riskAmount / riskPerUnit : 0;

  const [posForm, setPosForm] = useState({ asset: "QQQ", qty: "", entry: "" });
  const savePositions = async (updated) => {
    setPositions(updated);
    try { await window.storage.set("portfolio:positions", JSON.stringify(updated), false); }
    catch (e) { console.error("Uloženie zlyhalo:", e); }
  };
  const addPosition = () => {
    if (!posForm.qty || !posForm.entry) return;
    savePositions([{ id: Date.now(), asset: posForm.asset, qty: parseFloat(posForm.qty), entry: parseFloat(posForm.entry) }, ...positions]);
    setPosForm({ ...posForm, qty: "", entry: "" });
  };
  const removePosition = (id) => savePositions(positions.filter((p) => p.id !== id));

  return (
    <div className="space-y-4">
      <Panel title="Risk Management kalkulačka" icon={Shield}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-[11px] text-secondary font-mono block">Veľkosť účtu (EUR)</label>
            <input type="number" value={account} onChange={(e) => setAccount(parseFloat(e.target.value) || 0)} className="input w-full" />
            <label className="text-[11px] text-secondary font-mono block mt-2">Riziko na obchod (%)</label>
            <input type="number" step="0.1" value={riskPct} onChange={(e) => setRiskPct(parseFloat(e.target.value) || 0)} className="input w-full" />
            <p className="text-[11px] text-secondary mt-2">Použitý trade idea pre {ASSETS[assetKey].short}: entry {fmtPrice(idea.entryLow, assetKey)}, stop {fmtPrice(idea.stop, assetKey)}</p>
          </div>
          <div className="grid grid-cols-2 gap-2 content-start">
            <div className="rounded-lg bg-raised p-3">
              <div className="text-[10px] text-secondary font-mono">MAX. STRATA</div>
              <div className="text-lg font-mono font-semibold" style={{ color: "var(--bear)" }}>{fmtEUR(riskAmount)}</div>
            </div>
            <div className="rounded-lg bg-raised p-3">
              <div className="text-[10px] text-secondary font-mono">VEĽKOSŤ POZÍCIE</div>
              <div className="text-lg font-mono font-semibold">{positionSize.toFixed(2)}</div>
              <div className="text-[10px] text-secondary">jednotiek / kontraktov</div>
            </div>
          </div>
        </div>
      </Panel>

      <Panel title="Otvorené pozície" icon={Wallet}>
        <div className="grid grid-cols-3 gap-2 mb-3">
          <select value={posForm.asset} onChange={(e) => setPosForm({ ...posForm, asset: e.target.value })} className="input">
            {Object.keys(ASSETS).map((k) => <option key={k} value={k}>{ASSETS[k].short}</option>)}
          </select>
          <input type="number" placeholder="Množstvo" value={posForm.qty} onChange={(e) => setPosForm({ ...posForm, qty: e.target.value })} className="input" />
          <input type="number" placeholder="Entry cena" value={posForm.entry} onChange={(e) => setPosForm({ ...posForm, entry: e.target.value })} className="input" />
        </div>
        <button onClick={addPosition} className="btn-accent mb-3">Pridať pozíciu</button>
        {positions.length === 0 ? (
          <p className="text-sm text-secondary">Žiadne otvorené pozície.</p>
        ) : (
          <table className="w-full text-sm font-mono">
            <thead><tr className="text-left text-[11px] text-secondary border-b border-hairline">
              <th className="py-2 pr-3">Nástroj</th><th className="py-2 pr-3">Množstvo</th><th className="py-2 pr-3">Entry</th><th className="py-2 pr-3">Aktuálna</th><th className="py-2 pr-3">PnL</th><th></th>
            </tr></thead>
            <tbody>
              {positions.map((p) => {
                const current = ASSETS[p.asset]?.base ?? p.entry;
                const pnlPct = ((current - p.entry) / p.entry) * 100;
                return (
                  <tr key={p.id} className="border-b border-hairline/60">
                    <td className="py-2 pr-3">{ASSETS[p.asset]?.short}</td>
                    <td className="py-2 pr-3">{p.qty}</td>
                    <td className="py-2 pr-3">{p.entry}</td>
                    <td className="py-2 pr-3">{fmtPrice(current, p.asset)}</td>
                    <td className="py-2 pr-3" style={{ color: pnlPct >= 0 ? "var(--bull)" : "var(--bear)" }}>{fmtPct(pnlPct)}</td>
                    <td className="py-2"><button onClick={() => removePosition(p.id)}><Trash2 size={14} className="text-secondary hover:text-bear" /></button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Panel>
    </div>
  );
}

/* =========================================================================
   APP
   ========================================================================= */

function SettingsTab() {
  const [url, setUrl] = useState(API.getBase());
  const [saved, setSaved] = useState(false);
  const [test, setTest] = useState(null);

  const save = () => { API.setBase(url); setSaved(true); setTimeout(() => setSaved(false), 1500); };
  const testConn = async () => {
    setTest("testing");
    try { await API.analyze("QQQ", "15m"); setTest("ok"); }
    catch (e) { setTest(e.message === "NO_BACKEND" ? "no_url" : "fail"); }
  };

  return (
    <div className="space-y-4">
      <Panel title="Backend pripojenie" icon={Database}>
        <p className="text-[13px] text-secondary leading-relaxed mb-3">
          Zadaj URL nasadeného FastAPI backendu (napr. <span className="font-mono">https://tvoj-backend.up.railway.app</span>).
          Keď je nastavené, terminál používa reálne dáta a rozhodnutia. Bez toho beží v DEMO režime.
        </p>
        <div className="flex gap-2">
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" className="input flex-1" />
          <button onClick={save} className="btn-accent">{saved ? "Uložené ✓" : "Uložiť"}</button>
          <button onClick={testConn} className="chip-neutral">Test</button>
        </div>
        {test === "testing" && <p className="text-[12px] text-secondary mt-2">Testujem…</p>}
        {test === "ok" && <p className="text-[12px] mt-2" style={{ color: "var(--bull)" }}>Pripojené — backend odpovedá ✓</p>}
        {test === "fail" && <p className="text-[12px] mt-2" style={{ color: "var(--bear)" }}>Backend neodpovedá na tejto URL.</p>}
        {test === "no_url" && <p className="text-[12px] mt-2" style={{ color: "var(--accent)" }}>Najprv ulož URL.</p>}
      </Panel>
      <Panel title="Poznámka" icon={AlertTriangle}>
        <p className="text-[12px] text-secondary leading-relaxed">
          Toto je rozhodovacia podpora, nie investičné poradenstvo. Kým kalibrácia na reálnych dátach
          nepotvrdí kladnú štatistickú výhodu, systém neodporúča živé obchodovanie — začni paper tradingom.
        </p>
      </Panel>
    </div>
  );
}

const NAV = [
  { id: "assistant", label: "Assistant", icon: Zap },
  { id: "scan", label: "Evening Scan", icon: Search },
  { id: "dashboard", label: "Dashboard", icon: BarChart3 },
  { id: "scanner", label: "Scanner", icon: Search },
  { id: "sources", label: "Dáta", icon: Database },
  { id: "ai", label: "AI Analýza", icon: Brain },
  { id: "decision", label: "Rozhodnutie", icon: Target },
  { id: "calibration", label: "Kalibrácia", icon: Gauge },
  { id: "charts", label: "Grafy", icon: TrendingUp },
  { id: "journal", label: "Journal", icon: BookOpen },
  { id: "backtest", label: "Backtest", icon: Activity },
  { id: "portfolio", label: "Portfólio", icon: Wallet },
  { id: "settings", label: "Nastavenia", icon: KeyRound },
];

export default function TradingTerminal() {
  const [activeTab, setActiveTab] = useState("assistant");
  const [selectedAsset, setSelectedAsset] = useState("QQQ");
  const [journal, setJournal] = useState([]);
  const [positions, setPositions] = useState([]);
  const [openTrades, setOpenTrades] = useState([]);
  const [closedTrades, setClosedTrades] = useState([]);
  const [storageReady, setStorageReady] = useState(false);
  const [clock, setClock] = useState(new Date());
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try { const r = await window.storage.get("journal:entries", false); if (mounted && r) setJournal(JSON.parse(r.value)); } catch (e) {}
      try { const r2 = await window.storage.get("portfolio:positions", false); if (mounted && r2) setPositions(JSON.parse(r2.value)); } catch (e) {}
      try { const r3 = await window.storage.get("decisions:open", false); if (mounted && r3) setOpenTrades(JSON.parse(r3.value)); } catch (e) {}
      try { const r4 = await window.storage.get("decisions:closed", false); if (mounted && r4) setClosedTrades(JSON.parse(r4.value)); } catch (e) {}
      if (mounted) setStorageReady(true);
    })();
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    const id = setInterval(() => { setClock(new Date()); setTick((t) => t + 1); }, 3000);
    return () => clearInterval(id);
  }, []);

  const [liveMD, setLiveMD] = useState(null);     // reálne sviečky z backendu
  const [liveQuote, setLiveQuote] = useState(null); // živá cena (Finnhub)

  useEffect(() => {
    let mounted = true;
    setLiveMD(null); setLiveQuote(null);
    (async () => {
      try {
        const r = await API.candles(selectedAsset, "15m", 180);
        if (mounted && r?.candles?.length > 30)
          setLiveMD({ md: buildMarketDataFromApi(r.candles), source: r.source });
      } catch {}
    })();
    const poll = async () => {
      try { const q = await API.quote(selectedAsset, "15m"); if (mounted) setLiveQuote(q); } catch {}
    };
    poll();
    const qid = setInterval(poll, 60000);       // živá cena každú minútu
    const cid = setInterval(async () => {       // sviečky každých 5 minút
      try {
        const r = await API.candles(selectedAsset, "15m", 180);
        if (mounted && r?.candles?.length > 30)
          setLiveMD({ md: buildMarketDataFromApi(r.candles), source: r.source });
      } catch {}
    }, 300000);
    return () => { mounted = false; clearInterval(qid); clearInterval(cid); };
  }, [selectedAsset]);

  const marketData = useMemo(
    () => (liveMD ? liveMD.md : buildMarketData(selectedAsset, 180, 15)),
    [selectedAsset, liveMD]
  );
  const a = useMemo(() => deriveAnalysis(marketData), [marketData]);

  const jitter = useMemo(() => (mulberry32(tick * 97 + ASSETS[selectedAsset].seed)() - 0.5) * 0.0006 * a.price, [tick, selectedAsset, a.price]);
  const livePrice = liveQuote ? liveQuote.current_price : a.price + jitter;
  const isLiveData = Boolean(liveMD || liveQuote);
  const dayChangePct = ((livePrice - marketData.candles[0].open) / marketData.candles[0].open) * 100;

  return (
    <div className="terminal min-h-screen font-sans">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600;700&family=Inter:wght@400;500;600;700;800&display=swap');
        .terminal { --bg-void:#090b10; --bg-panel:#12151d; --bg-raised:#181c26; --hairline:#242938;
          --text-primary:#e7e9ee; --text-secondary:#8992a8; --accent:#c9a227; --accent-soft:rgba(201,162,39,0.12);
          --bull:#33d17a; --bull-soft:rgba(51,209,122,0.12); --bear:#ff5c6c; --bear-soft:rgba(255,92,108,0.12);
          background:var(--bg-void); color:var(--text-primary); font-family:'Inter',sans-serif; }
        .font-mono{ font-family:'IBM Plex Mono',monospace; }
        .panel{ background:var(--bg-panel); border:1px solid var(--hairline); }
        .bg-raised{ background:var(--bg-raised); }
        .border-hairline{ border-color:var(--hairline); }
        .text-secondary{ color:var(--text-secondary); }
        .text-accent{ color:var(--accent); }
        .text-bull{ color:var(--bull); } .text-bear{ color:var(--bear); }
        .bg-accent-soft{ background:var(--accent-soft); }
        .tag{ display:inline-flex; align-items:center; gap:4px; padding:3px 9px; border-radius:999px; font-size:11px; font-family:'IBM Plex Mono',monospace; font-weight:600; letter-spacing:0.02em; }
        .bull-tag{ background:var(--bull-soft); color:var(--bull); }
        .bear-tag{ background:var(--bear-soft); color:var(--bear); }
        .neutral-tag{ background:var(--accent-soft); color:var(--accent); }
        .sim-badge{ font-family:'IBM Plex Mono',monospace; font-size:9px; letter-spacing:0.06em; color:#5b6478; border:1px solid var(--hairline); padding:2px 6px; border-radius:5px; }
        .input{ background:var(--bg-raised); border:1px solid var(--hairline); border-radius:8px; padding:7px 10px; font-size:13px; color:var(--text-primary); font-family:'IBM Plex Mono',monospace; outline:none; }
        .input:focus{ border-color:var(--accent); }
        .btn-accent{ background:var(--accent); color:#0a0b0f; font-weight:600; font-size:13px; padding:7px 16px; border-radius:8px; }
        .btn-accent:hover{ opacity:0.9; }
        .btn-enter{ background:var(--bull); color:#04140a; border:none; cursor:pointer; }
        .btn-enter:hover{ opacity:0.92; }
        .btn-disabled{ background:var(--bg-raised); color:var(--text-secondary); border:1px solid var(--hairline); cursor:not-allowed; }
        .chip-bull{ background:var(--bull-soft); color:var(--bull); font-size:11px; font-weight:600; padding:5px 10px; border-radius:7px; font-family:'IBM Plex Mono',monospace; }
        .chip-bear{ background:var(--bear-soft); color:var(--bear); font-size:11px; font-weight:600; padding:5px 10px; border-radius:7px; font-family:'IBM Plex Mono',monospace; }
        .chip-neutral{ background:var(--accent-soft); color:var(--accent); font-size:11px; font-weight:600; padding:5px 10px; border-radius:7px; font-family:'IBM Plex Mono',monospace; }
      `}</style>

      <div className="border-b border-hairline bg-raised/40 px-3 py-2 text-center text-[11px] text-secondary font-mono flex items-center justify-center gap-2">
        <AlertTriangle size={12} className="text-accent" />
        MVP — reálne dáta (Yahoo → Stooq) po pripojení backendu v Nastaveniach · inak DEMO režim · nie je to investičné odporúčanie
      </div>

      <header className="px-4 md:px-6 pt-4 pb-3 border-b border-hairline">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-accent-soft flex items-center justify-center"><Brain size={16} className="text-accent" /></div>
            <div>
              <div className="text-sm font-semibold leading-none">AI Trading Intelligence Terminal</div>
              <div className="text-[11px] text-secondary font-mono flex items-center gap-1 mt-0.5"><Clock size={10} />{clock.toLocaleTimeString("sk-SK")}</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <select value={selectedAsset} onChange={(e) => setSelectedAsset(e.target.value)} className="input">
              {Object.keys(ASSETS).map((k) => <option key={k} value={k}>{ASSETS[k].symbol}</option>)}
            </select>
            <div className="text-right">
              <div className="flex items-center justify-end gap-2">
                {isLiveData
                  ? <span className="tag bull-tag"><Wifi size={10} /> LIVE</span>
                  : <span className="sim-badge">DEMO</span>}
                <div className="text-lg font-mono font-semibold">{fmtPrice(livePrice, selectedAsset)}</div>
              </div>
              <div className="text-[11px] font-mono" style={{ color: dayChangePct >= 0 ? "var(--bull)" : "var(--bear)" }}>{fmtPct(dayChangePct)}</div>
            </div>
          </div>
        </div>
        <nav className="flex gap-1 mt-4 overflow-x-auto">
          {NAV.map((n) => (
            <button key={n.id} onClick={() => setActiveTab(n.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${activeTab === n.id ? "bg-accent-soft text-accent" : "text-secondary hover:text-primary"}`}>
              <n.icon size={13} />{n.label}
            </button>
          ))}
        </nav>
      </header>

      <main className="px-4 md:px-6 py-4 max-w-6xl mx-auto">
        {activeTab === "assistant" && <AssistantTab assetKey={selectedAsset} setSelectedAsset={setSelectedAsset} marketData={marketData} a={a} openTrades={openTrades} setOpenTrades={setOpenTrades} closedTrades={closedTrades} setClosedTrades={setClosedTrades} />}
        {activeTab === "scan" && <EveningScanTab setSelectedAsset={setSelectedAsset} setActiveTab={setActiveTab} />}
        {activeTab === "dashboard" && <DashboardTab assetKey={selectedAsset} a={a} marketData={marketData} />}
        {activeTab === "scanner" && <ScannerTab selectedAsset={selectedAsset} onSelect={setSelectedAsset} />}
        {activeTab === "ai" && <AIAnalysisTab assetKey={selectedAsset} a={a} />}
        {activeTab === "decision" && <DecisionTab assetKey={selectedAsset} a={a} marketData={marketData} openTrades={openTrades} setOpenTrades={setOpenTrades} closedTrades={closedTrades} setClosedTrades={setClosedTrades} />}
        {activeTab === "calibration" && <CalibrationTab />}
        {activeTab === "settings" && <SettingsTab />}
        {activeTab === "charts" && <ChartsTab assetKey={selectedAsset} a={a} />}
        {activeTab === "journal" && <JournalTab journal={journal} setJournal={setJournal} storageReady={storageReady} />}
        {activeTab === "backtest" && <BacktestTab assetKey={selectedAsset} />}
        {activeTab === "sources" && <DataSourcesTab assetKey={selectedAsset} />}
        {activeTab === "portfolio" && <PortfolioTab assetKey={selectedAsset} a={a} positions={positions} setPositions={setPositions} />}
      </main>

      <footer className="px-4 md:px-6 py-4 text-center text-[11px] text-secondary font-mono border-t border-hairline">
        Nejde o investičné poradenstvo. Všetky pravdepodobnosti a scenáre sú ilustratívne výstupy demo modelu.
      </footer>
    </div>
  );
}

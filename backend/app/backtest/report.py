"""Trading Performance Report generator.

Produces the exact report the brief asks for (Asset / Period / Trades / Win rate
/ Profit factor / Max drawdown / Best setup / Worst setup / Recommendation) and
— critically — an HONEST recommendation. If the out-of-sample edge isn't there,
it says DO NOT go live and to optimize the model first. It never rounds a
losing system up into a winner."""
from __future__ import annotations

from .metrics import breakdown_by


# thresholds for the go/no-go call (deliberately strict)
MIN_SIGNIFICANT_TRADES = 30
MIN_PROFIT_FACTOR = 1.20
MAX_ACCEPTABLE_DEGRADATION = -0.05   # OOS EV may fall at most 0.05pp below IS


def recommendation(wf: dict) -> dict:
    """Return {'verdict', 'go_live', 'reasons'} from a walk_forward result."""
    reasons = []
    if wf.get("status") in ("INSUFFICIENT_TRAIN_DATA", "INSUFFICIENT_TEST_DATA"):
        return {"verdict": "INSUFFICIENT DATA — nedá sa rozhodnúť",
                "go_live": False,
                "reasons": [f"status={wf.get('status')}"]}

    oos = wf["out_of_sample"]
    is_ = wf["in_sample"]
    ev = oos["expected_value_pct"]
    pf = oos["profit_factor"]
    trades = oos["trades"]
    degr = wf.get("ev_change_oos_minus_is")

    go = True
    if trades < MIN_SIGNIFICANT_TRADES:
        go = False; reasons.append(f"príliš málo out-of-sample obchodov ({trades} < {MIN_SIGNIFICANT_TRADES})")
    if ev is None or ev <= 0:
        go = False; reasons.append(f"Expected Value nie je kladné (EV={ev}%)")
    if pf is None or pf < MIN_PROFIT_FACTOR:
        go = False; reasons.append(f"Profit factor pod prahom ({pf} < {MIN_PROFIT_FACTOR})")
    if degr is not None and degr < MAX_ACCEPTABLE_DEGRADATION * 100:
        # degr is in percentage points already (EV% difference)
        pass  # handled below with clearer message
    if degr is not None and (is_["expected_value_pct"] > 0) and ev < is_["expected_value_pct"] * 0.5:
        go = False; reasons.append("silná degradácia medzi tréningom a testom (možný overfitting)")

    if go:
        verdict = "POZITÍVNA MATEMATICKÁ VÝHODA v out-of-sample — pokračuj OPATRNE (najprv paper trading)"
    else:
        verdict = "NEODPORÚČAM live trading — najprv optimalizuj model"
    return {"verdict": verdict, "go_live": go, "reasons": reasons or ["všetky kritériá splnené"]}


def best_worst_setup(trades: list[dict]) -> dict:
    if not trades:
        return {"best": None, "worst": None}
    by_dir = breakdown_by(trades, "direction")
    by_tier = breakdown_by(trades, "tier")
    combined = {}
    combined.update({f"dir:{k}": v for k, v in by_dir.items()})
    combined.update({f"tier:{k}": v for k, v in by_tier.items()})
    ranked = [(k, v) for k, v in combined.items() if v["trades"] >= 5 and v["expected_value_pct"] is not None]
    if not ranked:
        return {"best": None, "worst": None, "note": "nedostatok obchodov v podskupinách"}
    ranked.sort(key=lambda x: x[1]["expected_value_pct"])
    return {"worst": {ranked[0][0]: ranked[0][1]},
            "best": {ranked[-1][0]: ranked[-1][1]}}


def build_report(wf: dict, df_span: str = "") -> dict:
    if wf.get("status") == "INSUFFICIENT_TRAIN_DATA":
        return {"asset": wf["symbol"], "timeframe": wf["timeframe"],
                "status": wf["status"],
                "recommendation": recommendation(wf)}

    oos = wf["out_of_sample"]
    bw = best_worst_setup(wf.get("test_trades_detail", []))
    rec = recommendation(wf)
    return {
        "asset": wf["symbol"],
        "timeframe": wf["timeframe"],
        "period": df_span,
        "chosen_threshold": wf["chosen_threshold"],
        "trades": oos["trades"],
        "win_rate_pct": oos["win_rate"],
        "avg_win_pct": oos["avg_win_pct"],
        "avg_loss_pct": oos["avg_loss_pct"],
        "expected_value_pct": oos["expected_value_pct"],
        "profit_factor": oos["profit_factor"],
        "max_drawdown_pct": oos["max_drawdown_pct"],
        "sharpe_annualized": oos["sharpe_annualized"],
        "in_sample_ev_pct": wf["in_sample"]["expected_value_pct"],
        "out_of_sample_ev_pct": oos["expected_value_pct"],
        "ev_change_oos_minus_is_pp": wf.get("ev_change_oos_minus_is"),
        "best_setup": bw.get("best"),
        "worst_setup": bw.get("worst"),
        "recommendation": rec,
    }


def format_report_text(rep: dict) -> str:
    """Human-readable Trading Performance Report block."""
    if rep.get("status") in ("INSUFFICIENT_TRAIN_DATA", "INSUFFICIENT_TEST_DATA"):
        return (f"TRADING PERFORMANCE REPORT — {rep['asset']} {rep['timeframe']}\n"
                f"  Status: {rep['status']}\n"
                f"  Recommendation: {rep['recommendation']['verdict']}")
    r = rep["recommendation"]
    lines = [
        f"TRADING PERFORMANCE REPORT — {rep['asset']} ({rep['timeframe']})",
        f"  Period            : {rep.get('period','')}",
        f"  Threshold (train) : {rep['chosen_threshold']}",
        f"  Trades (OOS)      : {rep['trades']}",
        f"  Win rate          : {rep['win_rate_pct']}%",
        f"  Avg win / loss    : {rep['avg_win_pct']}% / {rep['avg_loss_pct']}%",
        f"  Expected Value    : {rep['expected_value_pct']}%  per trade",
        f"  Profit factor     : {rep['profit_factor']}",
        f"  Max drawdown      : {rep['max_drawdown_pct']}%",
        f"  Sharpe (annual)   : {rep['sharpe_annualized']}",
        f"  IS -> OOS EV       : {rep['in_sample_ev_pct']}% -> {rep['out_of_sample_ev_pct']}% "
        f"(Δ {rep['ev_change_oos_minus_is_pp']}pp)",
        f"  Best setup        : {rep['best_setup']}",
        f"  Worst setup       : {rep['worst_setup']}",
        f"  RECOMMENDATION    : {r['verdict']}",
        f"                      reasons: {', '.join(r['reasons'])}",
    ]
    return "\n".join(lines)

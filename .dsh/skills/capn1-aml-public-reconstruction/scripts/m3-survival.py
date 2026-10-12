#!/usr/bin/env python3
"""M3 CAPN1 OS statistics and SVG using lifelines (no R runtime)."""
import csv
import math
import pathlib
import sys
import html
import lifelines
import numpy as np
import pandas as pd
from lifelines import KaplanMeierFitter, CoxPHFitter
from lifelines.statistics import logrank_test


def save_tsv(path, columns, rows):
    with path.open("w", newline="", encoding="utf-8") as file:
        writer = csv.writer(file, delimiter="\t", lineterminator="\n")
        writer.writerow(columns)
        writer.writerows(rows)


def main(path, output):
    df = pd.read_csv(path, sep="\t", dtype={"case_id": str, "file_id": str})
    cols = {"case_id", "group", "os_days", "event"}
    if not cols.issubset(df) or df.case_id.isna().any() or df.case_id.duplicated().any():
        raise ValueError("Missing columns or duplicate M3 case")
    if not df.group.isin(["low", "high"]).all() or set(df.group) != {"low", "high"}:
        raise ValueError("Both low/high groups required")
    if not df.event.isin([0, 1]).all() or not np.isfinite(df.os_days).all() or (df.os_days < 0).any():
        raise ValueError("Invalid overall-survival observations")
    if df.event.sum() == 0:
        raise ValueError("No observed deaths")
    low, high = [df.loc[df.group == group] for group in ("low", "high")]
    rank = logrank_test(low.os_days, high.os_days, low.event, high.event)
    model = CoxPHFitter(penalizer=0.0, baseline_estimation_method="breslow")
    fit_data = pd.DataFrame({"os_days": df.os_days, "event": df.event,
                             "high": (df.group == "high").astype(int)})
    model.fit(fit_data, duration_col="os_days", event_col="event",
              fit_options={"max_steps": 500})
    coefficient = model.summary.loc["high"]
    output.mkdir(parents=True, exist_ok=True)
    values = {
        "total_cases": len(df),
        "high_cases": len(high),
        "low_cases": len(low),
        "observed_deaths": int(df.event.sum()),
        "high_deaths": int(high.event.sum()),
        "low_deaths": int(low.event.sum()),
        "logrank_chisq": float(rank.test_statistic),
        "logrank_p": float(rank.p_value),
        "hazard_ratio_high_vs_low": math.exp(float(coefficient["coef"])),
        "hazard_ratio_ci_lower": math.exp(float(coefficient["coef lower 95%"])),
        "hazard_ratio_ci_upper": math.exp(float(coefficient["coef upper 95%"])),
        "cox_wald_p": float(coefficient["p"]),
    }
    if not all(math.isfinite(float(v)) for v in values.values()):
        raise ValueError("Non-finite survival result")
    save_tsv(output / "statistics.tsv", ["metric", "value"], values.items())
    steps = []
    tracks = []
    for group, subset, color in [("low", low, "#4477AA"), ("high", high, "#DD6655")]:
        km = KaplanMeierFitter().fit(subset.os_days, subset.event, label=group)
        steps.append((group, 0.0, 1.0, len(subset), 0, 0))
        for point in km.event_table.iloc[1:].itertuples():
            pass
        for time, row in km.event_table.iterrows():
            if time < 0:
                continue
            surv = float(km.survival_function_at_times([time]).iloc[0])
            steps.append((group, float(time), surv, int(row.at_risk),
                          int(row.observed), int(row.censored)))
        tracks.append((group, color, km))
    save_tsv(output / "km-steps.tsv",
             ["group", "days", "survival", "n_risk", "n_event", "n_censor"], steps)
    save_tsv(output / "runtime.tsv", ["name", "value"], [
        ("python_version", sys.version.split()[0]),
        ("lifelines_version", lifelines.__version__),
        ("cox_ties", "efron"),
        ("baseline", "breslow"),
    ])
    width, height, left, right, top, bottom = 900, 530, 85, 35, 55, 65
    max_days = max(float(df.os_days.max()), 1.0)
    px = lambda t: left + (width-left-right) * float(t) / max_days
    py = lambda val: height-bottom-(height-top-bottom)*float(val)
    lines = [
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" width="{width}" height="{height}">',
        '<rect width="100%" height="100%" fill="white"/>',
        '<text x="65" y="30" font-family="sans-serif" font-size="20">CAPN1 / TCGA-LAML overall survival</text>',
        f'<path d="M{left} {top}V{height-bottom}H{width-right}" stroke="#333" fill="none"/>',
    ]
    for group, color, km in tracks:
        coords = [(0.0, 1.0)]
        for time, value in km.survival_function_[group].items():
            coords.append((float(time), float(value)))
        parts = [f'M{px(coords[0][0]):.2f} {py(coords[0][1]):.2f}']
        old = coords[0][1]
        for time, val in coords[1:]:
            parts.extend([f'H{px(time):.2f}', f'V{py(val):.2f}'])
            old = val
        lines.append(f'<path d="{" ".join(parts)}" stroke="{color}" stroke-width="3" fill="none"/>')
    lines.extend([
        f'<text x="{width/2}" y="{height-18}" font-family="sans-serif" text-anchor="middle">Days after diagnosis</text>',
        f'<text x="18" y="{height/2}" font-family="sans-serif" transform="rotate(-90 18 {height/2})">Overall survival</text>',
        f'<text x="{left+15}" y="{top+24}" font-family="sans-serif" fill="#4477AA">Low CAPN1</text>',
        f'<text x="{left+15}" y="{top+45}" font-family="sans-serif" fill="#DD6655">High CAPN1</text>',
        '</svg>',
    ])
    (output / "kaplan-meier.svg").write_text("\n".join(lines) + "\n", encoding="utf-8")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit("Usage: python m3-survival.py cohort.tsv output-dir")
    main(pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2]))

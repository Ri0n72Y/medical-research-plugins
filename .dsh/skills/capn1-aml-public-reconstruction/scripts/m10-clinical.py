#!/usr/bin/env python3
"""Paper coverage: CAPN1 expression groups versus available AML clinical fields."""
import argparse
import pathlib
import csv
import html
import json

import numpy as np
import pandas as pd
from scipy.stats import mannwhitneyu, chi2_contingency


def write(path, headers, rows):
    with path.open("w", newline="", encoding="utf-8") as f:
        out = csv.writer(f, delimiter="\t", lineterminator="\n")
        out.writerow(headers)
        out.writerows(rows)


def analyze(cohort_path, cases_path, diagnosis_path, outdir):
    cohort = pd.read_csv(cohort_path, sep="\t", dtype=str).set_index("case_id")
    cases = pd.read_csv(cases_path, sep="\t", dtype=str).set_index("case_id")
    diagnoses = pd.read_csv(diagnosis_path, sep="\t", dtype=str)
    if cohort.index.has_duplicates or cases.index.has_duplicates:
        raise ValueError("Duplicate case_id")
    if not {"high", "low"}.issubset(set(cohort.group)):
        raise ValueError("Both CAPN1 groups are required")
    selected = cohort[["file_id", "group"]].join(
        cases[["age_at_index", "sex_at_birth"]], how="left")
    if len(selected) != len(cohort):
        raise ValueError("Case association lost cohort rows")
    if {"case_id", "eln_risk_classification"}.issubset(diagnoses):
        risks = diagnoses.dropna(subset=["eln_risk_classification"])
        risks = risks.drop_duplicates(subset="case_id").set_index("case_id")
        selected = selected.join(risks[["eln_risk_classification"]], how="left")
    else:
        selected["eln_risk_classification"] = np.nan
    selected.index.name = "case_id"
    selected.to_csv(outdir / "clinical-paired.tsv", sep="\t", na_rep="")
    rows = []
    age = pd.to_numeric(selected.age_at_index, errors="coerce")
    high = age[selected.group == "high"].dropna()
    low = age[selected.group == "low"].dropna()
    if len(high) and len(low):
        p = mannwhitneyu(high, low, alternative="two-sided").pvalue
        rows.append(["age_at_index", "continuous", "median",
                     len(high), len(low), f"{high.median():.5g}",
                     f"{low.median():.5g}", f"{p:.6g}"])
    for field in ("sex_at_birth", "eln_risk_classification"):
        data = selected[["group", field]].dropna()
        data = data[data[field].str.strip().ne("")]
        if data.empty:
            rows.append([field, "categorical", "unavailable", 0, 0, "", "", ""])
            continue
        table = pd.crosstab(data.group, data[field])
        if len(table.columns) < 2 or len(table.index) < 2:
            p = ""
        else:
            p = f"{chi2_contingency(table, correction=False).pvalue:.6g}"
        for value in sorted(data[field].unique()):
            rows.append([field, "categorical", value,
                int((data.group == "high").sum()), int((data.group == "low").sum()),
                int(((data.group == "high") & (data[field] == value)).sum()),
                int(((data.group == "low") & (data[field] == value)).sum()), p])
    headers = ["feature", "type", "value", "high_n", "low_n", "high", "low", "p_value"]
    write(outdir / "clinical-associations.tsv", headers, rows)
    lines = ['<svg xmlns="http://www.w3.org/2000/svg" width="960" height="{}">'.format(max(150, 85+24*len(rows))),
             '<rect width="100%" height="100%" fill="white"/>',
             '<text x="16" y="30" font-size="18" font-family="sans-serif">CAPN1 — AML clinical feature comparison</text>']
    for i, row in enumerate(rows):
        label = f"{row[0]} {row[2]}: high={row[5]} low={row[6]} p={row[7]}"
        lines.append('<text x="16" y="{}" font-size="12" font-family="monospace">{}</text>'.format(
            64+i*24, html.escape(label)))
    (outdir / "clinical-associations.svg").write_text("\n".join(lines+["</svg>"])+"\n")
    (outdir / "report.md").write_text(
        "# CAPN1 / AML clinical feature association\n\n"
        f"- Paired cases: {len(selected)}; high={int((selected.group=='high').sum())}; "
        f"low={int((selected.group=='low').sum())}.\n"
        "- Inputs: M2 clinical cases/diagnoses + M3 CAPN1 paired cohort.\n"
        "- Comparison: Mann–Whitney age; Pearson chi-square for available categories.\n"
        "- This is an original-paper analysis-step reconstruction; no clinical inference.\n"
        "- Output: clinical-paired.tsv, clinical-associations.tsv, clinical-associations.svg.\n")
    (outdir / "statistics.json").write_text(json.dumps(
        {"cases":len(selected),"comparisons":len(rows),"method":"SciPy descriptive associations"},indent=2)+"\n")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    for name in ("cohort", "cases", "diagnoses", "outdir"):
        ap.add_argument(name)
    args = ap.parse_args()
    dest = pathlib.Path(args.outdir)
    dest.mkdir(parents=True, exist_ok=True)
    analyze(pathlib.Path(args.cohort), pathlib.Path(args.cases),
            pathlib.Path(args.diagnoses), dest)

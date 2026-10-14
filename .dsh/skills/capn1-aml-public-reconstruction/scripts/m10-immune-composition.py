#!/usr/bin/env python3
"""Immune-composition workflow counterpart: public marker NNLS proxy or imported CIBERSORT."""
import argparse
import csv
import html
import json
import pathlib
import re
from collections import defaultdict

import numpy as np
import pandas as pd
from scipy.optimize import nnls

IMMUNE = re.compile(
    r"t[ _-]?cells?|b[ _-]?cells?|macrophages?|neutrophils?|monocytes?|"
    r"natural[ _-]?killer|nk[ _-]?cells?|dendritic|plasma[ _-]?cells?|"
    r"mast[ _-]?cells?|eosinophils?|basophils?", re.I)


def from_markers(tpm_path, annotations_path, cohort, gmt_path):
    tpm = pd.read_csv(tpm_path, sep="\t", index_col="gene_id")
    ann = pd.read_csv(annotations_path, sep="\t").set_index("gene_id")
    ann = ann.loc[tpm.index]
    unique = ann.gene_name.notna() & ~ann.gene_name.duplicated(keep=False)
    symbol = ann.loc[unique, "gene_name"].astype(str).str.upper()
    matrix = tpm.loc[unique].copy()
    matrix.index = symbol
    signatures = {}
    with gmt_path.open(encoding="utf-8") as inp:
        for line in inp:
            terms = line.rstrip("\r\n").split("\t")
            if len(terms) < 7:
                continue
            name = terms[0]
            if IMMUNE.search(name):
                overlap = set(x.upper() for x in terms[2:]) & set(matrix.index)
                if len(overlap) >= 5:
                    signatures[name] = overlap
    if len(signatures) < 2:
        raise ValueError("At least two public immune marker signatures must overlap M2")
    genes = sorted(set.union(*signatures.values()))
    labels = sorted(signatures)
    design = np.array([[int(g in signatures[t]) for t in labels] for g in genes], dtype=float)
    if np.linalg.matrix_rank(design) < 2:
        raise ValueError("Marker signatures insufficient for NNLS proxy")
    rows = []
    for sample in cohort.itertuples(index=False):
        if sample.file_id not in matrix:
            raise ValueError("M3 file ID absent from M2 TPM")
        vector = np.log1p(matrix.loc[genes, sample.file_id].to_numpy(dtype=float))
        if not np.isfinite(vector).all() or (vector < 0).any():
            raise ValueError("Invalid M2 expression")
        weights, _ = nnls(design, vector)
        total = weights.sum()
        weights = weights / total if total else weights
        rows.extend([sample.case_id, sample.file_id, sample.group, term, float(value)]
                    for term, value in zip(labels, weights))
    return rows, "public-marker-NNLS-relative-contribution"


def from_import(source, cohort):
    with source.open(newline="", encoding="utf-8") as f:
        records = list(csv.DictReader(f, delimiter="\t"))
    if not records:
        raise ValueError("Empty external CIBERSORT results")
    head = records[0].keys()
    sample_col = "Mixture" if "Mixture" in head else "sample_id"
    if sample_col not in head:
        raise ValueError("External CIBERSORT output needs Mixture or sample_id")
    cells = [c for c in head if c not in {sample_col, "P-value", "Correlation", "RMSE"}]
    if not cells:
        raise ValueError("No cell columns in CIBERSORT output")
    indexed = {str(x[sample_col]): x for x in records}
    rows = []
    for sample in cohort.itertuples(index=False):
        entry = indexed.get(sample.file_id) or indexed.get(sample.case_id)
        if not entry:
            raise ValueError("External CIBERSORT result missing paired sample")
        for term in cells:
            val = float(entry[term])
            if not np.isfinite(val) or val < 0:
                raise ValueError("Invalid imported CIBERSORT value")
            rows.append([sample.case_id, sample.file_id, sample.group, term, val])
    return rows, "external-CIBERSORT-import-only"


def write(path, fields, data):
    with path.open("w", newline="", encoding="utf-8") as f:
        out = csv.writer(f, delimiter="\t", lineterminator="\n")
        out.writerow(fields)
        out.writerows(data)


def analyze(cohort_path, outdir, tpm, annotations, gmt, imported):
    cohort = pd.read_csv(cohort_path, sep="\t", dtype=str)
    if not {"case_id", "file_id", "group"}.issubset(cohort) or cohort.empty:
        raise ValueError("Invalid paired M3 cohort")
    if imported:
        rows, method = from_import(imported, cohort)
    else:
        rows, method = from_markers(tpm, annotations, cohort, gmt)
    write(outdir / "immune-contributions.tsv",
          ["case_id", "file_id", "group", "cell_signature", "relative_contribution"], 
          [[*row[:4], f"{row[4]:.12g}"] for row in rows])
    grouped = defaultdict(lambda: defaultdict(list))
    for _, _, group, term, value in rows:
        grouped[term][group].append(value)
    summary = [[term, len(vals["high"]), len(vals["low"]),
                f"{np.median(vals['high']):.12g}" if vals["high"] else "",
                f"{np.median(vals['low']):.12g}" if vals["low"] else ""]
               for term, vals in sorted(grouped.items())]
    write(outdir / "immune-summary.tsv",
          ["cell_signature", "high_n", "low_n", "high_median", "low_median"], summary)
    lines = [f'<svg xmlns="http://www.w3.org/2000/svg" width="990" height="{90+24*len(summary)}">',
             '<rect width="100%" height="100%" fill="white"/>',
             '<text x="16" y="30" font-family="sans-serif" font-size="18">Immune contribution overview</text>']
    for i, s in enumerate(summary):
        label = html.escape(f"{s[0][:47]}: high={s[3]}, low={s[4]}")
        lines.append(f'<text x="16" y="{70+24*i}" font-size="12" font-family="monospace">{label}</text>')
    (outdir / "immune-composition.svg").write_text("\n".join(lines+["</svg>"])+"\n")
    (outdir / "statistics.json").write_text(json.dumps(
        {"method":method,"paired_samples":len(cohort),"signatures":len(summary)},indent=2)+"\n")
    (outdir / "report.md").write_text(
        "# Immune composition workflow counterpart\n\n"
        f"- Method: {method}.\n"
        f"- Paired samples: {len(cohort)}; signatures: {len(summary)}.\n"
        "- Public marker-based NNLS coefficients are **NOT** CIBERSORT fractions or cell counts.\n"
        "- External CIBERSORT results, if supplied, are imported/visualized only, "
        "not executed or licensed by this repository.\n"
        "- Output: immune-contributions.tsv, immune-summary.tsv, immune-composition.svg.\n")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("cohort", type=pathlib.Path)
    ap.add_argument("outdir", type=pathlib.Path)
    for key in ("tpm", "annotations", "gmt", "imported"):
        ap.add_argument("--"+key, type=pathlib.Path)
    args = ap.parse_args()
    args.outdir.mkdir(parents=True, exist_ok=True)
    analyze(args.cohort,args.outdir,args.tpm,args.annotations,args.gmt,args.imported)

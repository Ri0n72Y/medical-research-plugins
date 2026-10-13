#!/usr/bin/env python3
"""M7: transparent, marker-set ssGSEA scores (not immune-cell deconvolution)."""
import argparse
import csv
import html
import json
import math
import pathlib
import re
import sys
from collections import Counter

import gseapy as gp
import numpy as np
import pandas as pd
from scipy.stats import mannwhitneyu
from statsmodels.stats.multitest import multipletests

IMMUNE = re.compile(
    r"(?:^|[^a-z])(?:t[\s_-]?cells?|b[\s_-]?cells?|"
    r"cd[48]\+?[\s_-]?t[\s_-]?cells?|"
    r"nk[\s_-]?cells?|natural[\s_-]?killer[\s_-]?cells?|"
    r"macrophages?|monocytes?|neutrophils?|dendritic[\s_-]?cells?|"
    r"plasma[\s_-]?cells?|mast[\s_-]?cells?|eosinophils?|"
    r"basophils?|regulatory[\s_-]?t[\s_-]?cells?|"
    r"t[\s_-]?reg(?:ulatory)?[\s_-]?cells?)(?:$|[^a-z])",
    re.IGNORECASE)
SYMBOL = re.compile(r"^[A-Z][A-Z0-9._-]*$")
GENE_COLS = ["gene_id", "gene_name", "gene_type", "mapping_status"]
COVERAGE = ["term", "library_genes", "mapped_genes", "retained", "reason"]
SCORES = ["case_id", "file_id", "group", "term", "es", "nes"]
GROUPS = ["term", "high_n", "low_n", "high_median_nes", "low_median_nes",
          "median_difference_high_minus_low", "mann_whitney_p", "bh_fdr"]


def write(path, fields, rows):
    with path.open("w", newline="", encoding="utf-8") as handle:
        w = csv.writer(handle, delimiter="\t", lineterminator="\n")
        w.writerow(fields)
        w.writerows(rows)


def inputs(tpm_path, annotations_path, cohort_path):
    expression = pd.read_csv(tpm_path, sep="\t", dtype={"gene_id": "string"})
    annotation = pd.read_csv(annotations_path, sep="\t", dtype="string")
    cohort = pd.read_csv(cohort_path, sep="\t", dtype="string")
    if "gene_id" not in expression or not {"gene_id", "gene_name", "gene_type"}.issubset(annotation):
        raise ValueError("M7 requires M2 gene_id TPM matrix and annotations")
    if not {"case_id", "file_id", "group"}.issubset(cohort):
        raise ValueError("M7 requires M3 paired cohort IDs and groups")
    if (annotation.gene_id.isna().any() or expression.gene_id.isna().any() or
        annotation.gene_id.duplicated().any() or expression.gene_id.duplicated().any()):
        raise ValueError("Missing or duplicate M2 gene IDs")
    if set(annotation.gene_id) != set(expression.gene_id):
        raise ValueError("M2 gene annotation/TPM ID mismatch")
    if (cohort.empty or cohort.case_id.isna().any() or cohort.file_id.isna().any() or
        cohort.case_id.duplicated().any() or cohort.file_id.duplicated().any() or
        not set(cohort.group).issubset({"high", "low"}) or
        not {"high", "low"}.issubset(set(cohort.group))):
        raise ValueError("Invalid M3 paired cohort")
    if not set(cohort.file_id).issubset(set(expression.columns) - {"gene_id"}):
        raise ValueError("M3 file IDs missing from M2 TPM matrix")
    cohort = cohort.sort_values("case_id").reset_index(drop=True)
    columns = cohort.file_id.to_list()
    # Keep original TPM: GSEApy uses rank-based sample normalization.
    values = expression.set_index("gene_id").loc[:, columns]
    values = values.apply(pd.to_numeric, errors="coerce")
    array = values.to_numpy(dtype=float)
    if not np.isfinite(array).all() or (array < 0).any():
        raise ValueError("M2 TPM matrix contains invalid expression values")
    ann = annotation.set_index("gene_id").loc[values.index]
    symbols = ann.gene_name.fillna("").str.strip().str.upper()
    counts = Counter(symbols)
    valid = [bool(SYMBOL.fullmatch(sym)) and counts[sym] == 1 and
             typ == "protein_coding" for sym, typ in zip(symbols, ann.gene_type)]
    mapping = [[identifier, sym, typ, "included" if use else
                "not_protein_coding" if typ != "protein_coding" else
                "invalid_symbol" if not SYMBOL.fullmatch(sym) else "duplicate_symbol"]
               for identifier, sym, typ, use in zip(values.index, symbols, ann.gene_type, valid)]
    filtered = values.loc[np.asarray(valid)].copy()
    filtered.index = symbols.loc[np.asarray(valid)].to_list()
    if filtered.shape[0] < 20:
        raise ValueError("Too few unique protein-coding gene symbols")
    if filtered.index.duplicated().any():
        raise ValueError("Duplicate gene symbols after mapping")
    return filtered, cohort, mapping


def signatures(path, present, min_size=5, max_size=500):
    result = {}
    audit = []
    seen = set()
    with path.open(encoding="utf-8") as handle:
        for line in handle:
            cells = line.rstrip("\r\n").split("\t")
            if len(cells) < 3:
                raise ValueError("Malformed immune GMT line")
            name = cells[0].strip()
            if not name or name in seen:
                raise ValueError("Missing/duplicate GMT term")
            seen.add(name)
            if not IMMUNE.search(name):
                continue
            genes = {gene.strip().upper() for gene in cells[2:] if gene.strip()}
            overlap = genes & present
            keep = min_size <= len(overlap) <= max_size
            audit.append([name, len(genes), len(overlap), int(keep),
                          "" if keep else "insufficient_or_excessive_gene_overlap"])
            if keep:
                result[name] = sorted(genes)
    if not result:
        raise ValueError("No immune-labeled marker signatures pass coverage filtering")
    return result, audit


def calculate(expression, cohort, gene_sets):
    out = gp.ssgsea(
        data=expression, gene_sets=gene_sets, outdir=None, min_size=5,
        max_size=500, sample_norm_method="rank", correl_norm_type="rank",
        weight=0.25, permutation_num=0, threads=1, no_plot=True,
        seed=42, verbose=False)
    table = out.res2d
    if table is None or not {"Name", "Term", "ES", "NES"}.issubset(table):
        raise ValueError("Unexpected GSEApy ssGSEA result schema")
    by_file = cohort.set_index("file_id")
    expected = set(expression.columns)
    seen = set()
    rows = []
    for row in table.itertuples(index=False):
        file_id = str(row.Name)
        term = str(row.Term)
        if file_id not in expected or term not in gene_sets or (file_id, term) in seen:
            raise ValueError("Unexpected/duplicate ssGSEA sample or signature")
        es, nes = float(row.ES), float(row.NES)
        if not (math.isfinite(es) and math.isfinite(nes)):
            raise ValueError("Nonfinite ssGSEA scores")
        seen.add((file_id, term))
        sample = by_file.loc[file_id]
        rows.append([sample.case_id, file_id, sample.group, term,
                     f"{es:.12g}", f"{nes:.12g}"])
    if seen != {(f, term) for f in expected for term in gene_sets}:
        raise ValueError("Missing ssGSEA sample/signature scores")
    return sorted(rows, key=lambda r: (r[0], r[3]))


def group_stats(scores):
    frame = pd.DataFrame(scores, columns=SCORES)
    frame["nes"] = frame.nes.astype(float)
    results = []
    for term, part in sorted(frame.groupby("term"), key=lambda p: p[0]):
        high = part.loc[part.group == "high", "nes"].to_numpy()
        low = part.loc[part.group == "low", "nes"].to_numpy()
        if not len(high) or not len(low):
            raise ValueError("Missing high/low cohort group")
        test = mannwhitneyu(high, low, alternative="two-sided")
        h, l = float(np.median(high)), float(np.median(low))
        results.append([term, len(high), len(low), f"{h:.12g}", f"{l:.12g}",
                        f"{h-l:.12g}", f"{float(test.pvalue):.12g}", ""])
    fdr = multipletests([float(x[6]) for x in results], method="fdr_bh")[1]
    for row, adjusted in zip(results, fdr):
        row[7] = f"{adjusted:.12g}"
    return results


def figure(results, path):
    sorted_rows = sorted(results, key=lambda r: (-abs(float(r[5])), r[0]))[:16]
    height = max(180, 90 + 32 * len(sorted_rows))
    svg = [f'<svg xmlns="http://www.w3.org/2000/svg" width="1050" height="{height}">',
           '<rect width="100%" height="100%" fill="white"/>',
           '<text x="20" y="32" font-family="sans-serif" font-size="18">M7 ssGSEA signature differences</text>',
           '<text x="20" y="52" font-family="sans-serif" font-size="11">High minus low median NES (not immune cell proportions)</text>']
    for i, row in enumerate(sorted_rows):
        y = 80 + i * 32
        v = float(row[5])
        svg.append(f'<text x="20" y="{y}" font-family="sans-serif" font-size="11">{html.escape(row[0][:52])}</text>')
        svg.append(f'<text x="570" y="{y}" font-family="monospace" font-size="11">{v:+.4f}</text>')
    svg.append('</svg>')
    path.write_text("\n".join(svg) + "\n", encoding="utf-8")


def main():
    a = argparse.ArgumentParser()
    for arg in ("tpm", "annotation", "cohort", "gmt", "outdir"):
        a.add_argument(arg)
    p = a.parse_args()
    outdir = pathlib.Path(p.outdir)
    outdir.mkdir(parents=True, exist_ok=True)
    matrix, cohort, mapping = inputs(
        pathlib.Path(p.tpm), pathlib.Path(p.annotation), pathlib.Path(p.cohort))
    write(outdir / "gene-mapping.tsv", GENE_COLS, mapping)
    sets, coverage = signatures(pathlib.Path(p.gmt), set(matrix.index))
    write(outdir / "signature-coverage.tsv", COVERAGE, coverage)
    scores = calculate(matrix, cohort, sets)
    write(outdir / "immune-scores.tsv", SCORES, scores)
    stats = group_stats(scores)
    write(outdir / "group-comparison.tsv", GROUPS, stats)
    figure(stats, outdir / "immune-signatures.svg")
    summary = {
        "cases": int(len(cohort)), "high": int((cohort.group == "high").sum()),
        "low": int((cohort.group == "low").sum()),
        "expression_gene_symbols": int(matrix.shape[0]),
        "excluded_gene_rows": int(sum(r[3] != "included" for r in mapping)),
        "immune_marker_sets_considered": len(coverage),
        "immune_marker_sets_scored": len(sets),
        "score_rows": len(scores),
        "signatures_bh_fdr_below_005": sum(float(row[7]) < .05 for row in stats)}
    (outdir / "statistics.json").write_text(json.dumps(summary, indent=2) + "\n")
    write(outdir / "runtime.tsv", ["parameter", "value"], [
        ["python", sys.version.split()[0]], ["gseapy", gp.__version__],
        ["pandas", pd.__version__], ["numpy", np.__version__],
        ["sample_norm_method", "rank"], ["correl_norm_type", "rank"],
        ["weight", "0.25"], ["permutation_num", 0], ["min_size", 5],
        ["max_size", 500], ["seed", 42], ["threads", 1]])


if __name__ == "__main__":
    main()

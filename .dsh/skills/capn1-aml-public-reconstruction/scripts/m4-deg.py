#!/usr/bin/env python3
"""M4 differential expression from GDC raw counts with PyDESeq2."""
import csv
import math
import pathlib
import sys
import pandas as pd
import numpy as np
import pydeseq2
from pydeseq2.dds import DeseqDataSet
from pydeseq2.ds import DeseqStats


FIELDS = ("baseMean", "log2FoldChange", "lfcSE", "stat", "pvalue", "padj")


def table(path, cols, rows):
    with path.open("w", encoding="utf-8", newline="") as file:
        w = csv.writer(file, delimiter="\t", lineterminator="\n")
        w.writerow(cols)
        w.writerows(rows)


def main(counts_path, annotation_path, cohort_path, output, alpha, lfc):
    if not (0 < alpha < 1 and math.isfinite(alpha) and 0 <= lfc < math.inf):
        raise ValueError("Invalid thresholds")
    cohort = pd.read_csv(cohort_path, sep="\t", dtype=str)
    if not {"file_id", "case_id", "group"}.issubset(cohort):
        raise ValueError("M3 cohort missing fields")
    if cohort.file_id.duplicated().any() or cohort.case_id.duplicated().any():
        raise ValueError("Duplicate biological sample")
    if not cohort.group.isin(["low", "high"]).all() or min(cohort.group.value_counts().reindex(["low", "high"], fill_value=0)) < 3:
        raise ValueError("DEG requires at least three cases per group")
    raw = pd.read_csv(counts_path, sep="\t")
    ann = pd.read_csv(annotation_path, sep="\t", dtype=str)
    if not {"gene_id", "gene_name", "gene_type"}.issubset(ann) or "gene_id" not in raw:
        raise ValueError("M2 gene annotations or raw counts missing")
    if raw.gene_id.duplicated().any() or ann.gene_id.duplicated().any():
        raise ValueError("Repeated gene ID")
    if not set(cohort.file_id).issubset(raw.columns):
        raise ValueError("M3 file IDs not present in counts")
    matrix = raw.set_index("gene_id")[cohort.file_id.tolist()].T
    numeric = matrix.apply(pd.to_numeric, errors="raise").to_numpy(dtype=float)
    if not np.isfinite(numeric).all() or (numeric < 0).any() or not np.equal(numeric, np.floor(numeric)).all():
        raise ValueError("DESeq2 requires finite raw integer counts")
    if numeric.max() > np.iinfo(np.int32).max:
        raise ValueError("Counts exceed signed integer range")
    matrix = matrix.astype(np.int32)
    if matrix.index.duplicated().any() or matrix.columns.duplicated().any():
        raise ValueError("Duplicate sample or gene")
    min_replicates = min(cohort.group.value_counts().values)
    keep = (matrix >= 10).sum(axis=0) >= min_replicates
    if sum(keep) < 20:
        raise ValueError("Too few genes after low-count prefilter")
    metadata = pd.DataFrame({"group": pd.Categorical(cohort.group.to_list(), categories=["low", "high"])},
                            index=cohort.file_id)
    def fit(fit_type):
        dds = DeseqDataSet(counts=matrix.loc[:, keep], metadata=metadata,
                           design="~group", fit_type=fit_type, refit_cooks=False,
                           n_cpus=2, quiet=True)
        dds.deseq2()
        ds = DeseqStats(dds, contrast=["group", "high", "low"],
                        alpha=alpha, cooks_filter=True, independent_filter=True,
                        n_cpus=2, quiet=True)
        ds.summary()
        return ds.results_df.copy()
    selected_fit = "parametric"
    try:
        results = fit("parametric")
    except (ValueError, RuntimeError) as exception:
        # The historical R demo used a mean dispersion fallback only for a documented
        # near-floor dispersion case; never hide unrelated numerical failures.
        message = str(exception).lower()
        if not any(key in message for key in ["dispersion", "trend", "gamma", "fit"]):
            raise
        selected_fit = "mean_fallback"
        results = fit("mean")
    meta = ann.set_index("gene_id").reindex(raw.gene_id)
    if meta.isna().any().any():
        raise ValueError("Missing annotation for count matrix genes")
    out = pd.DataFrame({"gene_id": raw.gene_id,
                        "gene_name": meta.gene_name.to_numpy(),
                        "gene_type": meta.gene_type.to_numpy()}).set_index("gene_id")
    for name in FIELDS:
        out[name] = np.nan
        out.loc[results.index, name] = results[name]
    out["test_status"] = "low_counts"
    out.loc[results.index, "test_status"] = "independent_filter_or_unresolved"
    out.loc[results.index[results.padj.notna()], "test_status"] = "tested"
    out.loc[results.index[results.pvalue.notna() & results.padj.isna()], "test_status"] = "independent_filtered"
    out.loc[results.index[results.pvalue.isna()], "test_status"] = "outlier_or_untestable"
    good = out.padj.notna() & out.log2FoldChange.notna() & (out.padj < alpha) & (out.log2FoldChange.abs() >= lfc)
    out["direction"] = np.where(good & (out.log2FoldChange > 0), "up",
                                np.where(good & (out.log2FoldChange < 0), "down", "not_significant"))
    out = out.sort_values(["padj", "gene_id"], na_position="last", kind="stable").reset_index()
    significant = out.loc[out.direction.isin(["up", "down"])]
    output.mkdir(parents=True, exist_ok=True)
    out.to_csv(output / "deg-all.tsv", sep="\t", index=False, na_rep="NA")
    significant.to_csv(output / "deg-significant.tsv", sep="\t", index=False, na_rep="NA")
    metrics = {
        "total_genes": len(raw), "prefiltered_genes": int((~keep).sum()),
        "fit_genes": int(keep.sum()), "tested_genes": int((out.test_status == "tested").sum()),
        "significant_genes": len(significant),
        "up_genes": int((significant.direction == "up").sum()),
        "down_genes": int((significant.direction == "down").sum()),
        "high_cases": int((cohort.group == "high").sum()),
        "low_cases": int((cohort.group == "low").sum()),
        "fdr_threshold": alpha, "abs_log2fc_threshold": lfc,
    }
    table(output / "statistics.tsv", ["metric", "value"], metrics.items())
    table(output / "runtime.tsv", ["name", "value"], [
        ("python_version", sys.version.split()[0]),
        ("pydeseq2_version", pydeseq2.__version__),
        ("design", "~group; high vs low, Wald"),
        ("dispersion_fit", selected_fit),
    ])
    valid = out.loc[np.isfinite(out.log2FoldChange) & np.isfinite(out.padj)].copy()
    if valid.empty:
        raise ValueError("No adjusted DEG results")
    import html
    def sx(x): return 600 + 430 * float(x) / max(float(valid.log2FoldChange.abs().max()), 1)
    def sy(p): return 520 - 450 * (-math.log10(max(float(p), 1e-300))) / max(-math.log10(max(float(valid.padj.min()), 1e-300)), 1)
    svg = [
        '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="600" viewBox="0 0 1200 600">',
        '<rect width="100%" height="100%" fill="white"/>',
        '<text x="55" y="35" font-size="20" font-family="sans-serif">CAPN1 differential expression (PyDESeq2)</text>',
        '<line x1="600" y1="55" x2="600" y2="520" stroke="#ccc"/>',
    ]
    for row in valid.itertuples(index=False):
        color = "#4477AA" if row.direction == "down" else "#DD6655" if row.direction == "up" else "#aaa"
        svg.append(f'<circle cx="{sx(row.log2FoldChange):.2f}" cy="{sy(row.padj):.2f}" r="2" fill="{color}"/>')
    svg.append('</svg>')
    (output / "volcano.svg").write_text("\n".join(svg) + "\n", encoding="utf-8")


if __name__ == "__main__":
    if len(sys.argv) != 7:
        raise SystemExit("Usage: m4-deg.py counts.tsv annotation.tsv cohort.tsv output alpha abs-lfc")
    main(pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2]), pathlib.Path(sys.argv[3]),
         pathlib.Path(sys.argv[4]), float(sys.argv[5]), float(sys.argv[6]))

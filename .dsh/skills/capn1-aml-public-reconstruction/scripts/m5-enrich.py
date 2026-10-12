#!/usr/bin/env python3
"""M5 offline GO/KEGG hypergeometric ORA with scipy and versioned Enrichr GMT snapshots."""
import csv
import math
import pathlib
import sys
import platform
import numpy as np
import pandas as pd
import scipy
from scipy.stats import hypergeom
from statsmodels.stats.multitest import multipletests
import statsmodels

COLUMNS = ["ID", "Description", "GeneRatio", "BgRatio", "pvalue",
           "p.adjust", "qvalue", "geneID", "Count"]


def libraries(path):
    terms = {}
    with path.open(encoding="utf-8") as f:
        for line in f:
            cells = line.rstrip("\r\n").split("\t")
            if len(cells) < 4 or not cells[0]:
                continue
            term = cells[0]
            genes = {x.strip().upper() for x in cells[2:] if x.strip()}
            if genes:
                terms.setdefault(term, set()).update(genes)
    if len(terms) < 2:
        raise ValueError("GO/KEGG GMT library invalid or too small")
    return terms


def save_tsv(path, columns, rows):
    with path.open("w", encoding="utf-8", newline="") as f:
        writer = csv.writer(f, delimiter="\t", lineterminator="\n")
        writer.writerow(columns)
        writer.writerows(rows)


def enrich(sets, foreground, background, alpha):
    tested = []
    universe = len(background)
    positives = len(foreground)
    for term, genes in sets.items():
        matched = genes & background
        size = len(matched)
        if not 5 <= size <= 500:
            continue
        hits = foreground & matched
        prob = float(hypergeom.sf(len(hits) - 1, universe, size, positives))
        tested.append((term, size, hits, prob))
    if not tested:
        return []
    adjusted = multipletests([row[3] for row in tested], method="fdr_bh")[1]
    rows = []
    for (term, size, hits, pval), q in zip(tested, adjusted):
        rows.append((term, term, f"{len(hits)}/{positives}",
                     f"{size}/{universe}", pval, q, "NA",
                     "/".join(sorted(hits)), len(hits)))
    return sorted(rows, key=lambda row: (row[5], row[4], row[0]))


def main(all_path, significant_path, ref_dir, out_dir, alpha):
    if not math.isfinite(alpha) or not 0 < alpha < 1:
        raise ValueError("Invalid FDR threshold")
    full = pd.read_csv(all_path, sep="\t", dtype={"gene_id": str, "gene_name": str})
    sig = pd.read_csv(significant_path, sep="\t", dtype={"gene_id": str, "gene_name": str})
    needed = {"gene_id", "gene_name", "test_status", "direction", "padj"}
    if not needed.issubset(full) or not {"gene_id", "direction"}.issubset(sig):
        raise ValueError("M4 expression results have incompatible schema")
    if full.gene_id.duplicated().any() or sig.gene_id.duplicated().any() or not set(sig.gene_id).issubset(full.gene_id):
        raise ValueError("M4 DEG records contain duplicate or foreign IDs")
    if not sig.direction.isin(["up", "down"]).all():
        raise ValueError("M4 foreground contains non-significant genes")
    joined = full.set_index("gene_id")
    if (joined.loc[sig.gene_id, "direction"].to_numpy() != sig.direction.to_numpy()).any():
        raise ValueError("M4 foreground does not match full DEG table")
    is_tested = full.test_status.eq("tested") & np.isfinite(pd.to_numeric(full.padj, errors="coerce"))
    if int(is_tested.sum()) < 10:
        raise ValueError("Insufficient tested M4 genes")
    names = full.gene_name.fillna("").str.strip().str.upper()
    candidates = full.assign(symbol=names)
    # Symbol ambiguity can conflate different Ensembl genes; exclude all duplicate symbols.
    bad = set(candidates.symbol[candidates.symbol.duplicated(keep=False)])
    usable = candidates.symbol.ne("") & ~candidates.symbol.isin(bad) & candidates.symbol.str.match(r"^[A-Z0-9._-]+$")
    mapping = candidates[["gene_id", "gene_name"]].copy()
    mapping["symbol"] = candidates.symbol.where(usable, "")
    mapping["mapping_status"] = np.where(usable, "mapped", "unmapped_or_ambiguous_symbol")
    background = set(candidates.loc[is_tested & usable, "symbol"])
    foreground = set(candidates.loc[candidates.gene_id.isin(sig.gene_id) & is_tested & usable, "symbol"])
    if len(background) < 10:
        raise ValueError("Insufficient mapped tested-gene background")
    out_dir.mkdir(parents=True, exist_ok=True)
    mapping.to_csv(out_dir / "gene-id-mapping.tsv", sep="\t", index=False)
    metrics = dict(m4_gene_rows=len(full), tested_gene_rows=int(is_tested.sum()),
                   significant_gene_rows=len(sig), mapped_tested_symbols=len(background),
                   mapped_significant_symbols=len(foreground),
                   unmapped_or_ambiguous_rows=int((~usable).sum()),
                   fdr_threshold=alpha)
    for key, filename in (("go_bp", "go-bp.tsv"), ("go_mf", "go-mf.tsv"),
                          ("go_cc", "go-cc.tsv"), ("kegg", "kegg.tsv")):
        terms = libraries(ref_dir / (key + ".gmt"))
        result = enrich(terms, foreground, background, alpha)
        save_tsv(out_dir / filename, COLUMNS, result)
        metrics[key + "_terms"] = len(result)
        metrics[key + "_fdr_significant"] = sum(float(row[5]) < alpha for row in result)
    save_tsv(out_dir / "statistics.tsv", ["metric", "value"], metrics.items())
    save_tsv(out_dir / "runtime.tsv", ["name", "value"], [
        ("python_version", sys.version.split()[0]), ("scipy_version", scipy.__version__),
        ("statsmodels_version", statsmodels.__version__),
        ("method", "ORA hypergeometric.sf + BH FDR; M4 tested unique symbols background"),
        ("gene_mapping", "M4 GDC gene_name: exclude missing/ambiguous symbols"),
    ])


if __name__ == "__main__":
    if len(sys.argv) != 6:
        raise SystemExit("Usage: m5-enrich.py deg-all deg-significant reference-dir output-dir FDR")
    main(pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2]), pathlib.Path(sys.argv[3]),
         pathlib.Path(sys.argv[4]), float(sys.argv[5]))

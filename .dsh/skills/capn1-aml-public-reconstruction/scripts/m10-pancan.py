#!/usr/bin/env python3
"""Pan-cancer CAPN1 overview from a UCSC Xena single-gene query or an exported TSV."""
import argparse
import csv
import html
import json
import math
import pathlib
from collections import defaultdict
from statistics import median

HUB = "https://pancanatlas.xenahubs.net"
EXPRESSION = "EB++AdjustPANCAN_IlluminaHiSeq_RNASeqV2.geneExp.xena"
PHENOTYPE = "TCGA_phenotype_denseDataOnlyDownload.tsv"


def records_from_xena():
    import xenaPython as xena  # only used for explicit live provider acquisition
    sample_ids = xena.dataset_samples(HUB, EXPRESSION, None)
    field_codes = xena.field_codes(HUB, PHENOTYPE, ["_primary_disease"])
    raw_codes = field_codes[0].get("code") if field_codes else None
    codes = raw_codes.split("\t") if isinstance(raw_codes, str) else None
    result = []
    for start in range(0, len(sample_ids), 400):
        batch = sample_ids[start:start+400]
        capn1 = xena.dataset_probe_values(HUB, EXPRESSION, batch, ["CAPN1"])[1][0]
        types = xena.dataset_probe_values(HUB, PHENOTYPE, batch, ["_primary_disease"])[1][0]
        for sample, value, label in zip(batch, capn1, types):
            if codes and str(label).isdigit():
                idx = int(label)
                if idx >= len(codes):
                    raise ValueError("Unrecognized Xena phenotype code")
                label = codes[idx]
            result.append({"sample_id": sample, "cancer_type": label,
                           "capn1_expression": value})
    return result


def file_records(path):
    with path.open(newline="", encoding="utf-8") as handle:
        rows = list(csv.DictReader(handle, delimiter="\t"))
    required = {"sample_id", "cancer_type", "capn1_expression"}
    if not rows or not required.issubset(rows[0]):
        raise ValueError("Expected sample_id/cancer_type/capn1_expression TSV")
    return rows


def analyze(records, outdir, source):
    grouped = defaultdict(list)
    accepted, seen = [], set()
    for row in records:
        sample = str(row["sample_id"]).strip()
        cancer = str(row["cancer_type"]).strip()
        # TCGA barcode: 01-09 are tumor-derived; 11 etc are normal tissues.
        fields = sample.split("-")
        code = fields[3][:2] if len(fields) >= 4 else ""
        if code and (not code.isdigit() or not 1 <= int(code) <= 9):
            continue
        if sample in seen:
            raise ValueError("Repeated pan-cancer sample")
        seen.add(sample)
        try:
            value = float(row["capn1_expression"])
        except (ValueError, TypeError):
            continue
        if not (math.isfinite(value) and cancer and cancer.lower() not in {"nan", "none"}):
            continue
        accepted.append([sample, cancer, f"{value:.12g}"])
        grouped[cancer].append(value)
    if len(grouped) < 2:
        raise ValueError("Pan-cancer comparison needs at least two cohorts")
    with (outdir / "pancan-samples.tsv").open("w", newline="") as f:
        w = csv.writer(f, delimiter="\t", lineterminator="\n")
        w.writerow(["sample_id", "cancer_type", "capn1_expression"])
        w.writerows(sorted(accepted))
    summary = [[key, len(values), f"{median(values):.12g}"] for key, values in grouped.items()]
    summary.sort(key=lambda x: (-float(x[2]), x[0]))
    with (outdir / "pancan-summary.tsv").open("w", newline="") as f:
        w = csv.writer(f, delimiter="\t", lineterminator="\n")
        w.writerow(["cancer_type", "samples", "median_capn1_expression"])
        w.writerows(summary)
    top = summary[:32]
    lines = [f'<svg xmlns="http://www.w3.org/2000/svg" width="920" height="{85+25*len(top)}">',
             '<rect width="100%" height="100%" fill="white"/>',
             '<text x="20" y="32" font-size="18" font-family="sans-serif">TCGA pan-cancer CAPN1 expression</text>']
    for i, row in enumerate(top):
        value = html.escape(f"{row[0]}: n={row[1]}, median={row[2]}")
        lines.append(f'<text x="20" y="{68+25*i}" font-size="12" font-family="monospace">{value}</text>')
    (outdir / "pancan-expression.svg").write_text("\n".join(lines+["</svg>"])+"\n")
    (outdir / "statistics.json").write_text(json.dumps(
        {"samples":len(accepted),"cancer_types":len(summary),"source":source}, indent=2)+"\n")
    (outdir / "report.md").write_text(
        "# Pan-cancer CAPN1 expression\n\n"
        f"- Samples: {len(accepted)}; cancer groups: {len(summary)}.\n"
        f"- Source: {source}; Xena PanCanAtlas batch-adjusted RNASeqV2 values, NOT M2 TPM.\n"
        "- Output: pancan-samples.tsv, pancan-summary.tsv, pancan-expression.svg.\n"
        "- The display does not reproduce the original publication's numeric plot.\n")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("outdir")
    ap.add_argument("--input", type=pathlib.Path)
    args = ap.parse_args()
    out = pathlib.Path(args.outdir)
    out.mkdir(parents=True, exist_ok=True)
    records = file_records(args.input) if args.input else records_from_xena()
    analyze(records, out, ("supplied TSV " + str(args.input)) if args.input else HUB+" "+EXPRESSION)

#!/usr/bin/env python3
"""Render a deterministic GO/KEGG enrichment bar chart from clusterProfiler TSV outputs.

Python stdlib only. Statistical testing and ID mapping remain in Bioconductor;
this module is deliberately a presentation boundary, not another enrichment engine.
"""
import csv
import html
import math
import pathlib
import sys


def terms(directory: pathlib.Path, alpha: float) -> list[tuple[str, float]]:
    picked = []
    for section, filename in (
        ("GO BP", "go-bp.tsv"),
        ("GO MF", "go-mf.tsv"),
        ("GO CC", "go-cc.tsv"),
        ("KEGG", "kegg.tsv"),
    ):
        with (directory / filename).open(encoding="utf-8", newline="") as source:
            table = csv.DictReader(source, delimiter="\t")
            if not table.fieldnames or not {"Description", "p.adjust"}.issubset(table.fieldnames):
                raise ValueError(f"Invalid enrichment columns in {filename}")
            valid = []
            for row in table:
                try:
                    adjusted = float(row["p.adjust"])
                except (ValueError, TypeError):
                    continue
                if math.isfinite(adjusted) and 0 <= adjusted < alpha:
                    valid.append((f'{section}: {row["Description"]}', adjusted))
            picked.extend(sorted(valid, key=lambda v: (v[1], v[0]))[:5])
    return picked


def plot(directory: pathlib.Path, alpha: float) -> None:
    if not (math.isfinite(alpha) and 0 < alpha < 1):
        raise ValueError("Invalid FDR")
    selected = terms(directory, alpha)
    width = 1200
    left = 510
    right = 65
    top = 90
    row_height = 27
    height = max(220, top + max(1, len(selected)) * row_height + 95)
    lines = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}">',
        '<rect width="100%" height="100%" fill="#fff"/>',
        '<text x="30" y="39" font-family="sans-serif" font-size="20" fill="#242424">CAPN1-associated GO / KEGG enrichment</text>',
        '<text x="30" y="60" font-family="sans-serif" font-size="13" fill="#555">Exploratory over-representation analysis · BH adjusted p-values</text>',
    ]
    if not selected:
        lines.append('<text x="55" y="123" font-family="sans-serif" font-size="15">'
                     'No GO/KEGG pathways pass the declared FDR threshold</text>')
    else:
        max_value = max(-math.log10(max(p, 1e-300)) for _, p in selected)
        scale = (width - left - right) / max(max_value, 1.0)
        lines.append(f'<line x1="{left}" y1="{top - 8}" x2="{left}" y2="{height - 72}" stroke="#777"/>')
        for i, (label, adjusted) in enumerate(selected):
            y = top + i * row_height
            length = min(width - left - right, -math.log10(max(adjusted, 1e-300)) * scale)
            color = "#4477AA" if label.startswith("GO ") else "#AA6633"
            shown = html.escape(label[:68] + ("…" if len(label) > 68 else ""), quote=True)
            lines.extend([
                f'<text x="{left - 12}" y="{y + 13}" text-anchor="end" '
                f'font-family="sans-serif" font-size="12" fill="#333">{shown}</text>',
                f'<rect x="{left}" y="{y}" width="{length:.3f}" height="18" fill="{color}"/>',
            ])
        lines.append(f'<text x="{left}" y="{height - 35}" font-family="sans-serif" font-size="13">'
                     '-log10(BH-adjusted p-value)</text>')
    lines.append("</svg>")
    (directory / "enrichment-top.svg").write_text("\n".join(lines) + "\n", encoding="utf-8")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit("Usage: python3 m5-plot.py <M5 output directory> <FDR>")
    plot(pathlib.Path(sys.argv[1]), float(sys.argv[2]))

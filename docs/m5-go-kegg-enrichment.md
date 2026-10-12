# M5 — GO / KEGG Over-Representation Analysis

M5 illustrates the functional enrichment part of the CAPN1/AML paper's research pipeline. The paper describes DAVID; this public demonstration uses **Bioconductor clusterProfiler** instead. Its purpose is to show how an AI Harness can execute a complete documented research workflow, **not** numerically reproduce the original DAVID output.

## Inputs and scientific choices

- Verify the M2/M3/M4 lineage and SHA-256 checksums. M5 consumes `deg-all.tsv` and `deg-significant.tsv`.
- The M4 tested genes (`test_status == "tested"` and valid adjusted p-values) are the ORA background; use the declared M4 significant list as foreground.
- Map GDC `gene_name` to uppercase gene symbols; exclude missing or ambiguous symbols. This is a documented alternative to the former org.Hs.eg.db Ensembl→gene-symbol mapping.
- Use immutable, publicly downloaded Enrichr human GMT gene-set libraries: `GO_Biological_Process_2025`, `GO_Molecular_Function_2025`, `GO_Cellular_Component_2025`, and `KEGG_2021_Human`.
- Python SciPy `hypergeom.sf` computes ORA p-values for each library separately; Statsmodels `multipletests(method="fdr_bh")` adjusts within each library. Retain the full term table, including non-significant terms, with gene set sizes 5–500 after background intersection. No significant terms is a valid result.

These sources/implementations are a method substitution for the 2023 paper's DAVID analysis and for the prior R/clusterProfiler prototype. We do not expect identical pathway lists or p-values.

## Reference cache

On first run, retrieve and save the four Enrichr GMT datasets under `data/references/enrichr-human/<id>/`. `study/gene-set-reference.json` stores source URLs, per-file SHA-256 digests and a content fingerprint. Reuse the snapshot unless `--refresh-kegg` is explicitly provided (legacy CLI name: refreshes all four GO/KEGG libraries). Never invent missing annotations.

## Run

```sh
python -m pip install -r requirements.txt
pnpm run enrichment
pnpm run enrichment --rerun
pnpm run enrichment --refresh-kegg
pnpm run enrichment --workspace /absolute/path/to/study
```

## Outputs

Each completed immutable `runs/m5-enrichment/<id>/` includes:

- `gene-id-mapping.tsv`: Ensembl base ID, gene-symbol mapping, and reason when unresolved.
- `go-bp.tsv`, `go-mf.tsv`, `go-cc.tsv`: complete returned GO ORA results by ontology.
- `kegg.tsv`: KEGG ORA results from the recorded human term mapping.
- `statistics.tsv`: tested universe, mapped foreground, annotation coverage and significant term counts.
- `runtime.tsv`: Python, SciPy and Statsmodels versions.
- `enrichment-top.svg`: top FDR-significant GO/KEGG terms or a clear empty-result display. Rendered using Python 3 standard library from saved R results, without matplotlib.
- `report.md` and `run-manifest.json`: method decisions, limitations, run IDs, KEGG snapshot, checksums, and results.

`study/enrichment.json` points to the last successful run. The previous valid pointer is preserved on a failed run. Compatible repeated runs return `cache-hit`.

## Interpretation limits

Functional enrichment reveals annotations that are statistically overrepresented; it does **not** establish biological causality. GO and KEGG annotations evolve and enrichments depend on the background, gene mapping, and previous cohort selection. The M4 DEG study uses the M3 survival-eligible cohort, which may be biased. Interpret enrichment in light of clinical evidence; do not declare experimental confirmation of a hypothesis.

M6 can use the M5 mapped DEG gene set and other public protein interactions for STRING PPI, without changing this canonical enrichment calculation.

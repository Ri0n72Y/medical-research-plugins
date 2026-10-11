# M5 — GO / KEGG Over-Representation Analysis

M5 illustrates the functional enrichment part of the CAPN1/AML paper's research pipeline. The paper describes DAVID; this public demonstration uses **Bioconductor clusterProfiler** instead. Its purpose is to show how an AI Harness can execute a complete documented research workflow, **not** numerically reproduce the original DAVID output.

## Inputs and scientific choices

- Uses a SHA-256 verified completed M4 `study/deg.json`, `deg-all.tsv`, and `deg-significant.tsv`. The linked M2 and M3 run IDs must still match the active workspace.
- The ORA **background universe** is genes with valid M4 adjusted p-values (`test_status == "tested"`) mapped to unique Entrez identifiers, rather than the entire genome. This background matters for statistical interpretation.
- The DEG foreground is the M4 significant set, also mapped to distinct Entrez IDs. Remove an Ensembl version suffix before mapping with `org.Hs.eg.db`. Exclude unmapped and ambiguous IDs with a table of mapping outcomes; collapse duplicate Entrez IDs deterministically.
- GO ORA uses `clusterProfiler::enrichGO` separately for **BP, MF and CC** with `OrgDb=org.Hs.eg.db`. KEGG uses `clusterProfiler::enricher` with publicly retrieved human KEGG term/gene assignments and term names. This implements a reproducible *public KEGG annotation substitution* with cached mapping.
- Both analyses are hypergeometric ORA with **BH FDR** adjustment, a declared 5–500 gene-set size range and a default FDR screen < 0.05. Results preserve all terms returned by the tool, not only significant pathways. Empty results are scientific outcomes, not programming failures.

Official documentation: [clusterProfiler](https://bioconductor.org/packages/release/bioc/html/clusterProfiler.html), [org.Hs.eg.db](https://bioconductor.org/packages/release/data/annotation/html/org.Hs.eg.db.html), [KEGG REST](https://www.kegg.jp/kegg/rest/keggapi.html).

## Reference cache

The first M5 call downloads two KEGG REST text resources for human gene→pathway links and pathway titles, storing an immutable snapshot under `data/references/kegg-hsa/<id>/`, with the SHA-256 of each response and `study/kegg-reference.json` as the active pointer.

A compatible rerun **never refetches** this reference. A researcher can explicitly request `--refresh-kegg` to retrieve a new reference snapshot. M5's fingerprint includes the reference ID and bytes. Different KEGG snapshots can produce different enriched terms; record this in any comparisons.

If KEGG is unreachable and no valid local reference exists, M5 reports a missing prerequisite rather than inventing pathway mappings or silently skipping KEGG.

## Run

Install R/Bioconductor packages using the R/Bioconductor release compatible with the host:

```r
if (!requireNamespace("BiocManager", quietly = TRUE))
    install.packages("BiocManager")
BiocManager::install(c("clusterProfiler", "org.Hs.eg.db"), ask = FALSE, update = FALSE)
```

From a workspace with complete M2 → M3 → M4:

```sh
pnpm run enrichment
pnpm run enrichment --rerun
pnpm run enrichment --refresh-kegg
pnpm run enrichment --workspace /absolute/path/to/study
```

`--rerun` recomputes only M5 using existing scientific inputs and the cached KEGG mapping. `--refresh-kegg` explicitly requests a reference update.

## Outputs

Each completed immutable `runs/m5-enrichment/<id>/` includes:

- `gene-id-mapping.tsv`: Ensembl base ID, Entrez mapping, and reason when unresolved.
- `go-bp.tsv`, `go-mf.tsv`, `go-cc.tsv`: complete returned GO ORA results by ontology.
- `kegg.tsv`: KEGG ORA results from the recorded human term mapping.
- `statistics.tsv`: tested universe, mapped foreground, annotation coverage and significant term counts.
- `runtime.tsv`: R, clusterProfiler, org.Hs.eg.db and AnnotationDbi versions.
- `enrichment-top.svg`: top FDR-significant GO/KEGG terms or a clear empty-result display.
- `report.md` and `run-manifest.json`: method decisions, limitations, run IDs, KEGG snapshot, checksums, and results.

`study/enrichment.json` points to the last successful run. The previous valid pointer is preserved on a failed run. Compatible repeated runs return `cache-hit`.

## Interpretation limits

Functional enrichment reveals annotations that are statistically overrepresented; it does **not** establish biological causality. GO and KEGG annotations evolve and enrichments depend on the background, gene mapping, and previous cohort selection. The M4 DEG study uses the M3 survival-eligible cohort, which may be biased. Interpret enrichment in light of clinical evidence; do not declare experimental confirmation of a hypothesis.

M6 can use the M5 mapped DEG gene set and other public protein interactions for STRING PPI, without changing this canonical enrichment calculation.

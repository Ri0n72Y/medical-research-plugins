# M5 Skill operations — GO / KEGG enrichment

Prerequisites: a completed M4 DEG run, matching M2/M3 lineage, and R with `clusterProfiler`, `org.Hs.eg.db` and `AnnotationDbi`. The public single-file GDC smoke is not sufficient.

## Execute

1. Inspect `study/enrichment.json` and the upstream `study/deg.json`. Reuse verified completed output when compatible.
2. Run the bundled `scripts/m5-enrich.mjs` in the research workspace (or `pnpm run enrichment` from the repository).
3. On first run only, download public KEGG REST human gene→pathway links and pathway names. Persist an immutable reference snapshot under `data/references/kegg-hsa/` with checksums. Reuse that reference even when explicitly recomputing M5; only `--refresh-kegg` authorizes a new fetch.
4. Use M4's tested-gene background (valid adjusted p values) and declared significant foreground. Map versionless Ensembl IDs to unique Entrez IDs, disclose unmapped and ambiguous mappings. Deduplicate Entrez mappings.
5. Use R/Bioconductor `clusterProfiler::enrichGO` separately for BP/MF/CC, and `clusterProfiler::enricher` for KEGG with the cached pathway annotation snapshot. Hypergeometric ORA, Benjamini-Hochberg FDR and min/max gene-set sizes 5/500.
6. Inspect `gene-id-mapping.tsv`, `go-bp/mf/cc.tsv`, `kegg.tsv`, `statistics.tsv`, `enrichment-top.svg`, `runtime.tsv` and report.
7. If no terms meet FDR < 0.05, report zero significant enrichments instead of inventing findings. Confirm the mapping coverage and universe.

Do not state this is the original DAVID implementation. This method swap is intended and does not violate the AI Harness demonstration objective. Treat enrichment as association rather than causality or experimental validation; AI can nevertheless compare plausible medical significance against other evidence.

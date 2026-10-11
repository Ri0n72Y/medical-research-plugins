#!/usr/bin/env Rscript
args <- commandArgs(trailingOnly = TRUE)
if (length(args) != 6L) stop("Usage: Rscript m5-enrich.R all.tsv significant.tsv links.tsv titles.tsv output alpha")
for (pkg in c("clusterProfiler", "org.Hs.eg.db", "AnnotationDbi")) {
  if (!requireNamespace(pkg, quietly = TRUE)) stop("M5 requires Bioconductor package: ", pkg)
}
alpha <- as.numeric(args[[6]])
if (!is.finite(alpha) || alpha <= 0 || alpha >= 1) stop("Invalid enrichment FDR")
output <- args[[5]]
full <- read.delim(args[[1]], stringsAsFactors = FALSE, check.names = FALSE)
significant <- read.delim(args[[2]], stringsAsFactors = FALSE, check.names = FALSE)
required <- c("gene_id", "test_status", "direction", "padj")
if (!all(required %in% names(full)) || !all(c("gene_id", "direction") %in% names(significant))) {
  stop("M4 DEG input columns missing")
}
if (anyDuplicated(full$gene_id) || anyDuplicated(significant$gene_id) ||
    any(!significant$gene_id %in% full$gene_id)) stop("Duplicate or foreign DEG gene IDs")
if (!all(significant$direction %in% c("up", "down")) ||
    !all(full$direction[match(significant$gene_id, full$gene_id)] == significant$direction)) {
  stop("M4 significant DEG list conflicts with full gene table")
}
if (any(full$test_status == "tested" & !is.finite(full$padj))) {
  stop("M4 tested universe contains invalid adjusted p-values")
}
universe <- full[full$test_status == "tested" & is.finite(full$padj), ]
if (nrow(universe) < 10L) stop("At least ten M4 tested genes are required")
base_ids <- sub("\\.[0-9]+$", "", full$gene_id)
valid <- grepl("^ENSG[0-9]+$", base_ids)
mapping <- vector("list", nrow(full))
if (any(valid)) {
  keys <- unique(base_ids[valid])
  mapped <- AnnotationDbi::mapIds(org.Hs.eg.db::org.Hs.eg.db, keys = keys,
    column = "ENTREZID", keytype = "ENSEMBL", multiVals = "list")
  mapping[valid] <- unname(mapped[base_ids[valid]])
}
ids <- vapply(mapping, function(x) {
  uniq <- unique(as.character(x[!is.na(x) & nzchar(x)]))
  if (length(uniq) == 1L) uniq else NA_character_
}, character(1))
status <- ifelse(!valid, "invalid_ensembl", ifelse(is.na(ids),
  ifelse(lengths(mapping) > 1L, "ambiguous_entrez", "unmapped"), "mapped"))
map_table <- data.frame(gene_id = full$gene_id, ensembl_base = base_ids,
  entrez_id = ids, mapping_status = status, stringsAsFactors = FALSE)
write.table(map_table, file.path(output, "gene-id-mapping.tsv"),
  sep = "\t", quote = FALSE, row.names = FALSE, na = "")
idx <- match(universe$gene_id, full$gene_id)
universe_entrez <- unique(stats::na.omit(ids[idx]))
sig_ids <- unique(stats::na.omit(ids[match(significant$gene_id, full$gene_id)]))
sig_entrez <- intersect(sig_ids, universe_entrez)
if (length(universe_entrez) < 10) stop("Too few uniquely mapped Entrez genes in M4 tested universe")
empty <- data.frame(ID = character(), Description = character(), GeneRatio = character(),
  BgRatio = character(), pvalue = numeric(), p.adjust = numeric(), qvalue = numeric(),
  geneID = character(), Count = integer(), stringsAsFactors = FALSE)
normalize <- function(value) {
  if (is.null(value)) return(empty)
  result <- as.data.frame(value)
  if (!nrow(result)) return(empty)
  result <- result[order(result$p.adjust, result$pvalue, result$ID), , drop = FALSE]
  result
}
save_result <- function(data, name) {
  write.table(data, file.path(output, name), sep = "\t", quote = FALSE,
    row.names = FALSE, na = "NA")
}
go <- list()
for (ont in c("BP", "MF", "CC")) {
  term <- if (length(sig_entrez)) clusterProfiler::enrichGO(
    gene = sig_entrez, OrgDb = org.Hs.eg.db::org.Hs.eg.db, keyType = "ENTREZID",
    ont = ont, universe = universe_entrez, pvalueCutoff = 1, qvalueCutoff = 1,
    pAdjustMethod = "BH", minGSSize = 5, maxGSSize = 500
  ) else NULL
  go[[ont]] <- normalize(term)
  save_result(go[[ont]], paste0("go-", tolower(ont), ".tsv"))
}
links <- read.delim(args[[3]], header = FALSE, sep = "\t",
  stringsAsFactors = FALSE, col.names = c("gene", "pathway"))
titles <- read.delim(args[[4]], header = FALSE, sep = "\t",
  stringsAsFactors = FALSE, col.names = c("pathway", "description"))
if (ncol(links) != 2L || ncol(titles) != 2L) stop("Malformed KEGG reference")
links$gene <- sub("^hsa:", "", links$gene)
links$pathway <- sub("^path:", "", links$pathway)
titles$pathway <- sub("^path:", "", titles$pathway)
links <- unique(links[grepl("^[0-9]+$", links$gene) &
  grepl("^hsa[0-9]+$", links$pathway), c("pathway", "gene")])
titles <- unique(titles[grepl("^hsa[0-9]+$", titles$pathway), ])
names(links) <- c("term", "gene")
names(titles) <- c("term", "name")
kegg <- if (length(sig_entrez) && nrow(links)) clusterProfiler::enricher(
  gene = sig_entrez, universe = universe_entrez, TERM2GENE = links,
  TERM2NAME = titles, pvalueCutoff = 1, qvalueCutoff = 1,
  pAdjustMethod = "BH", minGSSize = 5, maxGSSize = 500
) else NULL
kegg_result <- normalize(kegg)
save_result(kegg_result, "kegg.tsv")
summary <- c(
  m4_gene_rows = nrow(full), tested_gene_rows = nrow(universe),
  significant_gene_rows = nrow(significant), mapped_tested_entrez = length(universe_entrez),
  mapped_significant_entrez = length(sig_entrez),
  unmapped_or_ambiguous_rows = sum(is.na(ids)), collapsed_duplicate_entrez_rows =
    sum(!is.na(ids)) - length(unique(stats::na.omit(ids))),
  kegg_reference_links = nrow(links), kegg_reference_pathways = length(unique(links$term))
)
for (ont in names(go)) {
  summary[paste0("go_", tolower(ont), "_terms")] <- nrow(go[[ont]])
  summary[paste0("go_", tolower(ont), "_fdr_significant")] <-
    sum(is.finite(go[[ont]]$p.adjust) & go[[ont]]$p.adjust < alpha)
}
summary["kegg_terms"] <- nrow(kegg_result)
summary["kegg_fdr_significant"] <- sum(is.finite(kegg_result$p.adjust) &
  kegg_result$p.adjust < alpha)
summary["fdr_threshold"] <- alpha
save_result(data.frame(metric = names(summary), value = unname(summary)), "statistics.tsv")
versions <- data.frame(name = c("r_version", "clusterProfiler", "org.Hs.eg.db",
  "AnnotationDbi", "Bioconductor", "method"),
  value = c(as.character(getRversion()), as.character(packageVersion("clusterProfiler")),
    as.character(packageVersion("org.Hs.eg.db")), as.character(packageVersion("AnnotationDbi")),
    if (requireNamespace("BiocManager", quietly = TRUE)) as.character(BiocManager::version()) else "unknown",
    "ORA; BH; per ontology; M4 tested Entrez background"))
save_result(versions, "runtime.tsv")
pieces <- lapply(c(go, list(KEGG = kegg_result)), function(x) {
  x <- x[is.finite(x$p.adjust) & x$p.adjust < alpha, , drop = FALSE]
  head(x[order(x$p.adjust, x$ID), ], 5)
})
labels <- unlist(Map(function(x, label) paste(label, x$Description, sep = ": "),
  pieces, names(pieces)), use.names = FALSE)
values <- unlist(lapply(pieces, function(x) -log10(pmax(x$p.adjust, .Machine$double.xmin))),
  use.names = FALSE)
svg(file.path(output, "enrichment-top.svg"), width = 11, height = 7)
tryCatch({
  if (!length(values)) {
    plot.new()
    text(0.5, 0.5, "No GO/KEGG pathways pass the declared FDR threshold")
  } else {
    margins <- par("mar")
    par(mar = c(5, 14, 3, 2))
    barplot(rev(values), names.arg = rev(substr(labels, 1, 90)),
      horiz = TRUE, las = 1, cex.names = 0.65,
      xlab = "-log10 adjusted p-value",
      main = "CAPN1-associated functional enrichment (illustrative)")
    par(mar = margins)
  }
}, finally = dev.off())

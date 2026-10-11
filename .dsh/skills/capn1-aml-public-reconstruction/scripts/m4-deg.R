#!/usr/bin/env Rscript
args <- commandArgs(trailingOnly = TRUE)
if (length(args) != 6L) stop("Usage: Rscript m4-deg.R counts.tsv annotation.tsv cohort.tsv out alpha absLfc")
if (!requireNamespace("DESeq2", quietly = TRUE)) stop("Bioconductor DESeq2 is required for M4")
counts_file <- args[[1L]]
annotation_file <- args[[2L]]
cohort_file <- args[[3L]]
output <- args[[4L]]
alpha <- as.numeric(args[[5L]])
lfc <- as.numeric(args[[6L]])
if (!is.finite(alpha) || alpha <= 0 || alpha >= 1) stop("Invalid FDR threshold")
if (!is.finite(lfc) || lfc < 0) stop("Invalid absolute log2FC threshold")

cohort <- read.delim(cohort_file, check.names = FALSE, stringsAsFactors = FALSE)
if (!all(c("file_id", "group", "case_id") %in% names(cohort))) stop("M3 cohort fields missing")
if (anyDuplicated(cohort$file_id) || anyDuplicated(cohort$case_id)) stop("Duplicate M3 cohort identifier")
if (!all(cohort$group %in% c("high", "low"))) stop("Invalid M3 CAPN1 group")
groups <- factor(cohort$group, levels = c("low", "high"))
if (any(table(groups) < 3L)) stop("DESeq2 demonstration requires >=3 biological cases per group")

raw <- read.delim(counts_file, check.names = FALSE, stringsAsFactors = FALSE)
if (!("gene_id" %in% names(raw)) || anyDuplicated(names(raw))) stop("Invalid count matrix columns")
if (anyDuplicated(raw$gene_id) || any(!nzchar(raw$gene_id))) stop("Invalid gene identifiers")
if (!all(cohort$file_id %in% names(raw))) stop("Some M3 file UUIDs are absent from M2 counts")
annotation <- read.delim(annotation_file, check.names = FALSE, stringsAsFactors = FALSE)
if (!all(c("gene_id", "gene_name", "gene_type") %in% names(annotation)) ||
    anyDuplicated(annotation$gene_id)) stop("Invalid M2 gene annotation")
ann_index <- match(raw$gene_id, annotation$gene_id)
if (anyNA(ann_index)) stop("Missing annotation for count matrix gene")
matrix <- as.matrix(raw[, cohort$file_id, drop = FALSE])
if (!is.numeric(matrix) || any(!is.finite(matrix)) || any(matrix < 0) ||
    any(matrix != floor(matrix)) || any(matrix > .Machine$integer.max)) {
  stop("DESeq2 requires nonnegative, finite, integer raw counts")
}
rownames(matrix) <- raw$gene_id
colnames(matrix) <- cohort$file_id
meta <- data.frame(row.names = cohort$file_id, group = groups)
dds <- DESeq2::DESeqDataSetFromMatrix(countData = matrix, colData = meta, design = ~ group)
min_replicates <- min(as.integer(table(groups)))
keep <- rowSums(DESeq2::counts(dds) >= 10) >= min_replicates
if (sum(keep) < 20L) stop("Insufficient genes after transparent low-count prefilter")
dds <- dds[keep, ]
fitted <- tryCatch(
  list(dds = DESeq2::DESeq(dds, quiet = TRUE, minReplicatesForReplace = Inf),
       dispersion_fit = "parametric_or_automatic_local"),
  error = function(e) {
    if (!grepl("all gene-wise dispersion estimates are within 2 orders",
               conditionMessage(e), fixed = TRUE)) stop(e)
    list(dds = DESeq2::DESeq(dds, fitType = "mean", quiet = TRUE,
                             minReplicatesForReplace = Inf),
         dispersion_fit = "mean_fallback_for_near_floor_dispersions")
  })
dds <- fitted$dds
result <- as.data.frame(DESeq2::results(dds, contrast = c("group", "high", "low"), alpha = alpha))
full <- data.frame(gene_id = raw$gene_id,
  gene_name = annotation$gene_name[ann_index],
  gene_type = annotation$gene_type[ann_index],
  baseMean = NA_real_, log2FoldChange = NA_real_, lfcSE = NA_real_,
  stat = NA_real_, pvalue = NA_real_, padj = NA_real_,
  test_status = ifelse(keep, "independent_filter_or_unresolved", "low_counts"),
  stringsAsFactors = FALSE)
indices <- match(rownames(result), full$gene_id)
fields <- c("baseMean", "log2FoldChange", "lfcSE", "stat", "pvalue", "padj")
for (name in fields) full[[name]][indices] <- result[[name]]
full$test_status[indices[!is.na(result$padj)]] <- "tested"
full$test_status[indices[!is.na(result$pvalue) & is.na(result$padj)]] <- "independent_filtered"
full$test_status[indices[is.na(result$pvalue)]] <- "outlier_or_untestable"
sig <- !is.na(full$padj) & !is.na(full$log2FoldChange) &
  full$padj < alpha & abs(full$log2FoldChange) >= lfc
full$direction <- ifelse(sig & full$log2FoldChange > 0, "up",
  ifelse(sig & full$log2FoldChange < 0, "down", "not_significant"))
full <- full[order(is.na(full$padj), full$padj, full$gene_id), ]
significant <- full[full$direction %in% c("up", "down"), ]
write.table(full, file.path(output, "deg-all.tsv"), sep = "\t", quote = FALSE,
  row.names = FALSE, na = "NA")
write.table(significant, file.path(output, "deg-significant.tsv"), sep = "\t",
  quote = FALSE, row.names = FALSE, na = "NA")
metrics <- c(total_genes = nrow(full), prefiltered_genes = sum(!keep),
  fit_genes = sum(keep), tested_genes = sum(full$test_status == "tested"),
  significant_genes = nrow(significant),
  up_genes = sum(significant$direction == "up"),
  down_genes = sum(significant$direction == "down"),
  high_cases = sum(groups == "high"), low_cases = sum(groups == "low"),
  fdr_threshold = alpha, abs_log2fc_threshold = lfc)
write.table(data.frame(metric = names(metrics), value = unname(metrics)),
  file.path(output, "statistics.tsv"), sep = "\t", quote = FALSE, row.names = FALSE)
runtime <- data.frame(name = c("r_version", "deseq2_version", "bioconductor_version", "design", "dispersion_fit"),
  value = c(as.character(getRversion()), as.character(packageVersion("DESeq2")),
    if (requireNamespace("BiocManager", quietly = TRUE)) as.character(BiocManager::version()) else "unavailable",
    "~group; high vs low, Wald", fitted$dispersion_fit))
write.table(runtime, file.path(output, "runtime.tsv"), sep = "\t",
  quote = FALSE, row.names = FALSE)
visible <- is.finite(full$log2FoldChange) & is.finite(full$padj)
if (!any(visible)) stop("No finite adjusted DEG results")
y <- -log10(pmax(full$padj[visible], .Machine$double.xmin))
x <- full$log2FoldChange[visible]
cols <- ifelse(full$direction[visible] == "up", "#E45756",
  ifelse(full$direction[visible] == "down", "#4C78A8", "#A0A0A0"))
svg(file.path(output, "volcano.svg"), width = 9, height = 6)
tryCatch({
  plot(x, y, pch = 16, cex = 0.5, col = cols, xlab = "log2 fold change (high / low)",
    ylab = "-log10 adjusted p value", main = "CAPN1-associated DEG (public demonstration)")
  abline(v = c(-lfc, lfc), h = -log10(alpha), lty = 2, col = "gray40")
  legend("topright", legend = c("Up", "Down", "Not significant"),
    col = c("#E45756", "#4C78A8", "#A0A0A0"), pch = 16, bty = "n")
}, finally = dev.off())

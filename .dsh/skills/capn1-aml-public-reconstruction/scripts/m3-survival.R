#!/usr/bin/env Rscript
# Exploratory reconstruction only. Never call a median cutoff "the original paper's".
args <- commandArgs(trailingOnly = TRUE)
if (length(args) != 1L) stop("Usage: Rscript m3-survival.R <M3 candidate run directory>")
dir <- normalizePath(args[[1]], mustWork = TRUE)
if (!requireNamespace("survival", quietly = TRUE)) stop("R package 'survival' is required")
data <- read.delim(file.path(dir, "candidate-cohort.tsv"),
                   stringsAsFactors = FALSE, check.names = FALSE)
needed <- c("case_id", "file_id", "event", "os_days", "tpm")
if (!all(needed %in% names(data))) stop("Missing candidate columns")
if (anyDuplicated(data$case_id)) stop("Candidate cohort contains duplicate case IDs")
if (any(!is.finite(data$os_days)) || any(data$os_days <= 0)) stop("Invalid OS times")
if (any(!is.finite(data$tpm)) || any(data$tpm < 0)) stop("Invalid CAPN1 TPM")
if (any(!(data$event %in% c(0, 1)))) stop("Invalid survival events")
if (nrow(data) < 12 || sum(data$event == 1) < 5) {
  stop("Exploratory cohort too small or too few events for useful estimation")
}
cutoff <- median(data$tpm)
data$group <- factor(ifelse(data$tpm >= cutoff, "high", "low"), levels = c("low", "high"))
if (min(table(data$group)) < 4) stop("Median ties leave too few samples in a group")
data$capn1_log2tpm1 <- log2(data$tpm + 1)
s <- survival::Surv(data$os_days, data$event)
fit <- survival::survfit(s ~ group, data = data)
diff <- survival::survdiff(s ~ group, data = data)
p_logrank <- pchisq(diff$chisq, df = 1L, lower.tail = FALSE)
cox_group <- survival::coxph(s ~ group, data = data, ties = "efron", x = TRUE)
cox_cont <- survival::coxph(s ~ capn1_log2tpm1, data = data, ties = "efron", x = TRUE)
extract <- function(model) {
  result <- summary(model)
  c(hr = unname(result$conf.int[1, "exp(coef)"]),
    ci_low = unname(result$conf.int[1, "lower .95"]),
    ci_high = unname(result$conf.int[1, "upper .95"]),
    p_value = unname(result$coefficients[1, "Pr(>|z|)"]))
}
group_result <- extract(cox_group)
cont_result <- extract(cox_cont)
ph_p <- function(model) {
  tryCatch(unname(survival::cox.zph(model)$table[1, "p"]),
           error = function(e) NA_real_)
}
metrics <- c(
  n_patients = nrow(data), n_deaths = sum(data$event == 1),
  n_high = sum(data$group == "high"), n_low = sum(data$group == "low"),
  cutoff_tpm = cutoff, logrank_chisq = unname(diff$chisq),
  logrank_p = p_logrank,
  group_high_vs_low_hr = group_result["hr"],
  group_hr_ci_lower = group_result["ci_low"],
  group_hr_ci_upper = group_result["ci_high"],
  group_cox_p = group_result["p_value"],
  group_proportional_hazards_test_p = ph_p(cox_group),
  per_log2_tpm1_hr = cont_result["hr"],
  per_log2_tpm1_ci_lower = cont_result["ci_low"],
  per_log2_tpm1_ci_upper = cont_result["ci_high"],
  continuous_cox_p = cont_result["p_value"],
  continuous_proportional_hazards_test_p = ph_p(cox_cont)
)
write.table(data[, c(needed, "group", "capn1_log2tpm1")],
            file.path(dir, "provisional-analysis-cohort.tsv"),
            quote = FALSE, sep = "\t", row.names = FALSE)
write.table(data.frame(metric = names(metrics), value = unname(metrics)),
            file.path(dir, "provisional-results.tsv"),
            quote = FALSE, sep = "\t", row.names = FALSE)
png(file.path(dir, "provisional-kaplan-meier.png"), width = 1040, height = 750, res = 145)
tryCatch({
  plot(fit, col = c("#305787", "#b35151"), lwd = 2,
       xlab = "Days from GDC-recorded index (provisional)",
       ylab = "Estimated overall survival", mark.time = TRUE,
       main = "TCGA-LAML CAPN1: exploratory only")
  legend("topright", legend = c(paste0("CAPN1 low, n=", sum(data$group == "low")),
     paste0("CAPN1 high, n=", sum(data$group == "high"))),
     col = c("#305787", "#b35151"), lwd = 2, bty = "n")
  mtext(sprintf("Exploratory median TPM split; log-rank p=%.3g", p_logrank),
        side = 3, line = 0, cex = 0.8)
}, finally = dev.off())
lines <- c(
 "# Provisional CAPN1–AML survival analysis",
 "",
 "**NOT a verified reproduction of the publication's exact methods.**",
 "",
 sprintf("Patients: %d; deaths: %d; high: %d; low: %d.",
         nrow(data), sum(data$event), sum(data$group == "high"), sum(data$group == "low")),
 sprintf("Exploratory CAPN1 median TPM cutoff: %.5f.", cutoff),
 sprintf("High versus low Cox HR %.3f (95%% CI %.3f–%.3f), p=%.4g.",
         group_result["hr"], group_result["ci_low"], group_result["ci_high"], group_result["p_value"]),
 sprintf("Kaplan-Meier log-rank p=%.4g.", p_logrank),
 sprintf("Continuous log2(TPM+1) Cox HR %.3f (95%% CI %.3f–%.3f), p=%.4g.",
         cont_result["hr"], cont_result["ci_low"], cont_result["ci_high"], cont_result["p_value"]),
 "",
 "## Method and limitations",
 "- Source: NCI GDC current TCGA-LAML public STAR counts and case metadata.",
 "- Exactly one expression file per case; ambiguous/missing case linkage excluded from candidate analysis only.",
 "- Death event: demographic vital_status Dead, time: demographic days_to_death only.",
 "- Censoring: Alive, time: maximum recorded valid diagnosis/follow_up day.",
 "- No other clinical adjustment or subgroup filtering; no sample-level identity proof.",
 "- Grouping median TPM is a declared reconstruction assumption, not verified paper original.",
 "- Historical data release, author's cutoff, original covariates and endpoint are not verified.",
 "- All formal study decisions D1/D2 remain unresolved; results are in exploration, not canonical runs.",
 "",
 sprintf("R: %s; survival: %s.", getRversion(),
         as.character(utils::packageVersion("survival"))),
 ""
)
writeLines(lines, file.path(dir, "provisional-report.md"))
cat(paste(readLines(file.path(dir, "provisional-report.md")), collapse = "\n"), "\n")

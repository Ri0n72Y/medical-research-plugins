#!/usr/bin/env Rscript
args <- commandArgs(trailingOnly = TRUE)
if (length(args) != 2L) stop("Usage: Rscript --vanilla m3-survival.R cohort.tsv output-dir")
if (!requireNamespace("survival", quietly = TRUE)) {
  stop("M3 requires the R 'survival' package")
}
input <- args[[1L]]
output <- args[[2L]]
cohort <- read.delim(input, stringsAsFactors = FALSE, check.names = FALSE)
required <- c("case_id", "group", "os_days", "event")
if (!all(required %in% names(cohort))) stop("M3 cohort missing required columns")
if (anyDuplicated(cohort$case_id)) stop("Duplicate case_id in M3 cohort")
if (!all(cohort$group %in% c("high", "low"))) stop("Invalid CAPN1 group")
if (!all(cohort$event %in% c(0L, 1L))) stop("Invalid event value")
if (!all(is.finite(cohort$os_days)) || any(cohort$os_days < 0)) {
  stop("Invalid OS follow-up days")
}
cohort$group <- factor(cohort$group, levels = c("low", "high"))
if (any(table(cohort$group) == 0)) stop("Both CAPN1 groups are required")
if (sum(cohort$event) == 0) stop("No observed deaths for survival analysis")
surv <- survival::Surv(cohort$os_days, cohort$event)
km <- survival::survfit(surv ~ group, data = cohort)
rank <- survival::survdiff(surv ~ group, data = cohort)
cox <- survival::coxph(surv ~ group, data = cohort, ties = "efron")
result <- summary(cox)
ci <- result$conf.int[1L, ]
wald <- result$coefficients[1L, ]
values <- c(
  total_cases = nrow(cohort),
  high_cases = sum(cohort$group == "high"),
  low_cases = sum(cohort$group == "low"),
  observed_deaths = sum(cohort$event),
  high_deaths = sum(cohort$event[cohort$group == "high"]),
  low_deaths = sum(cohort$event[cohort$group == "low"]),
  logrank_chisq = unname(rank$chisq),
  logrank_p = pchisq(unname(rank$chisq), df = 1, lower.tail = FALSE),
  hazard_ratio_high_vs_low = unname(ci["exp(coef)"]),
  hazard_ratio_ci_lower = unname(ci["lower .95"]),
  hazard_ratio_ci_upper = unname(ci["upper .95"]),
  cox_wald_p = unname(wald["Pr(>|z|)"])
)
if (any(!is.finite(values))) stop("Non-finite Cox or log-rank result; analysis not published")
stats <- data.frame(metric = names(values), value = format(values, digits = 12, scientific = TRUE))
write.table(stats, file.path(output, "statistics.tsv"), sep = "\t",
  quote = FALSE, row.names = FALSE)
strata <- rep(names(km$strata), as.integer(km$strata))
steps <- data.frame(group = sub("^group=", "", strata), days = km$time,
  survival = km$surv, n_risk = km$n.risk, n_event = km$n.event, n_censor = km$n.censor)
write.table(steps, file.path(output, "km-steps.tsv"), sep = "\t",
  quote = FALSE, row.names = FALSE)
runtime <- data.frame(name = c("r_version", "survival_package_version", "cox_ties"),
  value = c(as.character(getRversion()), as.character(packageVersion("survival")), "efron"))
write.table(runtime, file.path(output, "runtime.tsv"), sep = "\t",
  quote = FALSE, row.names = FALSE)
svg(file.path(output, "kaplan-meier.svg"), width = 9, height = 6)
tryCatch({
  plot(km, col = c("#4C78A8", "#E45756"), lwd = 2, mark.time = TRUE,
    xlab = "Days after diagnosis", ylab = "Overall survival",
    main = "CAPN1 / TCGA-LAML — illustrative public reconstruction",
    xlim = c(0, max(cohort$os_days)), ylim = c(0, 1))
  legend("topright", legend = c("Low CAPN1", "High CAPN1"),
    col = c("#4C78A8", "#E45756"), lwd = 2, bty = "n")
}, finally = dev.off())

# Medical Research Plugins for DeepSeek Harness

A DSH-native, human-in-the-loop **CAPN1 / AML public research reconstruction and Harness capability demonstration**. Researchers own the scientific decisions; the Agent follows the skill, uses existing DSH tools, and reuses transparent datasets and results stored in the workspace.

This is deliberately a single-study example, not an autonomous scientist or a generic biomedical analysis platform. The goal is to demonstrate an end-to-end Harness research workflow, not to match the original paper's unpublished parameters or p-values.

## Quick start

**Prerequisites:** Git, **Node.js 22.19+ (22.x) or 24+**, **pnpm 11.7.0**, and internet access for the first setup and GDC download. DSH does not need a global installation: the launcher uses **`pnpm dlx @deepseek-ai/dsh@0.2.0-rc.2`**.

```sh
# Enable the Node-bundled Corepack and activate DSH's exact pnpm version
corepack enable
corepack prepare pnpm@11.7.0 --activate

git clone https://github.com/Ri0n72Y/medical-research-plugins.git
cd medical-research-plugins

pnpm run doctor
pnpm run web
```

`pnpm run web` automatically:

1. initializes the `research-web` DSH profile **once**, using the shipped Web template;
2. deploys this repository's thin research skill bundle into that profile if missing;
3. creates `research-workspace/`, if needed;
4. starts DSH Web from the workspace directory.

**The profile's original template is copied once, not live-inherited.** On later runs, existing profile data and settings are kept. The bundle uses the official DSH filesystem skill provider; no new Cordis research runtime is installed.

The terminal should print the Web URL. Open it and select the research workspace if the interface asks you to choose a directory. Starting DSH with that working directory provides a default workspace root, but does not guarantee the browser automatically switches to a previously selected session.

### M3: CAPN1 expression and survival

After a **complete** M2 workspace is prepared, install R with the recommended R survival package, then run:

    pnpm run survival

M3 verifies cached M2 inputs, derives an auditable patient-level CAPN1/OS cohort, and uses R to produce Kaplan–Meier, log-rank, and unadjusted Cox results. The run records exclusions, artifacts, package versions, and checksums. A repeated compatible call is cache-hit; pnpm run survival --rerun creates a new version. See [M3 methods](docs/m3-expression-survival.md).

A one-file smoke example is not sufficient to support the statistical study.

### M4: Differential expression

After M3, install **R/Bioconductor DESeq2** and run:

    pnpm run deg

M4 verifies M2 raw counts and M3 paired CAPN1 high/low cohort, fits DESeq2, and writes full/filter DEG tables, volcano plot, method provenance and immutable cache. The default screen uses FDR < 0.05 and |log2FC| >= 1. This is a conventional methods demonstration, not a reproduction of the paper's exact gene list. See [M4 methods](docs/m4-differential-expression.md).

### M5: GO / KEGG functional enrichment

With a completed M4 DESeq2 run, install Bioconductor `clusterProfiler` and `org.Hs.eg.db` and run:

    pnpm run enrichment

M5 reuses the M4 significant genes and the properly tested M4 universe, maps Ensembl→Entrez IDs, and performs GO BP/MF/CC + KEGG enrichment. KEGG REST annotations are fetched only if absent and saved as immutable, checksum-verified references. `--rerun` reuses cached mappings; `--refresh-kegg` requests fresh KEGG public annotations. Outputs include complete enrichment tables, ID-mapping/QC, visualization, runtime versions and preserved manifests. See [M5 methods](docs/m5-go-kegg-enrichment.md).

The enrichment is a declared **clusterProfiler replacement for original DAVID**, not a claim of identical DAVID analysis or pathways.

### Configure your model API key

For AI-assisted conversations you must configure a model provider. With the default DeepSeek route, use **`DEEPSEEK_API_KEY`** in the environment that launches DSH, or configure credentials through DSH's model/settings interface.

macOS/Linux:

```sh
export DEEPSEEK_API_KEY='your-key'
pnpm run web
```

Windows PowerShell:

```powershell
$env:DEEPSEEK_API_KEY = 'your-key'
pnpm run web
```

Do not put credentials in `study/`, Git files, CLI arguments, screenshots, or `.env` files that might be committed. DSH's credential service can store keys for later use; the environment variable overrides the stored key for that launch. The **deterministic `pnpm run data:prepare` command does not need an LLM API key**.

### One-command public data preparation

```sh
pnpm run data:prepare
```

This runs the *implemented* M1 + M2 workflow:

- initialize workspace research files without overwriting researcher decisions;
- acquire public TCGA-LAML GDC STAR Counts and clinical source (first run only);
- validate and cache source files, then prepare separate counts/TPM matrices, clinical tables and QC;
- reuse compatible complete local source and processed artifacts on future runs, explicitly announcing cache hits.

The first run may download many public expression files and take time/disk space; later compatible runs avoid refetching and reanalysis. Data are **not** committed to Git.

The result is a reviewable `qc.md` in `research-workspace/data/processed/...`, linked from `study/processed.json`. **This is an M2 QC report, not a completed CAPN1 publication-level reproduction.** No cohort selection, survival endpoint, clinical conclusion or scientific decision is automatically approved.

Explicit operations:

```sh
# Requery public GDC and rebuild downstream data if source changes
pnpm run data:prepare --refresh

# Rerun processing with the existing GDC source cache
pnpm run data:prepare --rerun

# Choose a different working directory (all study files remain there)
pnpm run data:prepare --workspace /absolute/path/to/my-study
pnpm run web --workspace /absolute/path/to/my-study
```

On Windows, supply a Windows absolute path to `--workspace`.

## Optional non-GUI entrypoints

The modes are **separate DSH profiles**, each derived from its corresponding official template. They are not switches on the Web profile.

| Workflow | Command | Purpose |
|---|---|---|
| DSH Web (default) | `pnpm run web` | Interactive research discussions and review |
| Deterministic local preparation | `pnpm run data:prepare` | M1/M2 source and QC cache without an AI model |
| Headless Agent | `pnpm run headless:qc` | One-shot model-assisted explanation of **existing** cached QC |
| ACP deployment | `pnpm run deploy:acp` | Initialize separate `research-acp` profile |
| ACP server | `node scripts/cli.mjs acp` | JSON-RPC stdio for an external ACP client |

Headless uses a fresh Agent turn and is not a scientific-approval channel. Its default task deliberately **does not refetch or reanalyze**; if artifacts are missing, it reports that. It requires a model credential.

ACP is a **protocol server**, not a one-shot script that writes a report by itself. You need an ACP-compatible client to issue its tasks. **Do not launch ACP via `pnpm run acp`**, because package-manager banners may interfere with the ACP JSON-RPC stream; run the Node command above directly after deployment.

See [Deployment and run modes](docs/deployment.md) for details, Windows steps, options, failure recovery and exact profile behavior.

## Architecture and capability boundary

- **DSH owns:** Agent/session, skills, workspace filesystem, tools, execution, approvals/questions, and optional MCP.
- **The repository owns:** the CAPN1 skill, public-method map, thin GDC + QC scripts, analysis artifacts and provenance contracts.
- **The researcher owns:** methods, cohort exclusion, endpoints, parameters that affect scientific interpretation, and final conclusions.

Our initial pipeline is **public reconstruction**, not a bit-for-bit reproduction of unpublished 2023 data/parameters. Every stage is classified `PUBLIC-FIXED`, `RECONSTRUCTED`, `DECISION` or `OPTIONAL`. Exploration is separate from canonical results.

**Cache-first:** inspect before fetch; reuse before compute; announce cache use; refresh only on explicit request; preserve earlier completed runs.

The current source code is under `.dsh/skills/capn1-aml-public-reconstruction/`. The small `cordis.patch.yml` enables the existing DSH `skill-filesystem` provider to load that skill from the checked-out repository. **Keep the checkout in place after deploying this source-linked bundle**; if you move it, rerun deployment from the new location.

## Status and tests

Currently implemented: M0 baseline, M1 GDC source cache, M2 expression/clinical/QC, M3 CAPN1 paired-cohort and R survival, M4 DESeq2 raw-count differential expression, M5 GO/KEGG enrichment, and DSH profile launcher. M3 requires R and full M2 data. STRING PPI, immune analysis, full report, and registry-published plugin are later work.

```sh
pnpm test
pnpm run web --dry-run
pnpm run data:prepare --dry-run
```

Actual first-boot DSH profile deployment and full real GDC transfers require a connected target machine and **have not yet been verified in this repository's remote development environment**.

Read [architecture](docs/architecture.md), [M1](docs/m1-source-cache.md), [M2](docs/m2-processing-qc.md), and [AGENTS.md](AGENTS.md) before changing the workflow.

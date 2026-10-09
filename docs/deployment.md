# Deployment and running modes (DSH 0.2.0-rc.2)

This is the operational contract for the CAPN1 research skill pack. The current target is **source-checkout deployment**, not a registry-published standalone research application.

## 1. Install prerequisites

You need:

- Node.js **22.19+ on Node 22, or Node 24+**, matching DSH's `^22.19.0 || >=24.0.0` engine range;
- **pnpm 11.7.0**, matching DSH `0.2.0-rc.2`'s `packageManager` field;
- Git for cloning this source repository;
- outbound network for first-time pnpm/DSH package acquisition and GDC data download;
- enough local storage for public per-sample STAR - Counts files;
- an API credential for model-backed DSH sessions (not required for direct M1/M2 processing).

Version checks: `node --version`, `pnpm --version`.

On Node.js 22, enable bundled Corepack and activate DSH's pinned pnpm version:

```sh
corepack enable
corepack prepare pnpm@11.7.0 --activate
pnpm --version
```

If Corepack is unavailable in your Node distribution (notably some installations of Node 25+), install Corepack separately first. The repository records `"packageManager": "pnpm@11.7.0"` and the launcher checks for that exact version.

The CLI uses **`pnpm dlx @deepseek-ai/dsh@0.2.0-rc.2`**, not an unpinned `@latest` or global DSH. This is the integration baseline, not a promise that no newer version exists.

## 2. One-command Web launch

From the cloned project root:

```sh
pnpm run doctor
pnpm run web
```

The second command checks/creates the dedicated `research-web` profile, installs the local source bundle if needed, and starts DSH with `research-workspace/` as the invocation directory.

**Exact official primitives used by the wrapper:**

```sh
# First creation only, using the shipped web template (does not boot the UI)
pnpm dlx @deepseek-ai/dsh@0.2.0-rc.2 --profile research-web --from-default-profile web --dump-config

# Install bundle into the research profile (DSH invokes pnpm)
pnpm dlx @deepseek-ai/dsh@0.2.0-rc.2 plugin --profile research-web add /absolute/path/to/medical-research-plugins

# Launch from the research workspace
pnpm dlx @deepseek-ai/dsh@0.2.0-rc.2 --profile research-web
```

Do not blindly replay the first creation command once the profile exists: DSH rejects `--from-default-profile` against an existing profile. The wrapper checks for this.

DSH copies the **shipped** web template's bundle list exactly once. It does **not** dynamically inherit subsequent changes to the user's own `web` profile or template updates. Do not replace an existing profile without examining its contents. The wrapper refuses an existing `research-web` profile not recognizable as web-derived.

The project bundle is a `dsh.bundle` patch that configures the existing `skill-filesystem` row. It points at the checkout's `.dsh/skills` directory using a launch-scoped `DSH_MED_RESEARCH_SKILL_ROOT` variable.

This is a source-linked integration: do not move/delete the checkout after deployment without redeploying from its new location. Launch via the wrapper to supply that skill root consistently. Launching the profile directly without the variable may not discover the research skill.

DSH uses the invocation working directory as the default workspace root. The browser UI may still ask the user to select/open that directory; **we do not claim an official Web workspace pre-registration CLI flag**. No workspace database or DSH internal state file is edited.

## 3. Research workspace and report persistence

By default:

```text
medical-research-plugins/
  research-workspace/
    study/
      reconstruction.yaml
      decisions.yaml
      source.json
      processed.json
      status.md
    data/
      manifests/
      raw/
      processed/
        <snapshot>/<M2 run>/
          counts-unstranded.tsv
          tpm-unstranded.tsv
          clinical-cases.tsv
          qc.json
          qc.md
          run-manifest.json
    artifacts/
      reports/
    exploration/
```

The data workspace is ignored by Git. The DSH model conversation is not the source of truth.

`pnpm run prepare` performs deterministic M1+M2 data preparation:

- first time: source acquisition and QC processing;
- subsequent compatible runs: verify and reuse local source and processed artifacts;
- `--refresh`: explicitly re-query public GDC source, then process as needed;
- `--rerun`: explicitly redo M2 from cached source, without refetching.

Both actions preserve historical completed runs. Cache use is announced.

Only **QC** reports are currently supported. The full survival/GO/KEGG/STRING/immune/public-reconstruction report is **not yet implemented**, and a one-command invocation must not claim that it is.

To use a custom workspace:

```sh
pnpm run prepare --workspace /absolute/path/to/study
pnpm run web --workspace /absolute/path/to/study
```

PowerShell example:

```powershell
pnpm run prepare --workspace 'D:\\MedicalResearch\\CAPN1'
pnpm run web --workspace 'D:\\MedicalResearch\\CAPN1'
```

## 4. Provider credentials

With the default DeepSeek provider, DSH can read `DEEPSEEK_API_KEY` at launch or use its locally managed credentials service. The key is required for model-backed Web/headless/ACP conversations unless a different configured provider supplies credentials.

macOS/Linux:
```sh
export DEEPSEEK_API_KEY='your-api-key'
pnpm run web
```

Windows PowerShell:
```powershell
$env:DEEPSEEK_API_KEY = 'your-api-key'
pnpm run web
```

Alternatively use the Web Models/credentials settings. Keep secrets outside the workspace and Git. Do not hardcode them into `cordis.patch.yml` or launch args.

`pnpm run prepare` operates locally and accesses only public GDC. It does not request an LLM key.

## 5. Headless: a one-shot cached QC summary

```sh
pnpm run headless:qc
```

This automatically creates `research-headless` from DSH's shipped **headless** template on first use, installs the same bundle, and submits a bounded one-shot task in the research working directory.

Its task asks the Agent to read **existing** M1/M2 artifacts, explain the QC findings and save a short summary under `artifacts/reports/`. It must not download missing data, run new analysis, or decide clinical endpoints. The Agent requires a model credential.

Unlike deterministic `prepare`, this result is model-written narrative. The formal QC artifacts and lineages remain the authoritative sources. A missing source cache should produce a limitation notice, not an auto-refetch.

## 6. ACP: a persistent protocol connection

```sh
pnpm run deploy:acp
node scripts/cli.mjs acp
```

This creates `research-acp` from the shipped **ACP** profile and starts its stdio JSON-RPC server. You must connect an ACP-compatible client to drive sessions, prompts, and reports.

ACP is **not** interchangeable with headless. Running the server alone will not submit a task or generate a report. ACP stdout is reserved for protocol frames: launch via `node scripts/cli.mjs acp`, **not `pnpm run acp`**, because a package-manager wrapper may print non-protocol banners.

Web, headless and ACP are separately deployed configurations. Credentials and the workspace directory still need to be available to each mode.

## 7. Verification / troubleshooting

Without changing external state:

```sh
pnpm test
pnpm run web --dry-run
pnpm run prepare --dry-run
pnpm run deploy:acp --dry-run
```

The `--dry-run` options describe orchestration only. They do not verify that DSH downloaded successfully or that GDC is reachable.

During a connected acceptance run, verify:

1. `pnpm run doctor` reports the supported Node version and exact pnpm version;
2. `pnpm run deploy:web` creates a web-derived profile and registers the research bundle;
3. `pnpm run web` starts without composition errors and exposes the CAPN1 skill in the selected workspace;
4. `pnpm run prepare` retrieves public GDC and publishes `source.json`, `processed.json`, and `qc.md`;
5. a second `pnpm run prepare` announces verified local source + processed cache reuse, with no GDC requests;
6. missing/corrupt data, interrupted fetches, and deliberate refresh/reanalysis retain previous completed artifacts;
7. with a valid API key, headless can explain already cached QC;
8. optional ACP handshake is driven by a real compatible client.

If the package manager reports `pnpm` unavailable, install it explicitly. If a profile already exists and cannot be verified as template-derived, use a clean `DSH_HOME` instead of deleting unknown user data.

**Known unverified boundaries:** actual pnpm-based profile deployment with this local bundle, real DSH skill recognition from the installed profile, real GDC data transfer, and ACP interoperability need target-host integration tests. The repository's dry-run tests alone do not establish these.

Official DSH 0.2.0-rc.2 references:
- [CLI/profile behavior](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.0-rc.2/apps/cli/reference/README.md)
- [Filesystem skill provider](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.0-rc.2/packages/skill/skill-filesystem/README.md)
- [DSH credentials](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.0-rc.2/packages/credentials/README.md)

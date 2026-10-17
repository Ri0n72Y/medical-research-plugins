#!/usr/bin/env python3
"""One-off branch-only public-data sandbox acceptance; never imported by scientific code."""
import json
import os
import pathlib
import shutil
import subprocess
import sys
import time

ROOT = pathlib.Path(__file__).resolve().parents[1]
STUDY = pathlib.Path(os.environ.get("RUNNER_TEMP", "/tmp")) / "capn1-public-full-study"
OUT = ROOT / "sandbox-evidence"
LOG = OUT / "logs"
LOG.mkdir(parents=True, exist_ok=True)
STAGES = [
    ("M1-M2", "data:prepare", [], 2400),
    ("M3", "survival", [], 1200),
    ("M4", "deg", [], 1500),
    ("M5", "enrichment", [], 1500),
    ("M6", "ppi", ["--required-score", "400"], 900),
    ("M7", "immune", ["--immune-mode", "ssgsea-only"], 900),
    ("P1", "paper:pancan", [], 900),
    ("P2", "paper:clinical", [], 400),
    ("P3", "paper:composition", [], 400),
    ("M8", "report", [], 300),
    ("M11", "record", [], 300),
    ("M11-cache", "record", [], 300),
]
results = []
for label, script, extra, limit in STAGES:
    command = ["pnpm", "run", script, "--workspace", str(STUDY), *extra]
    log = LOG / (label + ".log")
    print("Running", label, command, flush=True)
    start = time.monotonic()
    exit_code = None
    error = None
    with log.open("w", encoding="utf-8") as f:
        try:
            p = subprocess.run(command, cwd=ROOT, stdout=f, stderr=subprocess.STDOUT, timeout=limit, check=False)
            exit_code = p.returncode
        except subprocess.TimeoutExpired:
            error = "timeout"
        except Exception as exc:
            error = str(exc)
    elapsed = round(time.monotonic() - start, 1)
    status = "pass" if exit_code == 0 else ("timeout" if error == "timeout" else "fail")
    record = {"stage": label, "status": status, "exit_code": exit_code, "error": error,
              "duration_sec": elapsed, "command": command, "log": str(log.relative_to(OUT))}
    results.append(record)
    print(f"{label}: {status}, duration={elapsed}s", flush=True)
    try:
        print("\n".join(log.read_text(encoding="utf-8", errors="replace").splitlines()[-9:]), flush=True)
    except Exception:
        pass
    if label == "M1-M2" and status != "pass":
        print("M1-M2 failed, downstream commands will run to capture explicit prerequisite errors.", flush=True)

(OUT / "stage-summary.json").write_text(json.dumps(results, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
lines = ["# CAPN1 sandbox M1–M11 acceptance", "", "Source revision: " + os.environ.get("GITHUB_SHA", "unknown"),
         "Public run in GitHub-hosted isolated runner; local data not published.", "",
         "| Stage | Result | Elapsed (s) | Evidence log |", "|---|---|---:|---|"]
for x in results:
    lines.append(f"| {x['stage']} | {x['status']} | {x['duration_sec']} | {x['log']} |")
lines += ["", "Status is based on actual subprocess execution; code test success is not counted as a public-data run.",
          "D4=400 and D5=ssgsea-only are demo parameters, not inferred researcher sign-off.",
          "Xena live/STRING public paths may fail independently of GDC.",
          "This runner does NOT perform an authenticated DSH Agent conversation or browser UX inspection.",
          "All summaries are workflow demonstrations, not biomedical validation.", ""]
(OUT / "README.md").write_text("\n".join(lines), encoding="utf-8")
registry = []
for pointer in sorted((STUDY / "study").glob("*.json")) if (STUDY / "study").exists() else []:
    try:
        d = json.loads(pointer.read_text(encoding="utf-8"))
        relative = "study/" + pointer.name
        (OUT / "manifests").mkdir(parents=True, exist_ok=True)
        shutil.copy2(pointer, OUT / "manifests" / pointer.name)
        record = {"pointer": relative, "status": d.get("status"), "run": d.get("id"),
                  "report_status": d.get("report_status"), "outputs": len(d.get("outputs", []))}
        registry.append(record)
        for item in d.get("outputs", []):
            file = STUDY / item.get("path", "")
            if file.is_file() and file.suffix in {".md", ".svg", ".json", ".tsv"} and file.stat().st_size < 300_000:
                # Do not publish clinical row-level details; use reports, aggregate stats, indices only.
                if file.suffix == ".tsv" and file.name not in {"statistics.tsv", "gaps.tsv",
                    "workflow.tsv", "artifacts.tsv", "pancan-summary.tsv", "clinical-associations.tsv",
                    "immune-summary.tsv", "evidence-register.tsv"}:
                    continue
                target = OUT / "outputs" / pointer.stem / file.name
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(file, target)
    except Exception as exc:
        registry.append({"pointer": pointer.name, "error": str(exc)})
(OUT / "manifest-index.json").write_text(json.dumps(registry, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
if any(x["status"] != "pass" for x in results):
    sys.exit(1)

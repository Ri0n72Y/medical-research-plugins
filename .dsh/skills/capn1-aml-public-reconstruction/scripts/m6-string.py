#!/usr/bin/env python3
"""M6 public STRING functional-association network; Python-only analysis.

Outputs are facts about STRING associations, not physical binding or causality.
"""
import argparse
import csv
import html
import json
import math
import pathlib
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import Counter, defaultdict

import networkx as nx

ENDPOINT = "https://version-12-5.string-db.org/api"
CALLER = "dsh-medical-research-skill-pack"
COLUMNS = ["gene_id", "gene_name", "gene_type", "direction", "padj", "status", "reason"]
MAPPING = ["queryItem", "stringId", "preferredName", "status", "reason"]
NODES = ["string_id", "preferred_name", "query_gene", "degree", "component", "isolated"]
EDGES = ["string_id_a", "string_id_b", "score", "score_1000", "evidence"]
SYMBOL = re.compile(r"^[A-Za-z][A-Za-z0-9._-]*$")


def tsv(path, columns, rows):
    with path.open("w", encoding="utf-8", newline="") as file:
        writer = csv.writer(file, delimiter="\t", lineterminator="\n")
        writer.writerow(columns)
        writer.writerows(rows)


def read_table(path, columns, *, allow_empty=False):
    with path.open(encoding="utf-8", newline="") as file:
        reader = csv.DictReader(file, delimiter="\t")
        if not reader.fieldnames or not set(columns).issubset(reader.fieldnames):
            raise ValueError("Missing columns in " + path.name)
        rows = list(reader)
    if not allow_empty and not rows:
        raise ValueError("Empty TSV: " + path.name)
    if any(None in row or any(value is None for value in row.values()) for row in rows):
        raise ValueError("Malformed TSV: " + path.name)
    return rows


def request(method, params, fixture=None):
    if fixture is not None:
        return fixture.read_text(encoding="utf-8"), "offline-fixture"
    body = urllib.parse.urlencode(params).encode("utf-8")
    req = urllib.request.Request(ENDPOINT + "/tsv/" + method, data=body,
                                 headers={"User-Agent": CALLER, "Accept": "text/tab-separated-values"})
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=60) as response:
                data = response.read(20_000_000)
                if len(data) >= 20_000_000:
                    raise ValueError("STRING response exceeds safe size limit")
                return data.decode("utf-8"), "live"
        except urllib.error.HTTPError as error:
            if error.code not in (429, 500, 502, 503, 504) or attempt == 2:
                raise
        except (TimeoutError, urllib.error.URLError):
            if attempt == 2:
                raise
        time.sleep(1.5 * (attempt + 1))
    raise RuntimeError("STRING API retrieval failed")


def prepare_genes(path, out, fdr):
    rows = read_table(path, ["gene_id", "gene_name", "gene_type", "direction", "padj"])
    seen_ids = set()
    candidates = []
    symbol_counts = Counter(str(row["gene_name"]).strip().upper() for row in rows)
    prepared = []
    for row in rows:
        identifier = row["gene_id"]
        symbol = str(row["gene_name"]).strip().upper()
        if identifier in seen_ids:
            raise ValueError("Duplicate M4 gene_id")
        seen_ids.add(identifier)
        if row["direction"] not in ("up", "down"):
            raise ValueError("M4 significant list includes a non-significant row")
        try:
            p = float(row["padj"])
        except ValueError as exc:
            raise ValueError("Invalid adjusted p value") from exc
        if not math.isfinite(p) or p < 0 or p >= fdr:
            raise ValueError("M4 significant result has invalid FDR")
        reason = ("not_protein_coding" if row["gene_type"] != "protein_coding" else
                  "invalid_symbol" if not SYMBOL.fullmatch(symbol) else
                  "duplicate_symbol" if symbol_counts[symbol] > 1 else "")
        status = "eligible" if not reason else "excluded"
        prepared.append([identifier, row["gene_name"], row["gene_type"],
                         row["direction"], row["padj"], status, reason])
        if not reason:
            candidates.append(symbol)
    tsv(out / "input-genes.tsv", COLUMNS, prepared)
    if not candidates:
        raise ValueError("No valid protein-coding M4 significant gene symbols")
    return sorted(candidates), prepared


def parse_raw_tsv(body, columns, name, allow_empty=False):
    if "<html" in body.lower() or "<!doctype" in body.lower():
        raise ValueError("Unexpected HTML from STRING " + name)
    lines = body.rstrip("\r\n").splitlines()
    if not lines or not lines[0].strip():
        if allow_empty and not body.strip():
            return []
        raise ValueError("Empty response from STRING " + name)
    reader = csv.DictReader(lines, delimiter="\t")
    if not reader.fieldnames or not set(columns).issubset(reader.fieldnames):
        raise ValueError("Unexpected STRING " + name + " headers")
    rows = list(reader)
    if any(None in row or any(value is None for value in row.values()) for row in rows):
        raise ValueError("Malformed STRING " + name + " TSV")
    return rows


def resolve_ids(symbols, raw, folder):
    data = parse_raw_tsv(raw, ["queryItem", "stringId", "preferredName"], "get_string_ids")
    by_symbol = defaultdict(set)
    labels = {}
    for row in data:
        symbol = row["queryItem"].strip().upper()
        if symbol not in symbols:
            raise ValueError("STRING mapping returned an unrequested query")
        sid = row["stringId"].strip()
        if not re.fullmatch(r"9606\.[A-Za-z0-9_.-]+", sid):
            raise ValueError("Invalid human STRING protein identifier")
        by_symbol[symbol].add(sid)
        labels[sid] = row["preferredName"]
    mapped = {symbol: next(iter(ids)) for symbol, ids in by_symbol.items() if len(ids) == 1}
    duplicates = Counter(mapped.values())
    accepted = {symbol: sid for symbol, sid in mapped.items() if duplicates[sid] == 1}
    rows = []
    for symbol in symbols:
        ids = by_symbol.get(symbol, set())
        reason = ("unmapped" if not ids else
                  "ambiguous_string_id" if len(ids) != 1 else
                  "duplicate_protein_mapping" if symbol not in accepted else "")
        # STRING's get_string_ids returns the *best* match, not a set of
        # candidate proteins. A single returned ID is not proof of uniqueness.
        rows.append([symbol, accepted.get(symbol, ""), labels.get(mapped.get(symbol), ""),
                     "string_best_match" if not reason else "excluded", reason])
    tsv(folder / "string-id-mapping.tsv", MAPPING, rows)
    if not accepted:
        raise ValueError("No usable human STRING best-match identifiers")
    return accepted, labels, rows


def normalize_edges(body, selected, required_score, folder):
    parsed = parse_raw_tsv(body, ["stringId_A", "stringId_B", "score"],
                           "network", allow_empty=True)
    links = {}
    for row in parsed:
        a, b = row["stringId_A"], row["stringId_B"]
        if a not in selected or b not in selected:
            raise ValueError("STRING network unexpectedly expanded input nodes")
        if a == b:
            continue
        try:
            score = float(row["score"])
        except ValueError as exc:
            raise ValueError("Non-numeric STRING score") from exc
        if not math.isfinite(score) or not 0 <= score <= 1:
            raise ValueError("STRING score is not within 0–1")
        score1000 = int(round(score * 1000))
        if score1000 < required_score:
            continue
        key = tuple(sorted((a, b)))
        evidence = {k: v for k, v in row.items() if k not in (
            "stringId_A", "stringId_B", "score", "preferredName_A",
            "preferredName_B", "ncbiTaxonId")}
        if "ncbiTaxonId" in row and row["ncbiTaxonId"] not in ("9606", ""):
            raise ValueError("STRING network returned a nonhuman interaction")
        item = [key[0], key[1], f"{score:.6f}", str(score1000),
                json.dumps(evidence, ensure_ascii=False, sort_keys=True)]
        if key not in links or float(links[key][2]) < score:
            links[key] = item
    edges = [links[key] for key in sorted(links)]
    tsv(folder / "ppi-edges.tsv", EDGES, edges)
    return edges


def graph_report(accepted, labels, edges, folder):
    graph = nx.Graph()
    graph.add_nodes_from(sorted(accepted.values()))
    graph.add_edges_from((row[0], row[1], {"score": float(row[2])}) for row in edges)
    components = list(nx.connected_components(graph))
    components.sort(key=lambda component: (-len(component), sorted(component)[0]))
    index = {sid: i + 1 for i, group in enumerate(components) for sid in group}
    inverted = {v: k for k, v in accepted.items()}
    ordered = sorted(graph.nodes)
    nodes = [[sid, labels.get(sid, ""), inverted[sid], graph.degree[sid],
              index[sid], int(graph.degree[sid] == 0)] for sid in ordered]
    tsv(folder / "ppi-nodes.tsv", NODES, nodes)
    metric = {"mapped_proteins": len(ordered), "edges": graph.number_of_edges(),
              "isolated_proteins": sum(graph.degree[v] == 0 for v in ordered),
              "connected_components": len(components),
              "largest_component": len(components[0]) if components else 0,
              "mean_degree": f"{sum(graph.degree[v] for v in ordered) / max(1, len(ordered)):.6f}"}
    tsv(folder / "ppi-metrics.tsv", ["metric", "value"], metric.items())
    # Overview intentionally visualizes only a deterministic high-degree subset,
    # while ppi-nodes.tsv / ppi-edges.tsv retain the full network.
    visible = sorted(ordered, key=lambda x: (-graph.degree[x], x))[:60]
    width, height = 1050, 780
    svg = ['<svg xmlns="http://www.w3.org/2000/svg" width="1050" height="780" viewBox="0 0 1050 780">',
           '<rect width="100%" height="100%" fill="white"/>',
           '<text x="35" y="38" font-size="20" font-family="sans-serif">STRING functional association network</text>',
           f'<text x="35" y="61" font-family="sans-serif" font-size="12">'
           f'{len(ordered)} mapped proteins, {len(edges)} associations · first 60 by degree</text>']
    position = nx.spring_layout(graph.subgraph(visible), seed=23, iterations=70)
    def xy(v):
        x, y = position[v]
        return 525 + 370 * float(x), 415 + 290 * float(y)
    for a, b in sorted(graph.subgraph(visible).edges()):
        x1, y1 = xy(a)
        x2, y2 = xy(b)
        svg.append(f'<line x1="{x1:.2f}" y1="{y1:.2f}" x2="{x2:.2f}" y2="{y2:.2f}" stroke="#b4c3ca" stroke-width="1"/>')
    for sid in visible:
        x, y = xy(sid)
        label = html.escape(inverted[sid])
        svg.append(f'<circle cx="{x:.2f}" cy="{y:.2f}" r="6" fill="#4477aa"/>')
        svg.append(f'<text x="{x + 7:.2f}" y="{y - 7:.2f}" font-size="9" fill="#344054" font-family="sans-serif">{label}</text>')
    svg.append("</svg>")
    (folder / "ppi-network.svg").write_text("\n".join(svg) + "\n", encoding="utf-8")
    return metric


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("deg")
    parser.add_argument("output")
    parser.add_argument("--required-score", required=True, type=int)
    parser.add_argument("--m4-fdr", required=True, type=float)
    parser.add_argument("--mapping-fixture")
    parser.add_argument("--network-fixture")
    args = parser.parse_args()
    if not (math.isfinite(args.m4_fdr) and 0 < args.m4_fdr < 1):
        raise ValueError("Invalid M4 FDR threshold")
    if not 0 <= args.required_score <= 1000:
        raise ValueError("STRING required_score must be an integer between 0 and 1000")
    if bool(args.mapping_fixture) != bool(args.network_fixture):
        raise ValueError("Both offline fixture files must be supplied together")
    folder = pathlib.Path(args.output)
    folder.mkdir(parents=True, exist_ok=True)
    symbols, prepared = prepare_genes(pathlib.Path(args.deg), folder, args.m4_fdr)
    parameters = {"identifiers": "\r".join(symbols), "species": "9606",
                  "echo_query": "1", "caller_identity": CALLER}
    mapping, mode = request("get_string_ids", parameters,
                            pathlib.Path(args.mapping_fixture) if args.mapping_fixture else None)
    (folder / "string-id-mapping-raw.tsv").write_text(mapping, encoding="utf-8")
    accepted, labels, mapping_rows = resolve_ids(symbols, mapping, folder)
    network_params = {"identifiers": "\r".join(sorted(accepted.values())),
                      "species": "9606", "required_score": str(args.required_score),
                      "network_type": "functional", "add_nodes": "0",
                      "caller_identity": CALLER}
    # STRING can auto-expand singleton queries to ten neighbors. To enforce
    # input-only semantics, skip the network request for a single mapped ID.
    if len(accepted) == 1:
        network, network_mode = "stringId_A\tstringId_B\tscore\n", "singleton-input-only"
    else:
        if mode == "live":
            time.sleep(1.0)  # STRING's recommended spacing between API calls.
        network, network_mode = request("network", network_params,
                                        pathlib.Path(args.network_fixture) if args.network_fixture else None)
    (folder / "string-network-raw.tsv").write_text(network, encoding="utf-8")
    edges = normalize_edges(network, set(accepted.values()), args.required_score, folder)
    metrics = graph_report(accepted, labels, edges, folder)
    tsv(folder / "runtime.tsv", ["name", "value"],
        [("python_version", sys.version.split()[0]), ("networkx_version", nx.__version__),
         ("string_endpoint", ENDPOINT), ("source_mode", mode),
         ("species", "9606"), ("network_type", "functional"),
         ("required_score_0_to_1000", args.required_score)])
    requests = {
        "provider": ENDPOINT, "source_mode": mode, "mapping": parameters,
        "network": network_params, "network_mode": network_mode,
        "mapping_method": "STRING get_string_ids returns one best match; no independent uniqueness verification",
        "note": "Functional associations, not necessarily physical contacts.",
    }
    (folder / "string-requests.json").write_text(json.dumps(requests, indent=2) + "\n")
    (folder / "statistics.json").write_text(json.dumps({
        "submitted_genes": len(prepared), "eligible_symbols": len(symbols),
        "mapped_proteins": len(accepted),
        "excluded_mapping": len(symbols) - len(accepted), "metrics": metrics,
    }, indent=2) + "\n")


if __name__ == "__main__":
    main()

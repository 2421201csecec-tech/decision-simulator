from __future__ import annotations

import networkx as nx


def build_dag(variables: list[dict]) -> nx.DiGraph:
    G = nx.DiGraph()
    for var in variables:
        vid = var.get("variable_id")
        if not vid:
            continue
        G.add_node(vid, **{
            "name": var.get("name", ""),
            "importance": var.get("importance", "medium"),
            "observability": var.get("observability", "lagged"),
        })
        for target_id in var.get("affects", []):
            G.add_edge(vid, target_id)
    return G


def check_cycles(G: nx.DiGraph) -> list[list[str]]:
    return list(nx.simple_cycles(G))


def check_temporal_consistency(G: nx.DiGraph, variables: list[dict]) -> list[str]:
    """A terminal variable cannot affect a realtime variable — causally impossible."""
    obs = {v["variable_id"]: v.get("observability", "lagged") for v in variables if v.get("variable_id")}
    warnings = []
    for u, v in G.edges():
        if obs.get(u) == "terminal" and obs.get(v) == "realtime":
            warnings.append(
                f"Temporal inconsistency: terminal variable '{u}' cannot affect "
                f"realtime variable '{v}'"
            )
    return warnings

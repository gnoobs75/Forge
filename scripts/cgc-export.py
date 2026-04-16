#!/usr/bin/env python3
"""
Export CodeGraphContext graph data as JSON for the Forge CodeViz.

Usage: python cgc-export.py <repo-path>
Outputs JSON to stdout.

Requires: pip install codegraphcontext kuzu
"""

import sys
import json
import os
import hashlib
from datetime import datetime, timezone


def find_cgc_db(repo_path):
    """Locate the KuzuDB database for a given repo path."""
    # CGC stores databases in ~/.cgc/databases/ keyed by a hash of the repo path
    cgc_home = os.path.expanduser("~/.cgc")
    db_dir = os.path.join(cgc_home, "databases")

    if not os.path.isdir(db_dir):
        return None

    # Try exact path hash (CGC uses the absolute path)
    abs_path = os.path.abspath(repo_path)

    # CGC may use various hashing strategies — check common ones
    for candidate in os.listdir(db_dir):
        candidate_path = os.path.join(db_dir, candidate)
        if os.path.isdir(candidate_path):
            # Check if this DB has a metadata file pointing to our repo
            meta_path = os.path.join(candidate_path, "metadata.json")
            if os.path.isfile(meta_path):
                try:
                    with open(meta_path) as f:
                        meta = json.load(f)
                    if meta.get("repo_path") == abs_path or meta.get("path") == abs_path:
                        return candidate_path
                except (json.JSONDecodeError, KeyError):
                    pass

    # Fallback: try MD5 hash of the absolute path
    path_hash = hashlib.md5(abs_path.encode()).hexdigest()
    candidate = os.path.join(db_dir, path_hash)
    if os.path.isdir(candidate):
        return candidate

    # Fallback: try SHA256[:16]
    path_hash = hashlib.sha256(abs_path.encode()).hexdigest()[:16]
    candidate = os.path.join(db_dir, path_hash)
    if os.path.isdir(candidate):
        return candidate

    # Last resort: look for any directory containing our repo name
    repo_name = os.path.basename(abs_path).lower()
    for candidate in os.listdir(db_dir):
        if repo_name in candidate.lower():
            return os.path.join(db_dir, candidate)

    return None


def export_graph(repo_path):
    """Query KuzuDB and export graph data as structured JSON."""
    try:
        import kuzu
    except ImportError:
        return {"error": "kuzu not installed. Run: pip install kuzu"}

    db_path = find_cgc_db(repo_path)
    if not db_path:
        return {"error": f"No CGC database found for {repo_path}. Run: cgc index {repo_path}"}

    try:
        db = kuzu.Database(db_path)
        conn = kuzu.Connection(db)
    except Exception as e:
        return {"error": f"Failed to connect to KuzuDB: {str(e)}"}

    nodes = []
    edges = []

    # Extract function nodes
    try:
        result = conn.execute("""
            MATCH (f:Function)
            RETURN f.id AS id, f.name AS name, f.file AS file,
                   f.start_line AS line, f.end_line AS endLine,
                   f.loc AS loc, f.complexity AS complexity,
                   f.parameters AS params
        """)
        while result.has_next():
            row = result.get_next()
            nodes.append({
                "id": row[0],
                "type": "function",
                "name": row[1],
                "file": row[2],
                "line": row[3],
                "endLine": row[4],
                "loc": row[5] or 0,
                "complexity": row[6],
                "params": row[7] if row[7] else [],
                "dead": False,  # Will be updated below
            })
    except Exception:
        pass  # Table might not exist

    # Extract class nodes
    try:
        result = conn.execute("""
            MATCH (c:Class)
            RETURN c.id AS id, c.name AS name, c.file AS file,
                   c.start_line AS line, c.end_line AS endLine,
                   c.loc AS loc
        """)
        while result.has_next():
            row = result.get_next()
            nodes.append({
                "id": row[0],
                "type": "class",
                "name": row[1],
                "file": row[2],
                "line": row[3],
                "endLine": row[4],
                "loc": row[5] or 0,
                "complexity": None,
                "dead": False,
            })
    except Exception:
        pass

    # Extract module nodes
    try:
        result = conn.execute("""
            MATCH (m:Module)
            RETURN m.id AS id, m.name AS name, m.file AS file,
                   m.start_line AS line, m.end_line AS endLine,
                   m.loc AS loc
        """)
        while result.has_next():
            row = result.get_next()
            ext = os.path.splitext(row[2] or "")[1].lstrip(".")
            nodes.append({
                "id": row[0],
                "type": "module",
                "name": row[1],
                "file": row[2],
                "line": row[3],
                "endLine": row[4],
                "loc": row[5] or 0,
                "ext": ext,
            })
    except Exception:
        pass

    # Extract edges (all relationship types)
    edge_queries = [
        ("CALLS", "MATCH (a)-[r:CALLS]->(b) RETURN a.id, b.id"),
        ("IMPORTS", "MATCH (a)-[r:IMPORTS]->(b) RETURN a.id, b.id"),
        ("INHERITS", "MATCH (a)-[r:INHERITS]->(b) RETURN a.id, b.id"),
        ("DEFINED_IN", "MATCH (a)-[r:DEFINED_IN]->(b) RETURN a.id, b.id"),
        ("REFERENCES", "MATCH (a)-[r:REFERENCES]->(b) RETURN a.id, b.id"),
        ("OVERRIDES", "MATCH (a)-[r:OVERRIDES]->(b) RETURN a.id, b.id"),
    ]

    for edge_type, query in edge_queries:
        try:
            result = conn.execute(query)
            while result.has_next():
                row = result.get_next()
                edges.append({
                    "source": row[0],
                    "target": row[1],
                    "type": edge_type.lower(),
                })
        except Exception:
            pass  # Relationship type might not exist

    # Dead code analysis: functions with no incoming CALLS edges
    dead_code = []
    try:
        result = conn.execute("""
            MATCH (f:Function)
            WHERE NOT EXISTS { MATCH ()-[:CALLS]->(f) }
            AND NOT f.name STARTS WITH '_'
            AND NOT f.name = 'main'
            AND NOT f.name = 'constructor'
            AND NOT f.name = '__init__'
            RETURN f.id
        """)
        while result.has_next():
            row = result.get_next()
            dead_code.append(row[0])
    except Exception:
        pass

    # Mark dead nodes
    dead_set = set(dead_code)
    for node in nodes:
        if node["id"] in dead_set:
            node["dead"] = True

    # Complexity hotspots
    hotspots = []
    for node in nodes:
        if node.get("complexity") and node["complexity"] > 10:
            hotspots.append({
                "id": node["id"],
                "complexity": node["complexity"],
            })
    hotspots.sort(key=lambda x: x["complexity"], reverse=True)

    # Compute stats
    complexities = [n["complexity"] for n in nodes if n.get("complexity")]
    avg_complexity = sum(complexities) / len(complexities) if complexities else 0
    max_complexity = max(complexities) if complexities else 0

    # Get CGC version
    cgc_version = "unknown"
    try:
        import codegraphcontext
        cgc_version = getattr(codegraphcontext, "__version__", "unknown")
    except Exception:
        pass

    output = {
        "meta": {
            "project": os.path.basename(os.path.abspath(repo_path)),
            "repoPath": os.path.abspath(repo_path),
            "indexedAt": datetime.now(timezone.utc).isoformat(),
            "cgcVersion": cgc_version,
            "nodeCount": len(nodes),
            "edgeCount": len(edges),
        },
        "nodes": nodes,
        "edges": edges,
        "analysis": {
            "deadCode": dead_code,
            "complexityHotspots": hotspots[:20],
            "avgComplexity": round(avg_complexity, 1),
            "maxComplexity": max_complexity,
        },
    }

    return output


def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Usage: python cgc-export.py <repo-path>"}))
        sys.exit(1)

    repo_path = sys.argv[1]
    if not os.path.isdir(repo_path):
        print(json.dumps({"error": f"Directory not found: {repo_path}"}))
        sys.exit(1)

    result = export_graph(repo_path)
    print(json.dumps(result))


if __name__ == "__main__":
    main()

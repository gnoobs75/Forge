#!/usr/bin/env python3
"""One-shot Forge->Forge rename across in-scope files. Delete after use."""
import os, re, sys

ROOT = r"C:\Claude\Samurai\Forge"

EXCLUDE_DIRS = {
    os.path.join(ROOT, ".superpowers"),
    os.path.join(ROOT, "docs", "superpowers"),
    os.path.join(ROOT, ".worktrees"),
    os.path.join(ROOT, "node_modules"),
    os.path.join(ROOT, ".git"),
    os.path.join(ROOT, "dist"),
    os.path.join(ROOT, "friday", "node_modules"),
    os.path.join(ROOT, "friday", "dist"),
}

# Files to leave alone (out-of-scope active docs per user instructions)
EXCLUDE_FILES = {
    os.path.join(ROOT, "docs", "friday-testing-checklist.html"),
    os.path.join(ROOT, "docs", "friday-architecture.html"),
}

EXTS = {".ts", ".tsx", ".js", ".jsx", ".cjs", ".mjs", ".py", ".sh",
        ".json", ".md", ".css", ".html"}

# Tailwind-only: only touch specific files (config + components)
def is_tailwind_target(path):
    rel = os.path.relpath(path, ROOT).replace("\\", "/")
    if rel == "tailwind.config.js":
        return True
    if rel == "index.html":
        return True
    if rel.startswith("src/"):
        return True
    return False

# Ordered replacements. Longer/more-specific first.
REPLACEMENTS = [
    # Paths
    ("C:/Claude/Samurai/Forge", "C:/Claude/Samurai/Forge"),
    ("C:\\\\Claude\\\\Agency\\\\forge", "C:\\\\Claude\\\\Samurai\\\\Forge"),
    ("C:\\Claude\\Samurai\\Forge", "C:\\Claude\\Samurai\\Forge"),
    ("C:/Claude/Samurai", "C:/Claude/Samurai"),
    ("C:\\\\Claude\\\\Agency", "C:\\\\Claude\\\\Samurai"),
    ("C:\\Claude\\Samurai", "C:\\Claude\\Samurai"),
    # Identifiers / message types
    ("forge-friday-dispatch", "forge-friday-dispatch"),
    ("forge-studio-module", "forge-studio-module"),
    ("forge-studio-workflows", "forge-studio-workflows"),
    ("forge-studio", "forge-studio"),
    ("forge:command", "forge:command"),
    ("forge:event", "forge:event"),
    ("forge:confirm", "forge:confirm"),
    ("FORGE_HQ_DATA", "FORGE_HQ_DATA"),
    ("forge", "forge"),
    # Prose
    ("Forge", "Forge"),
]

# Word-boundary Forge -> Forge (but not inside identifiers like "CoEvent")
COE_WORD_RE = re.compile(r"\bCoE\b")

def should_process(path):
    if path in EXCLUDE_FILES:
        return False
    for ex in EXCLUDE_DIRS:
        if path.startswith(ex + os.sep) or path == ex:
            return False
    ext = os.path.splitext(path)[1].lower()
    return ext in EXTS

def process_file(path):
    try:
        with open(path, "r", encoding="utf-8") as f:
            original = f.read()
    except (UnicodeDecodeError, PermissionError):
        return False
    new = original
    for old, repl in REPLACEMENTS:
        new = new.replace(old, repl)
    new = COE_WORD_RE.sub("Forge", new)
    # Tailwind color namespace rename, limited to target files
    if is_tailwind_target(path):
        tw_names = [
            "coe-surface-hover", "coe-surface-light", "coe-surface",
            "coe-text-primary", "coe-text-secondary", "coe-text-muted",
            "coe-accent-blue", "coe-accent",
            "coe-border", "coe-bg",
        ]
        for n in tw_names:
            new = new.replace(n, "forge-" + n[4:])
        # tailwind.config.js key
        if path.endswith("tailwind.config.js"):
            new = new.replace("        coe: {", "        forge: {")
    if new != original:
        with open(path, "w", encoding="utf-8", newline="") as f:
            f.write(new)
        return True
    return False

changed = []
for dirpath, dirnames, filenames in os.walk(ROOT):
    # prune excluded dirs in-place
    dirnames[:] = [d for d in dirnames
                   if os.path.join(dirpath, d) not in EXCLUDE_DIRS]
    for fn in filenames:
        p = os.path.join(dirpath, fn)
        if should_process(p) and process_file(p):
            changed.append(p)

print(f"Changed {len(changed)} files")
for c in changed:
    print(c)

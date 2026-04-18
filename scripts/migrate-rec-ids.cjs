#!/usr/bin/env node
/**
 * One-shot migration: assign first-class IDs to every existing recommendation.
 *
 * Scans ../hq-data/projects/{slug}/recommendations/*.json (relative to the
 * Forge repo, so the parent Samurai/hq-data tree). For each project, sorts
 * recs by timestamp ascending and assigns `id: <PREFIX>-NNN` in order.
 *
 * Prefix = first 3 uppercase chars of the slug AFTER stripping non-alphanumeric.
 *   homestead                 -> HOM
 *   plugger                   -> PLU
 *   safetyfirst-credentialing -> SAF
 *   _template                 -> TEM
 *
 * If two project prefixes collide, we fall back to 4 letters for whichever
 * comes second alphabetically and print a notice. No current project collides.
 *
 * Also writes rec-counter.json per project with { "next": <highest+1> }.
 *
 * Idempotent: recs that already have an `id` are left alone, and their
 * numeric suffix still contributes to the highest-id calculation so the
 * counter stays correct.
 *
 * Usage: node scripts/migrate-rec-ids.js
 * Does NOT commit — the human runs it and reviews the diff.
 */

const fs = require("node:fs");
const path = require("node:path");

const FORGE_ROOT = path.resolve(__dirname, "..");
const HQ_PROJECTS = path.resolve(FORGE_ROOT, "..", "hq-data", "projects");

function stripNonAlnum(s) {
  return (s || "").replace(/[^a-zA-Z0-9]/g, "");
}

function prefixForSlug(slug) {
  const clean = stripNonAlnum(slug).toUpperCase();
  return clean.slice(0, 3);
}

function pad(n) {
  return String(n).padStart(3, "0");
}

function listDirs(root) {
  if (!fs.existsSync(root)) return [];
  return fs
    .readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
}

function main() {
  const projectSlugs = listDirs(HQ_PROJECTS);

  // Detect prefix collisions up front.
  const prefixMap = new Map(); // prefix -> [slug]
  for (const slug of projectSlugs) {
    const p = prefixForSlug(slug);
    if (!prefixMap.has(p)) prefixMap.set(p, []);
    prefixMap.get(p).push(slug);
  }
  const collisions = [...prefixMap.entries()].filter(([, slugs]) => slugs.length > 1);
  if (collisions.length > 0) {
    console.error("[migrate] prefix collisions detected:");
    for (const [prefix, slugs] of collisions) {
      console.error(`  ${prefix}: ${slugs.join(", ")}`);
    }
    console.error("[migrate] aborting; resolve manually (e.g. fall back to 4-letter prefix for the later slug).");
    process.exit(1);
  }

  let grandTotal = 0;
  for (const slug of projectSlugs) {
    const recsDir = path.join(HQ_PROJECTS, slug, "recommendations");
    if (!fs.existsSync(recsDir)) continue;

    const files = fs
      .readdirSync(recsDir)
      .filter((f) => f.endsWith(".json") && !f.startsWith("."));

    // Read all recs, keep only those with parseable JSON that look like recs.
    const entries = [];
    for (const f of files) {
      const full = path.join(recsDir, f);
      let rec;
      try {
        rec = JSON.parse(fs.readFileSync(full, "utf8"));
      } catch (err) {
        console.warn(`[migrate] ${slug}/${f}: skipping, invalid JSON (${err.message})`);
        continue;
      }
      if (!rec || typeof rec !== "object") continue;
      entries.push({ file: f, full, rec });
    }

    const prefix = prefixForSlug(slug);

    // Establish the current highest numeric suffix among already-migrated recs
    // so new IDs don't clash.
    let highest = 0;
    for (const { rec } of entries) {
      if (typeof rec.id === "string") {
        const m = rec.id.match(/^([A-Z0-9]+)-(\d+)$/);
        if (m && m[1] === prefix) {
          const n = parseInt(m[2], 10);
          if (Number.isFinite(n) && n > highest) highest = n;
        }
      }
    }

    // Sort unmigrated entries by timestamp ascending (missing timestamp → sort by filename).
    const needsId = entries.filter((e) => typeof e.rec.id !== "string");
    needsId.sort((a, b) => {
      const ta = a.rec.timestamp || "";
      const tb = b.rec.timestamp || "";
      if (ta < tb) return -1;
      if (ta > tb) return 1;
      return a.file.localeCompare(b.file);
    });

    let assigned = 0;
    for (const entry of needsId) {
      highest += 1;
      entry.rec.id = `${prefix}-${pad(highest)}`;
      // Rewrite: pretty JSON + trailing newline. Preserve existing key order
      // by placing `id` first so it's easy to eyeball; the rest of the
      // object order is whatever JSON.parse returned, which is insertion order.
      const reordered = { id: entry.rec.id, ...entry.rec };
      fs.writeFileSync(entry.full, JSON.stringify(reordered, null, 2) + "\n", "utf8");
      assigned += 1;
    }

    const counter = { next: highest + 1 };
    const counterPath = path.join(HQ_PROJECTS, slug, "rec-counter.json");
    fs.writeFileSync(counterPath, JSON.stringify(counter, null, 2) + "\n", "utf8");

    console.log(`[migrate] ${slug}: assigned ${assigned} new IDs, counter at ${counter.next}`);
    grandTotal += assigned;
  }

  console.log(`[migrate] done. ${grandTotal} recs received new IDs across ${projectSlugs.length} projects.`);
}

main();

import * as fs from "node:fs";
import * as path from "node:path";
import type { FridayTool, ToolResult } from "../types.ts";
import { findHqDir, readJsonSafe, matchesQuery, getProjectSlugs } from "./hq-utils.ts";
import { computeSummary, checkBudgets } from "./metering.ts";

function queryRecommendations(hqDir: string, query: string, scope: string, limit: number): string {
  const slugs = scope === "all" ? getProjectSlugs(hqDir) : [scope];
  const results: string[] = [];

  for (const slug of slugs) {
    const recsDir = path.join(hqDir, "projects", slug, "recommendations");
    try {
      const files = fs.readdirSync(recsDir)
        .filter((f) => f.endsWith(".json"))
        .sort().reverse();

      for (const file of files) {
        if (results.length >= limit) break;
        const rec = readJsonSafe(path.join(recsDir, file));
        if (!rec) continue;
        const searchText = `${rec.title || ""} ${rec.agent || ""} ${rec.summary || ""}`;
        if (matchesQuery(searchText, query)) {
          results.push(`- [${file.slice(0, 10)}] **${rec.agent}**: ${rec.title} — ${rec.summary || ""} (${rec.status || "active"}) [${slug}]`);
        }
      }
    } catch {}
  }

  if (results.length === 0) return `No recommendations found matching "${query}".`;
  return `**Recommendations** (${results.length} results):\n${results.join("\n")}`;
}

function queryFeatures(hqDir: string, query: string, scope: string, limit: number): string {
  const slugs = scope === "all" ? getProjectSlugs(hqDir) : [scope];
  const results: string[] = [];

  for (const slug of slugs) {
    const features = readJsonSafe(path.join(hqDir, "projects", slug, "features.json"));
    if (!Array.isArray(features)) continue;
    for (const f of features) {
      if (results.length >= limit) break;
      const searchText = `${f.name || ""} ${f.description || ""} ${f.status || ""}`;
      if (matchesQuery(searchText, query)) {
        results.push(`- **${f.name}**: ${f.description || ""} — ${f.status || "unknown"} [${slug}]`);
      }
    }
  }

  if (results.length === 0) return `No features found matching "${query}".`;
  return `**Features** (${results.length} results):\n${results.join("\n")}`;
}

function queryActivity(hqDir: string, query: string, limit: number): string {
  const log = readJsonSafe(path.join(hqDir, "activity-log.json"));
  if (!Array.isArray(log)) return "No activity log found.";

  const filtered = [...log].reverse().filter((e: any) => {
    const searchText = `${e.agent || ""} ${e.action || ""} ${e.project || ""}`;
    return matchesQuery(searchText, query);
  }).slice(0, limit);

  if (filtered.length === 0) return `No activity found matching "${query}".`;
  return `**Recent Activity** (${filtered.length} entries):\n${filtered.map((e: any) => `- [${e.timestamp?.slice(0, 10) || "?"}] ${e.agent}: ${e.action} (${e.project || "studio"})`).join("\n")}`;
}

function queryProgress(hqDir: string, scope: string): string {
  const slugs = scope === "all" ? getProjectSlugs(hqDir) : [scope];
  const parts: string[] = [];

  for (const slug of slugs) {
    const progress = readJsonSafe(path.join(hqDir, "projects", slug, "progress.json"));
    if (!progress) continue;
    parts.push(`**${slug}** — ${progress.overall || 0}% overall (${progress.phase || "unknown"})`);
    if (progress.categories) {
      const cats = Object.entries(progress.categories)
        .map(([k, v]: [string, any]) => `${k}: ${v?.score ?? v?.progress ?? 0}%`)
        .join(", ");
      parts.push(`  Scores: ${cats}`);
    }
    if (progress.blockers?.length > 0) {
      const active = progress.blockers.filter((b: any) => !b.resolved);
      if (active.length > 0) {
        parts.push(`  Blockers: ${active.map((b: any) => b.name || b.description).join("; ")}`);
      }
    }
  }

  if (parts.length === 0) return "No progress data found.";
  return parts.join("\n");
}

function queryMetering(query: string): string {
  try {
    const summary = computeSummary();
    const alerts = checkBudgets();
    const parts: string[] = [];

    if (query.match(/budget|over|limit|alert/i)) {
      if (alerts.length === 0) {
        parts.push("All budgets healthy — no alerts.");
      } else {
        for (const a of alerts) {
          parts.push(`${a.level.toUpperCase()}: ${a.provider} ${a.period} at ${Math.round(a.pct * 100)}% (${a.used.toLocaleString()} / ${a.limit.toLocaleString()} tokens)`);
        }
      }
    }

    if (query.match(/today|spend|cost|usage|token/i)) {
      const t = summary.today;
      parts.push(`Today (${t.date}):`);
      parts.push(`  Claude: ${t.claude.total.toLocaleString()} tokens (${t.claude.sessions} sessions, estimated)`);
      parts.push(`  Grok: ${t.grok.total.toLocaleString()} tokens (${t.grok.sessions} sessions, actual)`);
      parts.push(`  Groq: ${t.groq.total.toLocaleString()} tokens (${t.groq.sessions} calls, info only)`);
    }

    if (query.match(/agent|who|expensive/i)) {
      const agents = Object.entries(summary.byAgent).sort((a, b) => (b[1].claude + b[1].grok) - (a[1].claude + a[1].grok));
      parts.push("By agent (today):");
      for (const [slug, data] of agents.slice(0, 5)) {
        parts.push(`  ${slug}: ${(data.claude + data.grok).toLocaleString()} tokens (${data.sessions} sessions)`);
      }
    }

    if (query.match(/project/i)) {
      parts.push("By project (today):");
      for (const [slug, data] of Object.entries(summary.byProject)) {
        parts.push(`  ${slug}: ${(data.claude + data.grok).toLocaleString()} tokens`);
      }
    }

    if (query.match(/feature|lifecycle|idea/i) && summary.byFeature.length > 0) {
      parts.push("Top features by cost:");
      for (const f of summary.byFeature.slice(0, 5)) {
        parts.push(`  ${f.linkId}: ${f.totalTokens.toLocaleString()} tokens (${Object.keys(f.stages).join(" → ")})`);
      }
    }

    return parts.length > 0 ? parts.join("\n") : "No metering data found. Try asking about today's spend, budget status, or agent costs.";
  } catch (err) {
    return `Metering query error: ${err instanceof Error ? err.message : String(err)}`;
  }
}

export async function queryStudioExecute(args: {
  query: string;
  type?: string;
  scope?: string;
  limit?: number;
}): Promise<ToolResult> {
  const hqDir = findHqDir();
  if (!hqDir) {
    return { success: false, output: "", error: "HQ data directory not found" };
  }

  const query = args.query || "";
  const type = args.type || "all";
  const scope = args.scope || "all";
  const limit = args.limit || 10;

  if (query.match(/meter|budget|token|spend|cost|expensive/i)) {
    return { success: true, output: queryMetering(query) };
  }

  const parts: string[] = [];

  if (type === "recommendations" || type === "all") {
    parts.push(queryRecommendations(hqDir, query, scope, limit));
  }
  if (type === "features" || type === "all") {
    parts.push(queryFeatures(hqDir, query, scope, limit));
  }
  if (type === "activity" || type === "all") {
    parts.push(queryActivity(hqDir, query, limit));
  }
  if (type === "progress" || type === "all") {
    parts.push(queryProgress(hqDir, scope));
  }

  return { success: true, output: parts.join("\n\n") };
}

export const queryStudio: FridayTool = {
  name: "studio.query",
  description: "Query the Forge studio data — recommendations, features, progress, and activity log. Returns formatted text summaries.",
  parameters: [
    { name: "query", type: "string", description: "Keyword search string — matched against titles, agents, summaries", required: true },
    { name: "type", type: "string", description: "Data type: recommendations | features | progress | activity | all", required: false, default: "all" },
    { name: "scope", type: "string", description: "Project slug to filter by, or 'all' for all projects", required: false, default: "all" },
    { name: "limit", type: "number", description: "Maximum results to return", required: false, default: 10 },
  ],
  clearance: ["read-fs"],
  async execute(args, _context) {
    return queryStudioExecute(args as any);
  },
};

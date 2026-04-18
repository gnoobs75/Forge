import * as fs from "node:fs";
import * as path from "node:path";
import type { FridayTool, ToolResult } from "../types.ts";
import { findHqDir, readJsonSafe } from "./hq-utils.ts";

/**
 * Allocate the next sequential rec ID for a project.
 * ID format: "<PREFIX>-<NNN>" where prefix = first 3 uppercase alnum chars
 * of the slug. Counter persisted at {hqDir}/projects/{slug}/rec-counter.json.
 * Not atomic across processes — Friday is a singleton, so serial writes from
 * a single runtime are fine.
 */
function prefixForSlug(slug: string): string {
  return (slug || "").replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(0, 3);
}

function assignRecId(hqDir: string, projectSlug: string): string {
  const counterPath = path.join(hqDir, "projects", projectSlug, "rec-counter.json");
  let next = 1;
  try {
    const raw = fs.readFileSync(counterPath, "utf-8");
    const parsed = JSON.parse(raw);
    const n = Number(parsed?.next);
    if (Number.isFinite(n) && n >= 1) next = n;
  } catch {
    // missing or corrupt counter — start at 1
  }
  const prefix = prefixForSlug(projectSlug);
  const id = `${prefix}-${String(next).padStart(3, "0")}`;
  fs.mkdirSync(path.dirname(counterPath), { recursive: true });
  fs.writeFileSync(counterPath, JSON.stringify({ next: next + 1 }, null, 2) + "\n");
  return id;
}

interface ValidationResult {
  valid: boolean;
  error?: string;
}

const REQUIRED_REC_FIELDS = ["agent", "agentColor", "title", "summary", "approaches", "recommended", "reasoning", "status"];

export function validateRecommendation(data: any): ValidationResult {
  for (const field of REQUIRED_REC_FIELDS) {
    if (data[field] === undefined || data[field] === null || data[field] === "") {
      return { valid: false, error: `Missing required field: ${field}` };
    }
  }
  if (!Array.isArray(data.approaches)) {
    return { valid: false, error: "approaches must be an array" };
  }
  return { valid: true };
}

export function validateActivity(data: any): ValidationResult {
  for (const field of ["agent", "agentColor", "action"]) {
    if (!data[field]) return { valid: false, error: `Missing required field: ${field}` };
  }
  return { valid: true };
}

export function validateFeatureUpdate(data: any): ValidationResult {
  if (!data.featureId) return { valid: false, error: "Missing required field: featureId" };
  if (!data.updates || typeof data.updates !== "object") return { valid: false, error: "Missing required field: updates" };
  return { valid: true };
}

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
}

async function createRecommendation(hqDir: string, project: string, data: any): Promise<ToolResult> {
  const validation = validateRecommendation(data);
  if (!validation.valid) {
    return { success: false, output: "", error: validation.error };
  }

  const timestamp = new Date().toISOString();
  const dateStr = timestamp.slice(0, 10);
  const agentSlug = data.agent.toLowerCase().replace(/\s+/g, "-");
  const titleSlug = slugify(data.title);
  const filename = `${dateStr}-${agentSlug}-${titleSlug}.json`;

  const recsDir = path.join(hqDir, "projects", project, "recommendations");
  fs.mkdirSync(recsDir, { recursive: true });

  // Assign a Forge-style project-prefixed ID (e.g. "HOM-042") unless the
  // caller already supplied one (idempotent re-runs / external tooling).
  const id = typeof data.id === "string" && data.id ? data.id : assignRecId(hqDir, project);

  const rec = {
    id,
    ...data,
    project,
    timestamp,
    type: "recommendation",
  };
  fs.writeFileSync(path.join(recsDir, filename), JSON.stringify(rec, null, 2));

  // Append to activity log
  const activityPath = path.join(hqDir, "activity-log.json");
  const activity = readJsonSafe(activityPath) || [];
  const nextId = activity.length > 0 ? Math.max(...activity.map((a: any) => a.id || 0)) + 1 : 1;
  activity.push({
    id: nextId,
    agent: data.agent,
    agentColor: data.agentColor,
    action: `Created recommendation: ${data.title}`,
    project: project.charAt(0).toUpperCase() + project.slice(1),
    timestamp,
  });
  fs.writeFileSync(activityPath, JSON.stringify(activity, null, 2));

  return { success: true, output: `Recommendation created: ${filename}` };
}

async function logActivity(hqDir: string, project: string, data: any): Promise<ToolResult> {
  const validation = validateActivity(data);
  if (!validation.valid) {
    return { success: false, output: "", error: validation.error };
  }

  const activityPath = path.join(hqDir, "activity-log.json");
  const activity = readJsonSafe(activityPath) || [];
  const nextId = activity.length > 0 ? Math.max(...activity.map((a: any) => a.id || 0)) + 1 : 1;
  activity.push({
    id: nextId,
    agent: data.agent,
    agentColor: data.agentColor,
    action: data.action,
    project: project || "Studio",
    timestamp: new Date().toISOString(),
  });
  fs.writeFileSync(activityPath, JSON.stringify(activity, null, 2));

  return { success: true, output: `Activity logged: ${data.action}` };
}

async function updateFeature(hqDir: string, project: string, data: any): Promise<ToolResult> {
  const validation = validateFeatureUpdate(data);
  if (!validation.valid) {
    return { success: false, output: "", error: validation.error };
  }

  const featuresPath = path.join(hqDir, "projects", project, "features.json");
  const features = readJsonSafe(featuresPath);
  if (!Array.isArray(features)) {
    return { success: false, output: "", error: `No features.json found for project: ${project}` };
  }

  const feature = features.find((f: any) => f.id === data.featureId || f.name === data.featureId);
  if (!feature) {
    return { success: false, output: "", error: `Feature not found: ${data.featureId}` };
  }

  Object.assign(feature, data.updates);
  fs.writeFileSync(featuresPath, JSON.stringify(features, null, 2));

  return { success: true, output: `Feature updated: ${data.featureId}` };
}

export const updateStudio: FridayTool = {
  name: "studio.update",
  description: "Write to the Forge studio data — create recommendations, log activities, or update features.",
  parameters: [
    { name: "action", type: "string", description: "Action type: create_recommendation | log_activity | update_feature", required: true },
    { name: "project", type: "string", description: "Project slug (expedition, ttr-ios, ttr-roblox)", required: true },
    { name: "data", type: "object", description: "Action-specific data payload", required: true },
  ],
  clearance: ["write-fs"],
  async execute(args, _context) {
    const hqDir = findHqDir();
    if (!hqDir) {
      return { success: false, output: "", error: "HQ data directory not found" };
    }

    const { action, project, data } = args as any;
    switch (action) {
      case "create_recommendation":
        return createRecommendation(hqDir, project, data);
      case "log_activity":
        return logActivity(hqDir, project, data);
      case "update_feature":
        return updateFeature(hqDir, project, data);
      default:
        return { success: false, output: "", error: `Unknown action: ${action}` };
    }
  },
};

// friday/src/modules/mobile/routes.ts
import * as fs from "node:fs";
import * as path from "node:path";
import type { SessionRegistry } from "./session-registry.ts";
import { readJsonSafe, getProjectSlugs } from "../studio/hq-utils.ts";
import { forgeRoot } from "../../config/paths.ts";

type BroadcastFn = (msg: Record<string, unknown>) => void;
let broadcastFn: BroadcastFn | null = null;
export function setMobileBroadcast(fn: BroadcastFn): void {
  broadcastFn = fn;
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function slugify(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 60);
}

export async function handleMobileRoute(
  req: Request,
  url: URL,
  registry: SessionRegistry,
  hqDir: string | null,
): Promise<Response | null> {
  const p = url.pathname;

  if (p === "/api/mobile/status" && req.method === "GET") {
    const all = registry.listAll();
    const waiting = registry.listWaiting();
    return json({
      status: "ok",
      timestamp: new Date().toISOString(),
      sessionCounts: {
        total: all.length,
        running: all.filter((s) => s.status === "running").length,
        waiting: waiting.length,
        complete: all.filter((s) => s.status === "complete").length,
      },
      alertCount: waiting.length,
    });
  }

  if (p === "/api/mobile/overview" && req.method === "GET") {
    const all = registry.listAll();
    const waiting = registry.listWaiting();
    let activity: unknown[] = [];
    if (hqDir) {
      const logPath = path.join(hqDir, "activity-log.json");
      const logData = readJsonSafe(logPath);
      if (Array.isArray(logData)) {
        activity = logData.slice(-20).reverse();
      }
    }
    const projects = hqDir ? getProjectSlugs(hqDir) : [];
    return json({
      stats: {
        totalSessions: all.length,
        waitingCount: waiting.length,
        runningCount: all.filter((s) => s.status === "running").length,
        projectCount: projects.length,
      },
      activity,
      alerts: waiting.map((s) => ({
        scopeId: s.scopeId,
        project: s.project,
        agent: s.agent,
        promptType: s.prompt?.type,
      })),
    });
  }

  if (p === "/api/mobile/sessions" && req.method === "GET") {
    return json({ sessions: registry.listAll() });
  }

  // GET /api/mobile/sessions/:scopeId/logs — hydrate buffered output on reconnect
  {
    const logsMatch = p.match(/^\/api\/mobile\/sessions\/([^/]+)\/logs$/);
    if (logsMatch && req.method === "GET") {
      const scopeId = decodeURIComponent(logsMatch[1]);
      const session = registry.get(scopeId);
      if (!session) {
        return json({ error: "session not found", scopeId }, 404);
      }
      return json({
        scopeId: session.scopeId,
        status: session.status,
        prompt: session.prompt,
        lastOutput: session.lastOutput,
        startedAt: session.startedAt,
        project: session.project,
        agent: session.agent,
        taskDescription: session.taskDescription,
      });
    }
  }

  if (p === "/api/mobile/recommendations" && req.method === "GET") {
    const projectFilter = url.searchParams.get("project");
    const recs: unknown[] = [];
    if (hqDir) {
      const slugs = projectFilter ? [projectFilter] : getProjectSlugs(hqDir);
      for (const slug of slugs) {
        const recDir = path.join(hqDir, "projects", slug, "recommendations");
        try {
          const files = fs.readdirSync(recDir).filter((f) => f.endsWith(".json"));
          for (const file of files) {
            const rec = readJsonSafe(path.join(recDir, file));
            if (rec && rec.title && rec.agent) {
              rec._project = slug;
              rec._file = file;
              recs.push(rec);
            }
          }
        } catch {}
      }
    }
    recs.sort((a: any, b: any) => (b.timestamp || "").localeCompare(a.timestamp || ""));
    return json({ recommendations: recs });
  }

  const recActionMatch = p.match(/^\/api\/mobile\/recommendations\/(.+)\/action$/);
  if (recActionMatch && req.method === "POST") {
    const recFile = decodeURIComponent(recActionMatch[1]);
    try {
      const body = await req.json();
      const action = body.action;
      if (!hqDir) return json({ error: "hq-data not found" }, 500);
      const slugs = getProjectSlugs(hqDir);
      for (const slug of slugs) {
        const filePath = path.join(hqDir, "projects", slug, "recommendations", recFile);
        if (fs.existsSync(filePath)) {
          const rec = readJsonSafe(filePath);
          if (rec) {
            if (action === "approve") rec.status = "approved";
            else if (action === "dismiss") {
              rec.status = "dismissed";
              rec.dismissedAt = new Date().toISOString();
            }
            fs.writeFileSync(filePath, JSON.stringify(rec, null, 2));
            return json({ success: true, status: rec.status });
          }
        }
      }
      return json({ error: "Recommendation not found" }, 404);
    } catch (e) {
      return json({ error: "Invalid request body" }, 400);
    }
  }

  if (p === "/api/mobile/projects" && req.method === "GET") {
    const projects: unknown[] = [];
    if (hqDir) {
      const slugs = getProjectSlugs(hqDir);
      for (const slug of slugs) {
        const projectJson = readJsonSafe(path.join(hqDir, "projects", slug, "project.json"));
        const features = readJsonSafe(path.join(hqDir, "projects", slug, "features.json"));
        const progress = readJsonSafe(path.join(hqDir, "projects", slug, "progress.json"));
        const sessions = registry.listByProject(slug);
        projects.push({
          slug,
          name: projectJson?.name || slug,
          ...(projectJson || {}),
          featureCount: Array.isArray(features) ? features.length : 0,
          progress: progress?.overall ?? null,
          activeSessions: sessions.length,
          waitingSessions: sessions.filter((s) => s.status === "waiting").length,
        });
      }
    }
    return json({ projects });
  }

  const projectMatch = p.match(/^\/api\/mobile\/projects\/([^/]+)$/);
  if (projectMatch && req.method === "GET") {
    const slug = projectMatch[1];
    if (!hqDir) return json({ error: "hq-data not found" }, 500);
    const projectJson = readJsonSafe(path.join(hqDir, "projects", slug, "project.json"));
    if (!projectJson) return json({ error: "Project not found" }, 404);
    const features = readJsonSafe(path.join(hqDir, "projects", slug, "features.json"));
    const progress = readJsonSafe(path.join(hqDir, "projects", slug, "progress.json"));
    const sessions = registry.listByProject(slug);
    return json({
      ...projectJson,
      slug,
      features: features || [],
      progress: progress || null,
      sessions,
    });
  }

  // POST /api/mobile/launch/implementation
  if (p === "/api/mobile/launch/implementation" && req.method === "POST") {
    if (!hqDir) return json({ error: "hq-data not found" }, 500);
    try {
      const body = await req.json();
      const { project, recFile, approachId, mode } = body as {
        project: string;
        recFile: string;
        approachId: number;
        mode: "plan" | "auto";
      };
      if (!project || !recFile) return json({ error: "project and recFile are required" }, 400);

      const recPath = path.join(hqDir, "projects", project, "recommendations", recFile);
      const rec = readJsonSafe(recPath);
      if (!rec) return json({ error: "Recommendation not found" }, 404);

      const projectJson = readJsonSafe(path.join(hqDir, "projects", project, "project.json"));
      const repoPath = projectJson?.repoPath || "";

      const approach = Array.isArray(rec.approaches)
        ? rec.approaches.find((a: any) => a.id === approachId) ?? rec.approaches[0]
        : null;

      const prompt = [
        "# Implementation Brief",
        "",
        `## Recommendation: ${rec.title}`,
        `**Agent:** ${rec.agent}`,
        `**Project:** ${project}`,
        "",
        "## Summary",
        rec.summary || "",
        "",
        approach ? `## Selected Approach: ${approach.name}` : "## Selected Approach",
        approach?.description || "",
        "",
        "## Reasoning",
        rec.reasoning || "",
        "",
        "## Instructions",
        mode === "plan"
          ? "Create a detailed plan. Do NOT start coding yet."
          : "Implement the recommended approach. Explore the codebase first.",
      ].join("\n");

      const scopeId = `impl-mobile-${Date.now()}`;
      registry.register({
        scopeId,
        project,
        agent: rec.agent || "unknown",
        taskDescription: `Implement: ${rec.title}`,
      });

      if (broadcastFn) {
        broadcastFn({
          type: "forge:command",
          commandId: scopeId,
          command: "spawn-implementation",
          args: {
            scopeId,
            cwd: repoPath || forgeRoot,
            prompt,
            mode,
            modelFlag: "",
            agentSlug: rec.agent || "unknown",
            projectSlug: project,
            recommendationId: typeof rec.id === "string" ? rec.id : null,
          },
          confirmRequired: false,
        });
      }

      return json({ success: true, scopeId });
    } catch {
      return json({ error: "Invalid request body" }, 400);
    }
  }

  // POST /api/mobile/launch/agent
  if (p === "/api/mobile/launch/agent" && req.method === "POST") {
    try {
      const body = await req.json();
      const { project, agentSlug, prompt } = body as {
        project: string;
        agentSlug: string;
        prompt?: string;
      };
      if (!project || !agentSlug) return json({ error: "project and agentSlug are required" }, 400);

      const scopeId = `agent-mobile-${Date.now()}`;
      registry.register({
        scopeId,
        project,
        agent: agentSlug,
        taskDescription: prompt || `Agent session: ${agentSlug}`,
      });

      if (broadcastFn) {
        broadcastFn({
          type: "forge:command",
          commandId: scopeId,
          command: "spawn-agent",
          args: {
            agent: agentSlug,
            project,
            instruction: prompt || `Analyze the ${project} project and provide recommendations based on your specialty.`,
          },
          confirmRequired: false,
        });
      }

      return json({ success: true, scopeId });
    } catch {
      return json({ error: "Invalid request body" }, 400);
    }
  }

  // GET /api/mobile/ideas?project=slug
  if (p === "/api/mobile/ideas" && req.method === "GET") {
    const projectSlug = url.searchParams.get("project");
    if (!projectSlug) return json({ error: "project query param required" }, 400);
    if (!hqDir) return json({ error: "hq-data not found" }, 500);

    const ideasDir = path.join(hqDir, "projects", projectSlug, "ideas");
    const ideas: unknown[] = [];
    try {
      const files = fs.readdirSync(ideasDir).filter((f) => f.endsWith(".json"));
      for (const file of files) {
        const idea = readJsonSafe(path.join(ideasDir, file));
        if (idea) {
          idea._file = file;
          ideas.push(idea);
        }
      }
    } catch {}

    ideas.sort((a: any, b: any) => (b.createdAt || "").localeCompare(a.createdAt || ""));
    return json({ ideas });
  }

  // POST /api/mobile/ideas
  if (p === "/api/mobile/ideas" && req.method === "POST") {
    if (!hqDir) return json({ error: "hq-data not found" }, 500);
    try {
      const body = await req.json();
      const { project, text } = body as { project: string; text: string };
      if (!project || !text) return json({ error: "project and text are required" }, 400);

      const random = Math.random().toString(36).slice(2, 8);
      const id = `idea-${Date.now()}-${random}`;
      const now = new Date();
      const dateStr = now.toISOString().slice(0, 10);
      const textSlug = slugify(text);
      const fileName = `${dateStr}-boss-${textSlug || id}.json`;

      const idea = {
        id,
        project,
        text,
        source: "boss",
        status: "active",
        createdAt: now.toISOString(),
      };

      const ideasDir = path.join(hqDir, "projects", project, "ideas");
      fs.mkdirSync(ideasDir, { recursive: true });
      fs.writeFileSync(path.join(ideasDir, fileName), JSON.stringify(idea, null, 2));

      return json({ success: true, idea });
    } catch {
      return json({ error: "Invalid request body" }, 400);
    }
  }

  // POST /api/mobile/ideas/:id/analyze
  const ideaAnalyzeMatch = p.match(/^\/api\/mobile\/ideas\/([^/]+)\/analyze$/);
  if (ideaAnalyzeMatch && req.method === "POST") {
    if (!hqDir) return json({ error: "hq-data not found" }, 500);
    try {
      const ideaId = ideaAnalyzeMatch[1];
      const body = await req.json();
      const { project } = body as { project: string };
      if (!project) return json({ error: "project is required" }, 400);

      const ideasDir = path.join(hqDir, "projects", project, "ideas");
      let ideaFile: string | null = null;
      let ideaData: any = null;
      try {
        const files = fs.readdirSync(ideasDir).filter((f) => f.endsWith(".json"));
        for (const file of files) {
          const d = readJsonSafe(path.join(ideasDir, file));
          if (d?.id === ideaId) {
            ideaFile = path.join(ideasDir, file);
            ideaData = d;
            break;
          }
        }
      } catch {}

      if (!ideaFile || !ideaData) return json({ error: "Idea not found" }, 404);

      ideaData.status = "analyzing";
      fs.writeFileSync(ideaFile, JSON.stringify(ideaData, null, 2));

      const scopeId = `idea-analyze-mobile-${Date.now()}`;
      const ideaFileFwd = ideaFile.replace(/\\/g, "/");
      const analysisPrompt = [
        `Analyze the following idea for the ${project} project.`,
        "",
        `Idea: "${ideaData.text}"`,
        "",
        "Score this idea 1-10 from each council agent's perspective (Solutions Architect, Backend Engineer, Frontend Engineer, UX Researcher, Product Owner, etc.).",
        "Compute an overall composite score.",
        "",
        `Write your full analysis back to the idea JSON file at: ${ideaFileFwd}`,
        "Add an 'analysis' object with fields: scores (object keyed by agent), overallScore (number 1-10), summary (string), strengths (array), concerns (array), analyzedAt (ISO timestamp).",
        "",
        "If overallScore >= 7, also generate a full recommendation JSON file in",
        `hq-data/projects/${project}/recommendations/`,
        "using the standard recommendation format (title, agent, summary, approaches, recommended, reasoning, status: 'active').",
        "",
        "Use the standard CLAUDE.md recommendation format. Do not skip any required fields.",
      ].join("\n");

      registry.register({
        scopeId,
        project,
        agent: "solutions-architect",
        taskDescription: `Analyze idea: ${ideaData.text.slice(0, 100)}`,
      });

      if (broadcastFn) {
        broadcastFn({
          type: "forge:command",
          commandId: scopeId,
          command: "spawn-agent",
          args: {
            agent: "solutions-architect",
            project,
            instruction: analysisPrompt,
          },
          confirmRequired: false,
        });
      }

      return json({ success: true, scopeId });
    } catch {
      return json({ error: "Invalid request body" }, 400);
    }
  }

  // POST /api/mobile/ideas/:id/promote
  const ideaPromoteMatch = p.match(/^\/api\/mobile\/ideas\/([^/]+)\/promote$/);
  if (ideaPromoteMatch && req.method === "POST") {
    if (!hqDir) return json({ error: "hq-data not found" }, 500);
    try {
      const ideaId = ideaPromoteMatch[1];
      const body = await req.json();
      const { project } = body as { project: string };
      if (!project) return json({ error: "project is required" }, 400);

      const ideasDir = path.join(hqDir, "projects", project, "ideas");
      let ideaFile: string | null = null;
      let ideaData: any = null;
      try {
        const files = fs.readdirSync(ideasDir).filter((f) => f.endsWith(".json"));
        for (const file of files) {
          const d = readJsonSafe(path.join(ideasDir, file));
          if (d?.id === ideaId) {
            ideaFile = path.join(ideasDir, file);
            ideaData = d;
            break;
          }
        }
      } catch {}

      if (!ideaFile || !ideaData) return json({ error: "Idea not found" }, 404);

      const score = ideaData.analysis?.overallScore ?? 0;
      if (score < 7) {
        return json({ error: `Idea score (${score}) is below 7 — analyze first or score is too low` }, 422);
      }

      ideaData.status = "promoted";
      ideaData.promotedAt = new Date().toISOString();
      fs.writeFileSync(ideaFile, JSON.stringify(ideaData, null, 2));

      // If no recommendation file yet, create one from the analysis
      if (!ideaData.recommendationFile && ideaData.analysis) {
        const recDir = path.join(hqDir, "projects", project, "recommendations");
        fs.mkdirSync(recDir, { recursive: true });
        const dateStr = new Date().toISOString().slice(0, 10);
        const titleSlug = slugify(ideaData.text);
        const recFile = `${dateStr}-boss-idea-${titleSlug || ideaId}.json`;
        const rec = {
          agent: "Boss (Promoted Idea)",
          agentColor: "#f59e0b",
          project,
          timestamp: new Date().toISOString(),
          type: "recommendation",
          title: ideaData.text.slice(0, 80),
          summary: ideaData.analysis.summary || ideaData.text,
          approaches: [
            {
              id: 1,
              name: "Implement this idea",
              description: ideaData.text,
              trade_offs: ideaData.analysis.concerns?.join("; ") || "Unknown",
              effort: "medium",
              impact: "high",
            },
          ],
          recommended: 1,
          reasoning: ideaData.analysis.summary || "Promoted from boss idea with score >= 7.",
          phase_relevant: [],
          status: "active",
          _sourceIdeaId: ideaId,
        };
        fs.writeFileSync(path.join(recDir, recFile), JSON.stringify(rec, null, 2));
        ideaData.recommendationFile = recFile;
        fs.writeFileSync(ideaFile, JSON.stringify(ideaData, null, 2));
      }

      return json({ success: true });
    } catch {
      return json({ error: "Invalid request body" }, 400);
    }
  }

  // POST /api/mobile/ideas/:id/dismiss
  const ideaDismissMatch = p.match(/^\/api\/mobile\/ideas\/([^/]+)\/dismiss$/);
  if (ideaDismissMatch && req.method === "POST") {
    if (!hqDir) return json({ error: "hq-data not found" }, 500);
    try {
      const ideaId = ideaDismissMatch[1];
      const body = await req.json();
      const { project } = body as { project: string };
      if (!project) return json({ error: "project is required" }, 400);

      const ideasDir = path.join(hqDir, "projects", project, "ideas");
      let ideaFile: string | null = null;
      let ideaData: any = null;
      try {
        const files = fs.readdirSync(ideasDir).filter((f) => f.endsWith(".json"));
        for (const file of files) {
          const d = readJsonSafe(path.join(ideasDir, file));
          if (d?.id === ideaId) {
            ideaFile = path.join(ideasDir, file);
            ideaData = d;
            break;
          }
        }
      } catch {}

      if (!ideaFile || !ideaData) return json({ error: "Idea not found" }, 404);

      ideaData.status = "dismissed";
      ideaData.dismissedAt = new Date().toISOString();
      fs.writeFileSync(ideaFile, JSON.stringify(ideaData, null, 2));

      return json({ success: true });
    } catch {
      return json({ error: "Invalid request body" }, 400);
    }
  }

  return null;
}

import type { ForgeConnection } from "./connection";
import { baseUrl } from "./connection";
import type { SessionInfo } from "./prompt-types";

export interface Idea {
  id: string;
  text: string;
  source: "boss" | "agent";
  agentName?: string;
  agentColor?: string;
  project: string;
  status: "active" | "analyzing" | "analyzed" | "promoted" | "dismissed";
  createdAt: string;
  analysis?: {
    overallScore: number;
    verdict: string;
    agents: Array<{ agentId: string; score: number; insight: string }>;
    analyzedAt: string;
  };
  _filePath?: string;
}

async function apiFetch<T>(
  conn: ForgeConnection,
  path: string,
  options?: RequestInit,
): Promise<T> {
  const url = `${baseUrl(conn)}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${conn.token}`,
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });
  if (!res.ok) {
    throw new Error(`API ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

export interface StatusResponse {
  status: string;
  timestamp: string;
  sessionCounts: {
    total: number;
    running: number;
    waiting: number;
    complete: number;
  };
  alertCount: number;
}

export interface OverviewResponse {
  stats: {
    totalSessions: number;
    waitingCount: number;
    runningCount: number;
    projectCount: number;
  };
  activity: Array<{
    id: number;
    agent: string;
    agentColor: string;
    action: string;
    project: string;
    timestamp: string;
  }>;
  alerts: Array<{
    scopeId: string;
    project: string;
    agent: string;
    promptType: string | null;
  }>;
}

export interface RecsResponse {
  recommendations: Array<{
    title: string;
    agent: string;
    agentColor: string;
    summary: string;
    status: string;
    timestamp: string;
    approaches: Array<{
      id: number;
      name: string;
      description: string;
      effort: string;
      impact: string;
    }>;
    recommended: number;
    reasoning: string;
    _project: string;
    _file: string;
  }>;
}

export interface ProjectSummary {
  slug: string;
  name: string;
  featureCount: number;
  progress: number | null;
  activeSessions: number;
  waitingSessions: number;
}

export interface ProjectDetail {
  slug: string;
  name: string;
  features: unknown[];
  progress: unknown;
  sessions: SessionInfo[];
}

export const api = {
  status: (conn: ForgeConnection) =>
    apiFetch<StatusResponse>(conn, "/api/mobile/status"),

  overview: (conn: ForgeConnection) =>
    apiFetch<OverviewResponse>(conn, "/api/mobile/overview"),

  sessions: (conn: ForgeConnection) =>
    apiFetch<{ sessions: SessionInfo[] }>(conn, "/api/mobile/sessions"),

  recommendations: (conn: ForgeConnection, project?: string) => {
    const qs = project ? `?project=${encodeURIComponent(project)}` : "";
    return apiFetch<RecsResponse>(conn, `/api/mobile/recommendations${qs}`);
  },

  recAction: (conn: ForgeConnection, file: string, action: string) =>
    apiFetch<{ success: boolean }>(
      conn,
      `/api/mobile/recommendations/${encodeURIComponent(file)}/action`,
      { method: "POST", body: JSON.stringify({ action }) },
    ),

  projects: (conn: ForgeConnection) =>
    apiFetch<{ projects: ProjectSummary[] }>(conn, "/api/mobile/projects"),

  project: (conn: ForgeConnection, slug: string) =>
    apiFetch<ProjectDetail>(conn, `/api/mobile/projects/${slug}`),

  launchImplementation: (
    conn: ForgeConnection,
    project: string,
    recFile: string,
    approachId: number,
    mode: "plan" | "auto",
  ) =>
    apiFetch<{ success: boolean; scopeId: string }>(
      conn,
      "/api/mobile/launch/implementation",
      {
        method: "POST",
        body: JSON.stringify({ project, recFile, approachId, mode }),
      },
    ),

  launchAgent: (
    conn: ForgeConnection,
    project: string,
    agentSlug: string,
    prompt?: string,
  ) =>
    apiFetch<{ success: boolean; scopeId: string }>(
      conn,
      "/api/mobile/launch/agent",
      {
        method: "POST",
        body: JSON.stringify({ project, agentSlug, prompt }),
      },
    ),

  ideas: (conn: ForgeConnection, project: string) =>
    apiFetch<{ ideas: Idea[] }>(
      conn,
      `/api/mobile/ideas?project=${encodeURIComponent(project)}`,
    ),

  addIdea: (conn: ForgeConnection, project: string, text: string) =>
    apiFetch<{ success: boolean; idea: Idea }>(conn, "/api/mobile/ideas", {
      method: "POST",
      body: JSON.stringify({ project, text }),
    }),

  analyzeIdea: (conn: ForgeConnection, id: string, project: string) =>
    apiFetch<{ success: boolean; scopeId: string }>(
      conn,
      `/api/mobile/ideas/${encodeURIComponent(id)}/analyze`,
      { method: "POST", body: JSON.stringify({ project }) },
    ),

  promoteIdea: (conn: ForgeConnection, id: string, project: string) =>
    apiFetch<{ success: boolean }>(
      conn,
      `/api/mobile/ideas/${encodeURIComponent(id)}/promote`,
      { method: "POST", body: JSON.stringify({ project }) },
    ),

  dismissIdea: (conn: ForgeConnection, id: string, project: string) =>
    apiFetch<{ success: boolean }>(
      conn,
      `/api/mobile/ideas/${encodeURIComponent(id)}/dismiss`,
      { method: "POST", body: JSON.stringify({ project }) },
    ),
};

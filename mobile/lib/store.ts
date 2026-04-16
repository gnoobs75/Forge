import { create } from "zustand";
import type { ForgeConnection } from "./connection";
import type { SessionInfo } from "./prompt-types";
import type {
  StatusResponse,
  OverviewResponse,
  RecsResponse,
  ProjectSummary,
} from "./api";
import { api } from "./api";
import { ForgeWebSocket } from "./ws";
import { notifySessionNeedsInput } from "./notifications";

interface ForgeStore {
  connection: ForgeConnection | null;
  connected: boolean;
  setConnection: (conn: ForgeConnection | null) => void;

  mobileWs: ForgeWebSocket | null;
  connectWs: () => void;
  disconnectWs: () => void;

  status: StatusResponse | null;
  overview: OverviewResponse | null;
  sessions: SessionInfo[];
  recommendations: RecsResponse["recommendations"];
  projects: ProjectSummary[];

  fetchStatus: () => Promise<void>;
  fetchOverview: () => Promise<void>;
  fetchSessions: () => Promise<void>;
  fetchRecommendations: (project?: string) => Promise<void>;
  fetchProjects: () => Promise<void>;
  refreshAll: () => Promise<void>;

  loading: boolean;
  error: string | null;
}

export const useForgeStore = create<ForgeStore>((set, get) => ({
  connection: null,
  connected: false,
  setConnection: (conn) => set({ connection: conn }),

  mobileWs: null,

  connectWs: () => {
    const { connection } = get();
    if (!connection) return;

    const ws = new ForgeWebSocket(connection, "/ws/mobile");

    ws.on("_connected", () => set({ connected: true }));
    ws.on("_disconnected", () => set({ connected: false }));

    ws.on("session:needs-input", (msg) => {
      const { scopeId, agent, project } = msg.data as Record<string, string>;
      notifySessionNeedsInput(scopeId, agent, project);
      get().fetchSessions();
    });

    ws.on("session:complete", () => {
      get().fetchSessions();
    });

    ws.on("activity:new", () => {
      get().fetchOverview();
    });

    ws.connect();
    set({ mobileWs: ws });
  },

  disconnectWs: () => {
    get().mobileWs?.disconnect();
    set({ mobileWs: null, connected: false });
  },

  status: null,
  overview: null,
  sessions: [],
  recommendations: [],
  projects: [],
  loading: false,
  error: null,

  fetchStatus: async () => {
    const { connection } = get();
    if (!connection) return;
    try {
      const status = await api.status(connection);
      set({ status, error: null });
    } catch (e) {
      set({ error: (e as Error).message });
    }
  },

  fetchOverview: async () => {
    const { connection } = get();
    if (!connection) return;
    try {
      const overview = await api.overview(connection);
      set({ overview, error: null });
    } catch (e) {
      set({ error: (e as Error).message });
    }
  },

  fetchSessions: async () => {
    const { connection } = get();
    if (!connection) return;
    try {
      const data = await api.sessions(connection);
      set({ sessions: data.sessions, error: null });
    } catch (e) {
      set({ error: (e as Error).message });
    }
  },

  fetchRecommendations: async (project?: string) => {
    const { connection } = get();
    if (!connection) return;
    try {
      const data = await api.recommendations(connection, project);
      set({ recommendations: data.recommendations, error: null });
    } catch (e) {
      set({ error: (e as Error).message });
    }
  },

  fetchProjects: async () => {
    const { connection } = get();
    if (!connection) return;
    try {
      const data = await api.projects(connection);
      set({ projects: data.projects, error: null });
    } catch (e) {
      set({ error: (e as Error).message });
    }
  },

  refreshAll: async () => {
    set({ loading: true });
    const { fetchStatus, fetchOverview, fetchSessions, fetchRecommendations, fetchProjects } = get();
    await Promise.allSettled([
      fetchStatus(),
      fetchOverview(),
      fetchSessions(),
      fetchRecommendations(),
      fetchProjects(),
    ]);
    set({ loading: false });
  },
}));

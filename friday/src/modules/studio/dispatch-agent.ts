import * as fs from "node:fs";
import * as path from "node:path";
import type { FridayTool, ToolResult } from "../types.ts";
import { findAgent, findProject, listAgentSlugs, listProjectSlugs, type DispatchRecord } from "./types.ts";
import { writeMeterRecord, estimateTokens, meterRecordId } from "./metering.ts";
import { agentsDir as AGENTS_DIR, forgeRoot } from "../../config/paths.ts";

const MAX_CONCURRENT = 3;
const dispatches = new Map<string, DispatchRecord>();

/** Broadcast function — set by the server after boot to relay commands to Electron */
let broadcastFn: ((msg: Record<string, unknown>) => void) | null = null;

export function setBroadcast(fn: (msg: Record<string, unknown>) => void): void {
	broadcastFn = fn;
}

export function getActiveDispatches(): DispatchRecord[] {
	return [...dispatches.values()].filter((d) => d.status === "running");
}

export const dispatchAgent: FridayTool = {
	name: "studio.dispatch_agent",
	description:
		"Dispatch a Forge agent to work on a project. Spawns a visible Claude Code terminal session in the dashboard. The agent loads its skill file and project context automatically.",
	parameters: [
		{ name: "agent", type: "string", description: `Agent slug. Available: ${listAgentSlugs().join(", ")}`, required: true },
		{ name: "project", type: "string", description: `Project slug. Available: ${listProjectSlugs().join(", ")}`, required: true },
		{ name: "prompt", type: "string", description: "Instructions for the agent", required: false },
	],
	clearance: ["exec-shell"],
	async execute(args, _context) {
		const { agent: agentSlug, project: projectSlug, prompt } = args as any;

		const agentInfo = findAgent(agentSlug);
		if (!agentInfo) {
			return { success: false, output: "", error: `Unknown agent: ${agentSlug}. Available: ${listAgentSlugs().join(", ")}` };
		}

		const projectInfo = findProject(projectSlug);
		if (!projectInfo) {
			return { success: false, output: "", error: `Unknown project: ${projectSlug}. Available: ${listProjectSlugs().join(", ")}` };
		}

		const skillPath = path.join(AGENTS_DIR, agentInfo.skillFile);
		if (!fs.existsSync(skillPath)) {
			return { success: false, output: "", error: `Agent skill file not found: ${skillPath}` };
		}

		const active = getActiveDispatches();
		if (active.length >= MAX_CONCURRENT) {
			return { success: false, output: "", error: `Max concurrent dispatches (${MAX_CONCURRENT}). Active: ${active.map((d) => d.agent).join(", ")}` };
		}

		const id = crypto.randomUUID();
		const record: DispatchRecord = {
			id,
			agent: agentInfo.name,
			agentSlug,
			project: projectSlug,
			prompt: prompt || "",
			startedAt: new Date(),
			status: "running",
		};
		dispatches.set(id, record);

		const instruction = prompt || `Analyze the ${projectSlug} project and provide recommendations based on your specialty.`;

		if (broadcastFn) {
			console.log(`[Studio:Dispatch] Broadcasting forge:command spawn-agent: agent=${agentSlug} project=${projectSlug}`);
			// Send forge:command to Electron — spawns a visible PTY terminal in the dashboard
			broadcastFn({
				type: "forge:command",
				commandId: id,
				command: "spawn-agent",
				args: {
					agent: agentSlug,
					project: projectSlug,
					instruction,
				},
				confirmRequired: false,
			});

			return {
				success: true,
				output: `Dispatched ${agentInfo.name} to work on ${projectInfo.name}. You'll see the terminal session appear in the dashboard.`,
			};
		}

		// Fallback: no broadcast available (standalone mode) — spawn background process
		console.warn("[Studio] No broadcast function — falling back to background Bun.spawn");
		const proc = Bun.spawn(["claude", "-p", instruction], {
			cwd: projectInfo.repoPath ?? forgeRoot,
			stdout: "pipe",
			stderr: "pipe",
		});

		proc.exited.then(async (code) => {
			const stdout = await new Response(proc.stdout).text();
			record.status = code === 0 ? "completed" : "failed";
			record.output = stdout.slice(0, 65536);
			record.completedAt = new Date();
			record.durationMs = Date.now() - record.startedAt.getTime();
			try {
				const outputText = record.output ?? "";
				const tokenEst = estimateTokens(instruction.length, outputText.length);
				writeMeterRecord({
					id: meterRecordId(),
					timestamp: new Date().toISOString(),
					provider: "claude",
					model: "claude-code",
					source: "agent-dispatch",
					agent: record.agent,
					agentSlug: record.agentSlug,
					project: record.project,
					linkType: null,
					linkId: null,
					tokens: tokenEst,
					durationMs: record.durationMs!,
					status: record.status === "completed" ? "completed" : "failed",
				});
			} catch { /* Metering must never break dispatch */ }
		}).catch((err) => {
			record.status = "failed";
			record.error = err instanceof Error ? err.message : String(err);
			record.completedAt = new Date();
			record.durationMs = Date.now() - record.startedAt.getTime();
			try {
				const tokenEst = estimateTokens(instruction.length, 0);
				writeMeterRecord({
					id: meterRecordId(),
					timestamp: new Date().toISOString(),
					provider: "claude",
					model: "claude-code",
					source: "agent-dispatch",
					agent: record.agent,
					agentSlug: record.agentSlug,
					project: record.project,
					linkType: null,
					linkId: null,
					tokens: tokenEst,
					durationMs: record.durationMs!,
					status: "failed",
				});
			} catch { /* Metering must never break dispatch */ }
		});

		return {
			success: true,
			output: `Dispatched ${agentInfo.name} (background mode). No terminal UI available.`,
		};
	},
};

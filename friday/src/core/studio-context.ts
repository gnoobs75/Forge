/**
 * Studio Context Loader — reads HQ data and builds a comprehensive briefing
 * for Friday's system prompt. Gives her full awareness of all Forge projects,
 * agents, recommendations, and activity.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { hqData } from "../config/paths.ts";

function findHqDataDir(): string | null {
	try {
		if (fs.existsSync(path.join(hqData, "projects"))) return hqData;
	} catch {}
	return null;
}

function readJsonSafe(filePath: string): any {
	try {
		return JSON.parse(fs.readFileSync(filePath, "utf-8"));
	} catch {
		return null;
	}
}

function readTextSafe(filePath: string): string {
	try {
		return fs.readFileSync(filePath, "utf-8");
	} catch {
		return "";
	}
}

interface ProjectBrief {
	slug: string;
	name: string;
	genre: string;
	platform: string;
	phase: string;
	progress: number;
	monetization: string;
	repo: string;
	verdict?: string;
	blockers: string[];
	categories: Record<string, number>;
	recentRecs: RecommendationSummary[];
}

interface RecommendationSummary {
	date: string;
	agent: string;
	title: string;
	status: string;
}

function loadProjectBrief(
	hqDir: string,
	slug: string,
): ProjectBrief | null {
	const projDir = path.join(hqDir, "projects", slug);
	const project = readJsonSafe(path.join(projDir, "project.json"));
	const progress = readJsonSafe(path.join(projDir, "progress.json"));
	if (!project) return null;

	// Extract category scores from progress
	const categories: Record<string, number> = {};
	if (progress?.categories) {
		for (const [key, val] of Object.entries(progress.categories)) {
			categories[key] = (val as any)?.score ?? (val as any)?.progress ?? 0;
		}
	}

	// Extract blockers
	const blockers: string[] = [];
	if (progress?.blockers) {
		for (const b of progress.blockers) {
			const status = b.resolved ? "RESOLVED" : b.severity || "P1";
			blockers.push(`[${status}] ${b.name || b.description || b.id}`);
		}
	}

	// Load recent recommendations (latest 8 per project)
	const recsDir = path.join(projDir, "recommendations");
	const recentRecs: RecommendationSummary[] = [];
	try {
		const files = fs
			.readdirSync(recsDir)
			.filter((f) => f.endsWith(".json"))
			.sort()
			.reverse()
			.slice(0, 8);

		for (const file of files) {
			const rec = readJsonSafe(path.join(recsDir, file));
			if (rec) {
				recentRecs.push({
					date: file.slice(0, 10),
					agent: rec.agent || "Unknown",
					title: rec.title || file,
					status: rec.status || "active",
				});
			}
		}
	} catch {}

	return {
		slug,
		name: project.name || slug,
		genre: project.genre || "",
		platform: Array.isArray(project.platforms)
			? project.platforms.join(", ")
			: project.platform || "",
		phase: project.phase || progress?.phase || "",
		progress: project.progress || progress?.overall || 0,
		monetization: project.monetization || "",
		repo: project.repo || "",
		verdict: progress?.verdict || project.verdict,
		blockers,
		categories,
		recentRecs,
	};
}

function loadRecentActivity(hqDir: string, count = 10): string[] {
	const log = readJsonSafe(path.join(hqDir, "activity-log.json"));
	if (!Array.isArray(log)) return [];
	return log
		.slice(-count)
		.reverse()
		.map(
			(e: any) =>
				`[${e.timestamp?.slice(0, 10) || "?"}] ${e.agent}: ${e.action} (${e.project || "studio"})`,
		);
}

const AGENT_ROSTER = [
	{ name: "Market Analyst", role: "Competitive landscape, pricing, genre trends" },
	{ name: "Store Optimizer", role: "ASO, Steam tags, listing copy" },
	{ name: "Growth Strategist", role: "Launch campaigns, viral mechanics" },
	{ name: "Brand Director", role: "Studio identity, visual consistency" },
	{ name: "Content Producer", role: "Trailers, social posts, press kits" },
	{ name: "Community Manager", role: "Discord, Reddit, TikTok strategy" },
	{ name: "QA Advisor", role: "Launch readiness, quality gates" },
	{ name: "Studio Producer", role: "Priorities, scheduling, cross-project focus" },
	{ name: "Monetization Strategist", role: "Pricing, IAP, Battle Pass, revenue" },
	{ name: "Player Psychologist", role: "Retention, engagement, session design" },
	{ name: "Art Director", role: "Visual QA, art pipeline, Blender MCP" },
	{ name: "Creative Thinker", role: "Bold ideas, cross-genre inspiration" },
	{ name: "Tech Architect", role: "Code architecture, perf, tech debt" },
	{ name: "HR Director", role: "Agent performance, brain audits, council health" },
];

function formatProjectBrief(p: ProjectBrief): string {
	const lines: string[] = [];
	lines.push(`### ${p.name} — ${p.progress}% (${p.phase})`);
	lines.push(`${p.genre} | ${p.platform} | ${p.monetization}`);
	if (p.verdict) lines.push(`**Verdict: ${p.verdict}**`);
	if (p.repo) lines.push(`Repo: ${p.repo}`);

	// Category scores
	if (Object.keys(p.categories).length > 0) {
		const catParts = Object.entries(p.categories)
			.map(([k, v]) => `${k}: ${v}%`)
			.join(", ");
		lines.push(`Scores: ${catParts}`);
	}

	// Blockers
	const activeBlockers = p.blockers.filter(
		(b) => !b.startsWith("[RESOLVED]"),
	);
	if (activeBlockers.length > 0) {
		lines.push(`Blockers: ${activeBlockers.join("; ")}`);
	}

	// Recent recommendations
	if (p.recentRecs.length > 0) {
		lines.push("Recent recommendations:");
		for (const r of p.recentRecs) {
			lines.push(`  - [${r.date}] ${r.agent}: ${r.title} (${r.status})`);
		}
	}

	return lines.join("\n");
}

/**
 * Load full studio context from HQ data.
 * Returns a formatted string for system prompt injection, or empty string if HQ data not found.
 */
export function loadStudioContext(): string {
	const hqDir = findHqDataDir();
	if (!hqDir) {
		console.log("[StudioContext] HQ data directory not found");
		return "";
	}

	console.log(`[StudioContext] Loading from ${hqDir}`);

	// Discover project directories
	const projectsDir = path.join(hqDir, "projects");
	let projectSlugs: string[] = [];
	try {
		projectSlugs = fs
			.readdirSync(projectsDir)
			.filter((d) => {
				try {
					return fs
						.statSync(path.join(projectsDir, d))
						.isDirectory();
				} catch {
					return false;
				}
			})
			.filter((d) => d !== "forge"); // Skip Forge itself
	} catch {
		return "";
	}

	// Load project briefs
	const briefs: ProjectBrief[] = [];
	for (const slug of projectSlugs) {
		const brief = loadProjectBrief(hqDir, slug);
		if (brief) briefs.push(brief);
	}

	// Load activity log
	const activity = loadRecentActivity(hqDir, 10);

	// Build the context string
	const parts: string[] = [];

	parts.push("## Studio Context — Forge Game Studio");
	parts.push(
		"You are the Studio Director for an indie game studio with the following portfolio and team.",
	);
	parts.push(
		"Use this knowledge to give informed, specific answers about project status, recommendations, and next steps.",
	);
	parts.push("");

	// Portfolio overview
	parts.push("### Portfolio Overview");
	for (const b of briefs) {
		parts.push(`- **${b.name}**: ${b.progress}% (${b.phase}) — ${b.genre}, ${b.platform}`);
	}
	parts.push("");

	// Detailed project briefs
	for (const b of briefs) {
		parts.push(formatProjectBrief(b));
		parts.push("");
	}

	// Agent roster
	parts.push("### Council of Agents (14 AI advisors)");
	parts.push("You can dispatch any agent by name. Each specializes in a domain:");
	for (const a of AGENT_ROSTER) {
		parts.push(`- **${a.name}**: ${a.role}`);
	}
	parts.push("");

	// Recent activity
	if (activity.length > 0) {
		parts.push("### Recent Activity");
		for (const a of activity) {
			parts.push(`- ${a}`);
		}
		parts.push("");
	}

	const context = parts.join("\n");
	console.log(
		`[StudioContext] Loaded: ${briefs.length} projects, ${activity.length} activity entries, ${context.length} chars`,
	);
	return context;
}

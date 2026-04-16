import type { LanguageModelV3 } from "@ai-sdk/provider";
import { type FridayConfig, type ConversationMessage, getTextContent } from "./types.ts";
import { GENESIS_TEMPLATE } from "./prompts.ts";
import { createModel, GROK_DEFAULTS } from "../providers/index.ts";
import type { FridayTool } from "../modules/types.ts";
import type { ClearanceManager } from "./clearance.ts";
import type { SmartsStore } from "../smarts/store.ts";
import { type Sensorium, formatDateTime } from "../sensorium/sensorium.ts";
import type { AuditLogger } from "../audit/logger.ts";
import type { SignalBus } from "./events.ts";
import type { ScopedMemory } from "./memory.ts";
import type { NotificationManager } from "./notifications.ts";
import type { Vox } from "./voice/vox.ts";
import { HistoryManager } from "./history-manager.ts";
import type { ChatStream, VoiceChatStream } from "./stream-types.ts";
import { appendInferenceLog } from "../providers/debug-log.ts";
import { buildToolDefinitions, createToolExecutor } from "./tool-bridge.ts";
import { TextWorker } from "./workers/text-worker.ts";
import { VoiceWorker } from "./workers/voice-worker.ts";
import { buildVoiceSystemPrompt } from "./voice/prompt.ts";
import { BrainRouter, type BrainRouterConfig, type RouteContext, BRAIN_ROUTER_DEFAULTS } from "./brain-router.ts";
import { ClaudeBrain, type ClaudeBrainConfig, CLAUDE_BRAIN_DEFAULTS } from "./claude-brain.ts";
import { createPushIterable } from "./workers/push-iterable.ts";
import { writeMeterRecord, meterRecordId } from "../modules/studio/metering.ts";

function fmtDuration(ms: number): string {
	return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`;
}

export interface CortexConfig extends Partial<FridayConfig> {
	injectedModel?: LanguageModelV3;
	clearance?: ClearanceManager;
	maxToolIterations?: number;
	smartsStore?: SmartsStore;
	sensorium?: Sensorium;
	audit?: AuditLogger;
	signals?: SignalBus;
	toolMemory?: ScopedMemory;
	notifications?: NotificationManager;
	genesisPrompt?: string;
	vox?: Vox;
	/** BrainRouter config — enables dual-brain routing */
	brainRouter?: BrainRouter;
	/** ClaudeBrain instance — Claude Code CLI subprocess */
	claudeBrain?: ClaudeBrain;
	debug?: boolean;
	projectRoot?: string;
	/** Per-step inference timeout in ms (default: 120000 = 2 min) */
	inferenceTimeout?: number;
	/** Studio context briefing injected at boot (HQ data summary) */
	studioContext?: string;
}

export class Cortex {
	private aiModel: LanguageModelV3;
	private historyManager: HistoryManager;

	// Shared
	private _modelName: string;
	private maxTokens: number;
	private tools: Map<string, FridayTool> = new Map();
	private clearance?: ClearanceManager;
	private maxToolIterations: number;
	private smartsStore?: SmartsStore;
	private sensorium?: Sensorium;
	private audit?: AuditLogger;
	private signals?: SignalBus;
	private toolMemory?: ScopedMemory;
	private notifications?: NotificationManager;
	private pinnedSmarts = new Set<string>();
	private genesisPrompt?: string;
	private studioContext?: string;
	private vox?: Vox;
	private _debug: boolean;
	private debugPayloadPath?: string;
	private debugResponsePath?: string;
	private brainRouter?: BrainRouter;
	private claudeBrain?: ClaudeBrain;
	private lastBrain?: "grok" | "claude";
	private readonly textWorker: TextWorker;
	private readonly inferenceTimeout: number;
	private _cachedDefs: ReturnType<typeof buildToolDefinitions> | null = null;
	private _cachedExecutor: ReturnType<typeof createToolExecutor> | null = null;
	private _customVoiceIdentity?: string;
	private _customDeliveryRules?: string;

	constructor(config: CortexConfig = {}) {
		this._modelName = config.model ?? GROK_DEFAULTS.model;
		this.maxTokens = config.maxTokens ?? 12288;
		this.maxToolIterations = config.maxToolIterations ?? 10;

		this.aiModel = config.injectedModel ?? createModel(this._modelName);

		this.historyManager = new HistoryManager({ maxTokens: 128000 });
		this.clearance = config.clearance;
		this.smartsStore = config.smartsStore;
		this.sensorium = config.sensorium;
		this.audit = config.audit;
		this.signals = config.signals;
		this.toolMemory = config.toolMemory;
		this.notifications = config.notifications;
		this.genesisPrompt = config.genesisPrompt;
		this.studioContext = config.studioContext;
		this.vox = config.vox;
		this._debug = config.debug ?? false;
		if (this._debug && config.projectRoot) {
			this.debugPayloadPath = `${config.projectRoot}/last-inference-payload.log`;
			this.debugResponsePath = `${config.projectRoot}/last-inference-response.log`;
		}
		this.brainRouter = config.brainRouter;
		this.claudeBrain = config.claudeBrain;
		this.textWorker = new TextWorker(this.aiModel);
		this.inferenceTimeout = config.inferenceTimeout ?? 120_000;
	}

	get modelName(): string {
		return this._modelName;
	}

	get availableTools(): FridayTool[] {
		return [...this.tools.values()];
	}

	get historyLength(): number {
		return this.historyManager.length;
	}

	registerTool(tool: FridayTool): void {
		this.tools.set(tool.name, tool);
		this._cachedDefs = null;
		this._cachedExecutor = null;
	}

	pinSmart(name: string): void {
		this.pinnedSmarts.add(name);
	}

	unpinSmart(name: string): void {
		this.pinnedSmarts.delete(name);
	}

	/** Update the custom voice persona used by chatStreamVoice(). */
	setVoicePersona(identity?: string, deliveryRules?: string): void {
		this._customVoiceIdentity = identity;
		this._customDeliveryRules = deliveryRules;
	}

	async chatStream(userMessage: string): Promise<ChatStream> {
		const startTime = Date.now();
		const { systemPrompt, defs, executor } = await this.prepareTurn(userMessage);

		const inferenceStart = Date.now();
		this.audit?.log({
			action: "inference:start",
			source: "cortex",
			detail: `model=${this._modelName} tools=${defs.length}`,
			success: true,
		});

		if (this._debug) {
			this.audit?.log({
				action: "debug:system-prompt",
				source: "cortex",
				detail: systemPrompt,
				success: true,
			});
			if (this.debugPayloadPath && this.debugResponsePath) {
				try {
					await Promise.all([
						Bun.write(this.debugPayloadPath, ""),
						Bun.write(this.debugResponsePath, ""),
					]);
				} catch {
					this.audit?.log({
						action: "debug:inference-write-failed",
						source: "cortex",
						detail: "Failed to clear inference log files",
						success: false,
					});
				}
			}
		}

		if (this._debug && this.debugPayloadPath) {
			appendInferenceLog(this.debugPayloadPath, 1, {
				system: systemPrompt,
				messages: this.historyManager.toMessages(),
				maxOutputTokens: this.maxTokens,
			});
		}

		// Delegate to TextWorker
		const workerResult = this.textWorker.process({
			systemPrompt,
			messages: this.historyManager.toMessages(),
			tools: defs,
			executeTool: executor,
			maxToolIterations: this.maxToolIterations,
			maxOutputTokens: this.maxTokens,
			stepTimeoutMs: this.inferenceTimeout,
		});

		const fullTextPromise = workerResult.fullText.then(
			async (text: string) => {
				const duration = fmtDuration(Date.now() - inferenceStart);
				this.audit?.log({
					action: "inference:complete",
					source: "cortex",
					detail: `${duration}, ${text.length} chars`,
					success: true,
				});

				this.historyManager.push({ role: "assistant", content: text });

				if (this._debug && this.debugResponsePath) {
					appendInferenceLog(this.debugResponsePath, 1, { text });
				}

				const usage = await workerResult.usage;
				if (usage?.inputTokens != null && usage?.outputTokens != null) {
					this.historyManager.recordUsage(
						usage.inputTokens + usage.outputTokens,
					);
				}

				try {
					writeMeterRecord({
						id: meterRecordId(),
						timestamp: new Date().toISOString(),
						provider: "grok",
						model: this._modelName ?? "grok-unknown",
						source: "friday-inference",
						agent: null,
						agentSlug: null,
						project: null,
						linkType: null,
						linkId: null,
						tokens: {
							input: usage?.inputTokens ?? 0,
							output: usage?.outputTokens ?? 0,
							total: (usage?.inputTokens ?? 0) + (usage?.outputTokens ?? 0),
							estimated: false,
						},
						durationMs: Date.now() - startTime,
						status: "completed",
					});
				} catch { /* Metering must never break inference */ }

				if (this.vox && this.vox.mode !== "off") {
					this.vox.speak(text).catch(() => {});
				}
				return text;
			},
			(err) => {
				const errDuration = fmtDuration(Date.now() - inferenceStart);
				this.audit?.log({
					action: "inference:error",
					source: "cortex",
					detail: `${errDuration}: ${err instanceof Error ? err.message : String(err)}`,
					success: false,
				});
				throw err;
			},
		);

		return {
			textStream: workerResult.textStream,
			fullText: fullTextPromise,
			usage: workerResult.usage,
		};
	}

	async chatStreamVoice(
		userMessage: string,
		voiceWorker: VoiceWorker,
	): Promise<VoiceChatStream> {
		const { systemPrompt, defs, executor } = await this.prepareTurn(userMessage);

		// Enrich with voice delivery guidance (identity + delivery rules)
		const voicePrompt = buildVoiceSystemPrompt(
			systemPrompt,
			this._customVoiceIdentity,
			this._customDeliveryRules,
		);

		// Delegate to VoiceWorker (messages not needed — Grok has its own conversation context)
		const workerResult = voiceWorker.process({
			systemPrompt: voicePrompt,
			messages: [],
			tools: defs,
			executeTool: executor,
			maxToolIterations: this.maxToolIterations,
			maxOutputTokens: this.maxTokens,
		});

		// Record in history when complete — do NOT fire Vox (Grok speaks directly)
		const fullTextPromise = workerResult.fullText.then(
			async (text: string) => {
				this.historyManager.push({ role: "assistant", content: text });

				const usage = await workerResult.usage;
				if (
					usage?.inputTokens != null &&
					usage?.outputTokens != null
				) {
					this.historyManager.recordUsage(
						usage.inputTokens + usage.outputTokens,
					);
				}
				return text;
			},
		);

		return {
			textStream: workerResult.textStream,
			audioStream: workerResult.audioStream!,
			toolEvents: workerResult.toolEvents,
			fullText: fullTextPromise,
			usage: workerResult.usage,
		};
	}

	async chat(userMessage: string): Promise<string> {
		const startLength = this.historyManager.length;
		try {
			const stream = await this.chatStream(userMessage);
			return await stream.fullText;
		} catch (err) {
			this.historyManager.truncateTo(startLength);
			throw err;
		}
	}

	async chatWithRouting(
		userMessage: string,
		routeContext?: Partial<RouteContext>,
	): Promise<ChatStream> {
		// If no brain router configured, fall through to Grok
		if (!this.brainRouter || !this.claudeBrain) {
			return this.chatStream(userMessage);
		}

		const ctx: RouteContext = {
			isVoice: false,
			previousBrain: this.lastBrain,
			...routeContext,
		};

		const decision = this.brainRouter.route(userMessage, ctx);
		this.lastBrain = decision.brain;
		const messageToProcess = decision.strippedMessage;

		if (decision.brain === "grok") {
			const stream = await this.chatStream(messageToProcess);
			return { ...stream, brain: "grok" };
		}

		// Claude path — subprocess
		const start = Date.now();
		const systemContext = await this.buildSystemPrompt(messageToProcess);

		this.audit?.log({
			action: "inference:start",
			source: "claude-brain",
			detail: `routing=${decision.reason}`,
			success: true,
		});

		try {
			const response = await this.claudeBrain.reason(
				messageToProcess,
				`<system>\n${systemContext}\n</system>`,
				{ isVoice: ctx.isVoice },
			);

			const durationMs = response.durationMs;
			this.audit?.log({
				action: "inference:complete",
				source: "claude-brain",
				detail: `${durationMs}ms, ${response.text.length} chars`,
				success: true,
			});

			// Record in history
			this.historyManager.push({ role: "user", content: messageToProcess });
			this.historyManager.push({ role: "assistant", content: response.text });

			// Wrap response as ChatStream using PushIterable
			const textPush = createPushIterable<string>({ collect: true });

			const chunkSize = 100;
			for (let i = 0; i < response.text.length; i += chunkSize) {
				textPush.push(response.text.slice(i, i + chunkSize));
			}
			textPush.done();

			// Speak via Vox if enabled (Claude doesn't use VoiceWorker)
			if (this.vox && this.vox.mode !== "off" && !ctx.isVoice) {
				this.vox.speak(response.text).catch(() => {});
			}

			return {
				textStream: textPush.iterable,
				fullText: Promise.resolve(response.text),
				usage: Promise.resolve({
					inputTokens: 0,
					outputTokens: response.text.length,
				}),
				brain: "claude",
				durationMs,
			};
		} catch (err) {
			this.audit?.log({
				action: "inference:error",
				source: "claude-brain",
				detail: err instanceof Error ? err.message : String(err),
				success: false,
			});
			// Fall back to Grok
			this.lastBrain = "grok";
			const stream = await this.chatStream(messageToProcess);
			return { ...stream, brain: "grok" };
		}
	}

	// ── Turn preparation ────────────────────────────────────────

	private async prepareTurn(userMessage: string) {
		await this.historyManager.compact();
		const systemPrompt = await this.buildSystemPrompt(userMessage);
		this.historyManager.push({ role: "user", content: userMessage });

		const defs = (this._cachedDefs ??= buildToolDefinitions(this.tools));
		const executor = (this._cachedExecutor ??= createToolExecutor({
			tools: this.tools,
			clearance: this.clearance,
			audit: this.audit,
			signals: this.signals,
			toolMemory: this.toolMemory,
			notifications: this.notifications,
		}));

		return { systemPrompt, defs, executor };
	}

	// ── History management ───────────────────────────────────────

	clearHistory(): void {
		this.historyManager.clear();
	}

	setHistory(messages: ConversationMessage[]): void {
		this.historyManager.setHistory(
			messages.map((m) => ({
				role: m.role as "user" | "assistant",
				content:
					typeof m.content === "string"
						? m.content
						: JSON.stringify(m.content),
			})),
		);
	}

	getHistory(): ConversationMessage[] {
		return this.historyManager.getHistory().map((m) => ({
			role: m.role as "user" | "assistant",
			content: typeof m.content === "string" ? m.content : JSON.stringify(m.content),
		}));
	}

	getRecentHistory(n: number): string[] {
		return this.getHistory().slice(-n).map((m) => {
			const role = m.role === "user" ? "User" : "Assistant";
			return `${role}: ${getTextContent(m.content)}`;
		});
	}

	// ── System prompt builder ────────────────────────────────────

	private async buildSystemPrompt(userMessage: string): Promise<string> {
		const MAX_SMARTS_SECTIONS = 8;
		const MAX_SMARTS_CHARS = 4000;

		let prompt = this.genesisPrompt ?? GENESIS_TEMPLATE;

		// SMARTS knowledge enrichment
		if (this.smartsStore) {
			const sections: string[] = [];
			let totalChars = 0;

			// Parallel fetch — pinned smarts are independent reads
			const pinnedEntries = this.pinnedSmarts.size > 0
				? await Promise.all(
					[...this.pinnedSmarts].map(name => this.smartsStore!.getByName(name))
				)
				: [];
			for (const entry of pinnedEntries) {
				if (
					sections.length >= MAX_SMARTS_SECTIONS ||
					totalChars >= MAX_SMARTS_CHARS
				)
					break;
				if (entry) {
					const title =
						entry.content.split("\n")[0]?.replace(/^#+\s*/, "") ||
						entry.name;
					const section = `### ${title} (confidence: ${entry.confidence})\n${entry.content}`;
					sections.push(section);
					totalChars += section.length;
				}
			}

			const relevant =
				await this.smartsStore.findRelevant(userMessage);
			for (const entry of relevant) {
				if (
					sections.length >= MAX_SMARTS_SECTIONS ||
					totalChars >= MAX_SMARTS_CHARS
				)
					break;
				if (this.pinnedSmarts.has(entry.name)) continue;
				const title =
					entry.content.split("\n")[0]?.replace(/^#+\s*/, "") ||
					entry.name;
				const section = `### ${title} (confidence: ${entry.confidence})\n${entry.content}`;
				sections.push(section);
				totalChars += section.length;
			}

			if (sections.length > 0) {
				prompt = `${prompt}\n\n## Active Knowledge\n\nThe following domain knowledge is available for this conversation.\nUse it to inform your responses when relevant.\n\n${sections.join("\n\n")}`;
			}
		}

		// Studio context (HQ data briefing — projects, agents, recommendations)
		if (this.studioContext) {
			prompt = `${prompt}\n\n${this.studioContext}`;
		}

		// Sensorium environment context (includes date/time)
		if (this.sensorium) {
			const envBlock = this.sensorium.getContextBlock();
			if (envBlock) {
				prompt = `${prompt}\n\n## Environment\n\n${envBlock}\n(Cached ambient snapshot — use the getEnvironmentStatus tool for fresh or detailed readings.)`;
			}
		} else {
			prompt = `${prompt}\n\n## Current Time\n\n${formatDateTime()}`;
		}

		return prompt;
	}

}

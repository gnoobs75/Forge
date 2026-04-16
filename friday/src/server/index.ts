import { resolve } from "node:path";
import { FridayRuntime, type RuntimeConfig, type BootStep } from "../core/runtime.ts";
import { WebSocketHandler, type SendFn } from "./handler.ts";
import { SessionHub } from "./session-hub.ts";
import type { ServerMessage } from "./protocol.ts";
import type { ServerWebSocket } from "bun";
import { createAuthChecker } from "./auth.ts";
import {
  mobileRegistry,
  getMobileBridge,
  mobileClients,
  initMobileBridge,
} from "../modules/mobile/index.ts";
import { handleMobileRoute } from "../modules/mobile/routes.ts";
import { findHqDir } from "../modules/studio/hq-utils.ts";
// Studio dispatch broadcast is wired after hub creation (see below)

export interface FridayServerConfig {
	port: number;
	staticDir?: string;
	runtimeConfig?: Partial<RuntimeConfig>;
	onBootProgress?: (step: BootStep, label: string) => void;
}

interface WSData {
	clientId: string;
	handler: WebSocketHandler;
}

const MAX_CONNECTIONS = 10;

export async function createFridayServer(config: FridayServerConfig) {
	const staticDir = config.staticDir ?? resolve("web/dist");
	const authCheck = createAuthChecker(process.env.FRIDAY_REMOTE_TOKEN);

	// Boot singleton runtime BEFORE starting the server.
	// Always boot fresh — SessionHub owns session lifecycle (start/save/clear),
	// so loading previous history at boot would leak stale conversations to clients.
	const runtime = new FridayRuntime();
	await runtime.boot(
		{ ...config.runtimeConfig, fresh: true },
		config.onBootProgress,
	);

	const hub = new SessionHub({
		runtime,
		summarizer: runtime.summarizer,
		curator: runtime.curator,
	});
	const pushIntervals = new Map<string, ReturnType<typeof setInterval>>();

	// Wire studio dispatch → broadcast so agent dispatches appear as visible terminals in Electron
	// Must use dynamic import to get the SAME module instance the loader created
	try {
		const { setBroadcast } = await import("../modules/studio/dispatch-agent.ts");
		setBroadcast((msg) => hub.broadcast(msg as ServerMessage));
		console.log("[Server] Studio dispatch broadcast wired");
	} catch {
		console.log("[Server] Studio module not available — dispatch broadcast not wired");
	}

	// Wire mobile routes → broadcast so launch/agent/ideas endpoints can send forge:command to Electron
	try {
		const { setMobileBroadcast } = await import("../modules/mobile/routes.ts");
		setMobileBroadcast((msg) => hub.broadcast(msg as ServerMessage));
		console.log("[Server] Mobile broadcast wired");
	} catch {
		console.log("[Server] Mobile module not available — broadcast not wired");
	}

	// Initialize mobile terminal bridge — sends terminal commands to Electron via hub broadcast
	initMobileBridge((msg) => hub.broadcast(msg as ServerMessage));
	console.log("[Server] Mobile terminal bridge initialized");

	const server = Bun.serve<WSData>({
		port: config.port,
		async fetch(req, server) {
			const url = new URL(req.url);

			// Mobile WebSocket upgrade
			if (url.pathname === "/ws/mobile" || url.pathname.startsWith("/ws/terminal/")) {
				if (!authCheck(req)) {
					return new Response("Unauthorized", { status: 401 });
				}
				const clientId = crypto.randomUUID();
				const isMobile = url.pathname === "/ws/mobile";
				const termScopeId = !isMobile
					? url.pathname.replace("/ws/terminal/", "")
					: null;
				const upgraded = server.upgrade(req, {
					data: {
						clientId,
						handler: null,
						_mobile: true,
						_termScopeId: termScopeId,
					},
				});
				if (upgraded) return undefined;
				return new Response("WebSocket upgrade failed", { status: 400 });
			}

			// WebSocket upgrade
			if (url.pathname === "/ws") {
				if (!authCheck(req)) {
					return new Response("Unauthorized", { status: 401 });
				}

				if (hub.clientCount >= MAX_CONNECTIONS) {
					return new Response("Service Unavailable: connection limit reached", { status: 503 });
				}

				const clientId = crypto.randomUUID();
				const handler = new WebSocketHandler(runtime, hub, clientId);
				const upgraded = server.upgrade(req, {
					data: { clientId, handler },
				});
				if (upgraded) return undefined;
				return new Response("WebSocket upgrade failed", { status: 400 });
			}

			// API route auth guard
			if (url.pathname.startsWith("/api/") && !authCheck(req)) {
				return new Response("Unauthorized", { status: 401 });
			}

			// REST voice endpoint — single request/response for Shortcuts/Watch
			if (url.pathname === "/api/voice/turn" && req.method === "POST") {
				const body = await req.text();
				if (!body.trim()) {
					return new Response(JSON.stringify({ error: "Empty message" }), {
						status: 400,
						headers: { "Content-Type": "application/json" },
					});
				}

				try {
					const start = Date.now();
					const stream = await runtime.cortex.chatWithRouting(body.trim());
					const text = await stream.fullText;
					return new Response(JSON.stringify({
						text,
						brain: stream.brain ?? "grok",
						durationMs: stream.durationMs ?? (Date.now() - start),
					}), {
						headers: { "Content-Type": "application/json" },
					});
				} catch (err) {
					return new Response(JSON.stringify({
						error: err instanceof Error ? err.message : String(err),
					}), { status: 500, headers: { "Content-Type": "application/json" } });
				}
			}

			// Mobile API endpoints
			if (url.pathname.startsWith("/api/mobile/")) {
				if (!authCheck(req)) {
					return new Response("Unauthorized", { status: 401 });
				}
				const hqDir = findHqDir();
				try {
					const mobileResponse = await handleMobileRoute(req, url, mobileRegistry, hqDir);
					if (mobileResponse) return mobileResponse;
					return new Response(JSON.stringify({ error: "Not found" }), {
						status: 404,
						headers: { "Content-Type": "application/json" },
					});
				} catch (err) {
					console.error("[Mobile] Route error:", err);
					return new Response(JSON.stringify({ error: String(err) }), {
						status: 500,
						headers: { "Content-Type": "application/json" },
					});
				}
			}

			// Static file serving (SPA) — guard against path traversal
			const filePath = url.pathname === "/" ? "/index.html" : url.pathname;
			const resolvedPath = resolve(staticDir, `.${filePath}`);
			if (!resolvedPath.startsWith(`${staticDir}/`)) {
				return new Response("Forbidden", { status: 403 });
			}
			const file = Bun.file(resolvedPath);
			if (await file.exists()) {
				return new Response(file);
			}

			// SPA fallback
			const index = Bun.file(resolve(staticDir, "index.html"));
			if (await index.exists()) {
				return new Response(index);
			}

			return new Response(
				"<html><body><h1>Friday Web UI</h1><p>Run <code>cd web && bun run build</code> first.</p></body></html>",
				{ headers: { "Content-Type": "text/html" } },
			);
		},
		websocket: {
			open(ws: ServerWebSocket<WSData>) {
				const data = ws.data as any;
				if (data._mobile) {
					const send = (msg: Record<string, unknown>) => {
						try {
							if (ws.readyState === 1) ws.send(JSON.stringify(msg));
						} catch {}
					};
					if (data._termScopeId && getMobileBridge()) {
						getMobileBridge().subscribe(data.clientId, data._termScopeId, send);
					} else {
						mobileClients.set(data.clientId, send);
						send({
							type: "mobile:welcome",
							clientId: data.clientId,
							sessionCount: mobileRegistry.listAll().length,
							alertCount: mobileRegistry.listWaiting().length,
						});
					}
				}
				// Non-mobile client registered when they send session:identify
			},
			async message(ws: ServerWebSocket<WSData>, message: string | Buffer) {
				const wsData = ws.data as any;
				if (wsData._mobile && typeof message === "string") {
					try {
						const msg = JSON.parse(message);
						if (msg.type === "mobile:terminal:input" && getMobileBridge()) {
							getMobileBridge().sendInput(msg.scopeId, msg.data);
						}
					} catch {}
					return;
				}

				if (typeof message !== "string") {
					// Binary frame = audio data from voice client
					const buf = Buffer.isBuffer(message) ? message : Buffer.from(message as ArrayBuffer);
					// Debug first few chunks
					const handler = ws.data.handler as any;
					if (!handler._binaryCount) handler._binaryCount = 0;
					handler._binaryCount++;
					if (handler._binaryCount <= 3 || handler._binaryCount % 100 === 0) {
						console.log(`[Server] Binary frame #${handler._binaryCount}: ${buf.byteLength} bytes, isBuffer=${Buffer.isBuffer(message)}, type=${typeof message}, constructor=${message?.constructor?.name}`);
					}
					ws.data.handler.handleAudio(buf);
					return;
				}

				const raw = message;
				const send: SendFn = (msg: ServerMessage) => {
					try {
						if (ws.readyState === 1) {
							ws.send(JSON.stringify(msg));
						}
					} catch { /* connection may have closed */ }
				};
				await ws.data.handler.handle(raw, send);

				// Set up Sensorium push after identify
				if (
					runtime.isBooted &&
					runtime.sensorium &&
					!pushIntervals.has(ws.data.clientId) &&
					hub.getClientById(ws.data.clientId)
				) {
					const interval = setInterval(() => {
						try {
							if (ws.readyState === 1) {
								ws.data.handler.pushSensoriumUpdate(
									(msg: ServerMessage) => {
										ws.send(JSON.stringify(msg));
									},
								);
							}
						} catch {
							// Connection may have closed
						}
					}, 5000);
					pushIntervals.set(ws.data.clientId, interval);
				}
			},
			close(ws: ServerWebSocket<WSData>) {
				const wsCloseData = ws.data as any;
				if (wsCloseData._mobile) {
					mobileClients.delete(wsCloseData.clientId);
					if (getMobileBridge()) getMobileBridge().unsubscribe(wsCloseData.clientId);
					return;
				}

				const interval = pushIntervals.get(ws.data.clientId);
				if (interval) {
					clearInterval(interval);
					pushIntervals.delete(ws.data.clientId);
				}
				ws.data.handler.disconnect();
				void hub.unregisterClient(ws.data.clientId);
				// Do NOT shutdown runtime — it's shared!
			},
		},
	});

	if (process.env.FRIDAY_REMOTE_TOKEN) {
		console.log("  → Remote access enabled (token auth active)");
		console.log(`    Set up a tunnel: cloudflared tunnel run --url http://localhost:${config.port}`);
	}

	return { server, runtime, hub };
}

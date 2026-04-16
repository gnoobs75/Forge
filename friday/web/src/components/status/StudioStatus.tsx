import { useState, useEffect, useRef } from "react";

interface ProjectStatus {
	name: string;
	slug: string;
	progress: number;
	color: string;
}

interface ActivityEntry {
	id: string;
	agent: string;
	action: string;
	project: string;
	timestamp: string;
	agentColor: string;
}

interface SystemHealth {
	cpu: number;
	memory: number;
	uptime: string;
}

// Default project data — will be overridden by server pushes
const DEFAULT_PROJECTS: ProjectStatus[] = [
	{ name: "Expedition", slug: "expedition", progress: 88, color: "#3B82F6" },
	{ name: "TTR iOS", slug: "ttr-ios", progress: 88, color: "#22C55E" },
	{ name: "TTR Roblox", slug: "ttr-roblox", progress: 69, color: "#F97316" },
];

function formatUptime(seconds: number): string {
	const h = Math.floor(seconds / 3600);
	const m = Math.floor((seconds % 3600) / 60);
	if (h > 0) return `${h}h ${m}m`;
	return `${m}m`;
}

function relativeTime(iso: string): string {
	const diff = Date.now() - new Date(iso).getTime();
	const s = Math.floor(diff / 1000);
	if (s < 60) return `${s}s ago`;
	const m = Math.floor(s / 60);
	if (m < 60) return `${m}m ago`;
	const h = Math.floor(m / 60);
	return `${h}h ago`;
}

/** Lightweight studio status dashboard — shows live data from WebSocket pushes */
export function StudioStatus() {
	const [projects] = useState<ProjectStatus[]>(DEFAULT_PROJECTS);
	const [activities, setActivities] = useState<ActivityEntry[]>([]);
	const [health, setHealth] = useState<SystemHealth | null>(null);
	const [wsConnected, setWsConnected] = useState(false);
	const wsRef = useRef<WebSocket | null>(null);

	useEffect(() => {
		const token = localStorage.getItem("friday-remote-token");
		const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
		const wsPort =
			window.location.port || (window.location.protocol === "https:" ? "443" : "80");
		let wsUrl = `${wsProtocol}//${window.location.hostname}:${wsPort}/ws`;
		if (token) wsUrl += `?token=${encodeURIComponent(token)}`;

		const ws = new WebSocket(wsUrl);
		wsRef.current = ws;

		ws.onopen = () => {
			setWsConnected(true);
			ws.send(
				JSON.stringify({
					type: "session:identify",
					id: crypto.randomUUID(),
					clientType: "status",
				}),
			);
		};

		ws.onclose = () => setWsConnected(false);
		ws.onerror = () => setWsConnected(false);

		ws.onmessage = (event) => {
			if (typeof event.data !== "string") return;
			try {
				const msg = JSON.parse(event.data) as Record<string, unknown>;

				if (
					msg.type === "sensorium:update" &&
					msg.snapshot &&
					typeof msg.snapshot === "object"
				) {
					const snap = msg.snapshot as Record<string, unknown>;
					const machine = (snap.machine ?? {}) as Record<string, unknown>;
					const cpuData = (machine.cpu ?? {}) as Record<string, unknown>;
					const memData = (machine.memory ?? {}) as Record<string, unknown>;
					setHealth({
						cpu: typeof cpuData.percent === "number" ? cpuData.percent : 0,
						memory:
							typeof memData.usedPercent === "number" ? memData.usedPercent : 0,
						uptime:
							typeof machine.uptime === "number"
								? formatUptime(machine.uptime)
								: "--",
					});
				}

				if (msg.type === "notification") {
					setActivities((prev) =>
						[
							{
								id: crypto.randomUUID(),
								agent:
									typeof msg.source === "string" ? msg.source : "System",
								action:
									typeof msg.title === "string"
										? msg.title
										: typeof msg.body === "string"
											? msg.body
											: "",
								project:
									typeof msg.project === "string" ? msg.project : "",
								timestamp: new Date().toISOString(),
								agentColor:
									typeof msg.agentColor === "string"
										? msg.agentColor
										: "#E8943A",
							},
							...prev,
						].slice(0, 20),
					);
				}
			} catch {
				// Ignore malformed messages
			}
		};

		return () => {
			ws.close();
		};
	}, []);

	return (
		<div
			className="w-full h-full flex flex-col select-none overflow-hidden"
			style={{ background: "#06060C" }}
		>
			{/* Header */}
			<div
				className="shrink-0 flex items-center justify-between px-5 pt-3 pb-2"
				style={{ paddingTop: "calc(0.75rem + env(safe-area-inset-top, 0px))" }}
			>
				<span
					className="text-xs font-semibold uppercase tracking-widest"
					style={{ color: "#E8943A" }}
				>
					Studio Status
				</span>
				<div className="flex items-center gap-2">
					<div
						className="w-2 h-2 rounded-full"
						style={{
							backgroundColor: wsConnected ? "#4ADE80" : "#8B6914",
							boxShadow: wsConnected ? "0 0 6px rgba(74, 222, 128, 0.5)" : "none",
						}}
					/>
					<span className="text-xs" style={{ color: "#6B5540" }}>
						{wsConnected ? "Live" : "Offline"}
					</span>
				</div>
			</div>

			{/* Scrollable content */}
			<div
				className="flex-1 min-h-0 overflow-y-auto px-4 pb-4"
				style={{ WebkitOverflowScrolling: "touch" }}
			>
				{/* Projects section */}
				<section className="mb-5">
					<h2
						className="text-xs font-semibold uppercase tracking-widest mb-3"
						style={{ color: "#E8943A" }}
					>
						Projects
					</h2>
					<div className="flex flex-col gap-3">
						{projects.map((p) => (
							<div
								key={p.slug}
								className="rounded-xl p-4"
								style={{ background: "rgba(26, 31, 46, 0.6)" }}
							>
								<div className="flex items-center justify-between mb-2">
									<span
										className="text-sm font-medium"
										style={{ color: "#E8E0D4" }}
									>
										{p.name}
									</span>
									<span
										className="text-sm font-semibold tabular-nums"
										style={{ color: p.color }}
									>
										{p.progress}%
									</span>
								</div>
								{/* Progress bar */}
								<div
									className="w-full rounded-full overflow-hidden"
									style={{ height: "4px", background: "rgba(255,255,255,0.06)" }}
								>
									<div
										className="h-full rounded-full transition-all duration-500"
										style={{
											width: `${p.progress}%`,
											background: p.color,
											boxShadow: `0 0 6px ${p.color}60`,
										}}
									/>
								</div>
							</div>
						))}
					</div>
				</section>

				{/* System health */}
				{health && (
					<section className="mb-5">
						<h2
							className="text-xs font-semibold uppercase tracking-widest mb-3"
							style={{ color: "#E8943A" }}
						>
							System
						</h2>
						<div className="flex gap-2 flex-wrap">
							<HealthPill label="CPU" value={`${health.cpu.toFixed(0)}%`} />
							<HealthPill label="RAM" value={`${health.memory.toFixed(0)}%`} />
							<HealthPill label="Uptime" value={health.uptime} />
						</div>
					</section>
				)}

				{/* Activity feed */}
				<section>
					<h2
						className="text-xs font-semibold uppercase tracking-widest mb-3"
						style={{ color: "#E8943A" }}
					>
						Recent Activity
					</h2>
					{activities.length === 0 ? (
						<div
							className="text-sm text-center py-8"
							style={{ color: "#4A4438" }}
						>
							Waiting for agent activity...
						</div>
					) : (
						<div className="flex flex-col gap-2">
							{activities.map((a) => (
								<ActivityRow key={a.id} entry={a} />
							))}
						</div>
					)}
				</section>
			</div>
		</div>
	);
}

function HealthPill({ label, value }: { label: string; value: string }) {
	return (
		<div
			className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs"
			style={{ background: "rgba(26, 31, 46, 0.6)", border: "1px solid rgba(232, 148, 58, 0.1)" }}
		>
			<span style={{ color: "#6B5540" }}>{label}</span>
			<span className="font-semibold tabular-nums" style={{ color: "#E8E0D4" }}>
				{value}
			</span>
		</div>
	);
}

function ActivityRow({ entry }: { entry: ActivityEntry }) {
	return (
		<div
			className="flex items-start gap-3 px-4 py-3 rounded-xl"
			style={{ background: "rgba(26, 31, 46, 0.4)" }}
		>
			{/* Agent color dot */}
			<div
				className="shrink-0 w-2 h-2 rounded-full mt-1.5"
				style={{ backgroundColor: entry.agentColor }}
			/>
			<div className="flex-1 min-w-0">
				<div className="flex items-baseline gap-2 flex-wrap">
					<span
						className="text-xs font-semibold"
						style={{ color: entry.agentColor }}
					>
						{entry.agent}
					</span>
					{entry.project && (
						<span className="text-xs" style={{ color: "#4A4438" }}>
							{entry.project}
						</span>
					)}
				</div>
				{entry.action && (
					<p
						className="text-xs mt-0.5 leading-relaxed"
						style={{ color: "#7A7262" }}
					>
						{entry.action}
					</p>
				)}
			</div>
			<span
				className="shrink-0 text-xs tabular-nums"
				style={{ color: "#4A4438" }}
			>
				{relativeTime(entry.timestamp)}
			</span>
		</div>
	);
}

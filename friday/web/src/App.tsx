import { useState, useEffect, useCallback } from "react";
import { VoiceMode, MobileVoice } from "./components/voice/index.ts";
import { TerminalEmbed } from "./components/terminal/TerminalEmbed.tsx";
import { MenuBar, type AppMode } from "./components/menu/MenuBar.tsx";
import { StudioStatus } from "./components/status/StudioStatus.tsx";
import { useAuth } from "./hooks/useAuth.ts";

// ttyd URL — same host, port 7681, base path /terminal/
const TTYD_URL = `${window.location.protocol}//${window.location.hostname}:7681/terminal/`;

// Server health check — lightweight ping to confirm Friday server is alive
function useServerStatus(intervalMs = 10_000): boolean {
	const [connected, setConnected] = useState(true);

	const check = useCallback(() => {
		fetch("/", { method: "HEAD", cache: "no-store" })
			.then(() => setConnected(true))
			.catch(() => setConnected(false));
	}, []);

	useEffect(() => {
		check();
		const id = setInterval(check, intervalMs);
		return () => clearInterval(id);
	}, [check, intervalMs]);

	return connected;
}

/** Detect mobile devices — phones and small touch screens */
function isMobileDevice(): boolean {
	return (
		/iPhone|iPad|iPod|Android/i.test(navigator.userAgent) ||
		(window.innerWidth <= 768 && "ontouchstart" in window)
	);
}

function getInitialMode(): AppMode {
	const params = new URLSearchParams(window.location.search);
	const modeParam = params.get("mode");
	if (modeParam === "mobile" || modeParam === "voice") {
		if (modeParam === "mobile" || isMobileDevice()) return "mobile";
		return "voice";
	}
	if (isMobileDevice()) return "mobile";
	return "terminal";
}

function TokenGate({ onSubmit }: { onSubmit: (token: string) => void }) {
	const [value, setValue] = useState("");
	const [error, setError] = useState(false);

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		if (!value.trim()) {
			setError(true);
			return;
		}
		onSubmit(value.trim());
	};

	return (
		<div
			className="h-full w-full flex items-center justify-center"
			style={{ background: "radial-gradient(ellipse at center, #0D1117 0%, #06060C 100%)" }}
		>
			<form
				onSubmit={handleSubmit}
				className="flex flex-col items-center gap-6 p-8 max-w-sm w-full"
			>
				<div className="text-center">
					<div
						className="text-2xl font-light mb-2"
						style={{ color: "#E8943A", letterSpacing: "0.3em" }}
					>
						F.R.I.D.A.Y.
					</div>
					<div className="text-sm" style={{ color: "#6B5540" }}>
						Remote Access
					</div>
				</div>
				<input
					type="password"
					value={value}
					onChange={(e) => {
						setValue(e.target.value);
						setError(false);
					}}
					placeholder="Access token"
					autoFocus
					className="w-full px-4 py-3 rounded-lg border text-sm outline-none transition-colors"
					style={{
						background: "rgba(26, 31, 46, 0.8)",
						borderColor: error ? "var(--color-friday-error)" : "rgba(232, 148, 58, 0.2)",
						color: "var(--color-friday-text)",
					}}
				/>
				<button
					type="submit"
					className="w-full py-3 rounded-lg text-sm font-medium transition-all"
					style={{
						background: "linear-gradient(135deg, #D946EF, #7C3AED)",
						color: "white",
					}}
				>
					Connect
				</button>
			</form>
		</div>
	);
}

// ── Mobile tab navigation ────────────────────────────────────────────────────

type MobileTab = "voice" | "status" | "settings";

interface TabButtonProps {
	active: boolean;
	onClick: () => void;
	icon: "mic" | "chart" | "gear";
	label: string;
}

function TabButton({ active, onClick, icon, label }: TabButtonProps) {
	return (
		<button
			type="button"
			onClick={onClick}
			className="flex flex-col items-center gap-1 px-5 py-1 transition-opacity"
			style={{ opacity: active ? 1 : 0.4 }}
		>
			<svg
				width="22"
				height="22"
				viewBox="0 0 24 24"
				fill="none"
				stroke={active ? "#E8943A" : "#7A7262"}
				strokeWidth="2"
				strokeLinecap="round"
				strokeLinejoin="round"
			>
				{icon === "mic" && (
					<>
						<path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
						<path d="M19 10v2a7 7 0 0 1-14 0v-2" />
						<line x1="12" x2="12" y1="19" y2="22" />
					</>
				)}
				{icon === "chart" && (
					<>
						<line x1="18" x2="18" y1="20" y2="10" />
						<line x1="12" x2="12" y1="20" y2="4" />
						<line x1="6" x2="6" y1="20" y2="14" />
					</>
				)}
				{icon === "gear" && (
					<>
						<circle cx="12" cy="12" r="3" />
						<path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
					</>
				)}
			</svg>
			<span
				className="text-xs font-medium"
				style={{ color: active ? "#E8943A" : "#7A7262" }}
			>
				{label}
			</span>
		</button>
	);
}

interface MobileSettingsProps {
	clearToken: () => void;
}

function MobileSettings({ clearToken }: MobileSettingsProps) {
	const host = window.location.hostname;
	const port = window.location.port;

	return (
		<div
			className="w-full h-full flex flex-col select-none overflow-y-auto"
			style={{ background: "#06060C" }}
		>
			{/* Header */}
			<div
				className="shrink-0 px-5 pt-3 pb-2"
				style={{ paddingTop: "calc(0.75rem + env(safe-area-inset-top, 0px))" }}
			>
				<span
					className="text-xs font-semibold uppercase tracking-widest"
					style={{ color: "#E8943A" }}
				>
					Settings
				</span>
			</div>

			<div className="flex-1 px-4 pb-4 flex flex-col gap-4">
				{/* Connection info */}
				<div
					className="rounded-xl p-4"
					style={{ background: "rgba(26, 31, 46, 0.6)" }}
				>
					<h3
						className="text-xs font-semibold uppercase tracking-widest mb-3"
						style={{ color: "#E8943A" }}
					>
						Connection
					</h3>
					<div className="flex flex-col gap-2">
						<InfoRow label="Host" value={host} />
						{port && <InfoRow label="Port" value={port} />}
						<InfoRow label="Protocol" value={window.location.protocol.replace(":", "")} />
					</div>
				</div>

				{/* Version info */}
				<div
					className="rounded-xl p-4"
					style={{ background: "rgba(26, 31, 46, 0.6)" }}
				>
					<h3
						className="text-xs font-semibold uppercase tracking-widest mb-3"
						style={{ color: "#E8943A" }}
					>
						About
					</h3>
					<div className="flex flex-col gap-2">
						<InfoRow label="App" value="F.R.I.D.A.Y. Remote" />
						<InfoRow label="Build" value="remote-access" />
					</div>
				</div>

				{/* Danger zone */}
				<div
					className="rounded-xl p-4"
					style={{
						background: "rgba(26, 31, 46, 0.6)",
						border: "1px solid rgba(248, 113, 113, 0.1)",
					}}
				>
					<h3
						className="text-xs font-semibold uppercase tracking-widest mb-3"
						style={{ color: "#F87171" }}
					>
						Session
					</h3>
					<button
						type="button"
						onClick={clearToken}
						className="w-full py-2.5 rounded-lg text-sm font-medium transition-all"
						style={{
							background: "rgba(248, 113, 113, 0.1)",
							color: "#F87171",
							border: "1px solid rgba(248, 113, 113, 0.2)",
						}}
					>
						Clear Token &amp; Disconnect
					</button>
				</div>
			</div>
		</div>
	);
}

function InfoRow({ label, value }: { label: string; value: string }) {
	return (
		<div className="flex items-center justify-between">
			<span className="text-xs" style={{ color: "#6B5540" }}>
				{label}
			</span>
			<span className="text-xs font-medium" style={{ color: "#E8E0D4" }}>
				{value}
			</span>
		</div>
	);
}

// ── App root ─────────────────────────────────────────────────────────────────

export function App() {
	const [mode, setMode] = useState<AppMode>(getInitialMode);
	const [mobileTab, setMobileTab] = useState<MobileTab>("voice");
	const connected = useServerStatus();
	const { setToken, clearToken, needsAuth, isAuthenticated } = useAuth();

	if (needsAuth && !isAuthenticated) {
		return <TokenGate onSubmit={setToken} />;
	}

	const handleModeChange = (newMode: AppMode) => {
		setMode(newMode);
		// Sync URL without page reload for bookmarkability
		const url = new URL(window.location.href);
		if (newMode === "terminal") {
			url.searchParams.delete("mode");
		} else {
			url.searchParams.set("mode", newMode);
		}
		window.history.replaceState({}, "", url.toString());
	};

	// Mobile mode — tab layout: Voice / Status / Settings
	if (mode === "mobile") {
		return (
			<div
				className="fixed inset-0 flex flex-col"
				style={{ background: "#06060C" }}
			>
				{/* Tab content — fills remaining space above nav bar */}
				<div className="flex-1 min-h-0 relative overflow-hidden">
					{mobileTab === "voice" && <MobileVoice />}
					{mobileTab === "status" && <StudioStatus />}
					{mobileTab === "settings" && <MobileSettings clearToken={clearToken} />}
				</div>

				{/* Bottom tab bar */}
				<nav
					className="shrink-0 flex items-center justify-around"
					style={{
						background: "rgba(11, 14, 20, 0.95)",
						backdropFilter: "blur(12px)",
						borderTop: "1px solid rgba(232, 148, 58, 0.08)",
						paddingBottom: "env(safe-area-inset-bottom, 0px)",
						height: "56px",
					}}
				>
					<TabButton
						active={mobileTab === "voice"}
						onClick={() => setMobileTab("voice")}
						icon="mic"
						label="Voice"
					/>
					<TabButton
						active={mobileTab === "status"}
						onClick={() => setMobileTab("status")}
						icon="chart"
						label="Status"
					/>
					<TabButton
						active={mobileTab === "settings"}
						onClick={() => setMobileTab("settings")}
						icon="gear"
						label="Settings"
					/>
				</nav>

				<div className="noise-overlay" />
			</div>
		);
	}

	return (
		<div className="h-full w-full flex flex-col overflow-hidden">
			<MenuBar
				activeMode={mode}
				onModeChange={handleModeChange}
				connected={connected}
			/>

			{/* Terminal — always rendered, CSS-hidden when inactive to preserve iframe session */}
			<div
				className="flex-1 min-h-0 overflow-hidden relative"
				style={{ display: mode === "terminal" ? undefined : "none" }}
			>
				<TerminalEmbed src={TTYD_URL} />

				{/* Ambient vignette — softens edges, adds depth to raw iframe */}
				<div
					className="absolute inset-0 pointer-events-none z-10"
					style={{
						background:
							"radial-gradient(ellipse at center, transparent 55%, rgba(0, 0, 0, 0.4) 100%)",
					}}
				/>
			</div>

			{/* Voice — conditionally rendered to save resources (canvas, audio, WebSocket) */}
			{mode === "voice" && (
				<div className="flex-1 min-h-0 relative overflow-hidden">
					<VoiceMode />
				</div>
			)}

			{/* Atmospheric noise grain — unified across both modes */}
			<div className="noise-overlay" />
		</div>
	);
}

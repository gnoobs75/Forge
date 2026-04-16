import { useState, useEffect, useCallback, useRef } from "react";
import { useVoiceSession } from "../../hooks/useVoiceSession.ts";
import { useVoiceAudio } from "../../hooks/useVoiceAudio.ts";
import type { VoiceState } from "./types.ts";

const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
const wsPort =
	window.location.port ||
	(window.location.protocol === "https:" ? "443" : "80");
const WS_URL = `${wsProtocol}//${window.location.hostname}:${wsPort}/ws`;

interface TranscriptMessage {
	id: string;
	role: "user" | "assistant";
	text: string;
	timestamp: number;
}

/** Full-screen mobile voice interface — touch-hold PTT, optimized for phones */
export function MobileVoice() {
	const voice = useVoiceSession({ wsUrl: WS_URL });

	const handleAudioChunk = useCallback(
		(pcmBuffer: ArrayBuffer) => {
			voice.sendAudio(pcmBuffer);
		},
		[voice.sendAudio],
	);

	const audio = useVoiceAudio(handleAudioChunk);

	// Wire audio playback
	useEffect(() => {
		voice.onAudioReceived((base64) => audio.playAudio(base64));
	}, [voice.onAudioReceived, audio.playAudio]);

	// Barge-in
	useEffect(() => {
		if (voice.state === "listening") audio.stopPlayback();
	}, [voice.state, audio.stopPlayback]);

	// Auto-start session
	useEffect(() => {
		if (voice.isConnected && !voice.sessionActive) voice.startSession();
	}, [voice.isConnected, voice.sessionActive, voice.startSession]);

	// Auto-start mic
	useEffect(() => {
		if (voice.sessionActive && !audio.isCapturing) {
			audio.startCapture().catch(console.error);
		}
		if (!voice.sessionActive && audio.isCapturing) {
			audio.stopCapture();
			audio.stopPlayback();
		}
	}, [
		voice.sessionActive,
		audio.isCapturing,
		audio.startCapture,
		audio.stopCapture,
		audio.stopPlayback,
	]);

	// WakeLock — prevent screen sleep during voice session
	useEffect(() => {
		let wakeLock: WakeLockSentinel | null = null;
		if ("wakeLock" in navigator && voice.sessionActive) {
			navigator.wakeLock
				.request("screen")
				.then((wl) => {
					wakeLock = wl;
				})
				.catch(() => {});
		}
		return () => {
			wakeLock?.release();
		};
	}, [voice.sessionActive]);

	// iOS audio unlock on first touch gesture
	const audioUnlocked = useRef(false);
	const unlockAudio = useCallback(() => {
		if (audioUnlocked.current) return;
		audioUnlocked.current = true;
		const ctx = new AudioContext();
		ctx.resume().then(() => ctx.close());
	}, []);

	// ── Transcript tracking ──────────────────────────────────────
	const [messages, setMessages] = useState<TranscriptMessage[]>([]);
	const transcriptRef = useRef<HTMLDivElement>(null);
	const assistantBufferRef = useRef("");
	const prevStateRef = useRef<VoiceState>("idle");

	useEffect(() => {
		const prev = prevStateRef.current;
		const curr = voice.state;

		// User finished speaking — capture what they said
		if (prev === "listening" && curr === "thinking" && voice.statusText) {
			setMessages((m) => [
				...m,
				{
					id: crypto.randomUUID(),
					role: "user",
					text: voice.statusText,
					timestamp: Date.now(),
				},
			]);
			assistantBufferRef.current = "";
		}

		// Assistant is speaking/typing — accumulate transcript
		if (
			(curr === "speaking" || voice.isTyping) &&
			voice.statusText &&
			voice.statusText !== "Processing..." &&
			voice.statusText !== "Listening..." &&
			voice.statusText !== "Ready."
		) {
			assistantBufferRef.current = voice.statusText;
		}

		// Assistant finished — commit message
		if (
			(prev === "speaking" || prev === "thinking") &&
			curr === "idle" &&
			assistantBufferRef.current
		) {
			const text = assistantBufferRef.current;
			assistantBufferRef.current = "";
			setMessages((m) => [
				...m,
				{
					id: crypto.randomUUID(),
					role: "assistant",
					text,
					timestamp: Date.now(),
				},
			]);
		}

		prevStateRef.current = curr;
	}, [voice.state, voice.statusText, voice.isTyping]);

	// Auto-scroll transcript
	useEffect(() => {
		if (transcriptRef.current) {
			transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
		}
	}, [messages, voice.statusText]);

	// ── PTT handlers ─────────────────────────────────────────────
	const [pttActive, setPttActive] = useState(false);

	const handlePTTStart = useCallback(
		(e: React.TouchEvent | React.MouseEvent) => {
			e.preventDefault();
			unlockAudio();
			navigator.vibrate?.(10);
			setPttActive(true);
			// Unmute if muted — Grok VAD handles speech detection
			if (voice.muted) {
				voice.toggleMute();
			}
		},
		[unlockAudio, voice.muted, voice.toggleMute],
	);

	const handlePTTEnd = useCallback(
		(e: React.TouchEvent | React.MouseEvent) => {
			e.preventDefault();
			navigator.vibrate?.(5);
			setPttActive(false);
		},
		[],
	);

	// ── State-based PTT styling ──────────────────────────────────
	const getPttStyle = (): {
		className: string;
		gradient: string;
		ring: string;
	} => {
		const base = voice.state;
		if (!voice.sessionActive || !voice.isConnected) {
			return {
				className: "",
				gradient: "linear-gradient(135deg, #4A3860, #2D1F4E)",
				ring: "rgba(217, 70, 239, 0.1)",
			};
		}
		switch (base) {
			case "listening":
				return {
					className: "ptt-active",
					gradient: "linear-gradient(135deg, #E879F9, #A855F7)",
					ring: "rgba(217, 70, 239, 0.5)",
				};
			case "thinking":
				return {
					className: "ptt-thinking",
					gradient: "linear-gradient(135deg, #C084FC, #7C3AED)",
					ring: "rgba(124, 58, 237, 0.4)",
				};
			case "speaking":
				return {
					className: "ptt-speaking",
					gradient: "linear-gradient(135deg, #F0ABFC, #D946EF)",
					ring: "rgba(217, 70, 239, 0.6)",
				};
			default:
				return {
					className: "ptt-idle",
					gradient: "linear-gradient(135deg, #D946EF, #7C3AED)",
					ring: "rgba(217, 70, 239, 0.25)",
				};
		}
	};

	const pttStyle = getPttStyle();
	const isActive = voice.sessionActive && voice.isConnected;

	// Live assistant text while speaking
	const liveAssistantText =
		voice.isTyping ||
		voice.state === "speaking" ||
		voice.state === "thinking"
			? assistantBufferRef.current || voice.statusText
			: null;

	return (
		<div
			className="w-full h-full flex flex-col select-none"
			style={{ background: "#06060C" }}
			onTouchStart={unlockAudio}
		>
			{/* ── Header — minimal branding ────────────────────────── */}
			<div
				className="shrink-0 flex items-center justify-between px-5 pt-3 pb-2"
				style={{ paddingTop: "calc(0.75rem + env(safe-area-inset-top, 0px))" }}
			>
				<div>
					<span
						className="text-lg font-light"
						style={{ color: "#E8943A", letterSpacing: "0.25em" }}
					>
						F.R.I.D.A.Y.
					</span>
				</div>
				<div className="flex items-center gap-2">
					{/* Connection indicator */}
					<div
						className="w-2 h-2 rounded-full"
						style={{
							backgroundColor: isActive ? "#4ADE80" : "#8B6914",
							boxShadow: isActive
								? "0 0 6px rgba(74, 222, 128, 0.5)"
								: "none",
						}}
					/>
					<span
						className="text-xs"
						style={{ color: isActive ? "#6B5540" : "#4A4438" }}
					>
						{!voice.isConnected
							? "Connecting"
							: !voice.sessionActive
								? "Starting"
								: voice.state === "listening"
									? "Listening"
									: voice.state === "thinking"
										? "Thinking"
										: voice.state === "speaking"
											? "Speaking"
											: "Ready"}
					</span>
				</div>
			</div>

			{/* ── Transcript area ──────────────────────────────────── */}
			<div
				ref={transcriptRef}
				className="flex-1 min-h-0 overflow-y-auto px-4 py-3"
				style={{
					WebkitOverflowScrolling: "touch",
					scrollBehavior: "smooth",
				}}
			>
				{messages.length === 0 && !liveAssistantText && (
					<div className="h-full flex items-center justify-center">
						<div className="text-center">
							<div
								className="text-5xl mb-4 opacity-20"
								style={{ color: "#D946EF" }}
							>
								&#x25C6;
							</div>
							<div
								className="text-sm font-light"
								style={{ color: "#6B5540", letterSpacing: "0.1em" }}
							>
								Hold the button and speak
							</div>
						</div>
					</div>
				)}

				<div className="flex flex-col gap-3 max-w-lg mx-auto">
					{messages.map((msg) => (
						<div
							key={msg.id}
							className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
						>
							<div
								className="max-w-[85%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed"
								style={
									msg.role === "user"
										? {
												background:
													"linear-gradient(135deg, rgba(217, 70, 239, 0.15), rgba(124, 58, 237, 0.1))",
												color: "#E8E0D4",
												borderBottomRightRadius: "6px",
											}
										: {
												background: "rgba(26, 31, 46, 0.7)",
												color: "#E8E0D4",
												borderBottomLeftRadius: "6px",
											}
								}
							>
								{msg.text}
							</div>
						</div>
					))}

					{/* Live assistant response */}
					{liveAssistantText &&
						liveAssistantText !== "Processing..." &&
						liveAssistantText !== "Listening..." &&
						liveAssistantText !== "Ready." && (
							<div className="flex justify-start">
								<div
									className="max-w-[85%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed"
									style={{
										background: "rgba(26, 31, 46, 0.7)",
										color: "#E8E0D4",
										borderBottomLeftRadius: "6px",
									}}
								>
									{liveAssistantText}
									{voice.isTyping && (
										<span className="voice-ellipsis ml-1">
											<span>.</span>
											<span>.</span>
											<span>.</span>
										</span>
									)}
								</div>
							</div>
						)}
				</div>
			</div>

			{/* ── PTT Button Area ──────────────────────────────────── */}
			<div
				className="shrink-0 flex flex-col items-center gap-3 pb-4 pt-4"
				style={{
					paddingBottom: "calc(2rem + env(safe-area-inset-bottom, 0px))",
					background:
						"linear-gradient(to top, #06060C 60%, transparent 100%)",
				}}
			>
				{/* State label */}
				<div
					className="text-xs font-medium uppercase tracking-widest"
					style={{ color: "#E8943A" }}
				>
					{pttActive
						? "Speak now"
						: voice.state === "speaking"
							? "Friday is speaking"
							: voice.state === "thinking"
								? "Thinking..."
								: "Hold to talk"}
				</div>

				{/* PTT button with ring */}
				<div className="relative flex items-center justify-center">
					{/* Outer ring — animated per state */}
					<div
						className={`absolute rounded-full ${pttStyle.className}`}
						style={{
							width: "120px",
							height: "120px",
							border: `2px solid ${pttStyle.ring}`,
							transition: "border-color 0.3s ease",
						}}
					/>

					{/* Thinking spinner ring */}
					{voice.state === "thinking" && (
						<div
							className="absolute rounded-full ptt-spin-ring"
							style={{
								width: "130px",
								height: "130px",
								border: "2px solid transparent",
								borderTopColor: "#C084FC",
								borderRightColor: "rgba(192, 132, 252, 0.3)",
							}}
						/>
					)}

					{/* Speaking pulse rings */}
					{voice.state === "speaking" && (
						<>
							<div
								className="absolute rounded-full ptt-expand-ring"
								style={{
									width: "96px",
									height: "96px",
								}}
							/>
							<div
								className="absolute rounded-full ptt-expand-ring"
								style={{
									width: "96px",
									height: "96px",
									animationDelay: "0.75s",
								}}
							/>
						</>
					)}

					{/* The button */}
					<button
						type="button"
						className="relative z-10 rounded-full touch-target flex items-center justify-center transition-transform duration-150 active:scale-95"
						style={{
							width: "96px",
							height: "96px",
							background: pttStyle.gradient,
							boxShadow: `0 0 30px ${pttStyle.ring}, 0 4px 20px rgba(0, 0, 0, 0.5)`,
							transform:
								pttActive || voice.state === "listening"
									? "scale(1.1)"
									: "scale(1)",
						}}
						onTouchStart={handlePTTStart}
						onTouchEnd={handlePTTEnd}
						onTouchCancel={handlePTTEnd}
						onMouseDown={handlePTTStart}
						onMouseUp={handlePTTEnd}
						onMouseLeave={handlePTTEnd}
						disabled={!isActive}
					>
						{/* Mic icon */}
						<svg
							width="32"
							height="32"
							viewBox="0 0 24 24"
							fill="none"
							stroke="white"
							strokeWidth="2"
							strokeLinecap="round"
							strokeLinejoin="round"
							style={{
								opacity: isActive ? 1 : 0.4,
								filter: pttActive ? "drop-shadow(0 0 8px white)" : "none",
							}}
						>
							<path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
							<path d="M19 10v2a7 7 0 0 1-14 0v-2" />
							<line x1="12" x2="12" y1="19" y2="22" />
						</svg>
					</button>
				</div>

				{/* Mute / End controls */}
				<div className="flex items-center gap-6 mt-1">
					<button
						type="button"
						className="touch-target flex items-center justify-center rounded-full"
						style={{
							width: "44px",
							height: "44px",
							background: voice.muted
								? "rgba(248, 113, 113, 0.15)"
								: "rgba(26, 31, 46, 0.6)",
						}}
						onClick={() => voice.toggleMute()}
					>
						<svg
							width="18"
							height="18"
							viewBox="0 0 24 24"
							fill="none"
							stroke={voice.muted ? "#F87171" : "#7A7262"}
							strokeWidth="2"
							strokeLinecap="round"
							strokeLinejoin="round"
						>
							{voice.muted ? (
								<>
									<line x1="1" x2="23" y1="1" y2="23" />
									<path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V5a3 3 0 0 0-5.94-.6" />
									<path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2c0 .76-.13 1.49-.35 2.17" />
									<line x1="12" x2="12" y1="19" y2="22" />
								</>
							) : (
								<>
									<path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
									<path d="M19 10v2a7 7 0 0 1-14 0v-2" />
									<line x1="12" x2="12" y1="19" y2="22" />
								</>
							)}
						</svg>
					</button>

					<button
						type="button"
						className="touch-target flex items-center justify-center rounded-full"
						style={{
							width: "44px",
							height: "44px",
							background: "rgba(248, 113, 113, 0.1)",
						}}
						onClick={() => voice.endSession()}
					>
						<svg
							width="18"
							height="18"
							viewBox="0 0 24 24"
							fill="none"
							stroke="#F87171"
							strokeWidth="2"
							strokeLinecap="round"
							strokeLinejoin="round"
						>
							<path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91" />
							<line x1="23" x2="17" y1="1" y2="7" />
							<line x1="17" x2="23" y1="1" y2="7" />
						</svg>
					</button>
				</div>
			</div>
		</div>
	);
}

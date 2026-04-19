import { useEffect, useRef, useState } from "react";
import { View, Text, ScrollView, Pressable } from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { api } from "@/lib/api";
import { useForgeStore } from "@/lib/store";
import { ForgeWebSocket } from "@/lib/ws";
import { PromptButtons } from "@/components/PromptButtons";
import { VoiceInput } from "@/components/VoiceInput";
import type { DetectedPrompt } from "@/lib/prompt-types";

export default function SessionScreen() {
  const { scopeId } = useLocalSearchParams<{ scopeId: string }>();
  const connection = useForgeStore((s) => s.connection);
  const sessions = useForgeStore((s) => s.sessions);
  const session = sessions.find((s) => s.scopeId === scopeId);

  const [output, setOutput] = useState<string[]>(session?.lastOutput || []);
  const [prompt, setPrompt] = useState<DetectedPrompt | null>(session?.prompt || null);
  const [status, setStatus] = useState(session?.status || "running");
  const wsRef = useRef<ForgeWebSocket | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    if (!connection || !scopeId) return;
    let cancelled = false;
    (async () => {
      try {
        const logs = await api.sessionLogs(connection, scopeId);
        if (cancelled) return;
        setOutput(logs.lastOutput.slice(-500));
        setPrompt((logs.prompt as DetectedPrompt | null) ?? null);
        setStatus(logs.status);
      } catch {
        // 404 or network error — let the WebSocket + store-based fallback populate state.
      }
    })();
    return () => { cancelled = true; };
  }, [scopeId, connection]);

  useEffect(() => {
    if (!connection || !scopeId) return;

    const ws = new ForgeWebSocket(connection, `/ws/terminal/${scopeId}`);

    ws.on("terminal:data", (msg) => {
      const data = msg.data as string;
      setOutput((prev) => {
        const newLines = [...prev, ...data.split("\n")];
        return newLines.slice(-500);
      });
    });

    ws.on("terminal:exit", () => {
      setStatus("complete");
      setPrompt(null);
    });

    ws.connect();
    wsRef.current = ws;

    return () => { ws.disconnect(); };
  }, [scopeId, connection]);

  useEffect(() => {
    if (session) {
      setPrompt(session.prompt);
      setStatus(session.status);
    }
  }, [session?.prompt, session?.status]);

  useEffect(() => {
    scrollRef.current?.scrollToEnd({ animated: true });
  }, [output.length]);

  const sendInput = (text: string) => {
    wsRef.current?.send({
      type: "mobile:terminal:input",
      scopeId,
      data: text,
    });
    setPrompt(null);
    setStatus("running");
  };

  const statusColor =
    status === "waiting" ? "#ef4444" : status === "running" ? "#10b981" : "#666";

  return (
    <View className="flex-1 bg-forge-bg">
      <View className="flex-row items-center justify-between px-4 pt-14 pb-3 border-b border-forge-border">
        <View className="flex-row items-center gap-3">
          <Pressable onPress={() => router.back()}>
            <Text className="text-forge-accent text-lg">Back</Text>
          </Pressable>
          <View>
            <Text className="text-forge-text font-semibold">{session?.agent || "Terminal"}</Text>
            <Text className="text-forge-muted text-xs">
              {session?.project} · {session?.taskDescription}
            </Text>
          </View>
        </View>
        <View className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: statusColor }} />
      </View>

      <ScrollView
        ref={scrollRef}
        className="flex-1 bg-black/30 px-4 py-3"
        contentContainerClassName="pb-4"
      >
        {output.map((line, i) => (
          <Text
            key={i}
            className="text-gray-400 text-xs"
            style={{ fontFamily: "monospace", lineHeight: 18 }}
          >
            {line}
          </Text>
        ))}

        {prompt && (
          <View className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 mt-2">
            <Text className="text-forge-text text-sm font-medium">{prompt.promptText}</Text>
          </View>
        )}
      </ScrollView>

      <View className="px-4 pb-8 pt-3 bg-forge-bg">
        {status === "waiting" && prompt && (
          <>
            <Text className="text-forge-red text-xs font-semibold uppercase tracking-wider mb-2">
              Quick Response
            </Text>
            <PromptButtons prompt={prompt} onSend={sendInput} />
          </>
        )}
        <VoiceInput onSend={sendInput} />
      </View>
    </View>
  );
}

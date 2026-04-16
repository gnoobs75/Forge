import { View, Text, ScrollView, Pressable, TextInput } from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { useEffect, useState } from "react";
import { useForgeStore } from "@/lib/store";
import { api, type ProjectDetail, type Idea } from "@/lib/api";

export default function ProjectDetailScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const connection = useForgeStore((s) => s.connection);
  const [detail, setDetail] = useState<ProjectDetail | null>(null);
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [newIdea, setNewIdea] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (connection && slug) {
      api.project(connection, slug).then(setDetail);
      api.ideas(connection, slug).then((data) => setIdeas(data.ideas || []));
    }
  }, [slug, connection]);

  const handleAddIdea = async () => {
    if (!connection || !slug || !newIdea.trim()) return;
    setSubmitting(true);
    try {
      const res = await api.addIdea(connection, slug, newIdea.trim());
      if (res.success) {
        setIdeas((prev) => [res.idea, ...prev]);
        setNewIdea("");
      }
    } catch {} finally {
      setSubmitting(false);
    }
  };

  const handleAnalyze = async (idea: Idea) => {
    if (!connection || !slug) return;
    try {
      const res = await api.analyzeIdea(connection, idea.id, slug);
      if (res.success) {
        setIdeas((prev) =>
          prev.map((i) => (i.id === idea.id ? { ...i, status: "analyzing" } : i)),
        );
        router.push(`/session/${res.scopeId}`);
      }
    } catch {}
  };

  const handlePromote = async (idea: Idea) => {
    if (!connection || !slug) return;
    try {
      await api.promoteIdea(connection, idea.id, slug);
      setIdeas((prev) =>
        prev.map((i) => (i.id === idea.id ? { ...i, status: "promoted" } : i)),
      );
    } catch {}
  };

  const handleDismissIdea = async (idea: Idea) => {
    if (!connection || !slug) return;
    try {
      await api.dismissIdea(connection, idea.id, slug);
      setIdeas((prev) =>
        prev.map((i) => (i.id === idea.id ? { ...i, status: "dismissed" } : i)),
      );
    } catch {}
  };

  if (!detail) {
    return (
      <View className="flex-1 bg-forge-bg justify-center items-center">
        <Text className="text-forge-muted">Loading...</Text>
      </View>
    );
  }

  return (
    <ScrollView className="flex-1 bg-forge-bg" contentContainerClassName="p-4 pt-8">
      <Pressable onPress={() => router.back()} className="mb-4">
        <Text className="text-forge-accent">Back</Text>
      </Pressable>

      <Text className="text-2xl font-bold text-forge-text mb-1">{detail.name}</Text>
      <Text className="text-forge-muted text-xs mb-6">{detail.slug}</Text>

      <Text className="text-forge-muted text-xs uppercase tracking-wider mb-3">Active Sessions</Text>
      {detail.sessions?.map((s) => (
        <Pressable
          key={s.scopeId}
          className="bg-forge-surface border border-forge-border rounded-xl p-3 mb-2 flex-row items-center gap-3"
          onPress={() => router.push(`/session/${s.scopeId}`)}
        >
          <View
            className={`w-2 h-2 rounded-full ${
              s.status === "waiting"
                ? "bg-forge-red"
                : s.status === "running"
                  ? "bg-forge-accent"
                  : "bg-forge-muted"
            }`}
          />
          <View className="flex-1">
            <Text className="text-forge-text text-sm font-semibold">{s.agent}</Text>
            <Text className="text-forge-muted text-xs">{s.taskDescription}</Text>
          </View>
          <Text
            className={`text-xs font-semibold ${s.status === "waiting" ? "text-forge-red" : "text-forge-muted"}`}
          >
            {s.status.toUpperCase()}
          </Text>
        </Pressable>
      ))}

      {/* Idea Board */}
      <Text className="text-forge-muted text-xs uppercase tracking-wider mb-3 mt-4">
        Idea Board
      </Text>

      {/* Add idea input */}
      <View className="flex-row gap-2 mb-4">
        <TextInput
          className="flex-1 bg-forge-surface border border-forge-border rounded-xl px-4 py-2.5 text-forge-text text-sm"
          placeholder="Drop an idea..."
          placeholderTextColor="#666"
          value={newIdea}
          onChangeText={setNewIdea}
          onSubmitEditing={handleAddIdea}
          returnKeyType="send"
        />
        <Pressable
          className="bg-forge-accent rounded-xl px-4 justify-center"
          onPress={handleAddIdea}
          disabled={submitting}
        >
          <Text className="text-white font-bold">+</Text>
        </Pressable>
      </View>

      {/* Ideas list */}
      {ideas
        .filter((i) => i.status !== "dismissed")
        .map((idea) => {
          const score = idea.analysis?.overallScore;
          const scoreColor = score
            ? score >= 7
              ? "#10b981"
              : score >= 4
                ? "#f59e0b"
                : "#ef4444"
            : null;

          return (
            <View
              key={idea.id}
              className="bg-forge-surface border border-forge-border rounded-xl p-4 mb-3"
            >
              <Text className="text-forge-text text-sm mb-2">{idea.text}</Text>

              {idea.status === "analyzing" && (
                <Text className="text-forge-amber text-xs font-semibold">Analyzing...</Text>
              )}

              {idea.analysis && (
                <View className="mb-2">
                  <View className="flex-row items-center gap-2 mb-1">
                    <View
                      className="w-8 h-8 rounded-lg items-center justify-center"
                      style={{ backgroundColor: (scoreColor ?? "#666") + "33" }}
                    >
                      <Text
                        style={{ color: scoreColor ?? "#666", fontSize: 14, fontWeight: "700" }}
                      >
                        {score}
                      </Text>
                    </View>
                    <Text className="text-forge-muted text-xs flex-1">
                      {idea.analysis.verdict}
                    </Text>
                  </View>
                </View>
              )}

              <View className="flex-row gap-2 mt-1">
                {idea.status === "active" && (
                  <>
                    <Pressable
                      className="bg-forge-purple/20 border border-forge-purple/30 rounded-lg px-3 py-1.5"
                      onPress={() => handleAnalyze(idea)}
                    >
                      <Text className="text-forge-purple text-xs font-semibold">Analyze</Text>
                    </Pressable>
                    <Pressable
                      className="bg-forge-surface border border-forge-border rounded-lg px-3 py-1.5"
                      onPress={() => handleDismissIdea(idea)}
                    >
                      <Text className="text-forge-muted text-xs">Dismiss</Text>
                    </Pressable>
                  </>
                )}
                {idea.status === "analyzed" && score !== undefined && score >= 7 && (
                  <Pressable
                    className="bg-forge-accent/20 border border-forge-accent/30 rounded-lg px-3 py-1.5"
                    onPress={() => handlePromote(idea)}
                  >
                    <Text className="text-forge-accent text-xs font-semibold">Promote to Rec</Text>
                  </Pressable>
                )}
                {idea.status === "analyzed" && (
                  <Pressable
                    className="bg-forge-purple/20 border border-forge-purple/30 rounded-lg px-3 py-1.5"
                    onPress={() => handleAnalyze(idea)}
                  >
                    <Text className="text-forge-purple text-xs font-semibold">Re-analyze</Text>
                  </Pressable>
                )}
                {idea.status === "promoted" && (
                  <Text className="text-forge-accent text-xs font-semibold">Promoted</Text>
                )}
              </View>
            </View>
          );
        })}
      {ideas.filter((i) => i.status !== "dismissed").length === 0 && (
        <Text className="text-forge-muted text-xs text-center mb-4">
          No ideas yet — add one above
        </Text>
      )}

      <Text className="text-forge-muted text-xs uppercase tracking-wider mb-3 mt-4">
        Features ({(detail.features as unknown[]).length})
      </Text>
      {(detail.features as any[]).slice(0, 10).map((f, i) => (
        <View key={i} className="flex-row items-center gap-2 py-1.5">
          <Text className="text-forge-accent text-xs">
            {f.status === "complete" ? "done" : f.status || "---"}
          </Text>
          <Text className="text-forge-text text-sm flex-1">
            {f.name || f.title || JSON.stringify(f).slice(0, 50)}
          </Text>
        </View>
      ))}
    </ScrollView>
  );
}

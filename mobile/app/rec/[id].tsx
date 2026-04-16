import { View, Text, ScrollView, Pressable } from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { useForgeStore } from "@/lib/store";
import { api } from "@/lib/api";

export default function RecDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const recommendations = useForgeStore((s) => s.recommendations);
  const connection = useForgeStore((s) => s.connection);
  const fetchRecommendations = useForgeStore((s) => s.fetchRecommendations);
  const rec = recommendations.find((r) => r._file === decodeURIComponent(id ?? ""));

  if (!rec) {
    return (
      <View className="flex-1 bg-forge-bg justify-center items-center">
        <Text className="text-forge-muted">Recommendation not found</Text>
      </View>
    );
  }

  const handleAction = async (action: string) => {
    if (!connection) return;
    await api.recAction(connection, rec._file, action);
    await fetchRecommendations();
    router.back();
  };

  const handleImplement = async (mode: "plan" | "auto", approachId?: number) => {
    if (!connection) return;
    try {
      const res = await api.launchImplementation(
        connection,
        rec._project,
        rec._file,
        approachId ?? rec.recommended,
        mode,
      );
      if (res.success) {
        router.push(`/session/${res.scopeId}`);
      }
    } catch (e) {
      // Could show error but keep simple
    }
  };

  return (
    <ScrollView className="flex-1 bg-forge-bg" contentContainerClassName="p-4 pt-8">
      <Pressable onPress={() => router.back()} className="mb-4">
        <Text className="text-forge-accent">Back</Text>
      </Pressable>

      <View className="flex-row items-center gap-2 mb-3">
        <View
          className="w-8 h-8 rounded-lg items-center justify-center"
          style={{ backgroundColor: rec.agentColor + "33" }}
        >
          <Text style={{ color: rec.agentColor, fontSize: 14, fontWeight: "700" }}>
            {rec.agent.charAt(0)}
          </Text>
        </View>
        <View>
          <Text className="text-forge-text font-semibold">{rec.agent}</Text>
          <Text className="text-forge-muted text-xs">{rec._project}</Text>
        </View>
      </View>

      <Text className="text-xl font-bold text-forge-text mb-2">{rec.title}</Text>
      <Text className="text-forge-muted text-sm mb-6">{rec.summary}</Text>

      <Text className="text-forge-muted text-xs uppercase tracking-wider mb-3">Approaches</Text>
      {rec.approaches?.map((approach) => (
        <View
          key={approach.id}
          className={`bg-forge-surface border rounded-xl p-4 mb-3 ${approach.id === rec.recommended ? "border-forge-accent" : "border-forge-border"}`}
        >
          {approach.id === rec.recommended && (
            <Text className="text-forge-accent text-xs font-semibold mb-1">Recommended</Text>
          )}
          <Text className="text-forge-text font-semibold text-sm mb-1">{approach.name}</Text>
          <Text className="text-forge-muted text-xs mb-2">{approach.description}</Text>
          <View className="flex-row justify-between items-center mt-2">
            <View className="flex-row gap-3">
              <Text className="text-forge-muted text-xs">Effort: {approach.effort}</Text>
              <Text className="text-forge-muted text-xs">Impact: {approach.impact}</Text>
            </View>
            <View className="flex-row gap-2">
              <Pressable
                className="bg-forge-purple/20 border border-forge-purple/30 rounded-lg px-3 py-1.5"
                onPress={() => handleImplement("plan", approach.id)}
              >
                <Text className="text-forge-purple text-xs font-semibold">Plan</Text>
              </Pressable>
              <Pressable
                className="bg-forge-accent/20 border border-forge-accent/30 rounded-lg px-3 py-1.5"
                onPress={() => handleImplement("auto", approach.id)}
              >
                <Text className="text-forge-accent text-xs font-semibold">Auto</Text>
              </Pressable>
            </View>
          </View>
        </View>
      ))}

      {rec.reasoning && (
        <View className="bg-forge-surface border border-forge-border rounded-xl p-4 mb-6">
          <Text className="text-forge-muted text-xs uppercase tracking-wider mb-2">Reasoning</Text>
          <Text className="text-forge-text text-sm">{rec.reasoning}</Text>
        </View>
      )}

      <View className="flex-row gap-3 mb-8">
        <Pressable
          className="flex-1 bg-forge-surface border border-forge-accent rounded-xl py-3 items-center"
          onPress={() => handleAction("approve")}
        >
          <Text className="text-forge-accent font-bold">Approve</Text>
        </Pressable>
        <Pressable
          className="flex-1 bg-forge-surface border border-forge-border rounded-xl py-3 items-center"
          onPress={() => handleAction("dismiss")}
        >
          <Text className="text-forge-muted font-bold">Dismiss</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

import { View, Text, ScrollView, RefreshControl, Pressable } from "react-native";
import { useState } from "react";
import { useForgeStore } from "@/lib/store";
import { RecommendationCard } from "@/components/RecommendationCard";

export default function RecsScreen() {
  const recommendations = useForgeStore((s) => s.recommendations);
  const projects = useForgeStore((s) => s.projects);
  const fetchRecommendations = useForgeStore((s) => s.fetchRecommendations);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<string | null>(null);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchRecommendations(filter ?? undefined);
    setRefreshing(false);
  };

  const filtered = filter
    ? recommendations.filter((r) => r._project === filter)
    : recommendations;

  return (
    <ScrollView
      className="flex-1 bg-forge-bg"
      contentContainerClassName="p-4 pt-16"
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#10b981" />
      }
    >
      <Text className="text-2xl font-bold text-forge-text mb-4">Recommendations</Text>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-4">
        <Pressable
          className={`px-3 py-1.5 rounded-full mr-2 ${!filter ? "bg-forge-accent" : "bg-forge-surface border border-forge-border"}`}
          onPress={() => setFilter(null)}
        >
          <Text className={!filter ? "text-white text-xs font-semibold" : "text-forge-muted text-xs"}>All</Text>
        </Pressable>
        {projects.map((p) => (
          <Pressable
            key={p.slug}
            className={`px-3 py-1.5 rounded-full mr-2 ${filter === p.slug ? "bg-forge-accent" : "bg-forge-surface border border-forge-border"}`}
            onPress={() => setFilter(p.slug)}
          >
            <Text className={filter === p.slug ? "text-white text-xs font-semibold" : "text-forge-muted text-xs"}>
              {p.name}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {filtered.map((rec) => (
        <RecommendationCard key={rec._file} rec={rec} />
      ))}
      {filtered.length === 0 && (
        <Text className="text-forge-muted text-center mt-8">No recommendations</Text>
      )}
    </ScrollView>
  );
}

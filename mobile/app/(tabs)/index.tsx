import { View, Text, ScrollView, RefreshControl } from "react-native";
import { useState } from "react";
import { useForgeStore } from "@/lib/store";
import { ConnectionStatus } from "@/components/ConnectionStatus";
import { AlertBanner } from "@/components/AlertBanner";
import { ActivityFeed } from "@/components/ActivityFeed";

export default function OverviewScreen() {
  const overview = useForgeStore((s) => s.overview);
  const refreshAll = useForgeStore((s) => s.refreshAll);
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    await refreshAll();
    setRefreshing(false);
  };

  return (
    <ScrollView
      className="flex-1 bg-forge-bg"
      contentContainerClassName="p-4 pt-16"
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#10b981" />
      }
    >
      <View className="flex-row justify-between items-center mb-4">
        <View>
          <Text className="text-2xl font-bold text-forge-text">Forge HQ</Text>
          <Text className="text-forge-muted text-xs mt-1">
            {overview?.stats.projectCount ?? 0} projects ·{" "}
            {overview?.stats.totalSessions ?? 0} sessions
          </Text>
        </View>
        <ConnectionStatus />
      </View>

      <AlertBanner alerts={overview?.alerts ?? []} />

      {overview?.stats && (
        <View className="flex-row gap-3 mb-4">
          <StatCard label="Running" value={overview.stats.runningCount} color="#10b981" />
          <StatCard label="Waiting" value={overview.stats.waitingCount} color="#ef4444" />
          <StatCard label="Projects" value={overview.stats.projectCount} color="#8b5cf6" />
        </View>
      )}

      <Text className="text-forge-muted text-xs uppercase tracking-wider mb-2">
        Recent Activity
      </Text>
      <ActivityFeed entries={overview?.activity ?? []} />
    </ScrollView>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View
      className="flex-1 rounded-xl p-3 border"
      style={{ backgroundColor: color + "0D", borderColor: color + "26" }}
    >
      <Text style={{ color, fontSize: 24, fontWeight: "700" }}>{value}</Text>
      <Text className="text-forge-muted text-xs">{label}</Text>
    </View>
  );
}

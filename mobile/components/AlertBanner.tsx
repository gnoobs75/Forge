import { View, Text, Pressable } from "react-native";
import { router } from "expo-router";
import type { OverviewResponse } from "@/lib/api";

interface Props {
  alerts: OverviewResponse["alerts"];
}

export function AlertBanner({ alerts }: Props) {
  if (!alerts.length) return null;

  return (
    <Pressable
      className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 mb-3"
      onPress={() => router.push("/(tabs)/cli")}
    >
      <View className="flex-row items-center gap-3">
        <View className="w-2 h-2 rounded-full bg-forge-red" />
        <View>
          <Text className="text-forge-red font-semibold text-sm">
            {alerts.length} session{alerts.length > 1 ? "s" : ""} need{alerts.length === 1 ? "s" : ""} input
          </Text>
          <Text className="text-forge-muted text-xs mt-0.5">
            {alerts.map((a) => `${a.project}: ${a.agent}`).join(" · ")}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

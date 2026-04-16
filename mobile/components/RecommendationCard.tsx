import { View, Text, Pressable } from "react-native";
import { router } from "expo-router";

interface Props {
  rec: {
    title: string;
    agent: string;
    agentColor: string;
    summary: string;
    status: string;
    _project: string;
    _file: string;
  };
}

export function RecommendationCard({ rec }: Props) {
  return (
    <Pressable
      className="bg-forge-surface border border-forge-border rounded-xl p-4 mb-3"
      onPress={() => router.push(`/rec/${encodeURIComponent(rec._file)}`)}
    >
      <View className="flex-row items-center gap-2 mb-2">
        <View
          className="w-6 h-6 rounded-md items-center justify-center"
          style={{ backgroundColor: rec.agentColor + "33" }}
        >
          <Text style={{ color: rec.agentColor, fontSize: 10, fontWeight: "700" }}>
            {rec.agent.charAt(0)}
          </Text>
        </View>
        <Text className="text-forge-muted text-xs flex-1">{rec.agent}</Text>
        <Text className="text-forge-muted text-xs bg-forge-border/50 px-2 py-0.5 rounded">
          {rec._project}
        </Text>
      </View>
      <Text className="text-forge-text font-semibold text-sm mb-1">{rec.title}</Text>
      <Text className="text-forge-muted text-xs" numberOfLines={2}>{rec.summary}</Text>
    </Pressable>
  );
}

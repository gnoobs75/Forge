import { View, Text, FlatList } from "react-native";

interface ActivityEntry {
  id: number;
  agent: string;
  agentColor: string;
  action: string;
  project: string;
  timestamp: string;
}

interface Props {
  entries: ActivityEntry[];
}

function timeAgo(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function ActivityFeed({ entries }: Props) {
  return (
    <FlatList
      data={entries}
      keyExtractor={(item) => String(item.id)}
      scrollEnabled={false}
      renderItem={({ item }) => (
        <View className="flex-row gap-3 py-2.5 border-b border-forge-border">
          <View
            className="w-8 h-8 rounded-lg items-center justify-center"
            style={{ backgroundColor: item.agentColor + "33" }}
          >
            <Text style={{ color: item.agentColor, fontSize: 12, fontWeight: "700" }}>
              {item.agent.charAt(0)}
            </Text>
          </View>
          <View className="flex-1">
            <Text className="text-forge-text text-sm">
              <Text className="font-semibold">{item.agent}</Text> {item.action}
            </Text>
            <Text className="text-forge-muted text-xs mt-0.5">
              {item.project} · {timeAgo(item.timestamp)}
            </Text>
          </View>
        </View>
      )}
    />
  );
}

import { View, Text, Pressable } from "react-native";
import { router } from "expo-router";
import type { SessionInfo } from "@/lib/prompt-types";

interface Props {
  sessions: SessionInfo[];
}

function groupByProject(sessions: SessionInfo[]): Map<string, SessionInfo[]> {
  const groups = new Map<string, SessionInfo[]>();
  for (const s of sessions) {
    const list = groups.get(s.project) || [];
    list.push(s);
    groups.set(s.project, list);
  }
  return groups;
}

const STATUS_COLORS: Record<string, string> = {
  running: "#10b981",
  waiting: "#ef4444",
  idle: "#666666",
  complete: "#666666",
};

const STATUS_LABELS: Record<string, string> = {
  running: "RUNNING",
  waiting: "NEEDS INPUT",
  idle: "IDLE",
  complete: "COMPLETE",
};

export function SessionTree({ sessions }: Props) {
  const groups = groupByProject(sessions);

  if (sessions.length === 0) {
    return (
      <View className="items-center mt-12">
        <Text className="text-forge-muted text-sm">No active CLI sessions</Text>
        <Text className="text-forge-muted text-xs mt-1">
          Sessions will appear here when agents are running
        </Text>
      </View>
    );
  }

  return (
    <View>
      {Array.from(groups.entries()).map(([project, projectSessions]) => (
        <View key={project} className="mb-5">
          <View className="flex-row items-center gap-2 mb-2">
            <View className="w-1.5 h-1.5 rounded-full bg-forge-purple" />
            <Text className="text-forge-text font-semibold text-base">{project}</Text>
            <Text className="text-forge-muted text-xs">
              {projectSessions.length} session{projectSessions.length > 1 ? "s" : ""}
            </Text>
          </View>

          <View className="ml-3 border-l border-forge-border pl-3">
            {projectSessions.map((s) => {
              const color = STATUS_COLORS[s.status] || "#666";
              const isWaiting = s.status === "waiting";

              return (
                <Pressable
                  key={s.scopeId}
                  className={`rounded-xl p-3 mb-2 border ${isWaiting ? "bg-red-500/5 border-red-500/20" : "bg-forge-surface border-forge-border"}`}
                  onPress={() => router.push(`/session/${s.scopeId}`)}
                >
                  <View className="flex-row justify-between items-center">
                    <View className="flex-row items-center gap-2">
                      <View
                        className="w-2 h-2 rounded-full"
                        style={{
                          backgroundColor: color,
                          ...(isWaiting && {
                            shadowColor: color,
                            shadowOffset: { width: 0, height: 0 },
                            shadowOpacity: 0.5,
                            shadowRadius: 3,
                          }),
                        }}
                      />
                      <Text className="text-forge-text text-sm font-medium">{s.agent}</Text>
                    </View>
                    <Text
                      className="text-xs font-semibold px-2 py-0.5 rounded-full"
                      style={{ color, backgroundColor: color + "1A" }}
                    >
                      {STATUS_LABELS[s.status]}
                    </Text>
                  </View>
                  <Text className="text-forge-muted text-xs mt-1 ml-4">{s.taskDescription}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ))}
    </View>
  );
}

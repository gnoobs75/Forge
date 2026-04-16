import { View, Text, Pressable } from "react-native";
import { router } from "expo-router";
import type { ProjectSummary } from "@/lib/api";

interface Props {
  project: ProjectSummary;
}

export function ProjectCard({ project }: Props) {
  return (
    <Pressable
      className="bg-forge-surface border border-forge-border rounded-xl p-4 mb-3"
      onPress={() => router.push(`/project/${project.slug}`)}
    >
      <View className="flex-row justify-between items-center mb-2">
        <Text className="text-forge-text font-semibold text-base">{project.name}</Text>
        {project.waitingSessions > 0 && (
          <View className="bg-forge-red/20 px-2 py-0.5 rounded-full">
            <Text className="text-forge-red text-xs font-semibold">
              {project.waitingSessions} waiting
            </Text>
          </View>
        )}
      </View>
      <View className="flex-row gap-4">
        <Text className="text-forge-muted text-xs">{project.featureCount} features</Text>
        <Text className="text-forge-muted text-xs">{project.activeSessions} sessions</Text>
        {project.progress !== null && (
          <Text className="text-forge-accent text-xs">
            {Math.round(project.progress * 100)}% complete
          </Text>
        )}
      </View>
    </Pressable>
  );
}

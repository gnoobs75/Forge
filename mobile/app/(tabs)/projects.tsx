import { Text, ScrollView, RefreshControl } from "react-native";
import { useState } from "react";
import { useForgeStore } from "@/lib/store";
import { ProjectCard } from "@/components/ProjectCard";

export default function ProjectsScreen() {
  const projects = useForgeStore((s) => s.projects);
  const fetchProjects = useForgeStore((s) => s.fetchProjects);
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchProjects();
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
      <Text className="text-2xl font-bold text-forge-text mb-4">Projects</Text>
      {projects.map((p) => (
        <ProjectCard key={p.slug} project={p} />
      ))}
      {projects.length === 0 && (
        <Text className="text-forge-muted text-center mt-8">No projects</Text>
      )}
    </ScrollView>
  );
}

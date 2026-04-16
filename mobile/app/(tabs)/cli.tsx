import { Text, ScrollView, RefreshControl, View, Pressable, Modal } from "react-native";
import { useState } from "react";
import { router } from "expo-router";
import { useForgeStore } from "@/lib/store";
import { api } from "@/lib/api";
import { SessionTree } from "@/components/SessionTree";

const AGENTS = [
  "solutions-architect",
  "backend-engineer",
  "frontend-engineer",
  "devops-engineer",
  "data-engineer",
  "security-auditor",
  "qa-lead",
  "product-owner",
  "ux-researcher",
  "api-designer",
  "performance-engineer",
  "technical-writer",
  "project-manager",
  "code-reviewer",
];

export default function CLIScreen() {
  const sessions = useForgeStore((s) => s.sessions);
  const fetchSessions = useForgeStore((s) => s.fetchSessions);
  const projects = useForgeStore((s) => s.projects);
  const connection = useForgeStore((s) => s.connection);
  const [refreshing, setRefreshing] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [newProject, setNewProject] = useState("");
  const [newAgent, setNewAgent] = useState("");

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchSessions();
    setRefreshing(false);
  };

  const sorted = [...sessions].sort((a, b) => {
    const order = { waiting: 0, running: 1, idle: 2, complete: 3 };
    return (order[a.status] ?? 4) - (order[b.status] ?? 4);
  });

  const handleLaunch = async () => {
    if (!connection || !newProject || !newAgent) return;
    try {
      const res = await api.launchAgent(connection, newProject, newAgent);
      setShowNew(false);
      if (res.success) {
        await fetchSessions();
        router.push(`/session/${res.scopeId}`);
      }
    } catch {}
  };

  return (
    <ScrollView
      className="flex-1 bg-forge-bg"
      contentContainerClassName="p-4 pt-16"
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#10b981" />
      }
    >
      <Text className="text-2xl font-bold text-forge-text mb-4">CLI Command Center</Text>

      <Pressable
        className="bg-forge-purple rounded-xl py-3 items-center mb-4"
        onPress={() => setShowNew(true)}
      >
        <Text className="text-white font-bold">+ New Agent Session</Text>
      </Pressable>

      <SessionTree sessions={sorted} />

      <Modal visible={showNew} transparent animationType="slide">
        <View className="flex-1 bg-black/50 justify-end">
          <View className="bg-forge-bg rounded-t-3xl p-6 pb-10">
            <Text className="text-xl font-bold text-forge-text mb-4">New Agent Session</Text>

            <Text className="text-forge-muted text-sm mb-2">Project</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-4">
              {projects.map((p) => (
                <Pressable
                  key={p.slug}
                  className={`px-4 py-2 rounded-full mr-2 ${newProject === p.slug ? "bg-forge-accent" : "bg-forge-surface border border-forge-border"}`}
                  onPress={() => setNewProject(p.slug)}
                >
                  <Text
                    className={
                      newProject === p.slug
                        ? "text-white font-semibold text-sm"
                        : "text-forge-muted text-sm"
                    }
                  >
                    {p.name}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>

            <Text className="text-forge-muted text-sm mb-2">Agent</Text>
            <ScrollView className="max-h-48 mb-4">
              {AGENTS.map((a) => (
                <Pressable
                  key={a}
                  className={`px-4 py-2.5 rounded-xl mb-1 ${newAgent === a ? "bg-forge-purple" : "bg-forge-surface"}`}
                  onPress={() => setNewAgent(a)}
                >
                  <Text
                    className={
                      newAgent === a
                        ? "text-white font-semibold text-sm"
                        : "text-forge-muted text-sm"
                    }
                  >
                    {a
                      .split("-")
                      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
                      .join(" ")}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>

            <Pressable
              className={`rounded-xl py-3 items-center mb-3 ${newProject && newAgent ? "bg-forge-accent" : "bg-forge-surface"}`}
              onPress={handleLaunch}
              disabled={!newProject || !newAgent}
            >
              <Text className="text-white font-bold">Launch</Text>
            </Pressable>
            <Pressable className="py-3 items-center" onPress={() => setShowNew(false)}>
              <Text className="text-forge-muted">Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

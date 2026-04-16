import { Tabs } from "expo-router";
import { useEffect } from "react";
import { Text } from "react-native";
import { useForgeStore } from "@/lib/store";

export default function TabLayout() {
  const connectWs = useForgeStore((s) => s.connectWs);
  const refreshAll = useForgeStore((s) => s.refreshAll);
  const waitingCount = useForgeStore(
    (s) => s.sessions.filter((ses) => ses.status === "waiting").length,
  );

  useEffect(() => {
    connectWs();
    refreshAll();
    const interval = setInterval(refreshAll, 15000);
    return () => { clearInterval(interval); };
  }, []);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: "#0a0a0f",
          borderTopColor: "rgba(255,255,255,0.08)",
        },
        tabBarActiveTintColor: "#10b981",
        tabBarInactiveTintColor: "#666",
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Overview",
          tabBarIcon: ({ color }) => (
            <Text style={{ color, fontSize: 18, fontWeight: "700", fontFamily: "monospace" }}>O</Text>
          ),
        }}
      />
      <Tabs.Screen
        name="recs"
        options={{
          title: "Recs",
          tabBarIcon: ({ color }) => (
            <Text style={{ color, fontSize: 18, fontWeight: "700", fontFamily: "monospace" }}>R</Text>
          ),
        }}
      />
      <Tabs.Screen
        name="projects"
        options={{
          title: "Projects",
          tabBarIcon: ({ color }) => (
            <Text style={{ color, fontSize: 18, fontWeight: "700", fontFamily: "monospace" }}>P</Text>
          ),
        }}
      />
      <Tabs.Screen
        name="cli"
        options={{
          title: "CLI",
          tabBarBadge: waitingCount > 0 ? waitingCount : undefined,
          tabBarBadgeStyle: { backgroundColor: "#ef4444" },
          tabBarIcon: ({ color }) => (
            <Text style={{ color, fontSize: 18, fontWeight: "700", fontFamily: "monospace" }}>{">"}</Text>
          ),
        }}
      />
    </Tabs>
  );
}

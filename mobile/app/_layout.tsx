import "../global.css";
import { useEffect, useState } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { loadConnection } from "@/lib/connection";
import { useForgeStore } from "@/lib/store";
import { requestPermissions } from "@/lib/notifications";

export default function RootLayout() {
  const [ready, setReady] = useState(false);
  const setConnection = useForgeStore((s) => s.setConnection);
  const connection = useForgeStore((s) => s.connection);

  useEffect(() => {
    (async () => {
      const conn = await loadConnection();
      if (conn) setConnection(conn);
      await requestPermissions();
      setReady(true);
    })();
  }, []);

  if (!ready) return null;

  return (
    <>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: "#0a0a0f" },
          animation: "fade",
        }}
      >
        {!connection ? (
          <Stack.Screen name="connect" />
        ) : (
          <Stack.Screen name="(tabs)" />
        )}
        <Stack.Screen
          name="session/[scopeId]"
          options={{ presentation: "modal", animation: "slide_from_bottom" }}
        />
        <Stack.Screen
          name="rec/[id]"
          options={{ presentation: "modal", animation: "slide_from_bottom" }}
        />
        <Stack.Screen
          name="project/[slug]"
          options={{ presentation: "modal", animation: "slide_from_bottom" }}
        />
      </Stack>
    </>
  );
}

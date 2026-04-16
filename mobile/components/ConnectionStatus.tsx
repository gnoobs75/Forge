import { View, Text } from "react-native";
import { useForgeStore } from "@/lib/store";

export function ConnectionStatus() {
  const connected = useForgeStore((s) => s.connected);
  return (
    <View className="flex-row items-center gap-2">
      <View
        className={`w-2 h-2 rounded-full ${connected ? "bg-forge-accent" : "bg-forge-red"}`}
      />
      <Text className="text-forge-muted text-xs">
        {connected ? "Tailscale Connected" : "Disconnected"}
      </Text>
    </View>
  );
}

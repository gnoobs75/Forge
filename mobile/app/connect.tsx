import { useState } from "react";
import { View, Text, TextInput, Pressable, ActivityIndicator } from "react-native";
import { useForgeStore } from "@/lib/store";
import { saveConnection } from "@/lib/connection";
import { api } from "@/lib/api";

export default function ConnectScreen() {
  const [host, setHost] = useState("");
  const [token, setToken] = useState("");
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const setConnection = useForgeStore((s) => s.setConnection);

  const handleConnect = async () => {
    if (!host.trim() || !token.trim()) {
      setError("Both fields are required");
      return;
    }
    setTesting(true);
    setError(null);
    const conn = { host: host.trim(), token: token.trim() };
    try {
      await api.status(conn);
      await saveConnection(conn);
      setConnection(conn);
    } catch (e) {
      setError(`Connection failed: ${(e as Error).message}`);
    } finally {
      setTesting(false);
    }
  };

  return (
    <View className="flex-1 bg-forge-bg justify-center px-8">
      <Text className="text-3xl font-bold text-forge-text mb-2">
        Forge Mobile
      </Text>
      <Text className="text-forge-muted mb-8">
        Connect to your Forge instance over Tailscale
      </Text>

      <Text className="text-forge-muted text-sm mb-2">
        Forge Address (Tailscale IP:Port)
      </Text>
      <TextInput
        className="bg-forge-surface border border-forge-border rounded-xl px-4 py-3 text-forge-text mb-4"
        placeholder="100.64.0.1:3100"
        placeholderTextColor="#666"
        value={host}
        onChangeText={setHost}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
      />

      <Text className="text-forge-muted text-sm mb-2">
        Auth Token (FRIDAY_REMOTE_TOKEN)
      </Text>
      <TextInput
        className="bg-forge-surface border border-forge-border rounded-xl px-4 py-3 text-forge-text mb-6"
        placeholder="your-token-here"
        placeholderTextColor="#666"
        value={token}
        onChangeText={setToken}
        autoCapitalize="none"
        autoCorrect={false}
        secureTextEntry
      />

      {error && (
        <Text className="text-forge-red text-sm mb-4">{error}</Text>
      )}

      <Pressable
        className="bg-forge-accent rounded-xl py-4 items-center"
        onPress={handleConnect}
        disabled={testing}
      >
        {testing ? (
          <ActivityIndicator color="white" />
        ) : (
          <Text className="text-white font-bold text-lg">Connect</Text>
        )}
      </Pressable>
    </View>
  );
}

import { View, Text, Pressable } from "react-native";
import * as Haptics from "expo-haptics";
import type { DetectedPrompt } from "@/lib/prompt-types";

interface Props {
  prompt: DetectedPrompt;
  onSend: (text: string) => void;
}

export function PromptButtons({ prompt, onSend }: Props) {
  const send = (text: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onSend(text);
  };

  if (prompt.type === "binary") {
    return (
      <View className="flex-row gap-3 mb-3">
        <Pressable
          className="flex-1 bg-forge-accent py-4 rounded-xl items-center"
          style={{ shadowColor: "#10b981", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 8 }}
          onPress={() => send("yes\n")}
        >
          <Text className="text-white text-lg font-bold">YES</Text>
        </Pressable>
        <Pressable
          className="flex-1 bg-forge-red py-4 rounded-xl items-center"
          style={{ shadowColor: "#ef4444", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 8 }}
          onPress={() => send("no\n")}
        >
          <Text className="text-white text-lg font-bold">NO</Text>
        </Pressable>
      </View>
    );
  }

  if (prompt.type === "permission") {
    return (
      <View>
        <View className="flex-row gap-3 mb-2">
          <Pressable
            className="flex-1 bg-forge-accent py-4 rounded-xl items-center"
            onPress={() => send("y\n")}
          >
            <Text className="text-white text-lg font-bold">Allow</Text>
          </Pressable>
          <Pressable
            className="flex-1 bg-forge-red py-4 rounded-xl items-center"
            onPress={() => send("n\n")}
          >
            <Text className="text-white text-lg font-bold">Deny</Text>
          </Pressable>
        </View>
        <Pressable
          className="bg-forge-accent/20 border border-forge-accent/30 py-3 rounded-xl items-center mb-3"
          onPress={() => send("yes, and never ask again\n")}
        >
          <Text className="text-forge-accent font-semibold">Yes, never ask again</Text>
        </Pressable>
      </View>
    );
  }

  if (prompt.type === "numbered") {
    return (
      <View className="flex-row flex-wrap gap-2 mb-3">
        {prompt.options.map((opt) => (
          <Pressable
            key={opt}
            className="bg-amber-500/20 border border-amber-500/30 px-5 py-3 rounded-xl"
            onPress={() => send(`${opt}\n`)}
          >
            <Text className="text-forge-amber text-lg font-bold">{opt}</Text>
          </Pressable>
        ))}
      </View>
    );
  }

  return null;
}

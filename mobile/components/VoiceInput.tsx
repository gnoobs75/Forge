import { useState } from "react";
import { View, Text, Pressable, TextInput } from "react-native";
import * as Haptics from "expo-haptics";

interface Props {
  onSend: (text: string) => void;
}

export function VoiceInput({ onSend }: Props) {
  const [text, setText] = useState("");

  const handleSend = () => {
    if (!text.trim()) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onSend(text.trim() + "\n");
    setText("");
  };

  return (
    <View className="border-t border-forge-border pt-3">
      <View className="flex-row gap-2 items-center">
        <TextInput
          className="flex-1 bg-forge-surface border border-forge-border rounded-2xl px-4 py-2.5 text-forge-text text-sm"
          placeholder="Type or tap mic to speak..."
          placeholderTextColor="#666"
          value={text}
          onChangeText={setText}
          onSubmitEditing={handleSend}
          returnKeyType="send"
          autoCorrect={false}
          enablesReturnKeyAutomatically
        />
        <Pressable
          className="w-11 h-11 rounded-full bg-forge-purple items-center justify-center"
          style={{
            shadowColor: "#8b5cf6",
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.4,
            shadowRadius: 12,
          }}
          onPress={handleSend}
        >
          <Text className="text-white text-lg">{text.trim() ? ">" : "mic"}</Text>
        </Pressable>
      </View>
      <Text className="text-forge-muted text-xs mt-2 text-center">
        iOS keyboard mic button enables voice dictation
      </Text>
    </View>
  );
}

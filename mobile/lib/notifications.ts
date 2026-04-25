import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import { router } from "expo-router";

const isWeb = Platform.OS === "web";

if (!isWeb) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });

  Notifications.addNotificationResponseReceivedListener((response) => {
    const data = response.notification.request.content.data;
    if (data?.scopeId) {
      router.push(`/session/${data.scopeId}`);
    }
  });
}

export async function requestPermissions(): Promise<boolean> {
  if (isWeb) return false;
  const { status } = await Notifications.requestPermissionsAsync();
  return status === "granted";
}

export async function notifySessionNeedsInput(
  scopeId: string,
  agent: string,
  project: string,
): Promise<void> {
  if (isWeb) return;
  await Notifications.scheduleNotificationAsync({
    content: {
      title: `${agent} needs input`,
      body: `Project: ${project}`,
      data: { scopeId, screen: "session" },
    },
    trigger: null,
  });
}

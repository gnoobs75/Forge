import * as Notifications from "expo-notifications";
import { router } from "expo-router";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function requestPermissions(): Promise<boolean> {
  const { status } = await Notifications.requestPermissionsAsync();
  return status === "granted";
}

export async function notifySessionNeedsInput(
  scopeId: string,
  agent: string,
  project: string,
): Promise<void> {
  await Notifications.scheduleNotificationAsync({
    content: {
      title: `${agent} needs input`,
      body: `Project: ${project}`,
      data: { scopeId, screen: "session" },
    },
    trigger: null,
  });
}

Notifications.addNotificationResponseReceivedListener((response) => {
  const data = response.notification.request.content.data;
  if (data?.scopeId) {
    router.push(`/session/${data.scopeId}`);
  }
});

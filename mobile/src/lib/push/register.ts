import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import { Platform } from "react-native";
import { authenticatedFetch } from "../api/authenticated-fetch";

/**
 * Milestone 14 (mobile), Task 7. Requests the native OS permission dialog
 * and registers the resulting Expo push token with the backend - called
 * once, from OrderConfirmationScreen after an order reaches
 * status: "ready" (Product Decision #2 in the plan doc), never on cold app
 * open. If the user declines, this quietly does nothing further - no error
 * banner, no retry loop; they can still use the app fully without push.
 */
export async function registerForPushNotifications(): Promise<void> {
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== "granted") return;

  const projectId = Constants.expoConfig?.extra?.eas?.projectId;
  const tokenResponse = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);

  await authenticatedFetch("/api/account/push-tokens", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ expoPushToken: tokenResponse.data, platform: Platform.OS }),
  });
}

/**
 * Called from signOut (auth-context.tsx), before the Supabase session is
 * actually cleared - deregisterPushNotifications needs the still-valid
 * bearer token to authenticate the DELETE call. Best-effort: if resolving
 * the device's current push token fails for any reason (e.g. permission
 * was revoked at the OS level since registering), sign-out must still
 * proceed uninterrupted - this never blocks or fails the caller.
 */
export async function deregisterPushNotifications(): Promise<void> {
  try {
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== "granted") return; // never registered, or already revoked - nothing to remove

    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    const tokenResponse = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);

    await authenticatedFetch("/api/account/push-tokens", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ expoPushToken: tokenResponse.data }),
    });
  } catch {
    // Best-effort, see header comment - swallow and let sign-out continue.
  }
}

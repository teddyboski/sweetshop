import "server-only";

const EXPO_PUSH_API_URL = "https://exp.host/--/api/v2/push/send";
const EXPO_PUSH_BATCH_SIZE = 100; // Expo push API's own per-request limit

export interface ExpoPushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

/**
 * Milestone 14 (mobile): sends push notifications via Expo's push API,
 * batched into groups of 100 (Expo's own limit per request) and
 * authenticated with EXPO_ACCESS_TOKEN (plan doc Product Decision #6 -
 * prevents another party from spoofing sends against this project's Expo
 * push credentials). Shared by both push triggers (order-shipped and
 * drop-live) rather than duplicated - this genuinely is the same operation
 * both need, unlike e.g. createOrderFromPaymentIntent's deliberate
 * near-duplication of createOrderFromSession elsewhere in this codebase
 * (see that function's own header comment for when duplication vs sharing
 * is the right call).
 *
 * Never throws - a failed push send must never fail the request that
 * triggered it (marking an order shipped, or the cron sweep moving on to
 * the next drop). Failures are logged, not surfaced to the caller as a
 * rejected promise - the underlying business action (order marked shipped,
 * drop notification recorded) already succeeded or is about to regardless
 * of whether the push itself lands.
 */
export async function sendExpoPushNotifications(messages: ExpoPushMessage[]): Promise<void> {
  if (messages.length === 0) return;

  const accessToken = process.env.EXPO_ACCESS_TOKEN;
  if (!accessToken) {
    console.error("EXPO_ACCESS_TOKEN is not set - push notification(s) not sent");
    return;
  }

  for (let i = 0; i < messages.length; i += EXPO_PUSH_BATCH_SIZE) {
    const batch = messages.slice(i, i + EXPO_PUSH_BATCH_SIZE);
    try {
      const response = await fetch(EXPO_PUSH_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "Accept-Encoding": "gzip, deflate",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(batch),
      });
      if (!response.ok) {
        console.error(`Expo push API returned ${response.status} for a batch of ${batch.length} message(s)`);
      }
    } catch (error) {
      console.error("Expo push API request failed:", error);
    }
  }
}

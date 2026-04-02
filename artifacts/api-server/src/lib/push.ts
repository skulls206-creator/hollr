import webpush from "web-push";
import { Expo, ExpoPushMessage } from "expo-server-sdk";
import { db } from "@workspace/db";
import { pushSubscriptionsTable, notificationPrefsTable, expoPushTokensTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

const expo = new Expo();

const publicKey = process.env.VAPID_PUBLIC_KEY;
const privateKey = process.env.VAPID_PRIVATE_KEY;
const subject = process.env.VAPID_SUBJECT || "mailto:admin@hollr.chat";

if (publicKey && privateKey) {
  webpush.setVapidDetails(subject, publicKey, privateKey);
} else {
  console.warn("[push] VAPID keys not set — push notifications disabled");
}

export type PushNav =
  | { type: "channel"; serverId: string; channelId: string }
  | { type: "dm"; threadId: string };

export interface PushPayload {
  title: string;
  body: string;
  icon?: string;
  url?: string;
  tag?: string;
  nav?: PushNav;
  // Call-specific fields — passed through to the service worker for action handling
  notifType?: "message" | "call" | "video_call";
  callerId?: string;
  callerName?: string;
  dmThreadId?: string;
  // Note: `quiet` is NOT set by callers — it is injected per-device from the DB
}

async function removeSub(id: string) {
  try {
    await db.delete(pushSubscriptionsTable).where(eq(pushSubscriptionsTable.id, id));
  } catch {}
}

export async function sendPushToUser(userId: string, payload: PushPayload): Promise<void> {
  const [subs, expoTokens] = await Promise.all([
    publicKey && privateKey
      ? db.query.pushSubscriptionsTable.findMany({ where: eq(pushSubscriptionsTable.userId, userId) })
      : Promise.resolve([]),
    db.query.expoPushTokensTable.findMany({ where: eq(expoPushTokensTable.userId, userId) }),
  ]);

  const tasks: Promise<unknown>[] = [];

  if (publicKey && privateKey && subs.length > 0) {
    tasks.push(
      ...subs.map(async (sub) => {
        try {
          const devicePayload = { ...payload, quiet: sub.quiet };
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            JSON.stringify(devicePayload),
          );
        } catch (err: unknown) {
          const e = err as { statusCode?: number };
          if (e.statusCode === 410 || e.statusCode === 404) {
            await removeSub(sub.id);
          }
        }
      })
    );
  }

  if (expoTokens.length > 0) {
    const messages: ExpoPushMessage[] = expoTokens
      .filter(t => Expo.isExpoPushToken(t.token))
      .map(t => ({
        to: t.token,
        title: payload.title,
        body: payload.body,
        data: {
          navType: payload.nav?.type,
          ...(payload.nav?.type === "channel" ? { serverId: payload.nav.serverId, channelId: payload.nav.channelId } : {}),
          ...(payload.nav?.type === "dm" ? { threadId: payload.nav.threadId } : {}),
        },
        sound: "default",
      }));

    if (messages.length > 0) {
      tasks.push(
        expo.sendPushNotificationsAsync(messages).catch(() => {})
      );
    }
  }

  await Promise.allSettled(tasks);
}

export async function getNotifPrefs(userId: string) {
  const row = await db.query.notificationPrefsTable.findFirst({
    where: eq(notificationPrefsTable.userId, userId),
  });
  return {
    muteDms: row?.muteDms ?? false,
    mutedChannelIds: row ? (JSON.parse(row.mutedChannelIds) as string[]) : [],
  };
}

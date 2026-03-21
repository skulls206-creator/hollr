import webpush from "web-push";
import { db } from "@workspace/db";
import { pushSubscriptionsTable, notificationPrefsTable } from "@workspace/db/schema";
import { eq, and, inArray } from "drizzle-orm";

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
}

async function removeSub(id: string) {
  try {
    await db.delete(pushSubscriptionsTable).where(eq(pushSubscriptionsTable.id, id));
  } catch {}
}

export async function sendPushToUser(userId: string, payload: PushPayload): Promise<void> {
  if (!publicKey || !privateKey) return;

  const subs = await db.query.pushSubscriptionsTable.findMany({
    where: eq(pushSubscriptionsTable.userId, userId),
  });

  await Promise.allSettled(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify(payload),
        );
      } catch (err: any) {
        if (err.statusCode === 410 || err.statusCode === 404) {
          await removeSub(sub.id);
        }
      }
    })
  );
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

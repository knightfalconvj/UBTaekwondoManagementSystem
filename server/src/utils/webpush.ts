import webpush from "web-push";
import { config } from "../config.js";
import { prisma } from "../lib/prisma.js";

webpush.setVapidDetails(
  config.vapid.subject,
  config.vapid.publicKey,
  config.vapid.privateKey
);

type PushPayload = {
  title: string;
  body: string;
  url?: string;
  tag?: string;
  badge?: number;
};

/** Compute total unread count for a user (notifications + DMs + group). */
export async function getUserUnreadCount(userId: string): Promise<number> {
  const [notifCount, dmCount, groupStatus] = await Promise.all([
    prisma.notification.count({ where: { userId, isRead: false } }),
    prisma.message.count({ where: { receiverId: userId, isRead: false } }),
    prisma.groupMessageReadStatus.findUnique({ where: { userId } })
  ]);
  const groupUnread = await prisma.groupMessage.count({
    where: {
      senderId: { not: userId },
      ...(groupStatus ? { createdAt: { gt: groupStatus.lastReadAt } } : {})
    }
  });
  return notifCount + dmCount + groupUnread;
}

/**
 * Send a push notification to every registered device for a user.
 * Silently removes stale subscriptions that the browser has invalidated.
 */
export async function sendPushToUser(userId: string, payload: PushPayload): Promise<void> {
  if (!config.vapid.publicKey || !config.vapid.privateKey) return;

  const subscriptions = await prisma.pushSubscription.findMany({ where: { userId } });
  if (subscriptions.length === 0) return;

  // Include accurate badge count so the OS icon badge is updated
  const badgeCount = payload.badge ?? await getUserUnreadCount(userId);
  const enriched = { ...payload, badge: badgeCount };

  const staleIds: string[] = [];

  await Promise.allSettled(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify(enriched)
        );
      } catch (err: unknown) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          staleIds.push(sub.id);
        }
      }
    })
  );

  if (staleIds.length > 0) {
    await prisma.pushSubscription.deleteMany({ where: { id: { in: staleIds } } });
  }
}

/**
 * Send a push notification to all active users (e.g. group chat message).
 * Excludes the sender. Fetches each recipient's individual badge count.
 */
export async function sendPushToAllExcept(excludeUserId: string, payload: PushPayload): Promise<void> {
  if (!config.vapid.publicKey || !config.vapid.privateKey) return;

  const subscriptions = await prisma.pushSubscription.findMany({
    where: { userId: { not: excludeUserId } }
  });
  if (subscriptions.length === 0) return;

  // Group subscriptions by userId so we compute badge count once per user
  const byUser = new Map<string, typeof subscriptions>();
  for (const sub of subscriptions) {
    if (!byUser.has(sub.userId)) byUser.set(sub.userId, []);
    byUser.get(sub.userId)!.push(sub);
  }

  const staleIds: string[] = [];

  await Promise.allSettled(
    Array.from(byUser.entries()).map(async ([userId, subs]) => {
      const badgeCount = await getUserUnreadCount(userId);
      const enriched   = { ...payload, badge: badgeCount };
      await Promise.allSettled(
        subs.map(async (sub) => {
          try {
            await webpush.sendNotification(
              { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
              JSON.stringify(enriched)
            );
          } catch (err: unknown) {
            const status = (err as { statusCode?: number }).statusCode;
            if (status === 404 || status === 410) staleIds.push(sub.id);
          }
        })
      );
    })
  );

  if (staleIds.length > 0) {
    await prisma.pushSubscription.deleteMany({ where: { id: { in: staleIds } } });
  }
}

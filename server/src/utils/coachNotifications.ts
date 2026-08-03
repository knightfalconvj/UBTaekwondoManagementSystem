import { prisma } from "../lib/prisma.js";
import { sendPushToUser } from "./webpush.js";

type AthleteActionNotification = {
  type:
    | "ATHLETE_PROFILE_UPDATED"
    | "ATHLETE_CREDENTIALS_UPDATED"
    | "ATHLETE_PHOTO_UPDATED"
    | "ATHLETE_ABSENCE_REASON_SUBMITTED";
  title: string;
  message: string;
  targetId?: string | null;
};

export async function notifyCoachesAboutAthleteAction(
  athleteId: string,
  payload: AthleteActionNotification
) {
  const coaches = await prisma.user.findMany({
    where: { role: "ADMIN" },
    select: { id: true }
  });

  if (coaches.length === 0) return;

  await prisma.notification.createMany({
    data: coaches.map((coach) => ({
      userId: coach.id,
      type: payload.type,
      title: payload.title,
      message: payload.message,
      targetId: payload.targetId ?? athleteId
    }))
  });

  // Fire push notifications to all coaches
  await Promise.allSettled(
    coaches.map((coach) =>
      sendPushToUser(coach.id, {
        title: payload.title,
        body:  payload.message,
        url:   "/dashboard",
        tag:   payload.type
      })
    )
  );
}
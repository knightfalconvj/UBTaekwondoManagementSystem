import { Router } from "express";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth, type RequestWithUser } from "../middlewares/auth.js";
import { profileUpload } from "../middlewares/upload.js";
import { BELT_RANKS } from "../utils/constants.js";
import { hashPassword, verifyPassword } from "../utils/password.js";
import { notifyCoachesAboutAthleteAction } from "../utils/coachNotifications.js";

const updateProfileSchema = z.object({
  fullName: z.string().min(2).optional(),
  contactNumber: z.string().min(1).optional(),
  address: z.string().min(1).optional(),
  emergencyContact: z.string().min(1).optional(),
  beltRank: z.enum(BELT_RANKS).optional()
});

const updateCredentialsSchema = z
  .object({
    email: z.string().email().optional(),
    currentPassword: z.string().min(1),
    newPassword: z.string().min(8).optional()
  })
  .refine((data) => Boolean(data.email || data.newPassword), {
    message: "Provide at least one of email or newPassword"
  });

const meUserSelect = {
  id: true,
  email: true,
  role: true,
  fullName: true,
  isActive: true,
  profilePhoto: true,
  createdAt: true,
  updatedAt: true,
  athleteProfile: true
} as const;

export const meRouter = Router();

meRouter.use(requireAuth);

meRouter.get("/", async (req: RequestWithUser, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.authUser!.id },
    include: { athleteProfile: true }
  });
  res.json(user);
});

meRouter.get("/notifications", async (req: RequestWithUser, res) => {
  const notifications = await prisma.notification.findMany({
    where: { userId: req.authUser!.id },
    orderBy: { createdAt: "desc" },
    take: 30
  });

  res.json(notifications);
});

meRouter.get("/unread-count", async (req: RequestWithUser, res, next) => {
  try {
    const me = req.authUser!.id;
    const [notifCount, dmCount, groupStatus] = await Promise.all([
      prisma.notification.count({ where: { userId: me, isRead: false } }),
      prisma.message.count({ where: { receiverId: me, isRead: false } }),
      prisma.groupMessageReadStatus.findUnique({ where: { userId: me } })
    ]);
    const groupUnread = await prisma.groupMessage.count({
      where: {
        senderId: { not: me },
        ...(groupStatus ? { createdAt: { gt: groupStatus.lastReadAt } } : {})
      }
    });
    res.json({ total: notifCount + dmCount + groupUnread, notifications: notifCount, dms: dmCount, group: groupUnread });
  } catch (err) { next(err); }
});

meRouter.patch("/notifications/:id/read", async (req: RequestWithUser, res) => {
  const id = String(req.params.id);
  const updated = await prisma.notification.updateMany({
    where: { id, userId: req.authUser!.id },
    data: { isRead: true }
  });

  if (updated.count === 0) {
    res.status(404).json({ message: "Notification not found" });
    return;
  }

  res.json({ message: "Notification marked as read" });
});

meRouter.patch("/", async (req: RequestWithUser, res, next) => {
  try {
    const body = updateProfileSchema.parse(req.body);

    if (req.authUser!.role === "ATHLETE") {
      if (!body.fullName || !body.contactNumber || !body.address || !body.emergencyContact || !body.beltRank) {
        res.status(400).json({
          message: "Athlete profile updates require fullName, contactNumber, address, emergencyContact, and beltRank"
        });
        return;
      }
    }

    const updated = await prisma.user.update({
      where: { id: req.authUser!.id },
      data: {
        ...(body.fullName ? { fullName: body.fullName } : {}),
        athleteProfile: req.authUser!.role === "ATHLETE" && body.contactNumber && body.address && body.emergencyContact && body.beltRank
          ? {
              update: {
                contactNumber: body.contactNumber,
                address: body.address,
                emergencyContact: body.emergencyContact,
                beltRank: body.beltRank
              }
            }
          : undefined
      },
      include: { athleteProfile: true }
    });

    if (req.authUser!.role === "ATHLETE") {
      await notifyCoachesAboutAthleteAction(req.authUser!.id, {
        type: "ATHLETE_PROFILE_UPDATED",
        title: "Athlete profile updated",
        message: `${updated.fullName} updated their profile details.`,
        targetId: updated.id
      });
    }

    res.json(updated);
  } catch (error) {
    next(error);
  }
});

meRouter.patch("/credentials", async (req: RequestWithUser, res, next) => {
  try {
    const body = updateCredentialsSchema.parse(req.body);

    const user = await prisma.user.findUnique({ where: { id: req.authUser!.id } });
    if (!user) {
      res.status(404).json({ message: "User not found" });
      return;
    }

    const currentPasswordValid = await verifyPassword(body.currentPassword, user.passwordHash);
    if (!currentPasswordValid) {
      res.status(401).json({ message: "Current password is incorrect" });
      return;
    }

    const nextEmail = body.email?.trim().toLowerCase();
    if (nextEmail && nextEmail !== user.email.toLowerCase()) {
      const existingUser = await prisma.user.findUnique({ where: { email: nextEmail } });
      if (existingUser && existingUser.id !== user.id) {
        res.status(409).json({ message: "Email is already in use" });
        return;
      }
    }

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: {
        ...(nextEmail && nextEmail !== user.email.toLowerCase() ? { email: nextEmail } : {}),
        ...(body.newPassword ? { passwordHash: await hashPassword(body.newPassword) } : {})
      },
      select: meUserSelect
    });

    if (req.authUser!.role === "ATHLETE") {
      await notifyCoachesAboutAthleteAction(req.authUser!.id, {
        type: "ATHLETE_CREDENTIALS_UPDATED",
        title: "Athlete credentials changed",
        message: `${updated.fullName} updated their login credentials.`,
        targetId: updated.id
      });
    }

    res.json({ message: "Credentials updated", user: updated });
  } catch (error) {
    next(error);
  }
});

meRouter.post("/photo", profileUpload.single("photo"), async (req: RequestWithUser, res) => {
  if (!req.file) {
    res.status(400).json({ message: "No file uploaded" });
    return;
  }

  const user = await prisma.user.findUnique({ where: { id: req.authUser!.id } });
  if (user?.profilePhoto) {
    const oldPath = path.join(process.cwd(), user.profilePhoto.replace(/^\//, ""));
    if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
  }

  const profilePhoto = `/uploads/profiles/${req.file.filename}`;
  await prisma.user.update({ where: { id: req.authUser!.id }, data: { profilePhoto } });

  if (req.authUser!.role === "ATHLETE" && user) {
    await notifyCoachesAboutAthleteAction(req.authUser!.id, {
      type: "ATHLETE_PHOTO_UPDATED",
      title: "Athlete profile photo updated",
      message: `${user.fullName} changed their profile photo.`,
      targetId: req.authUser!.id
    });
  }

  res.json({ profilePhoto });
});

meRouter.delete("/photo", async (req: RequestWithUser, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.authUser!.id } });
  if (user?.profilePhoto) {
    const filePath = path.join(process.cwd(), user.profilePhoto.replace(/^\//, ""));
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }
  await prisma.user.update({ where: { id: req.authUser!.id }, data: { profilePhoto: null } });

  if (req.authUser!.role === "ATHLETE" && user) {
    await notifyCoachesAboutAthleteAction(req.authUser!.id, {
      type: "ATHLETE_PHOTO_UPDATED",
      title: "Athlete profile photo removed",
      message: `${user.fullName} removed their profile photo.`,
      targetId: req.authUser!.id
    });
  }

  res.json({ message: "Profile photo deleted" });
});

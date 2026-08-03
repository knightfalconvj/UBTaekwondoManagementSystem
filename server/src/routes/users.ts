import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireAdmin, type RequestWithUser } from "../middlewares/auth.js";
import { hashPassword } from "../utils/password.js";
import { BELT_RANKS } from "../utils/constants.js";
import { logAdminAction } from "../utils/adminLog.js";
import { sendPushToUser } from "../utils/webpush.js";

const createAthleteSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  fullName: z.string().min(2),
  studentId: z.string().min(1),
  contactNumber: z.string().min(1),
  address: z.string().min(1),
  emergencyContact: z.string().min(1),
  beltRank: z.enum(BELT_RANKS)
});

const updateAthleteSchema = createAthleteSchema.partial().extend({ isActive: z.boolean().optional() });
const resetAthletePasswordSchema = z.object({ password: z.string().min(8) });

export const usersRouter = Router();

usersRouter.use(requireAuth, requireAdmin);

usersRouter.get("/athletes", async (_req, res) => {
  const athletes = await prisma.user.findMany({
    where: { role: "ATHLETE" },
    include: {
      athleteProfile: true,
      attendances: true
    },
    orderBy: { createdAt: "desc" }
  });
  res.json(athletes);
});

usersRouter.post("/athletes", async (req: RequestWithUser, res, next) => {
  try {
    const body = createAthleteSchema.parse(req.body);
    const passwordHash = await hashPassword(body.password);
    const created = await prisma.user.create({
      data: {
        email: body.email,
        passwordHash,
        role: "ATHLETE",
        fullName: body.fullName,
        athleteProfile: {
          create: {
            studentId: body.studentId,
            contactNumber: body.contactNumber,
            address: body.address,
            emergencyContact: body.emergencyContact,
            beltRank: body.beltRank
          }
        }
      },
      include: { athleteProfile: true }
    });

    await logAdminAction({
      adminUserId: req.authUser!.id,
      action: "CREATE_ATHLETE",
      targetType: "User",
      targetId: created.id,
      details: `Created athlete ${created.email}`
    });

    await prisma.notification.create({
      data: {
        userId: created.id,
        type: "ACCOUNT_CREATED",
        title: "Athlete account created",
        message: "Your athlete account is ready. You can sign in using your email and password.",
        targetId: created.id
      }
    });
    void sendPushToUser(created.id, {
      title: "Athlete account created",
      body:  "Your athlete account is ready. You can sign in using your email and password.",
      url:   "/dashboard",
      tag:   "ACCOUNT_CREATED"
    });

    res.status(201).json(created);
  } catch (error) {
    next(error);
  }
});

usersRouter.patch("/athletes/:id", async (req: RequestWithUser, res, next) => {
  try {
    const userId = String(req.params.id);
    const body = updateAthleteSchema.parse(req.body);

    const existing = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, fullName: true, isActive: true }
    });

    if (!existing) {
      res.status(404).json({ message: "Athlete not found" });
      return;
    }

    const data: Record<string, unknown> = {};
    if (body.email) data.email = body.email;
    if (body.fullName) data.fullName = body.fullName;
    if (typeof body.isActive === "boolean") data.isActive = body.isActive;
    if (body.password) data.passwordHash = await hashPassword(body.password);

    const updated = await prisma.user.update({
      where: { id: userId },
      data: {
        ...data,
        athleteProfile: body.studentId || body.contactNumber || body.address || body.emergencyContact || body.beltRank
          ? {
              update: {
                ...(body.studentId ? { studentId: body.studentId } : {}),
                ...(body.contactNumber ? { contactNumber: body.contactNumber } : {}),
                ...(body.address ? { address: body.address } : {}),
                ...(body.emergencyContact ? { emergencyContact: body.emergencyContact } : {}),
                ...(body.beltRank ? { beltRank: body.beltRank } : {})
              }
            }
          : undefined
      },
      include: { athleteProfile: true }
    });

    await logAdminAction({
      adminUserId: req.authUser!.id,
      action: "UPDATE_ATHLETE",
      targetType: "User",
      targetId: updated.id,
      details: `Updated athlete ${updated.email}`
    });

    if (typeof body.isActive === "boolean" && body.isActive !== existing.isActive) {
      await prisma.notification.create({
        data: {
          userId: existing.id,
          type: body.isActive ? "VERIFICATION_APPROVED" : "ACCOUNT_DISABLED",
          title: body.isActive ? "Account verified" : "Account disabled",
          message: body.isActive
            ? "Your coach has verified your athlete account. You can now sign in."
            : "Your athlete account has been disabled. Please contact your coach for assistance.",
          targetId: existing.id
        }
      });
    }

    res.json(updated);
  } catch (error) {
    next(error);
  }
});

usersRouter.patch("/athletes/:id/reset-password", async (req: RequestWithUser, res, next) => {
  try {
    const userId = String(req.params.id);
    const { password } = resetAthletePasswordSchema.parse(req.body);

    const athlete = await prisma.user.findUnique({ where: { id: userId } });
    if (!athlete || athlete.role !== "ATHLETE") {
      res.status(404).json({ message: "Athlete not found" });
      return;
    }

    const passwordHash = await hashPassword(password);
    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash }
    });

    await logAdminAction({
      adminUserId: req.authUser!.id,
      action: "RESET_ATHLETE_PASSWORD",
      targetType: "User",
      targetId: athlete.id,
      details: `Reset password for athlete ${athlete.email}`
    });

    res.json({ message: "Athlete password reset successful" });
  } catch (error) {
    next(error);
  }
});

usersRouter.delete("/athletes/:id", async (req: RequestWithUser, res) => {
  const userId = String(req.params.id);
  await prisma.user.delete({ where: { id: userId } });

  await logAdminAction({
    adminUserId: req.authUser!.id,
    action: "DELETE_ATHLETE",
    targetType: "User",
    targetId: userId,
    details: "Deleted athlete account"
  });

  res.json({ message: "Athlete deleted" });
});

usersRouter.get("/admin-logs", async (_req, res) => {
  const logs = await prisma.adminActionLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
    include: {
      adminUser: {
        select: { id: true, fullName: true, email: true }
      }
    }
  });

  res.json(logs);
});

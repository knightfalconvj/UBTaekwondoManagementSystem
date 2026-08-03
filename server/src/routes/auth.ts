import { Router } from "express";
import { z } from "zod";
import crypto from "node:crypto";
import dayjs from "dayjs";
import { prisma } from "../lib/prisma.js";
import { hashPassword, verifyPassword } from "../utils/password.js";
import { signAuthToken } from "../utils/jwt.js";
import { BELT_RANKS } from "../utils/constants.js";
import { logAdminAction } from "../utils/adminLog.js";
import { sendCoachVerificationEmail } from "../utils/mailer.js";
import { sendPushToUser } from "../utils/webpush.js";

const registerSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8),
  fullName: z.string().trim().min(2),
  studentId: z.string().trim().min(1),
  contactNumber: z.string().trim().min(1),
  address: z.string().trim().min(1),
  emergencyContact: z.string().trim().min(1),
  beltRank: z.enum(BELT_RANKS)
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

const forgotPasswordSchema = z.object({ email: z.string().email() });
const resetPasswordSchema = z.object({ token: z.string().min(16), password: z.string().min(8) });

export const authRouter = Router();

const authUserSelect = {
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

authRouter.post("/register", async (req, res, next) => {
  try {
    const body = registerSchema.parse(req.body);
    const normalized = {
      ...body,
      email: body.email.trim().toLowerCase(),
      fullName: body.fullName.trim(),
      studentId: body.studentId.trim(),
      contactNumber: body.contactNumber.trim(),
      address: body.address.trim(),
      emergencyContact: body.emergencyContact.trim()
    };

    const existing = await prisma.user.findUnique({ where: { email: normalized.email } });
    if (existing) {
      res.status(409).json({ message: "Email already registered" });
      return;
    }

    const existingStudent = await prisma.athleteProfile.findUnique({
      where: { studentId: normalized.studentId },
      select: { id: true }
    });
    if (existingStudent) {
      res.status(409).json({ message: "Student ID already registered" });
      return;
    }

    const passwordHash = await hashPassword(normalized.password);
    const user = await prisma.user.create({
      data: {
        email: normalized.email,
        passwordHash,
        role: "ATHLETE",
        fullName: normalized.fullName,
        isActive: false,
        athleteProfile: {
          create: {
            studentId: normalized.studentId,
            contactNumber: normalized.contactNumber,
            address: normalized.address,
            emergencyContact: normalized.emergencyContact,
            beltRank: normalized.beltRank
          }
        }
      },
      select: authUserSelect
    });

    const coach = await prisma.user.findFirst({ where: { role: "ADMIN" }, select: { id: true } });
    if (coach) {
      await logAdminAction({
        adminUserId: coach.id,
        action: "REQUEST_ATHLETE_VERIFICATION",
        targetType: "User",
        targetId: user.id,
        details: `New athlete registration pending verification for ${user.email}`
      });
    }

    const admins = await prisma.user.findMany({
      where: { role: "ADMIN" },
      select: { id: true }
    });

    if (admins.length > 0) {
      await prisma.notification.createMany({
        data: admins.map((admin) => ({
          userId: admin.id,
          type: "VERIFICATION_REQUEST",
          title: "New athlete registration",
          message: `${user.fullName} has registered and is waiting for coach verification.`,
          targetId: user.id
        }))
      });
      // Push to all coaches
      await Promise.allSettled(
        admins.map((admin) =>
          sendPushToUser(admin.id, {
            title: "New athlete registration",
            body:  `${user.fullName} has registered and is waiting for coach verification.`,
            url:   "/athletes",
            tag:   "VERIFICATION_REQUEST"
          })
        )
      );
    }

    const coaches = await prisma.user.findMany({ where: { role: "ADMIN", email: { not: "" } }, select: { email: true } });
    void sendCoachVerificationEmail(
      coaches.map((item) => item.email),
      user.fullName,
      user.email
    ).catch((error) => {
      // eslint-disable-next-line no-console
      console.warn("Failed to send coach verification email", error);
    });

    res.status(201).json({
      message: "Your account is pending coach verification. Please wait until the coach approves it before signing in.",
      user
    });
  } catch (error) {
    next(error);
  }
});

authRouter.post("/login", async (req, res, next) => {
  try {
    const body = loginSchema.parse(req.body);
    const user = await prisma.user.findUnique({
      where: { email: body.email },
      include: { athleteProfile: true }
    });

    if (!user) {
      res.status(401).json({ message: "Invalid credentials" });
      return;
    }

    if (!user.isActive) {
      res.status(403).json({
        message: "Your account is waiting for coach verification. Please wait for approval before signing in."
      });
      return;
    }

    const ok = await verifyPassword(body.password, user.passwordHash);
    if (!ok) {
      res.status(401).json({ message: "Invalid credentials" });
      return;
    }

    const token = signAuthToken({ sub: user.id, role: user.role });
    const safeUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: authUserSelect
    });
    res.json({ token, user: safeUser });
  } catch (error) {
    next(error);
  }
});

authRouter.post("/forgot-password", async (req, res, next) => {
  try {
    const { email } = forgotPasswordSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      res.json({ message: "If the account exists, a reset token was issued." });
      return;
    }

    const token = crypto.randomBytes(20).toString("hex");
    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        token,
        expiresAt: dayjs().add(30, "minute").toDate()
      }
    });

    // For local development we return the token instead of emailing.
    res.json({ message: "Reset token created", resetToken: token });
  } catch (error) {
    next(error);
  }
});

authRouter.post("/reset-password", async (req, res, next) => {
  try {
    const body = resetPasswordSchema.parse(req.body);
    const resetToken = await prisma.passwordResetToken.findUnique({ where: { token: body.token } });
    if (!resetToken || resetToken.usedAt || dayjs(resetToken.expiresAt).isBefore(dayjs())) {
      res.status(400).json({ message: "Invalid or expired reset token" });
      return;
    }

    const passwordHash = await hashPassword(body.password);
    await prisma.$transaction([
      prisma.user.update({ where: { id: resetToken.userId }, data: { passwordHash } }),
      prisma.passwordResetToken.update({ where: { id: resetToken.id }, data: { usedAt: new Date() } })
    ]);

    res.json({ message: "Password reset successful" });
  } catch (error) {
    next(error);
  }
});

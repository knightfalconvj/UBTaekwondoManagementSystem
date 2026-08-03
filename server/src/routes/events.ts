import { Router } from "express";
import dayjs from "dayjs";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireAdmin, type RequestWithUser } from "../middlewares/auth.js";
import { logAdminAction } from "../utils/adminLog.js";
import { notifyCoachesAboutAthleteAction } from "../utils/coachNotifications.js";
import { sendPushToUser } from "../utils/webpush.js";

const eventSchema = z.object({
  title: z.string().min(2),
  type: z.enum(["TRAINING", "TOURNAMENT", "TEAM_EVENT"]),
  date: z.string().datetime(),
  startTime: z.string().min(1),
  endTime: z.string().min(1),
  venue: z.string().min(2),
  remarks: z.string().optional(),
  status: z.enum(["UPCOMING", "COMPLETED"])
});

const attendanceSchema = z.object({
  eventId: z.string(),
  userId: z.string(),
  present: z.boolean()
});

const absenceReasonSchema = z.object({
  reason: z.string().min(3)
});

const reasonReviewSchema = z.object({
  status: z.enum(["VALID", "INVALID"]),
  coachComment: z.string().optional()
});

const dashboardQuerySchema = z.object({
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  eventType: z.enum(["TRAINING", "TOURNAMENT", "TEAM_EVENT"]).optional(),
  warningOnly: z.enum(["true", "false"]).optional()
});

const dashboardSummaryQuerySchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100).optional(),
  eventType: z.enum(["TRAINING", "TOURNAMENT", "TEAM_EVENT"]).optional()
});

const getConsecutiveAbsences = async (userId: string) => {
  const records = await prisma.attendance.findMany({
    where: { userId },
    include: { event: true },
    orderBy: [{ event: { date: "desc" } }, { createdAt: "desc" }]
  });

  let streak = 0;
  for (const record of records) {
    if (record.present) break;
    streak += 1;
  }

  return streak;
};

export const eventsRouter = Router();

eventsRouter.use(requireAuth);

eventsRouter.get("/", async (_req, res) => {
  const events = await prisma.event.findMany({ orderBy: { date: "asc" } });
  res.json(events);
});

eventsRouter.post("/", requireAdmin, async (req: RequestWithUser, res, next) => {
  try {
    const body = eventSchema.parse(req.body);
    const created = await prisma.event.create({
      data: {
        ...body,
        date: new Date(body.date),
        createdById: req.authUser!.id
      }
    });

    await logAdminAction({
      adminUserId: req.authUser!.id,
      action: "CREATE_EVENT",
      targetType: "Event",
      targetId: created.id,
      details: created.title
    });

    res.status(201).json(created);
  } catch (error) {
    next(error);
  }
});

eventsRouter.patch("/:id", requireAdmin, async (req: RequestWithUser, res, next) => {
  try {
    const eventId = String(req.params.id);
    const body = eventSchema.partial().parse(req.body);
    const updated = await prisma.event.update({
      where: { id: eventId },
      data: {
        ...(body.title ? { title: body.title } : {}),
        ...(body.type ? { type: body.type } : {}),
        ...(body.date ? { date: new Date(body.date) } : {}),
        ...(body.startTime ? { startTime: body.startTime } : {}),
        ...(body.endTime ? { endTime: body.endTime } : {}),
        ...(body.venue ? { venue: body.venue } : {}),
        ...(body.remarks !== undefined ? { remarks: body.remarks } : {}),
        ...(body.status ? { status: body.status } : {})
      }
    });

    await logAdminAction({
      adminUserId: req.authUser!.id,
      action: "UPDATE_EVENT",
      targetType: "Event",
      targetId: updated.id,
      details: updated.title
    });

    res.json(updated);
  } catch (error) {
    next(error);
  }
});

eventsRouter.delete("/:id", requireAdmin, async (req: RequestWithUser, res) => {
  const eventId = String(req.params.id);
  await prisma.event.delete({ where: { id: eventId } });
  await logAdminAction({
    adminUserId: req.authUser!.id,
    action: "DELETE_EVENT",
    targetType: "Event",
    targetId: eventId
  });
  res.json({ message: "Event deleted" });
});

eventsRouter.post("/attendance", requireAdmin, async (req: RequestWithUser, res, next) => {
  try {
    const body = attendanceSchema.parse(req.body);
    const updatedAt = new Date();
    const attendance = await prisma.attendance.upsert({
      where: {
        userId_eventId: {
          userId: body.userId,
          eventId: body.eventId
        }
      },
      update: {
        present: body.present,
        ...(body.present
          ? {
              absenceReason: null,
              reasonStatus: "NONE",
              reasonReviewedAt: null,
              reasonReviewedById: null,
              coachComment: null,
              warningFlaggedAt: null
            }
          : {}),
        updatedAt
      },
      create: {
        ...body,
        ...(body.present ? {} : { reasonStatus: "NONE" }),
        updatedAt
      }
    });

    let consecutiveAbsences = 0;
    if (!body.present) {
      consecutiveAbsences = await getConsecutiveAbsences(body.userId);

      if (consecutiveAbsences >= 3) {
        const alreadyWarnedForEvent = await prisma.notification.findFirst({
          where: {
            userId: body.userId,
            type: "ATTENDANCE_WARNING",
            targetId: body.eventId
          }
        });

        if (!alreadyWarnedForEvent) {
          await prisma.notification.create({
            data: {
              userId: body.userId,
              type: "ATTENDANCE_WARNING",
              title: "Attendance Warning",
              message: "You have reached 3 consecutive absences. Please coordinate with your coach.",
              targetId: body.eventId
            }
          });
          void sendPushToUser(body.userId, {
            title: "Attendance Warning",
            body:  "You have reached 3 consecutive absences. Please coordinate with your coach.",
            url:   "/dashboard",
            tag:   "ATTENDANCE_WARNING"
          });
        }

        await prisma.attendance.update({
          where: { id: attendance.id },
          data: { warningFlaggedAt: attendance.warningFlaggedAt ?? new Date() }
        });
      }
    }

    await logAdminAction({
      adminUserId: req.authUser!.id,
      action: "UPSERT_ATTENDANCE",
      targetType: "Attendance",
      targetId: attendance.id,
      details: `event=${body.eventId}, user=${body.userId}, present=${body.present}`
    });

    res.json({ attendance, consecutiveAbsences });
  } catch (error) {
    next(error);
  }
});

eventsRouter.get("/:id/attendance", requireAdmin, async (req: RequestWithUser, res) => {
  const eventId = String(req.params.id);
  const event = await prisma.event.findUnique({ where: { id: eventId } });

  if (!event) {
    res.status(404).json({ message: "Event not found" });
    return;
  }

  const athletes = await prisma.user.findMany({
    where: { role: "ATHLETE", isActive: true },
    include: {
      athleteProfile: true,
      attendances: {
        where: { eventId },
        include: {
          reasonReviewedBy: {
            select: { id: true, fullName: true }
          }
        }
      }
    },
    orderBy: { fullName: "asc" }
  });

  const rows = athletes.map((athlete) => ({
    userId: athlete.id,
    fullName: athlete.fullName,
    beltRank: athlete.athleteProfile?.beltRank ?? "",
    attendance: athlete.attendances[0] ?? null
  }));

  res.json({ event, rows });
});

eventsRouter.patch("/attendance/:attendanceId/reason", async (req: RequestWithUser, res, next) => {
  try {
    if (req.authUser!.role !== "ATHLETE") {
      res.status(403).json({ message: "Athlete access only" });
      return;
    }

    const attendanceId = String(req.params.attendanceId);
    const body = absenceReasonSchema.parse(req.body);
    const current = await prisma.attendance.findUnique({
      where: { id: attendanceId },
      include: { event: true }
    });

    if (!current) {
      res.status(404).json({ message: "Attendance record not found" });
      return;
    }

    if (current.userId !== req.authUser!.id) {
      res.status(403).json({ message: "Forbidden" });
      return;
    }

    if (current.present) {
      res.status(400).json({ message: "Cannot submit absence reason for present attendance" });
      return;
    }

    const athlete = await prisma.user.findUnique({
      where: { id: req.authUser!.id },
      select: { fullName: true }
    });

    const updated = await prisma.attendance.update({
      where: { id: attendanceId },
      data: {
        absenceReason: body.reason,
        reasonStatus: "PENDING",
        reasonReviewedAt: null,
        reasonReviewedById: null,
        coachComment: null,
        updatedAt: new Date()
      }
    });

    await notifyCoachesAboutAthleteAction(req.authUser!.id, {
      type: "ATHLETE_ABSENCE_REASON_SUBMITTED",
      title: "Athlete submitted an absence reason",
      message: `${athlete?.fullName ?? "An athlete"} submitted an absence reason for ${current.event.title}.`,
      targetId: attendanceId
    });

    res.json(updated);
  } catch (error) {
    next(error);
  }
});

eventsRouter.patch("/attendance/:attendanceId/reason-review", requireAdmin, async (req: RequestWithUser, res, next) => {
  try {
    const attendanceId = String(req.params.attendanceId);
    const body = reasonReviewSchema.parse(req.body);

    const attendance = await prisma.attendance.findUnique({
      where: { id: attendanceId },
      include: {
        event: true,
        user: true
      }
    });

    if (!attendance) {
      res.status(404).json({ message: "Attendance record not found" });
      return;
    }

    if (attendance.present) {
      res.status(400).json({ message: "Attendance is marked present" });
      return;
    }

    if (!attendance.absenceReason) {
      res.status(400).json({ message: "No absence reason submitted" });
      return;
    }

    const reviewed = await prisma.attendance.update({
      where: { id: attendanceId },
      data: {
        reasonStatus: body.status,
        coachComment: body.coachComment,
        reasonReviewedAt: new Date(),
        reasonReviewedById: req.authUser!.id,
        updatedAt: new Date()
      }
    });

    await prisma.notification.create({
      data: {
        userId: attendance.userId,
        type: "ATTENDANCE_WARNING",
        title: "Absence Reason Reviewed",
        message: `Your absence reason for ${attendance.event.title} was marked ${body.status.toLowerCase()} by coach.`,
        targetId: attendance.eventId
      }
    });
    void sendPushToUser(attendance.userId, {
      title: "Absence Reason Reviewed",
      body:  `Your absence reason for ${attendance.event.title} was marked ${body.status.toLowerCase()} by coach.`,
      url:   "/dashboard",
      tag:   "ATTENDANCE_REVIEW"
    });

    await logAdminAction({
      adminUserId: req.authUser!.id,
      action: "REVIEW_ATTENDANCE_REASON",
      targetType: "Attendance",
      targetId: attendanceId,
      details: `${attendance.user.fullName}: ${body.status}`
    });

    res.json(reviewed);
  } catch (error) {
    next(error);
  }
});

eventsRouter.get("/attendance/mine", async (req: RequestWithUser, res) => {
  if (req.authUser!.role !== "ATHLETE") {
    res.status(403).json({ message: "Athlete access only" });
    return;
  }

  const records = await prisma.attendance.findMany({
    where: { userId: req.authUser!.id },
    include: {
      event: true,
      reasonReviewedBy: {
        select: { id: true, fullName: true }
      }
    },
    orderBy: [{ event: { date: "desc" } }, { createdAt: "desc" }]
  });

  res.json(records);
});

eventsRouter.get("/attendance/dashboard", requireAdmin, async (req: RequestWithUser, res, next) => {
  try {
    const query = dashboardQuerySchema.parse(req.query);

    const dateFrom = query.dateFrom ? new Date(query.dateFrom) : undefined;
    const dateTo = query.dateTo ? new Date(query.dateTo) : undefined;
    const eventDateFilter = {
      ...(dateFrom ? { gte: dateFrom } : {}),
      ...(dateTo ? { lte: dateTo } : {})
    };

    const attendanceWhere = {
      ...(query.eventType ? { event: { type: query.eventType } } : {}),
      ...(dateFrom || dateTo
        ? {
            event: {
              ...(query.eventType ? { type: query.eventType } : {}),
              date: eventDateFilter
            }
          }
        : {})
    };

    const athletes = await prisma.user.findMany({
      where: { role: "ATHLETE", isActive: true },
      include: {
        athleteProfile: true,
        attendances: {
          where: attendanceWhere,
          include: {
            event: {
              select: { id: true, date: true, type: true, title: true }
            }
          },
          orderBy: [{ event: { date: "desc" } }, { createdAt: "desc" }]
        }
      },
      orderBy: { fullName: "asc" }
    });

    const rows = await Promise.all(athletes.map(async (athlete) => {
      const total = athlete.attendances.length;
      const present = athlete.attendances.filter((item) => item.present).length;
      const absences = total - present;
      const attendanceRate = total === 0 ? 0 : Number(((present / total) * 100).toFixed(2));
      const pendingReasons = athlete.attendances.filter((item) => item.reasonStatus === "PENDING").length;
      const validReasons = athlete.attendances.filter((item) => item.reasonStatus === "VALID").length;
      const invalidReasons = athlete.attendances.filter((item) => item.reasonStatus === "INVALID").length;
      const consecutiveAbsences = await getConsecutiveAbsences(athlete.id);
      const warning = consecutiveAbsences >= 3;

      return {
        athleteId: athlete.id,
        fullName: athlete.fullName,
        beltRank: athlete.athleteProfile?.beltRank ?? "",
        total,
        present,
        absences,
        attendanceRate,
        pendingReasons,
        validReasons,
        invalidReasons,
        consecutiveAbsences,
        warning
      };
    }));

    const filteredRows = query.warningOnly === "true" ? rows.filter((item) => item.warning) : rows;

    const totals = filteredRows.reduce((acc, row) => {
      acc.totalSessions += row.total;
      acc.totalPresent += row.present;
      acc.totalAbsences += row.absences;
      acc.warnedAthletes += row.warning ? 1 : 0;
      acc.pendingReasons += row.pendingReasons;
      return acc;
    }, {
      totalSessions: 0,
      totalPresent: 0,
      totalAbsences: 0,
      warnedAthletes: 0,
      pendingReasons: 0
    });

    res.json({
      filters: query,
      totals: {
        ...totals,
        attendanceRate: totals.totalSessions === 0 ? 0 : Number(((totals.totalPresent / totals.totalSessions) * 100).toFixed(2))
      },
      rows: filteredRows
    });
  } catch (error) {
    next(error);
  }
});

eventsRouter.get("/attendance/summary", async (req: RequestWithUser, res) => {
  const query = dashboardSummaryQuerySchema.parse(req.query);
  const where = req.authUser!.role === "ATHLETE"
    ? { userId: req.authUser!.id }
    : undefined;

  const records = await prisma.attendance.findMany({
    where,
    include: {
      event: {
        select: { type: true, date: true }
      }
    },
    orderBy: [{ event: { date: "desc" } }, { createdAt: "desc" }]
  });
  const filteredRecords = records.filter((item) => {
    if (query.eventType && item.event.type !== query.eventType) {
      return false;
    }

    if (query.year && dayjs(item.event.date).year() !== query.year) {
      return false;
    }

    return true;
  });

  const total = filteredRecords.length;
  const present = filteredRecords.filter((item) => item.present).length;
  const absences = total - present;
  const percentage = total === 0 ? 0 : Number(((present / total) * 100).toFixed(2));

  let consecutiveAbsences = 0;
  for (const record of filteredRecords) {
    if (record.present) break;
    consecutiveAbsences += 1;
  }

  const byEventType = filteredRecords.reduce<Record<string, { total: number; present: number; absences: number }>>((acc, item) => {
    const key = item.event.type;
    if (!acc[key]) acc[key] = { total: 0, present: 0, absences: 0 };
    acc[key].total += 1;
    if (item.present) acc[key].present += 1;
    else acc[key].absences += 1;
    return acc;
  }, {});

  res.json({
    total,
    present,
    absences,
    percentage,
    consecutiveAbsences,
    warning: consecutiveAbsences >= 3,
    byEventType
  });
});

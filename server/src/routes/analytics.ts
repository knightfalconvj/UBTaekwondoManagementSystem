import { Router } from "express";
import dayjs from "dayjs";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth, type RequestWithUser } from "../middlewares/auth.js";

export const analyticsRouter = Router();

analyticsRouter.use(requireAuth);

const analyticsQuerySchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100).optional()
});

analyticsRouter.get("/individual/:athleteProfileId", async (req: RequestWithUser, res) => {
  const query = analyticsQuerySchema.parse(req.query);
  const athleteProfileId = String(req.params.athleteProfileId);
  const profile = await prisma.athleteProfile.findUnique({
    where: { id: athleteProfileId },
    include: {
      user: { include: { attendances: { include: { event: true } } } },
      performanceRecords: true,
      achievements: true,
      rankingPoints: true
    }
  });

  if (!profile) {
    res.status(404).json({ message: "Athlete not found" });
    return;
  }

  if (req.authUser!.role === "ATHLETE" && profile.userId !== req.authUser!.id) {
    res.status(403).json({ message: "Forbidden" });
    return;
  }

  const attendanceRecords = query.year
    ? profile.user.attendances.filter((attendance) => dayjs(attendance.event.date).year() === query.year)
    : profile.user.attendances;
  const performanceRecords = query.year
    ? profile.performanceRecords.filter((record) => dayjs(record.eventDate).year() === query.year)
    : profile.performanceRecords;
  const achievements = query.year
    ? profile.achievements.filter((achievement) => dayjs(achievement.achievedAt).year() === query.year)
    : profile.achievements;
  const rankingPoints = query.year
    ? profile.rankingPoints.filter((point) => String(point.season).includes(String(query.year)))
    : profile.rankingPoints;

  const attendanceTotal = attendanceRecords.length;
  const present = attendanceRecords.filter((a) => a.present).length;
  const attendanceRate = attendanceTotal ? Number(((present / attendanceTotal) * 100).toFixed(2)) : 0;

  const wins = performanceRecords.filter((p) => /win|gold|champion/i.test(p.finalResult)).length;
  const losses = Math.max(performanceRecords.length - wins, 0);
  const totalPoints = rankingPoints.reduce((sum, p) => sum + p.points, 0);

  const achievementsByType = achievements.reduce<Record<string, number>>((acc, ach) => {
    acc[ach.type] = (acc[ach.type] ?? 0) + 1;
    return acc;
  }, {});

  const trend = performanceRecords
    .sort((a, b) => +new Date(a.eventDate) - +new Date(b.eventDate))
    .map((record) => ({
      period: dayjs(record.eventDate).format("YYYY-MM"),
      score: /win|gold|champion|silver|bronze/i.test(record.finalResult) ? 1 : 0,
      result: record.finalResult
    }));

  const hasData =
    attendanceRecords.length > 0 ||
    performanceRecords.length > 0 ||
    achievements.length > 0 ||
    rankingPoints.length > 0;

  res.json({
    hasData,
    attendanceRate,
    winLoss: { wins, losses },
    totalPoints,
    achievementsByType,
    trend
  });
});

analyticsRouter.get("/team", async (req: RequestWithUser, res) => {
  const query = analyticsQuerySchema.parse(req.query);
  const athletes = await prisma.user.findMany({
    where: { role: "ATHLETE" },
    include: {
      attendances: { include: { event: true } },
      athleteProfile: {
        include: {
          achievements: true,
          performanceRecords: true
        }
      }
    }
  });

  const attendanceRecords = athletes.flatMap((a) => a.attendances).filter((attendance) => {
    if (!query.year) return true;
    return dayjs(attendance.event.date).year() === query.year;
  });
  const totalAttendance = attendanceRecords.length;
  const totalPresent = attendanceRecords.filter((a) => a.present).length;
  const teamAttendancePercentage = totalAttendance ? Number(((totalPresent / totalAttendance) * 100).toFixed(2)) : 0;

  const allAchievements = athletes.flatMap((a) => a.athleteProfile?.achievements ?? []).filter((achievement) => {
    if (!query.year) return true;
    return dayjs(achievement.achievedAt).year() === query.year;
  });
  const medals = {
    GOLD: allAchievements.filter((a) => a.type === "GOLD").length,
    SILVER: allAchievements.filter((a) => a.type === "SILVER").length,
    BRONZE: allAchievements.filter((a) => a.type === "BRONZE").length
  };

  const records = athletes.flatMap((a) => a.athleteProfile?.performanceRecords ?? []).filter((record) => {
    if (!query.year) return true;
    return dayjs(record.eventDate).year() === query.year;
  });
  const participationRate = athletes.length === 0 ? 0 : Number(((records.length / athletes.length) * 100).toFixed(2));
  const wins = records.filter((r) => /win|gold|champion/i.test(r.finalResult)).length;
  const teamWinRate = records.length === 0 ? 0 : Number(((wins / records.length) * 100).toFixed(2));

  const hasData = attendanceRecords.length > 0 || allAchievements.length > 0 || records.length > 0;

  res.json({
    hasData,
    teamAttendancePercentage,
    medals,
    competitionParticipationRate: participationRate,
    tournamentWinRate: teamWinRate
  });
});

import { Router } from "express";
import dayjs from "dayjs";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireAdmin, type RequestWithUser } from "../middlewares/auth.js";
import { ACHIEVEMENT_TYPES, POINTS_DEFAULT } from "../utils/constants.js";
import { logAdminAction } from "../utils/adminLog.js";

const tournamentSchema = z.object({
  name: z.string().min(2),
  level: z.enum(["PROVINCIAL", "REGIONAL", "NATIONAL", "INTERNATIONAL"]),
  date: z.string().datetime(),
  venue: z.string().min(2)
});

const rosterSchema = z.object({
  athleteProfileId: z.string()
});

const resultSchema = z.object({
  result: z.string().min(2),
  coachFeedback: z.string().min(2),
  achievementType: z.enum(ACHIEVEMENT_TYPES).optional(),
  points: z.number().int().min(0).optional(),
  season: z.string().min(4).default("2026")
});

export const tournamentsRouter = Router();

tournamentsRouter.use(requireAuth);

const tournamentListQuerySchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100).optional()
});

tournamentsRouter.get("/", async (req: RequestWithUser, res) => {
  const query = tournamentListQuerySchema.parse(req.query);
  const tournaments = await prisma.tournament.findMany({
    where: query.year
      ? {
          date: {
            gte: dayjs(`${query.year}-01-01`).startOf("year").toDate(),
            lt: dayjs(`${query.year}-01-01`).startOf("year").add(1, "year").toDate()
          }
        }
      : undefined,
    include: {
      rosters: {
        where: req.authUser!.role === "ATHLETE"
          ? { athleteProfile: { userId: req.authUser!.id } }
          : undefined,
        include: {
          athleteProfile: { include: { user: true } }
        }
      }
    },
    orderBy: { date: "desc" }
  });
  res.json(tournaments);
});

tournamentsRouter.post("/", requireAdmin, async (req: RequestWithUser, res, next) => {
  try {
    const body = tournamentSchema.parse(req.body);
    const created = await prisma.tournament.create({
      data: {
        ...body,
        date: new Date(body.date)
      }
    });

    await logAdminAction({
      adminUserId: req.authUser!.id,
      action: "CREATE_TOURNAMENT",
      targetType: "Tournament",
      targetId: created.id,
      details: created.name
    });

    res.status(201).json(created);
  } catch (error) {
    next(error);
  }
});

tournamentsRouter.patch("/:id", requireAdmin, async (req: RequestWithUser, res, next) => {
  try {
    const tournamentId = String(req.params.id);
    const body = tournamentSchema.partial().parse(req.body);
    const updated = await prisma.tournament.update({
      where: { id: tournamentId },
      data: {
        ...(body.name ? { name: body.name } : {}),
        ...(body.level ? { level: body.level } : {}),
        ...(body.date ? { date: new Date(body.date) } : {}),
        ...(body.venue ? { venue: body.venue } : {})
      }
    });

    await logAdminAction({
      adminUserId: req.authUser!.id,
      action: "UPDATE_TOURNAMENT",
      targetType: "Tournament",
      targetId: updated.id,
      details: updated.name
    });

    res.json(updated);
  } catch (error) {
    next(error);
  }
});

tournamentsRouter.delete("/:id", requireAdmin, async (req: RequestWithUser, res) => {
  const tournamentId = String(req.params.id);
  await prisma.tournament.delete({ where: { id: tournamentId } });
  await logAdminAction({
    adminUserId: req.authUser!.id,
    action: "DELETE_TOURNAMENT",
    targetType: "Tournament",
    targetId: tournamentId
  });
  res.json({ message: "Tournament deleted" });
});

tournamentsRouter.post("/:id/roster", requireAdmin, async (req: RequestWithUser, res, next) => {
  try {
    const tournamentId = String(req.params.id);
    const body = rosterSchema.parse(req.body);
    const roster = await prisma.tournamentRoster.create({
      data: {
        tournamentId,
        athleteProfileId: body.athleteProfileId
      }
    });

    await logAdminAction({
      adminUserId: req.authUser!.id,
      action: "ASSIGN_ROSTER",
      targetType: "TournamentRoster",
      targetId: roster.id
    });

    res.status(201).json(roster);
  } catch (error) {
    next(error);
  }
});

tournamentsRouter.delete("/:id/roster/:rosterId", requireAdmin, async (req: RequestWithUser, res) => {
  const rosterId = String(req.params.rosterId);
  await prisma.tournamentRoster.delete({ where: { id: rosterId } });
  await logAdminAction({
    adminUserId: req.authUser!.id,
    action: "REMOVE_ROSTER",
    targetType: "TournamentRoster",
    targetId: rosterId
  });
  res.json({ message: "Athlete removed from roster" });
});

tournamentsRouter.patch("/:id/roster/:rosterId/result", requireAdmin, async (req: RequestWithUser, res, next) => {
  try {
    const rosterId = String(req.params.rosterId);
    const body = resultSchema.parse(req.body);
    const roster = await prisma.tournamentRoster.update({
      where: { id: rosterId },
      data: {
        result: body.result,
        coachFeedback: body.coachFeedback
      },
      include: {
        athleteProfile: { include: { user: true } },
        tournament: true
      }
    });

    await prisma.performanceRecord.create({
      data: {
        athleteProfileId: roster.athleteProfileId,
        eventName: roster.tournament.name,
        eventDate: roster.tournament.date,
        finalResult: body.result,
        coachFeedback: body.coachFeedback
      }
    });

    if (body.achievementType) {
      await prisma.achievement.create({
        data: {
          athleteProfileId: roster.athleteProfileId,
          type: body.achievementType,
          eventName: roster.tournament.name,
          achievedAt: roster.tournament.date
        }
      });
    }

    await prisma.rankingPoint.create({
      data: {
        athleteProfileId: roster.athleteProfileId,
        level: roster.tournament.level,
        points: body.points ?? POINTS_DEFAULT[roster.tournament.level],
        season: body.season
      }
    });

    await logAdminAction({
      adminUserId: req.authUser!.id,
      action: "UPDATE_RESULT",
      targetType: "TournamentRoster",
      targetId: roster.id,
      details: `${roster.athleteProfile.user.fullName} - ${body.result}`
    });

    res.json({ message: "Result updated and synced" });
  } catch (error) {
    next(error);
  }
});

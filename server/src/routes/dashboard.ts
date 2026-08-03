import { Router } from "express";
import dayjs from "dayjs";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth, type RequestWithUser } from "../middlewares/auth.js";

export const dashboardRouter = Router();

dashboardRouter.use(requireAuth);

const dashboardEventsQuerySchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100).optional(),
  eventType: z.enum(["TRAINING", "TOURNAMENT", "TEAM_EVENT"]).optional()
});

dashboardRouter.get("/upcoming-events", async (req: RequestWithUser, res) => {
  const query = dashboardEventsQuerySchema.parse(req.query);
  const now = dayjs().startOf("day").toDate();
  const dateFilter = query.year
    ? {
        gte: dayjs(`${query.year}-01-01`).startOf("year").toDate(),
        lt: dayjs(`${query.year}-01-01`).startOf("year").add(1, "year").toDate()
      }
    : { gte: now };

  const events = await prisma.event.findMany({
    where: {
      ...(query.eventType ? { type: query.eventType } : {}),
      ...(query.year ? {} : { status: "UPCOMING" }),
      date: dateFilter
    },
    orderBy: { date: "asc" },
    ...(query.year ? {} : { take: 10 })
  });
  res.json(events);
});

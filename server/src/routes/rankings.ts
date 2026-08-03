import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth, type RequestWithUser } from "../middlewares/auth.js";

export const rankingsRouter = Router();

rankingsRouter.use(requireAuth);

rankingsRouter.get("/", async (req: RequestWithUser, res) => {
  const athletes = await prisma.athleteProfile.findMany({
    include: {
      user: true,
      rankingPoints: true
    }
  });

  const ranked = athletes
    .map((athlete) => {
      const previousSeasonPoints = athlete.rankingPoints
        .filter((p) => p.season === "2025")
        .reduce((sum, p) => sum + p.points, 0);
      const totalPoints = athlete.rankingPoints.reduce((sum, p) => sum + p.points, 0);
      const finalScore = previousSeasonPoints + totalPoints;

      return {
        athleteProfileId: athlete.id,
        athleteName: athlete.user.fullName,
        beltRank: athlete.beltRank,
        previousSeasonPoints,
        totalPoints,
        finalScore
      };
    })
    .sort((a, b) => b.finalScore - a.finalScore)
    .map((item, index) => ({ ...item, rank: index + 1 }));

  if (req.authUser!.role === "ATHLETE") {
    const profile = await prisma.athleteProfile.findUnique({ where: { userId: req.authUser!.id } });
    if (!profile) {
      res.json([]);
      return;
    }

    const ownRow = ranked.find((row) => row.athleteProfileId === profile.id);
    res.json(ownRow ? [ownRow] : []);
    return;
  }

  res.json(ranked);
});

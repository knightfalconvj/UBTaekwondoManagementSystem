import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth, type RequestWithUser } from "../middlewares/auth.js";
import { config } from "../config.js";

const subscribeSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth:   z.string().min(1)
  })
});

export const pushRouter = Router();
pushRouter.use(requireAuth);

// GET /api/push/vapid-public-key
pushRouter.get("/vapid-public-key", (_req, res) => {
  res.json({ publicKey: config.vapid.publicKey });
});

// POST /api/push/subscribe
pushRouter.post("/subscribe", async (req: RequestWithUser, res, next) => {
  try {
    const me = req.authUser!.id;
    const body = subscribeSchema.parse(req.body);

    await prisma.pushSubscription.upsert({
      where:  { endpoint: body.endpoint },
      update: { userId: me, p256dh: body.keys.p256dh, auth: body.keys.auth },
      create: { userId: me, endpoint: body.endpoint, p256dh: body.keys.p256dh, auth: body.keys.auth }
    });

    res.status(201).json({ ok: true });
  } catch (err) { next(err); }
});

// DELETE /api/push/unsubscribe
pushRouter.delete("/unsubscribe", async (req: RequestWithUser, res, next) => {
  try {
    const me = req.authUser!.id;
    const { endpoint } = z.object({ endpoint: z.string() }).parse(req.body);

    await prisma.pushSubscription.deleteMany({ where: { userId: me, endpoint } });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

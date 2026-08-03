import type { NextFunction, Request, Response } from "express";
import { prisma } from "../lib/prisma.js";
import { verifyAuthToken } from "../utils/jwt.js";

export type RequestWithUser = Request & {
  authUser?: {
    id: string;
    role: "ATHLETE" | "ADMIN";
  };
};

export async function requireAuth(req: RequestWithUser, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ message: "Missing bearer token" });
    return;
  }

  try {
    const token = authHeader.slice("Bearer ".length);
    const payload = verifyAuthToken(token);
    const user = await prisma.user.findUnique({ where: { id: payload.sub } });

    if (!user || !user.isActive) {
      res.status(401).json({ message: "Invalid user" });
      return;
    }

    req.authUser = { id: user.id, role: user.role };
    next();
  } catch {
    res.status(401).json({ message: "Invalid or expired token" });
  }
}

export function requireAdmin(req: RequestWithUser, res: Response, next: NextFunction): void {
  if (!req.authUser || req.authUser.role !== "ADMIN") {
    res.status(403).json({ message: "Admin access only" });
    return;
  }
  next();
}

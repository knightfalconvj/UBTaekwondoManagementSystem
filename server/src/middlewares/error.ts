import type { NextFunction, Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { ZodError } from "zod";

export function errorHandler(error: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (error instanceof ZodError) {
    res.status(400).json({ message: "Validation error", issues: error.issues });
    return;
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") {
      const fields = Array.isArray(error.meta?.target) ? error.meta?.target.join(", ") : "unique field";
      if (fields.includes("email")) {
        res.status(409).json({ message: "Email already registered" });
        return;
      }
      if (fields.includes("studentId")) {
        res.status(409).json({ message: "Student ID already registered" });
        return;
      }
      res.status(409).json({ message: `Duplicate value for ${fields}` });
      return;
    }

    if (error.code === "P2025") {
      res.status(404).json({ message: "Requested record was not found" });
      return;
    }
  }

  if (error instanceof Error) {
    res.status(500).json({ message: error.message });
    return;
  }

  res.status(500).json({ message: "Unknown server error" });
}

import { PrismaClient } from "@prisma/client";

// Singleton Prisma client instance shared across the application
export const prisma = new PrismaClient();

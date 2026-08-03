import { prisma } from "../lib/prisma.js";

export async function logAdminAction(params: {
  adminUserId: string;
  action: string;
  targetType: string;
  targetId?: string;
  details?: string;
}): Promise<void> {
  await prisma.adminActionLog.create({ data: params });
}

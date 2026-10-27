import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/utils/password.js";

const prisma = new PrismaClient();

async function seedDevelopmentAccounts() {
  const adminEmail = "coach.admin@ub.edu.ph";
  const athleteEmail = "athlete.sample@ub.edu.ph";

  const existingAdmin = await prisma.user.findUnique({ where: { email: adminEmail } });
  if (!existingAdmin) {
    await prisma.user.create({
      data: {
        email: adminEmail,
        passwordHash: await hashPassword("AdminPass123!"),
        role: "ADMIN",
        fullName: "Coach Admin"
      }
    });
  }

  const existingAthlete = await prisma.user.findUnique({ where: { email: athleteEmail } });
  if (!existingAthlete) {
    await prisma.user.create({
      data: {
        email: athleteEmail,
        passwordHash: await hashPassword("AthletePass123!"),
        role: "ATHLETE",
        fullName: "Sample Athlete",
        athleteProfile: {
          create: {
            studentId: "2026-0001",
            contactNumber: "09171234567",
            address: "Tagbilaran City, Bohol",
            emergencyContact: "Parent - 09179876543",
            beltRank: "White"
          }
        }
      }
    });
  }
}

async function seedProductionAdmin() {
  const existingAdmin = await prisma.user.findFirst({ where: { role: "ADMIN" }, select: { id: true } });
  if (existingAdmin) return;

  const email = process.env.INITIAL_ADMIN_EMAIL?.trim().toLowerCase();
  const fullName = process.env.INITIAL_ADMIN_NAME?.trim();
  const password = process.env.INITIAL_ADMIN_PASSWORD;

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !fullName || fullName.length < 2 || !password) {
    throw new Error("Set valid INITIAL_ADMIN_EMAIL, INITIAL_ADMIN_NAME, and INITIAL_ADMIN_PASSWORD values.");
  }
  if (password.length < 16) {
    throw new Error("INITIAL_ADMIN_PASSWORD must be at least 16 characters.");
  }

  await prisma.user.create({
    data: {
      email,
      passwordHash: await hashPassword(password),
      role: "ADMIN",
      fullName
    }
  });
}

async function main() {
  if (process.env.NODE_ENV === "production") {
    await seedProductionAdmin();
  } else {
    await seedDevelopmentAccounts();
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    // eslint-disable-next-line no-console
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });

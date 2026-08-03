import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/utils/password.js";

const prisma = new PrismaClient();

async function main() {
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

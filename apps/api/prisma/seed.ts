import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const roles = ["ADMIN", "MANAGER", "INVENTORY_STAFF", "SALES_STAFF", "VIEWER"];

  for (const name of roles) {
    await prisma.role.upsert({
      where: { name },
      update: {},
      create: { name }
    });
  }

  const channels = ["Direct", "PickMe Food", "Uber Eats", "Instagram", "WhatsApp", "Other"];

  for (const name of channels) {
    await prisma.salesChannel.upsert({
      where: { name },
      update: {},
      create: { name }
    });
  }

  const adminRole = await prisma.role.findUniqueOrThrow({
    where: { name: "ADMIN" }
  });

  const passwordHash = await bcrypt.hash("Admin@123", 10);

  const adminUser = await prisma.user.upsert({
    where: { email: "admin@baura.local" },
    update: {},
    create: {
      firstName: "Baura",
      lastName: "Admin",
      email: "admin@baura.local",
      passwordHash
    }
  });

  await prisma.userRole.upsert({
    where: {
      userId_roleId: {
        userId: adminUser.id,
        roleId: adminRole.id
      }
    },
    update: {},
    create: {
      userId: adminUser.id,
      roleId: adminRole.id
    }
  });

  console.log("Seed completed");
  console.log("Admin email: admin@baura.local");
  console.log("Admin password: Admin@123");
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });
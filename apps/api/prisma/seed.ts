import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function seedRoles() {
  const roles = [
    {
      name: "ADMIN",
      description: "Full system administration access"
    },
    {
      name: "MANAGER",
      description: "Bakery management and operational oversight"
    },
    {
      name: "INVENTORY_STAFF",
      description: "Ingredients, GRN and inventory operations"
    },
    {
      name: "PRODUCTION_STAFF",
      description: "Production batches and bakery stock operations"
    },
    {
      name: "SALES_STAFF",
      description: "POS and sales operations"
    },
    {
      name: "ACCOUNT_STAFF",
      description: "Finance and accounting operations"
    },
    {
      name: "VIEWER",
      description: "Read-only reporting access"
    }
  ];

  for (const role of roles) {
    await prisma.role.upsert({
      where: {
        name: role.name
      },
      update: {
        description: role.description
      },
      create: role
    });
  }
}

async function seedSalesChannels() {
  const channels = [
    "Direct",
    "PickMe Food",
    "Uber Eats",
    "Instagram",
    "WhatsApp",
    "Other"
  ];

  for (const name of channels) {
    await prisma.salesChannel.upsert({
      where: {
        name
      },
      update: {},
      create: {
        name
      }
    });
  }
}

async function seedDocumentSequences() {
  const sequences = [
    {
      key: "GRN",
      prefix: "GRN"
    },
    {
      key: "PRODUCTION",
      prefix: "PRD"
    },
    {
      key: "SALE",
      prefix: "SAL"
    },
    {
      key: "SUPPLIER",
      prefix: "SUP"
    },
    {
      key: "STOCK_ADJUSTMENT",
      prefix: "ADJ"
    },
    {
      key: "WASTE",
      prefix: "WST"
    },
    {
      key: "RETURN",
      prefix: "RTN"
    }
  ];

  for (const sequence of sequences) {
    await prisma.documentSequence.upsert({
      where: {
        key: sequence.key
      },
      update: {
        prefix: sequence.prefix
      },
      create: {
        key: sequence.key,
        prefix: sequence.prefix,
        nextValue: 1
      }
    });
  }
}

async function seedAdmin() {
  const adminRole =
    await prisma.role.findUniqueOrThrow({
      where: {
        name: "ADMIN"
      }
    });

  let admin =
    await prisma.user.findUnique({
      where: {
        email: "admin@baura.local"
      }
    });

  if (!admin) {
    const passwordHash =
      await bcrypt.hash(
        "Admin@123",
        12
      );

    admin =
      await prisma.user.create({
        data: {
          firstName: "Baura",
          lastName: "Admin",
          email: "admin@baura.local",
          passwordHash,
          isActive: true
        }
      });
  }

  await prisma.userRole.upsert({
    where: {
      userId_roleId: {
        userId: admin.id,
        roleId: adminRole.id
      }
    },
    update: {},
    create: {
      userId: admin.id,
      roleId: adminRole.id
    }
  });
}

async function main() {
  await seedRoles();
  await seedSalesChannels();
  await seedDocumentSequences();
  await seedAdmin();

  console.log("");
  console.log("Baura Bakery ERP seed completed.");
  console.log("");
  console.log("Roles:");
  console.log("  ADMIN");
  console.log("  MANAGER");
  console.log("  INVENTORY_STAFF");
  console.log("  PRODUCTION_STAFF");
  console.log("  SALES_STAFF");
  console.log("  ACCOUNT_STAFF");
  console.log("  VIEWER");
  console.log("");
  console.log("Document sequences initialized.");
  console.log("");
}

main()
  .catch((error) => {
    console.error(
      "Seed failed:",
      error
    );

    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { prisma } from "../../lib/prisma";
import { authMiddleware } from "../../middleware/auth.middleware";

const router = Router();

type UserRoleWithRole = {
  role: {
    name: string;
  };
};

router.post("/login", async (req, res) => {
  const { email, password } = req.body as {
    email?: string;
    password?: string;
  };

  if (!email || !password) {
    return res.status(400).json({ message: "Email and password are required" });
  }

  const user = await prisma.user.findUnique({
    where: { email },
    include: {
      roles: {
        include: {
          role: true
        }
      }
    }
  });

  if (!user || !user.isActive) {
    return res.status(401).json({ message: "Invalid email or password" });
  }

  const isPasswordValid = await bcrypt.compare(password, user.passwordHash);

  if (!isPasswordValid) {
    return res.status(401).json({ message: "Invalid email or password" });
  }

  const roles = user.roles.map((userRole: UserRoleWithRole) => userRole.role.name);

  const token = jwt.sign(
    {
      id: user.id,
      email: user.email,
      roles
    },
    process.env.JWT_SECRET || "fallback_secret",
    {
      expiresIn: "8h"
    }
  );

  return res.json({
    token,
    user: {
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      roles
    }
  });
});

router.get("/me", authMiddleware, async (req, res) => {
  if (!req.user) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    include: {
      roles: {
        include: {
          role: true
        }
      }
    }
  });

  if (!user || !user.isActive) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  return res.json({
    user: {
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      roles: user.roles.map((userRole: UserRoleWithRole) => userRole.role.name)
    }
  });
});

export default router;
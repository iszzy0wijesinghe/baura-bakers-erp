import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

import { prisma } from "../../lib/prisma";
import { env } from "../../config/env";
import { authMiddleware } from "../../middleware/auth.middleware";

const router = Router();

function normalizeEmail(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

router.post("/login", async (req, res) => {
  const email = normalizeEmail(req.body?.email);

  const password =
    typeof req.body?.password === "string"
      ? req.body.password
      : "";

  if (!email || !password) {
    return res.status(400).json({
      message: "Email and password are required.",
    });
  }

  if (
    email.length > 254 ||
    password.length > 256
  ) {
    return res.status(400).json({
      message: "Invalid login details.",
    });
  }

  const user = await prisma.user.findUnique({
    where: {
      email,
    },

    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      passwordHash: true,
      isActive: true,

      roles: {
        select: {
          role: {
            select: {
              name: true,
            },
          },
        },
      },
    },
  });

  if (!user || !user.isActive) {
    return res.status(401).json({
      message: "Invalid email or password.",
    });
  }

  const isPasswordValid =
    await bcrypt.compare(
      password,
      user.passwordHash,
    );

  if (!isPasswordValid) {
    return res.status(401).json({
      message: "Invalid email or password.",
    });
  }

  const roles = user.roles.map(
    (userRole) =>
      userRole.role.name,
  );

  const token = jwt.sign(
    {
      email: user.email,
      type: "access",
    },
    env.JWT_SECRET,
    {
      subject: user.id,

      expiresIn:
        env.JWT_EXPIRES_IN as jwt.SignOptions["expiresIn"],

      algorithm: "HS256",
      issuer: "baura-erp-api",
      audience: "baura-erp",
    },
  );

  return res.json({
    token,

    user: {
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      roles,
    },
  });
});

router.get(
  "/me",
  authMiddleware,
  async (req, res) => {
    if (!req.user) {
      return res.status(401).json({
        message: "Unauthorized",
      });
    }

    const user =
      await prisma.user.findUnique({
        where: {
          id: req.user.id,
        },

        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          isActive: true,

          roles: {
            select: {
              role: {
                select: {
                  name: true,
                },
              },
            },
          },
        },
      });

    if (!user || !user.isActive) {
      return res.status(401).json({
        message: "Unauthorized",
      });
    }

    return res.json({
      user: {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,

        roles: user.roles.map(
          (userRole) =>
            userRole.role.name,
        ),
      },
    });
  },
);

export default router;
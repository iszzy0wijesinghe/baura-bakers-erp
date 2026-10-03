import type {
  NextFunction,
  Request,
  Response,
} from "express";

import jwt from "jsonwebtoken";

import { prisma } from "../lib/prisma";
import { env } from "../config/env";

export type AuthUser = {
  id: string;
  email: string;
  roles: string[];
};

type AccessTokenPayload = {
  sub: string;
  email: string;
  type: "access";
};

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const authHeader =
    req.headers.authorization;

  if (
    !authHeader ||
    !authHeader.startsWith(
      "Bearer ",
    )
  ) {
    return res.status(401).json({
      message:
        "Authentication required",
    });
  }

  const token = authHeader
    .slice("Bearer ".length)
    .trim();

  if (!token) {
    return res.status(401).json({
      message:
        "Authentication required",
    });
  }

  try {
    const decoded = jwt.verify(
      token,
      env.JWT_SECRET,
      {
        algorithms: [
          "HS256",
        ],
        issuer:
          "baura-erp-api",
        audience:
          "baura-erp",
      },
    ) as AccessTokenPayload;

    if (
      decoded.type !==
        "access" ||
      !decoded.sub
    ) {
      return res.status(401).json({
        message:
          "Invalid session.",
      });
    }

    const user =
      await prisma.user.findUnique({
        where: {
          id: decoded.sub,
        },

        select: {
          id: true,
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

    if (
      !user ||
      !user.isActive
    ) {
      return res.status(401).json({
        message:
          "Your account is unavailable. Please sign in again.",
      });
    }

    req.user = {
      id: user.id,
      email: user.email,

      roles: user.roles.map(
        (userRole) =>
          userRole.role.name,
      ),
    };

    return next();
  } catch (error) {
    if (
      error instanceof
      jwt.TokenExpiredError
    ) {
      return res.status(401).json({
        message:
          "Your session has expired. Please sign in again.",
      });
    }

    return res.status(401).json({
      message:
        "Invalid session. Please sign in again.",
    });
  }
}

export function requireRoles(
  ...allowedRoles: string[]
) {
  return (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    if (!req.user) {
      return res.status(401).json({
        message:
          "Authentication required",
      });
    }

    const allowed =
      req.user.roles.some(
        (role) =>
          allowedRoles.includes(
            role,
          ),
      );

    if (!allowed) {
      return res.status(403).json({
        message:
          "You do not have permission to perform this action.",
      });
    }

    return next();
  };
}

export function hasRole(
  req: Request,
  role: string,
) {
  return Boolean(
    req.user?.roles.includes(
      role,
    ),
  );
}

export function hasAnyRole(
  req: Request,
  ...roles: string[]
) {
  if (!req.user) {
    return false;
  }

  return req.user.roles.some(
    (role) =>
      roles.includes(role),
  );
}
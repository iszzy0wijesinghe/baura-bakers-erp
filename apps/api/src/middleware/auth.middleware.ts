import type {
  NextFunction,
  Request,
  Response,
} from "express";

import jwt from "jsonwebtoken";

import { env } from "../config/env";
import { prisma } from "../lib/prisma";

export type AuthUser = {
  id: string;
  email: string;

  officialSiteUserId:
    number | null;

  roleId:
    number | null;

  roleCode:
    string | null;

  roleName:
    string | null;

  permissions:
    string[];

  /**
   * Temporary compatibility field.
   *
   * Do not use this for new authorization
   * decisions. Existing ERP modules will be
   * migrated from role checks to permissions.
   */
  roles: string[];
};

type AccessTokenPayload = {
  sub: string;
  email: string;
  type: "access";

  officialSiteUserId?:
    number;

  roleId?:
    number | null;

  roleCode?:
    string | null;

  roleName?:
    string | null;

  permissions?:
    string[];
};

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

function normalizePermissions(
  value: unknown,
): string[] {
  if (
    !Array.isArray(
      value,
    )
  ) {
    return [];
  }

  return Array.from(
    new Set(
      value
        .filter(
          (
            permission,
          ): permission is string =>
            typeof permission ===
              "string",
        )
        .map(
          (permission) =>
            permission.trim(),
        )
        .filter(Boolean),
    ),
  );
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
    return res
      .status(401)
      .json({
        message:
          "Authentication required",
      });
  }

  const token =
    authHeader
      .slice(
        "Bearer ".length,
      )
      .trim();

  if (!token) {
    return res
      .status(401)
      .json({
        message:
          "Authentication required",
      });
  }

  try {
    const decoded =
      jwt.verify(
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
      return res
        .status(401)
        .json({
          message:
            "Invalid session.",
        });
    }

    const permissions =
      normalizePermissions(
        decoded.permissions,
      );

    /*
     * Every valid ERP session must carry the
     * canonical ERP access permission.
     *
     * Old tokens issued before the RBAC migration
     * are intentionally rejected so users must
     * sign in again and receive a permission-aware
     * token.
     */
    if (
      !permissions.includes(
        "erp.access",
      )
    ) {
      return res
        .status(401)
        .json({
          message:
            "Your session is no longer valid. Please sign in again.",
        });
    }

    const user =
      await prisma.user.findUnique({
        where: {
          id:
            decoded.sub,
        },

        select: {
          id: true,
          email: true,
          isActive: true,

          officialSiteUserId:
            true,

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
      !user.isActive ||
      user.officialSiteUserId ===
        null
    ) {
      return res
        .status(401)
        .json({
          message:
            "Your account is unavailable. Please sign in again.",
        });
    }

    /*
     * Prevent a token linked to one official-site
     * identity from being used against another
     * linked ERP identity.
     */
    if (
      typeof decoded
        .officialSiteUserId ===
        "number" &&
      decoded
        .officialSiteUserId !==
        user.officialSiteUserId
    ) {
      return res
        .status(401)
        .json({
          message:
            "Invalid session. Please sign in again.",
        });
    }

    req.user = {
      id:
        user.id,

      email:
        user.email,

      officialSiteUserId:
        user.officialSiteUserId,

      roleId:
        typeof decoded.roleId ===
          "number"
          ? decoded.roleId
          : null,

      roleCode:
        typeof decoded.roleCode ===
          "string"
          ? decoded.roleCode
          : null,

      roleName:
        typeof decoded.roleName ===
          "string"
          ? decoded.roleName
          : null,

      permissions,

      roles:
        user.roles.map(
          (
            userRole,
          ) =>
            userRole.role.name,
        ),
    };

    return next();
  } catch (error) {
    if (
      error instanceof
      jwt.TokenExpiredError
    ) {
      return res
        .status(401)
        .json({
          message:
            "Your session has expired. Please sign in again.",
        });
    }

    return res
      .status(401)
      .json({
        message:
          "Invalid session. Please sign in again.",
      });
  }
}

/*
|--------------------------------------------------------------------------
| Canonical permission authorization
|--------------------------------------------------------------------------
*/

export function requirePermission(
  permission: string,
) {
  return (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    if (!req.user) {
      return res
        .status(401)
        .json({
          message:
            "Authentication required",
        });
    }

    if (
      !req.user.permissions.includes(
        permission,
      )
    ) {
      return res
        .status(403)
        .json({
          message:
            "You do not have permission to perform this action.",
        });
    }

    return next();
  };
}

export function requireAnyPermission(
  ...permissions: string[]
) {
  return (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    if (!req.user) {
      return res
        .status(401)
        .json({
          message:
            "Authentication required",
        });
    }

    const allowed =
      permissions.some(
        (permission) =>
          req.user?.permissions.includes(
            permission,
          ),
      );

    if (!allowed) {
      return res
        .status(403)
        .json({
          message:
            "You do not have permission to perform this action.",
        });
    }

    return next();
  };
}

export function requireAllPermissions(
  ...permissions: string[]
) {
  return (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    if (!req.user) {
      return res
        .status(401)
        .json({
          message:
            "Authentication required",
        });
    }

    const allowed =
      permissions.every(
        (permission) =>
          req.user?.permissions.includes(
            permission,
          ),
      );

    if (!allowed) {
      return res
        .status(403)
        .json({
          message:
            "You do not have permission to perform this action.",
        });
    }

    return next();
  };
}

export function hasPermission(
  req: Request,
  permission: string,
): boolean {
  return Boolean(
    req.user?.permissions.includes(
      permission,
    ),
  );
}

export function hasAnyPermission(
  req: Request,
  ...permissions: string[]
): boolean {
  if (!req.user) {
    return false;
  }

  return permissions.some(
    (permission) =>
      req.user?.permissions.includes(
        permission,
      ),
  );
}

export function hasAllPermissions(
  req: Request,
  ...permissions: string[]
): boolean {
  if (!req.user) {
    return false;
  }

  return permissions.every(
    (permission) =>
      req.user?.permissions.includes(
        permission,
      ),
  );
}

/*
|--------------------------------------------------------------------------
| Temporary legacy helpers
|--------------------------------------------------------------------------
|
| Existing ERP modules still contain role-based authorization.
|
| Keep these temporarily so this migration does not break unrelated routes
| before we replace them with requirePermission()/hasPermission().
|
| DO NOT use these functions in new code.
|
*/

export function requireRoles(
  ...allowedRoles: string[]
) {
  return (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    if (!req.user) {
      return res
        .status(401)
        .json({
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
      return res
        .status(403)
        .json({
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
): boolean {
  return Boolean(
    req.user?.roles.includes(
      role,
    ),
  );
}

export function hasAnyRole(
  req: Request,
  ...roles: string[]
): boolean {
  if (!req.user) {
    return false;
  }

  return req.user.roles.some(
    (role) =>
      roles.includes(
        role,
      ),
  );
}
import {
  Prisma,
} from "@prisma/client";
import { Router } from "express";
import jwt from "jsonwebtoken";

import { env } from "../../config/env";
import { prisma } from "../../lib/prisma";
import {
  authMiddleware,
} from "../../middleware/auth.middleware";

const router = Router();

type OfficialSiteAccess = {
  erp: boolean;
  pos: boolean;
  website_admin: boolean;
};

type OfficialSiteUser = {
  id: number;
  name: string;
  email: string;

  role: string | null;

  role_id: number | null;
  role_code: string | null;
  role_name: string | null;

  is_active: boolean;

  permissions: string[];

  access: OfficialSiteAccess;
};

type OfficialSiteAuthSuccess = {
  authenticated: true;
  user: OfficialSiteUser;
};

type AccessTokenPayload = {
  email: string;
  type: "access";

  officialSiteUserId: number;

  roleId: number | null;
  roleCode: string | null;
  roleName: string | null;

  permissions: string[];
};

function normalizeEmail(
  value: unknown,
): string {
  return String(
    value ?? "",
  )
    .trim()
    .toLowerCase();
}

function normalizePermissionKeys(
  value: unknown,
): string[] {
  if (!Array.isArray(value)) {
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
  ).sort();
}

function nullableString(
  value: unknown,
): string | null {
  if (
    typeof value !==
    "string"
  ) {
    return null;
  }

  const normalized =
    value.trim();

  return normalized
    ? normalized
    : null;
}

function nullablePositiveInteger(
  value: unknown,
): number | null {
  if (
    typeof value !==
      "number" ||
    !Number.isInteger(
      value,
    ) ||
    value <= 0
  ) {
    return null;
  }

  return value;
}

function splitName(
  value: string,
): {
  firstName: string;
  lastName: string;
} {
  const normalized =
    value
      .trim()
      .replace(
        /\s+/g,
        " ",
      );

  if (!normalized) {
    return {
      firstName: "ERP",
      lastName: "User",
    };
  }

  const parts =
    normalized.split(
      " ",
    );

  const firstName =
    parts.shift() ??
    "ERP";

  const lastName =
    parts.join(" ");

  return {
    firstName,

    lastName:
      lastName ||
      "User",
  };
}

function isOfficialSiteAccess(
  value: unknown,
): value is OfficialSiteAccess {
  if (
    typeof value !==
      "object" ||
    value === null
  ) {
    return false;
  }

  const access =
    value as Record<
      string,
      unknown
    >;

  return (
    typeof access.erp ===
      "boolean" &&
    typeof access.pos ===
      "boolean" &&
    typeof access.website_admin ===
      "boolean"
  );
}

function parseOfficialSiteUser(
  value: unknown,
): OfficialSiteUser | null {
  if (
    typeof value !==
      "object" ||
    value === null
  ) {
    return null;
  }

  const user =
    value as Record<
      string,
      unknown
    >;

  if (
    typeof user.id !==
      "number" ||
    !Number.isInteger(
      user.id,
    ) ||
    user.id <= 0
  ) {
    return null;
  }

  if (
    typeof user.name !==
      "string" ||
    !user.name.trim()
  ) {
    return null;
  }

  if (
    typeof user.email !==
      "string" ||
    !user.email.trim()
  ) {
    return null;
  }

  if (
    user.is_active !==
    true
  ) {
    return null;
  }

  if (
    !isOfficialSiteAccess(
      user.access,
    )
  ) {
    return null;
  }

  const permissions =
    normalizePermissionKeys(
      user.permissions,
    );

  /*
   * Laravel is the canonical authorization
   * authority.
   *
   * ERP authentication is permitted only when
   * the effective permission set contains
   * erp.access and the convenience access flag
   * agrees with it.
   */
  if (
    !permissions.includes(
      "erp.access",
    ) ||
    user.access.erp !==
      true
  ) {
    return null;
  }

  return {
    id:
      user.id,

    name:
      user.name.trim(),

    email:
      normalizeEmail(
        user.email,
      ),

    role:
      nullableString(
        user.role,
      ),

    role_id:
      nullablePositiveInteger(
        user.role_id,
      ),

    role_code:
      nullableString(
        user.role_code,
      ),

    role_name:
      nullableString(
        user.role_name,
      ),

    is_active:
      true,

    permissions,

    access:
      user.access,
  };
}

function parseOfficialAuthSuccess(
  value: unknown,
): OfficialSiteAuthSuccess | null {
  if (
    typeof value !==
      "object" ||
    value === null
  ) {
    return null;
  }

  const response =
    value as Record<
      string,
      unknown
    >;

  if (
    response.authenticated !==
    true
  ) {
    return null;
  }

  const user =
    parseOfficialSiteUser(
      response.user,
    );

  if (!user) {
    return null;
  }

  return {
    authenticated:
      true,

    user,
  };
}

function officialSiteUrl(
  path: string,
): string {
  return new URL(
    path,
    env.OFFICIAL_SITE_API_URL,
  ).toString();
}

async function authenticateWithOfficialSite(
  email: string,
  password: string,
): Promise<
  | {
      ok: true;
      user: OfficialSiteUser;
    }
  | {
      ok: false;
      status: number;
      message: string;
    }
> {
  let response: Response;

  try {
    response =
      await fetch(
        officialSiteUrl(
          "/api/v1/integrations/erp/authenticate",
        ),
        {
          method:
            "POST",

          headers: {
            Accept:
              "application/json",

            "Content-Type":
              "application/json",

            Authorization:
              `Bearer ${env.ERP_INTEGRATION_TOKEN}`,
          },

          body:
            JSON.stringify({
              email,
              password,
            }),

          signal:
            AbortSignal.timeout(
              10_000,
            ),
        },
      );
  } catch (error) {
    console.error(
      "Official-site authentication request failed:",
      error,
    );

    return {
      ok: false,
      status: 503,

      message:
        "Authentication service is temporarily unavailable.",
    };
  }

  let body:
    unknown = null;

  try {
    body =
      await response.json();
  } catch {
    body = null;
  }

  if (!response.ok) {
    /*
     * Keep credential/account failures generic.
     *
     * Laravel deliberately does not reveal
     * whether the email, password, account state
     * or ERP access permission caused rejection.
     */
    if (
      response.status ===
        401 ||
      response.status ===
        422
    ) {
      return {
        ok: false,
        status: 401,

        message:
          "Invalid email or password.",
      };
    }

    console.error(
      "Official-site authentication returned an unexpected status:",
      response.status,
      body,
    );

    return {
      ok: false,
      status: 503,

      message:
        "Authentication service is temporarily unavailable.",
    };
  }

  const parsed =
    parseOfficialAuthSuccess(
      body,
    );

  if (!parsed) {
    console.error(
      "Official-site authentication returned an invalid RBAC response.",
      body,
    );

    return {
      ok: false,
      status: 503,

      message:
        "Authentication service is temporarily unavailable.",
    };
  }

  return {
    ok: true,
    user:
      parsed.user,
  };
}

async function synchronizeErpUser(
  officialUser: OfficialSiteUser,
) {
  const email =
    normalizeEmail(
      officialUser.email,
    );

  const {
    firstName,
    lastName,
  } = splitName(
    officialUser.name,
  );

  return prisma.$transaction(
    async (tx) => {
      let user =
        await tx.user.findUnique({
          where: {
            officialSiteUserId:
              officialUser.id,
          },
        });

      if (!user) {
        /*
         * An ERP identity may already exist from
         * the old local-auth system.
         *
         * Link it by email instead of creating a
         * duplicate user.
         */
        const existingByEmail =
          await tx.user.findUnique({
            where: {
              email,
            },
          });

        if (
          existingByEmail &&
          existingByEmail
            .officialSiteUserId !==
            null &&
          existingByEmail
            .officialSiteUserId !==
            officialUser.id
        ) {
          throw new Error(
            "ERP email is already linked to another official-site user.",
          );
        }

        if (
          existingByEmail
        ) {
          user =
            await tx.user.update({
              where: {
                id:
                  existingByEmail.id,
              },

              data: {
                officialSiteUserId:
                  officialUser.id,

                firstName,
                lastName,
                email,

                isActive:
                  true,

                /*
                 * Local ERP password authentication
                 * is no longer authoritative.
                 */
                passwordHash:
                  null,
              },
            });
        } else {
          user =
            await tx.user.create({
              data: {
                officialSiteUserId:
                  officialUser.id,

                firstName,
                lastName,
                email,

                isActive:
                  true,

                passwordHash:
                  null,
              },
            });
        }
      } else {
        const emailOwner =
          await tx.user.findUnique({
            where: {
              email,
            },
          });

        if (
          emailOwner &&
          emailOwner.id !==
            user.id
        ) {
          throw new Error(
            "Official-site email belongs to another ERP user.",
          );
        }

        user =
          await tx.user.update({
            where: {
              id:
                user.id,
            },

            data: {
              firstName,
              lastName,
              email,

              isActive:
                true,

              passwordHash:
                null,
            },
          });
      }

      /*
       * IMPORTANT
       * ---------
       *
       * We intentionally do NOT translate the
       * Laravel role into ADMIN / MANAGER /
       * CASHIER here anymore.
       *
       * Laravel permissions are now the
       * authorization authority.
       *
       * Existing ERP UserRole records are left
       * untouched temporarily because several
       * old ERP modules still depend on them.
       *
       * Those role checks will be removed
       * module-by-module in the next migration
       * stage.
       */

      return tx.user.findUniqueOrThrow({
        where: {
          id:
            user.id,
        },

        select: {
          id: true,

          officialSiteUserId:
            true,

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
    },
    {
      isolationLevel:
        Prisma
          .TransactionIsolationLevel
          .ReadCommitted,
    },
  );
}

function createAccessToken(
  userId: string,
  email: string,
  officialUser: OfficialSiteUser,
): string {
  const payload:
    AccessTokenPayload = {
      email,

      type:
        "access",

      officialSiteUserId:
        officialUser.id,

      roleId:
        officialUser.role_id,

      roleCode:
        officialUser.role_code,

      roleName:
        officialUser.role_name ??
        officialUser.role,

      permissions:
        officialUser.permissions,
    };

  return jwt.sign(
    payload,
    env.JWT_SECRET,
    {
      subject:
        userId,

      expiresIn:
        env.JWT_EXPIRES_IN as jwt.SignOptions["expiresIn"],

      algorithm:
        "HS256",

      issuer:
        "baura-erp-api",

      audience:
        "baura-erp",
    },
  );
}

router.post(
  "/login",
  async (
    req,
    res,
  ) => {
    const email =
      normalizeEmail(
        req.body?.email,
      );

    const password =
      typeof req.body
        ?.password ===
      "string"
        ? req.body.password
        : "";

    if (
      !email ||
      !password
    ) {
      return res
        .status(400)
        .json({
          message:
            "Email and password are required.",
        });
    }

    if (
      email.length >
        254 ||
      password.length >
        256
    ) {
      return res
        .status(400)
        .json({
          message:
            "Invalid login details.",
        });
    }

    const authentication =
      await authenticateWithOfficialSite(
        email,
        password,
      );

    if (
      !authentication.ok
    ) {
      return res
        .status(
          authentication.status,
        )
        .json({
          message:
            authentication.message,
        });
    }

    const officialUser =
      authentication.user;

    /*
     * Defense in depth.
     *
     * Laravel already checks erp.access, but ERP
     * verifies the effective permission again
     * before issuing its own session.
     */
    if (
      !officialUser
        .permissions
        .includes(
          "erp.access",
        )
    ) {
      return res
        .status(401)
        .json({
          message:
            "Invalid email or password.",
        });
    }

    let user;

    try {
      user =
        await synchronizeErpUser(
          officialUser,
        );
    } catch (error) {
      console.error(
        "Failed to synchronize ERP identity:",
        error,
      );

      return res
        .status(503)
        .json({
          message:
            "Your ERP account could not be prepared. Please try again.",
        });
    }

    if (
      !user.isActive
    ) {
      return res
        .status(401)
        .json({
          message:
            "Invalid email or password.",
        });
    }

    const token =
      createAccessToken(
        user.id,
        user.email,
        officialUser,
      );

    return res.json({
      token,

      user: {
        id:
          user.id,

        officialSiteUserId:
          officialUser.id,

        firstName:
          user.firstName,

        lastName:
          user.lastName,

        email:
          user.email,

        /*
         * Canonical Laravel RBAC identity.
         */
        roleId:
          officialUser.role_id,

        roleCode:
          officialUser.role_code,

        roleName:
          officialUser.role_name ??
          officialUser.role,

        permissions:
          officialUser.permissions,

        access:
          officialUser.access,

        /*
         * Temporary compatibility only.
         *
         * Existing ERP modules may still inspect
         * local roles until we migrate every route
         * to permission checks.
         */
        roles:
          user.roles.map(
            (
              userRole,
            ) =>
              userRole.role.name,
          ),
      },
    });
  },
);

router.get(
  "/me",
  authMiddleware,
  async (
    req,
    res,
  ) => {
    if (!req.user) {
      return res
        .status(401)
        .json({
          message:
            "Unauthorized",
        });
    }

    const user =
      await prisma.user.findUnique({
        where: {
          id:
            req.user.id,
        },

        select: {
          id: true,

          officialSiteUserId:
            true,

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
            "Unauthorized",
        });
    }

    return res.json({
      user: {
        id:
          user.id,

        officialSiteUserId:
          user.officialSiteUserId,

        firstName:
          user.firstName,

        lastName:
          user.lastName,

        email:
          user.email,

        roleId:
          req.user.roleId,

        roleCode:
          req.user.roleCode,

        roleName:
          req.user.roleName,

        permissions:
          req.user.permissions,

        access: {
          erp:
            req.user.permissions.includes(
              "erp.access",
            ),

          pos:
            req.user.permissions.includes(
              "erp.pos.access",
            ),

          websiteAdmin:
            req.user.permissions.includes(
              "website-admin.access",
            ),
        },

        roles:
          user.roles.map(
            (
              userRole,
            ) =>
              userRole.role.name,
          ),
      },
    });
  },
);

export default router;
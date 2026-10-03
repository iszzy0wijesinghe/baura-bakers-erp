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

const ERP_ROLE_NAMES = [
  "ADMIN",
  "MANAGER",
  "CASHIER",
] as const;

type ErpRole =
  (typeof ERP_ROLE_NAMES)[number];

type OfficialSiteRole =
  | "Admin"
  | "Manager"
  | "Cashier";

type OfficialSiteUser = {
  id: number;
  name: string;
  email: string;
  role: OfficialSiteRole;
  is_active: boolean;
};

type OfficialSiteAuthSuccess = {
  authenticated: true;
  user: OfficialSiteUser;
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

function splitName(
  value: string,
): {
  firstName: string;
  lastName: string;
} {
  const normalized = value
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
    normalized.split(" ");

  const firstName =
    parts.shift() ?? "ERP";

  const lastName =
    parts.join(" ");

  return {
    firstName,
    lastName:
      lastName || "User",
  };
}

function mapOfficialRole(
  role: OfficialSiteRole,
): ErpRole {
  switch (role) {
    case "Admin":
      return "ADMIN";

    case "Manager":
      return "MANAGER";

    case "Cashier":
      return "CASHIER";
  }
}

function isOfficialSiteUser(
  value: unknown,
): value is OfficialSiteUser {
  if (
    typeof value !== "object" ||
    value === null
  ) {
    return false;
  }

  const user =
    value as Record<
      string,
      unknown
    >;

  return (
    typeof user.id === "number" &&
    Number.isInteger(user.id) &&
    user.id > 0 &&
    typeof user.name === "string" &&
    user.name.trim().length > 0 &&
    typeof user.email === "string" &&
    user.email.trim().length > 0 &&
    (
      user.role === "Admin" ||
      user.role === "Manager" ||
      user.role === "Cashier"
    ) &&
    user.is_active === true
  );
}

function isOfficialAuthSuccess(
  value: unknown,
): value is OfficialSiteAuthSuccess {
  if (
    typeof value !== "object" ||
    value === null
  ) {
    return false;
  }

  const response =
    value as Record<
      string,
      unknown
    >;

  return (
    response.authenticated ===
      true &&
    isOfficialSiteUser(
      response.user,
    )
  );
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
    response = await fetch(
      officialSiteUrl(
        "/api/v1/integrations/erp/authenticate",
      ),
      {
        method: "POST",

        headers: {
          Accept:
            "application/json",

          "Content-Type":
            "application/json",

          Authorization:
            `Bearer ${env.ERP_INTEGRATION_TOKEN}`,
        },

        body: JSON.stringify({
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

  let body: unknown = null;

  try {
    body =
      await response.json();
  } catch {
    body = null;
  }

  if (!response.ok) {
    /*
     * A 401 from Laravel means the supplied
     * credentials/account are invalid.
     *
     * Do not leak whether the email, password,
     * active state or role caused the failure.
     */
    if (
      response.status === 401 ||
      response.status === 422
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
    );

    return {
      ok: false,
      status: 503,
      message:
        "Authentication service is temporarily unavailable.",
    };
  }

  if (
    !isOfficialAuthSuccess(
      body,
    )
  ) {
    console.error(
      "Official-site authentication returned an invalid response.",
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
    user: body.user,
  };
}

async function synchronizeErpUser(
  officialUser: OfficialSiteUser,
) {
  const email =
    normalizeEmail(
      officialUser.email,
    );

  const roleName =
    mapOfficialRole(
      officialUser.role,
    );

  const {
    firstName,
    lastName,
  } = splitName(
    officialUser.name,
  );

  return prisma.$transaction(
    async (tx) => {
      const role =
        await tx.role.findUnique({
          where: {
            name: roleName,
          },
        });

      if (!role) {
        throw new Error(
          `Required ERP role ${roleName} does not exist.`,
        );
      }

      let user =
        await tx.user.findUnique({
          where: {
            officialSiteUserId:
              officialUser.id,
          },
        });

      if (!user) {
        /*
         * During migration, an existing ERP user
         * may already use the same email.
         *
         * We link that identity instead of creating
         * a duplicate ERP user.
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

        if (existingByEmail) {
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
                isActive: true,

                /*
                 * Authentication now belongs to
                 * the official-site backend.
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
                isActive: true,

                passwordHash:
                  null,
              },
            });
        }
      } else {
        /*
         * The canonical ID is already linked.
         *
         * If the email has changed on the official
         * site, make sure it does not belong to
         * another ERP identity before synchronizing.
         */
        const emailOwner =
          await tx.user.findUnique({
            where: {
              email,
            },
          });

        if (
          emailOwner &&
          emailOwner.id !== user.id
        ) {
          throw new Error(
            "Official-site email belongs to another ERP user.",
          );
        }

        user =
          await tx.user.update({
            where: {
              id: user.id,
            },

            data: {
              firstName,
              lastName,
              email,
              isActive: true,
              passwordHash: null,
            },
          });
      }

      /*
       * Laravel is authoritative for the ERP
       * access role.
       *
       * Remove the three canonical ERP-access
       * roles and assign exactly the role
       * returned by Laravel.
       *
       * Other specialist ERP roles such as
       * INVENTORY_STAFF are left untouched for
       * now because they are not represented by
       * the official-site role enum.
       */
      const canonicalRoles =
        await tx.role.findMany({
          where: {
            name: {
              in: [
                ...ERP_ROLE_NAMES,
              ],
            },
          },

          select: {
            id: true,
          },
        });

      if (
        canonicalRoles.length > 0
      ) {
        await tx.userRole.deleteMany({
          where: {
            userId: user.id,

            roleId: {
              in:
                canonicalRoles.map(
                  (item) =>
                    item.id,
                ),
            },
          },
        });
      }

      await tx.userRole.create({
        data: {
          userId: user.id,
          roleId: role.id,
        },
      });

      return tx.user.findUniqueOrThrow({
        where: {
          id: user.id,
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
    },
    {
      isolationLevel:
        Prisma.TransactionIsolationLevel
          .ReadCommitted,
    },
  );
}

router.post(
  "/login",
  async (req, res) => {
    const email =
      normalizeEmail(
        req.body?.email,
      );

    const password =
      typeof req.body?.password ===
      "string"
        ? req.body.password
        : "";

    if (
      !email ||
      !password
    ) {
      return res.status(400).json({
        message:
          "Email and password are required.",
      });
    }

    if (
      email.length > 254 ||
      password.length > 256
    ) {
      return res.status(400).json({
        message:
          "Invalid login details.",
      });
    }

    const authentication =
      await authenticateWithOfficialSite(
        email,
        password,
      );

    if (!authentication.ok) {
      return res
        .status(
          authentication.status,
        )
        .json({
          message:
            authentication.message,
        });
    }

    let user;

    try {
      user =
        await synchronizeErpUser(
          authentication.user,
        );
    } catch (error) {
      console.error(
        "Failed to synchronize ERP identity:",
        error,
      );

      return res.status(503).json({
        message:
          "Your ERP account could not be prepared. Please try again.",
      });
    }

    if (!user.isActive) {
      return res.status(401).json({
        message:
          "Invalid email or password.",
      });
    }

    const roles =
      user.roles.map(
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

        issuer:
          "baura-erp-api",

        audience:
          "baura-erp",
      },
    );

    return res.json({
      token,

      user: {
        id: user.id,
        officialSiteUserId:
          authentication.user.id,
        firstName:
          user.firstName,
        lastName:
          user.lastName,
        email: user.email,
        roles,
      },
    });
  },
);

router.get(
  "/me",
  authMiddleware,
  async (req, res) => {
    if (!req.user) {
      return res.status(401).json({
        message:
          "Unauthorized",
      });
    }

    const user =
      await prisma.user.findUnique({
        where: {
          id: req.user.id,
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
      return res.status(401).json({
        message:
          "Unauthorized",
      });
    }

    return res.json({
      user: {
        id: user.id,

        officialSiteUserId:
          user.officialSiteUserId,

        firstName:
          user.firstName,

        lastName:
          user.lastName,

        email:
          user.email,

        roles:
          user.roles.map(
            (userRole) =>
              userRole.role.name,
          ),
      },
    });
  },
);

export default router;
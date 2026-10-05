import { Router } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";

import { prisma } from "../../lib/prisma";
import {
  authMiddleware,
  hasPermission,
  requirePermission,
} from "../../middleware/auth.middleware";

const router = Router();

router.use(authMiddleware);

const APPROVAL_EXPIRY_MINUTES = 5;

const approvalTypes = [
  "MANUAL_DISCOUNT",
  "CANCEL_SALE",
  "REFUND",
  "RETURN",
] as const;

type ApprovalContext = Record<string, unknown>;

const approvalIdSchema = z.string().uuid();

const requestApprovalSchema = z.object({
  type: z.enum(approvalTypes),

  saleId: z
    .string()
    .uuid()
    .optional()
    .nullable(),

  amount: z.coerce
    .number()
    .finite()
    .nonnegative()
    .optional()
    .nullable(),

  reason: z
    .string()
    .trim()
    .max(500)
    .optional()
    .nullable(),

  context: z
    .record(z.unknown())
    .optional()
    .nullable(),
});

const rejectApprovalSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(
      1,
      "Rejection reason is required",
    )
    .max(500),
});

function getExpiryDate() {
  return new Date(
    Date.now() +
      APPROVAL_EXPIRY_MINUTES *
        60 *
        1000,
  );
}

function toPrismaJson(
  value:
    | ApprovalContext
    | null
    | undefined,
):
  | Prisma.InputJsonValue
  | undefined {
  if (
    value === undefined ||
    value === null
  ) {
    return undefined;
  }

  return value as Prisma.InputJsonValue;
}

function parseApprovalId(
  value: unknown,
) {
  return approvalIdSchema.safeParse(
    String(value ?? ""),
  );
}

async function expireOldApprovals() {
  const now = new Date();

  await prisma.posApproval.updateMany({
    where: {
      status: {
        in: [
          "PENDING",
          "APPROVED",
        ],
      },

      expiresAt: {
        lte: now,
      },

      usedAt: null,
    },

    data: {
      status: "EXPIRED",
    },
  });
}

/*
|--------------------------------------------------------------------------
| Request manager approval
|--------------------------------------------------------------------------
|
| Any authenticated POS user with POS access may REQUEST an approval.
|
| Requesting an approval does not grant the privileged action.
| The protected action still has to consume a valid APPROVED approval
| server-side.
|
*/

router.post(
  "/",
  requirePermission(
    "erp.pos.access",
  ),
  async (req, res) => {
    if (!req.user) {
      return res
        .status(401)
        .json({
          message:
            "Authentication required",
        });
    }

    const parsed =
      requestApprovalSchema.safeParse(
        req.body,
      );

    if (!parsed.success) {
      return res
        .status(400)
        .json({
          message:
            "Invalid approval request",
          errors:
            parsed.error.flatten(),
        });
    }

    const {
      type,
      saleId,
      amount,
      reason,
      context,
    } = parsed.data;

    if (
      type ===
      "MANUAL_DISCOUNT"
    ) {
      if (
        amount === undefined ||
        amount === null ||
        amount <= 0
      ) {
        return res
          .status(400)
          .json({
            message:
              "A positive discount amount is required.",
          });
      }
    }

    if (
      (
        type ===
          "CANCEL_SALE" ||
        type ===
          "REFUND" ||
        type ===
          "RETURN"
      ) &&
      !saleId
    ) {
      return res
        .status(400)
        .json({
          message:
            "Sale is required for this approval type.",
        });
    }

    if (saleId) {
      const sale =
        await prisma.salesOrder.findUnique({
          where: {
            id: saleId,
          },

          select: {
            id: true,
            status: true,
          },
        });

      if (!sale) {
        return res
          .status(404)
          .json({
            message:
              "Sale not found.",
          });
      }

      if (
        (
          type === "REFUND" ||
          type === "RETURN"
        ) &&
        sale.status !==
          "COMPLETED"
      ) {
        return res
          .status(409)
          .json({
            message:
              "Only completed sales can be refunded or returned.",
          });
      }

      if (
        type ===
          "CANCEL_SALE" &&
        (
          sale.status ===
            "CANCELLED" ||
          sale.status ===
            "REFUNDED"
        )
      ) {
        return res
          .status(409)
          .json({
            message:
              "This sale is already cancelled or refunded.",
          });
      }
    }

    await expireOldApprovals();

    const now = new Date();

    /*
     * Protect against repeated clicks creating many equivalent pending
     * approval requests.
     */
    const existingRequest =
      await prisma.posApproval.findFirst({
        where: {
          requestedById:
            req.user.id,

          type,

          saleId:
            saleId ?? null,

          status:
            "PENDING",

          expiresAt: {
            gt: now,
          },
        },

        orderBy: {
          createdAt: "desc",
        },
      });

    if (existingRequest) {
      const sameAmount =
        type !==
          "MANUAL_DISCOUNT" ||
        Number(
          existingRequest.amount,
        ) === Number(amount);

      if (sameAmount) {
        return res
          .status(200)
          .json({
            message:
              "Manager approval is already pending.",

            approval: {
              id:
                existingRequest.id,

              type:
                existingRequest.type,

              status:
                existingRequest.status,

              amount:
                existingRequest.amount,

              saleId:
                existingRequest.saleId,

              reason:
                existingRequest.reason,

              expiresAt:
                existingRequest.expiresAt,

              createdAt:
                existingRequest.createdAt,
            },
          });
      }
    }

    const approval =
      await prisma.$transaction(
        async (tx) => {
          const created =
            await tx.posApproval.create({
              data: {
                type,

                status:
                  "PENDING",

                requestedById:
                  req.user!.id,

                saleId:
                  saleId ?? null,

                amount:
                  amount ?? null,

                reason:
                  reason || null,

                contextJson:
                  toPrismaJson(
                    context,
                  ),

                expiresAt:
                  getExpiryDate(),
              },

              select: {
                id: true,
                type: true,
                status: true,
                saleId: true,
                amount: true,
                reason: true,
                expiresAt: true,
                createdAt: true,
              },
            });

          await tx.auditLog.create({
            data: {
              userId:
                req.user!.id,

              action:
                "REQUEST",

              entityType:
                "PosApproval",

              entityId:
                created.id,

              afterJson: {
                type:
                  created.type,

                saleId:
                  created.saleId,

                amount:
                  created.amount,

                reason:
                  created.reason,

                expiresAt:
                  created.expiresAt,
              },
            },
          });

          return created;
        },
      );

    return res
      .status(201)
      .json({
        message:
          "Manager approval requested.",
        approval,
      });
  },
);

/*
|--------------------------------------------------------------------------
| Get approval status
|--------------------------------------------------------------------------
|
| Requester can read their own approval.
|
| Users with erp.pos.approvals.read may inspect other users' approval
| requests.
|
*/

router.get(
  "/:id/status",
  requirePermission(
    "erp.pos.access",
  ),
  async (req, res) => {
    if (!req.user) {
      return res
        .status(401)
        .json({
          message:
            "Authentication required",
        });
    }

    const parsedId =
      parseApprovalId(
        req.params.id,
      );

    if (!parsedId.success) {
      return res
        .status(400)
        .json({
          message:
            "Invalid approval ID.",
        });
    }

    await expireOldApprovals();

    const approval =
      await prisma.posApproval.findUnique({
        where: {
          id: parsedId.data,
        },

        select: {
          id: true,
          type: true,
          status: true,

          requestedById:
            true,

          approvedById:
            true,

          saleId: true,
          amount: true,
          reason: true,
          expiresAt: true,
          approvedAt: true,
          usedAt: true,
          createdAt: true,
        },
      });

    if (!approval) {
      return res
        .status(404)
        .json({
          message:
            "Approval request not found.",
        });
    }

    const canReadAll =
      hasPermission(
        req,
        "erp.pos.approvals.read",
      );

    if (
      approval.requestedById !==
        req.user.id &&
      !canReadAll
    ) {
      return res
        .status(403)
        .json({
          message:
            "You do not have permission to view this approval request.",
        });
    }

    return res.json({
      approval: {
        id:
          approval.id,

        type:
          approval.type,

        status:
          approval.status,

        saleId:
          approval.saleId,

        amount:
          approval.amount,

        reason:
          approval.reason,

        expiresAt:
          approval.expiresAt,

        approvedAt:
          approval.approvedAt,

        usedAt:
          approval.usedAt,

        createdAt:
          approval.createdAt,
      },
    });
  },
);

/*
|--------------------------------------------------------------------------
| List pending approvals
|--------------------------------------------------------------------------
*/

router.get(
  "/pending",
  requirePermission(
    "erp.pos.approvals.read",
  ),
  async (_req, res) => {
    await expireOldApprovals();

    const now = new Date();

    const approvals =
      await prisma.posApproval.findMany({
        where: {
          status:
            "PENDING",

          expiresAt: {
            gt: now,
          },
        },

        orderBy: {
          createdAt: "asc",
        },

        take: 100,

        include: {
          requestedBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },

          sale: {
            select: {
              id: true,
              orderNo: true,
              grossTotal: true,
              discountTotal: true,
              netTotal: true,
              status: true,
              soldAt: true,
            },
          },
        },
      });

    return res.json({
      approvals,
    });
  },
);

/*
|--------------------------------------------------------------------------
| Approve request
|--------------------------------------------------------------------------
|
| This endpoint only changes the approval record to APPROVED.
|
| The actual privileged operation must separately validate and consume
| this approval inside the operation's own transaction.
|
*/

router.post(
  "/:id/approve",
  requirePermission(
    "erp.pos.approvals.update",
  ),
  async (req, res) => {
    if (!req.user) {
      return res
        .status(401)
        .json({
          message:
            "Authentication required",
        });
    }

    const parsedId =
      parseApprovalId(
        req.params.id,
      );

    if (!parsedId.success) {
      return res
        .status(400)
        .json({
          message:
            "Invalid approval ID.",
        });
    }

    await expireOldApprovals();

    const approval =
      await prisma.posApproval.findUnique({
        where: {
          id: parsedId.data,
        },
      });

    if (!approval) {
      return res
        .status(404)
        .json({
          message:
            "Approval request not found.",
        });
    }

    /*
     * Separation of duties:
     * even a user who possesses approval permission cannot approve
     * their own request.
     */
    if (
      approval.requestedById ===
      req.user.id
    ) {
      return res
        .status(403)
        .json({
          message:
            "You cannot approve your own POS approval request.",
        });
    }

    if (
      approval.status ===
        "EXPIRED" ||
      approval.expiresAt.getTime() <=
        Date.now()
    ) {
      if (
        approval.status !==
          "EXPIRED"
      ) {
        await prisma.posApproval.updateMany({
          where: {
            id:
              approval.id,

            status: {
              in: [
                "PENDING",
                "APPROVED",
              ],
            },

            usedAt: null,
          },

          data: {
            status:
              "EXPIRED",
          },
        });
      }

      return res
        .status(409)
        .json({
          message:
            "This approval request has expired.",
        });
    }

    if (
      approval.status !==
      "PENDING"
    ) {
      return res
        .status(409)
        .json({
          message:
            `This approval request is already ${approval.status.toLowerCase()}.`,
        });
    }

    const approvedAt =
      new Date();

    const approved =
      await prisma.$transaction(
        async (tx) => {
          /*
           * Conditional update makes manager approval race-safe.
           * Only one manager can transition PENDING -> APPROVED.
           */
          const updated =
            await tx.posApproval.updateMany({
              where: {
                id:
                  approval.id,

                status:
                  "PENDING",

                expiresAt: {
                  gt:
                    approvedAt,
                },

                usedAt:
                  null,
              },

              data: {
                status:
                  "APPROVED",

                approvedById:
                  req.user!.id,

                approvedAt,
              },
            });

          if (
            updated.count !== 1
          ) {
            throw new Error(
              "APPROVAL_CONFLICT",
            );
          }

          const result =
            await tx.posApproval.findUniqueOrThrow({
              where: {
                id:
                  approval.id,
              },

              select: {
                id: true,
                type: true,
                status: true,
                saleId: true,
                amount: true,
                reason: true,

                requestedById:
                  true,

                approvedById:
                  true,

                approvedAt:
                  true,

                expiresAt:
                  true,
              },
            });

          await tx.auditLog.create({
            data: {
              userId:
                req.user!.id,

              action:
                "APPROVE",

              entityType:
                "PosApproval",

              entityId:
                result.id,

              afterJson: {
                type:
                  result.type,

                requestedById:
                  result.requestedById,

                approvedById:
                  result.approvedById,

                saleId:
                  result.saleId,

                amount:
                  result.amount,

                approvedAt:
                  result.approvedAt,

                expiresAt:
                  result.expiresAt,
              },
            },
          });

          return result;
        },
      ).catch((error) => {
        if (
          error instanceof Error &&
          error.message ===
            "APPROVAL_CONFLICT"
        ) {
          return null;
        }

        throw error;
      });

    if (!approved) {
      return res
        .status(409)
        .json({
          message:
            "Approval request changed or expired. Refresh and try again.",
        });
    }

    return res.json({
      message:
        "POS action approved.",

      approval: {
        id:
          approved.id,

        type:
          approved.type,

        status:
          approved.status,

        saleId:
          approved.saleId,

        amount:
          approved.amount,

        approvedAt:
          approved.approvedAt,

        expiresAt:
          approved.expiresAt,
      },
    });
  },
);

/*
|--------------------------------------------------------------------------
| Reject request
|--------------------------------------------------------------------------
*/

router.post(
  "/:id/reject",
  requirePermission(
    "erp.pos.approvals.update",
  ),
  async (req, res) => {
    if (!req.user) {
      return res
        .status(401)
        .json({
          message:
            "Authentication required",
        });
    }

    const parsedId =
      parseApprovalId(
        req.params.id,
      );

    if (!parsedId.success) {
      return res
        .status(400)
        .json({
          message:
            "Invalid approval ID.",
        });
    }

    const parsed =
      rejectApprovalSchema.safeParse(
        req.body,
      );

    if (!parsed.success) {
      return res
        .status(400)
        .json({
          message:
            "Invalid rejection data",
          errors:
            parsed.error.flatten(),
        });
    }

    await expireOldApprovals();

    const approval =
      await prisma.posApproval.findUnique({
        where: {
          id:
            parsedId.data,
        },
      });

    if (!approval) {
      return res
        .status(404)
        .json({
          message:
            "Approval request not found.",
        });
    }

    if (
      approval.requestedById ===
      req.user.id
    ) {
      return res
        .status(403)
        .json({
          message:
            "You cannot reject your own POS approval request.",
        });
    }

    if (
      approval.status !==
      "PENDING"
    ) {
      return res
        .status(409)
        .json({
          message:
            `This approval request is already ${approval.status.toLowerCase()}.`,
        });
    }

    const rejectedAt =
      new Date();

    const rejected =
      await prisma.$transaction(
        async (tx) => {
          const result =
            await tx.posApproval.updateMany({
              where: {
                id:
                  approval.id,

                status:
                  "PENDING",

                expiresAt: {
                  gt:
                    rejectedAt,
                },

                usedAt:
                  null,
              },

              data: {
                status:
                  "REJECTED",

                approvedById:
                  req.user!.id,

                /*
                 * Existing schema has one reason field.
                 * Until the schema migration introduces dedicated
                 * decision/request reason fields, the manager rejection
                 * reason is retained here.
                 */
                reason:
                  parsed.data.reason,
              },
            });

          if (
            result.count !== 1
          ) {
            throw new Error(
              "APPROVAL_CONFLICT",
            );
          }

          await tx.auditLog.create({
            data: {
              userId:
                req.user!.id,

              action:
                "REJECT",

              entityType:
                "PosApproval",

              entityId:
                approval.id,

              afterJson: {
                type:
                  approval.type,

                requestedById:
                  approval.requestedById,

                rejectedById:
                  req.user!.id,

                saleId:
                  approval.saleId,

                amount:
                  approval.amount,

                reason:
                  parsed.data.reason,

                rejectedAt,
              },
            },
          });

          return true;
        },
      ).catch((error) => {
        if (
          error instanceof Error &&
          error.message ===
            "APPROVAL_CONFLICT"
        ) {
          return false;
        }

        throw error;
      });

    if (!rejected) {
      return res
        .status(409)
        .json({
          message:
            "Approval request changed or expired. Refresh and try again.",
        });
    }

    return res.json({
      message:
        "POS approval request rejected.",

      approval: {
        id:
          approval.id,

        type:
          approval.type,

        status:
          "REJECTED",

        reason:
          parsed.data.reason,
      },
    });
  },
);

export default router;
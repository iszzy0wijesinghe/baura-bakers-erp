import {
  Router,
} from "express";

import {
  z,
} from "zod";

import {
  Prisma,
} from "@prisma/client";

import {
  prisma,
} from "../../lib/prisma";

import {
  authMiddleware,
  requireRoles,
} from "../../middleware/auth.middleware";

const router =
  Router();

router.use(
  authMiddleware,
);

const APPROVAL_EXPIRY_MINUTES =
  5;

const approvalTypes = [
  "MANUAL_DISCOUNT",
  "CANCEL_SALE",
  "REFUND",
  "RETURN",
] as const;

type ApprovalContext =
  Record<
    string,
    unknown
  >;

const requestApprovalSchema =
  z.object({
    type: z.enum(
      approvalTypes,
    ),

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
      .record(
        z.unknown(),
      )
      .optional()
      .nullable(),
  });

const rejectApprovalSchema =
  z.object({
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

async function expireOldApprovals() {
  const now =
    new Date();

  await prisma.posApproval.updateMany(
    {
      where: {
        status: {
          in: [
            "PENDING",
            "APPROVED",
          ],
        },

        expiresAt: {
          lte:
            now,
        },
      },

      data: {
        status:
          "EXPIRED",
      },
    },
  );
}

/*
 * CREATE APPROVAL REQUEST
 *
 * Used by POS users when an action
 * requires manager authorization.
 */
router.post(
  "/",

  requireRoles(
    "ADMIN",
    "MANAGER",
    "CASHIER",
    "SALES_STAFF",
  ),

  async (
    req,
    res,
  ) => {
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

    if (
      !parsed.success
    ) {
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

    /*
     * A manual discount approval is
     * meaningless without a positive
     * discount amount.
     */
    if (
      type ===
      "MANUAL_DISCOUNT"
    ) {
      if (
        amount ===
          undefined ||
        amount ===
          null ||
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

    /*
     * These operations act against
     * an already-created sale.
     */
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

    /*
     * Validate any sale referenced by
     * the request.
     */
    if (saleId) {
      const sale =
        await prisma.salesOrder.findUnique(
          {
            where: {
              id:
                saleId,
            },

            select: {
              id: true,
              status: true,
            },
          },
        );

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
          type ===
            "REFUND" ||
          type ===
            "RETURN"
        ) &&
        sale.status !==
          "COMPLETED"
      ) {
        return res
          .status(400)
          .json({
            message:
              "Only completed sales can be refunded or returned.",
          });
      }
    }

    await expireOldApprovals();

    /*
     * Prevent duplicate pending
     * requests caused by repeated
     * button presses.
     */
    const existingRequest =
      await prisma.posApproval.findFirst(
        {
          where: {
            requestedById:
              req.user.id,

            type,

            saleId:
              saleId ??
              null,

            status:
              "PENDING",

            expiresAt: {
              gt:
                new Date(),
            },
          },

          orderBy: {
            createdAt:
              "desc",
          },
        },
      );

    if (
      existingRequest
    ) {
      const sameAmount =
        type !==
          "MANUAL_DISCOUNT" ||
        Number(
          existingRequest.amount,
        ) ===
          Number(
            amount,
          );

      if (
        sameAmount
      ) {
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
      await prisma.posApproval.create(
        {
          data: {
            type,

            status:
              "PENDING",

            requestedById:
              req.user.id,

            saleId:
              saleId ??
              null,

            amount:
              amount ??
              null,

            reason:
              reason ||
              null,

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
        },
      );

    await prisma.auditLog.create(
      {
        data: {
          userId:
            req.user.id,

          action:
            "REQUEST",

          entityType:
            "PosApproval",

          entityId:
            approval.id,

          afterJson: {
            type:
              approval.type,

            saleId:
              approval.saleId,

            amount:
              approval.amount,

            reason:
              approval.reason,

            expiresAt:
              approval.expiresAt,
          },
        },
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
 * GET APPROVAL STATUS
 *
 * Cashiers may only inspect approval
 * requests they created.
 *
 * ADMIN and MANAGER may inspect any
 * approval request.
 */
router.get(
  "/:id/status",

  requireRoles(
    "ADMIN",
    "MANAGER",
    "CASHIER",
    "SALES_STAFF",
  ),

  async (
    req,
    res,
  ) => {
    if (!req.user) {
      return res
        .status(401)
        .json({
          message:
            "Authentication required",
        });
    }

    const approvalId =
      String(
        req.params.id,
      );

    await expireOldApprovals();

    const approval =
      await prisma.posApproval.findUnique(
        {
          where: {
            id:
              approvalId,
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
        },
      );

    if (!approval) {
      return res
        .status(404)
        .json({
          message:
            "Approval request not found.",
        });
    }

    const isManager =
      req.user.roles.some(
        (
          role,
        ) =>
          role ===
            "ADMIN" ||
          role ===
            "MANAGER",
      );

    if (
      !isManager &&
      approval.requestedById !==
        req.user.id
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
 * LIST PENDING APPROVALS
 *
 * Used by the manager/admin POS
 * approval interface.
 */
router.get(
  "/pending",

  requireRoles(
    "ADMIN",
    "MANAGER",
  ),

  async (
    _req,
    res,
  ) => {
    await expireOldApprovals();

    const approvals =
      await prisma.posApproval.findMany(
        {
          where: {
            status:
              "PENDING",

            expiresAt: {
              gt:
                new Date(),
            },
          },

          orderBy: {
            createdAt:
              "asc",
          },

          take:
            100,

          include: {
            requestedBy: {
              select: {
                id: true,

                firstName:
                  true,

                lastName:
                  true,

                email:
                  true,
              },
            },

            sale: {
              select: {
                id: true,

                orderNo:
                  true,

                grossTotal:
                  true,

                discountTotal:
                  true,

                netTotal:
                  true,

                status:
                  true,

                soldAt:
                  true,
              },
            },
          },
        },
      );

    return res.json({
      approvals,
    });
  },
);

/*
 * APPROVE REQUEST
 *
 * Only ADMIN and MANAGER may approve
 * privileged POS actions.
 */
router.post(
  "/:id/approve",

  requireRoles(
    "ADMIN",
    "MANAGER",
  ),

  async (
    req,
    res,
  ) => {
    if (!req.user) {
      return res
        .status(401)
        .json({
          message:
            "Authentication required",
        });
    }

    const approvalId =
      String(
        req.params.id,
      );

    await expireOldApprovals();

    const approval =
      await prisma.posApproval.findUnique(
        {
          where: {
            id:
              approvalId,
          },
        },
      );

    if (!approval) {
      return res
        .status(404)
        .json({
          message:
            "Approval request not found.",
        });
    }

    /*
     * A user must never authorize
     * their own privileged action.
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
        await prisma.posApproval.update(
          {
            where: {
              id:
                approval.id,
            },

            data: {
              status:
                "EXPIRED",
            },
          },
        );
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

    /*
     * Conditional update prevents
     * two managers approving the
     * same request concurrently.
     */
    const updated =
      await prisma.posApproval.updateMany(
        {
          where: {
            id:
              approval.id,

            status:
              "PENDING",

            expiresAt: {
              gt:
                approvedAt,
            },
          },

          data: {
            status:
              "APPROVED",

            approvedById:
              req.user.id,

            approvedAt,
          },
        },
      );

    if (
      updated.count !==
      1
    ) {
      return res
        .status(409)
        .json({
          message:
            "Approval request changed or expired. Refresh and try again.",
        });
    }

    const approved =
      await prisma.posApproval.findUniqueOrThrow(
        {
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
        },
      );

    await prisma.auditLog.create(
      {
        data: {
          userId:
            req.user.id,

          action:
            "APPROVE",

          entityType:
            "PosApproval",

          entityId:
            approved.id,

          afterJson: {
            type:
              approved.type,

            requestedById:
              approved.requestedById,

            approvedById:
              approved.approvedById,

            saleId:
              approved.saleId,

            amount:
              approved.amount,

            approvedAt:
              approved.approvedAt,

            expiresAt:
              approved.expiresAt,
          },
        },
      },
    );

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
 * REJECT REQUEST
 *
 * Only ADMIN and MANAGER may reject
 * pending POS approval requests.
 */
router.post(
  "/:id/reject",

  requireRoles(
    "ADMIN",
    "MANAGER",
  ),

  async (
    req,
    res,
  ) => {
    if (!req.user) {
      return res
        .status(401)
        .json({
          message:
            "Authentication required",
        });
    }

    const approvalId =
      String(
        req.params.id,
      );

    const parsed =
      rejectApprovalSchema.safeParse(
        req.body,
      );

    if (
      !parsed.success
    ) {
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
      await prisma.posApproval.findUnique(
        {
          where: {
            id:
              approvalId,
          },
        },
      );

    if (!approval) {
      return res
        .status(404)
        .json({
          message:
            "Approval request not found.",
        });
    }

    /*
     * Do not permit self-rejection
     * through a manager-capable
     * account.
     */
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
      await prisma.posApproval.updateMany(
        {
          where: {
            id:
              approval.id,

            status:
              "PENDING",

            expiresAt: {
              gt:
                rejectedAt,
            },
          },

          data: {
            status:
              "REJECTED",

            approvedById:
              req.user.id,

            reason:
              parsed.data.reason,
          },
        },
      );

    if (
      rejected.count !==
      1
    ) {
      return res
        .status(409)
        .json({
          message:
            "Approval request changed or expired. Refresh and try again.",
        });
    }

    await prisma.auditLog.create(
      {
        data: {
          userId:
            req.user.id,

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
              req.user.id,

            saleId:
              approval.saleId,

            amount:
              approval.amount,

            reason:
              parsed.data.reason,

            rejectedAt,
          },
        },
      },
    );

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
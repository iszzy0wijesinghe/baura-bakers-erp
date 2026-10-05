import { Router } from "express";
import { z } from "zod";

import { prisma } from "../../lib/prisma";
import { runSerializableTransaction } from "../../lib/transaction";

import {
  authMiddleware,
  hasPermission,
  requirePermission,
} from "../../middleware/auth.middleware";

const router = Router();

router.use(authMiddleware);

const MAX_CASH_MOVEMENT_AMOUNT =
  10_000_000;

const createCashMovementSchema =
  z.object({
    posSessionId: z
      .string()
      .uuid(
        "Valid POS session ID is required",
      ),

    type: z.enum([
      "CASH_IN",
      "CASH_OUT",
      "ADJUSTMENT",
    ]),

    amount: z.coerce
      .number()
      .finite(),

    reason: z
      .string()
      .trim()
      .min(
        1,
        "Cash movement reason is required",
      )
      .max(500),

    reference: z
      .string()
      .trim()
      .max(191)
      .optional()
      .nullable(),
  });

function round2(
  value: number,
) {
  return Number(
    value.toFixed(2),
  );
}

function normalizeNullableText(
  value:
    | string
    | null
    | undefined,
) {
  return (
    value?.trim() ||
    null
  );
}

function getErrorMessage(
  error: unknown,
  fallback: string,
) {
  return error instanceof Error
    ? error.message
    : fallback;
}

function getHttpError(
  message: string,
) {
  switch (
    message
  ) {
    case "POS_SESSION_NOT_FOUND":
      return {
        status: 404,
        code:
          "POS_SESSION_NOT_FOUND",
        message:
          "POS session was not found.",
      };

    case "POS_SESSION_NOT_OWNED":
      return {
        status: 403,
        code:
          "POS_SESSION_NOT_OWNED",
        message:
          "You cannot create a cash movement for another cashier's POS session.",
      };

    case "POS_SESSION_NOT_OPEN":
      return {
        status: 409,
        code:
          "POS_SESSION_NOT_OPEN",
        message:
          "Cash movements can only be recorded while the POS session is open.",
      };

    case "ADJUSTMENT_PERMISSION_REQUIRED":
      return {
        status: 403,
        code:
          "ADJUSTMENT_PERMISSION_REQUIRED",
        message:
          "Manager authorization is required to create a cash adjustment.",
      };

    case "INVALID_MOVEMENT_AMOUNT":
      return {
        status: 400,
        code:
          "INVALID_MOVEMENT_AMOUNT",
        message:
          "Cash movement amount is invalid.",
      };

    case "MOVEMENT_AMOUNT_TOO_LARGE":
      return {
        status: 400,
        code:
          "MOVEMENT_AMOUNT_TOO_LARGE",
        message:
          "Cash movement amount exceeds the permitted POS limit.",
      };

    case "INSUFFICIENT_DRAWER_CASH":
      return {
        status: 409,
        code:
          "INSUFFICIENT_DRAWER_CASH",
        message:
          "The requested cash out exceeds the calculated cash currently available in the drawer.",
      };

    default:
      return {
        status: 400,
        code:
          "POS_CASH_MOVEMENT_ERROR",
        message,
      };
  }
}

async function calculateExpectedDrawerCash(
  tx: Parameters<
    Parameters<
      typeof runSerializableTransaction
    >[0]
  >[0],

  posSessionId: string,
  openingFloat: number,
) {
  /*
   * Completed CASH payments increase
   * physical drawer cash.
   */
  const cashPayments =
    await tx.posPayment.findMany({
      where: {
        salesOrder: {
          posSessionId,
        },

        method:
          "CASH",

        status:
          "COMPLETED",
      },

      select: {
        amount:
          true,
      },
    });

  const completedCashSales =
    round2(
      cashPayments.reduce(
        (
          sum,
          payment,
        ) =>
          sum +
          Number(
            payment.amount,
          ),
        0,
      ),
    );

  /*
   * Existing physical drawer movements.
   *
   * OPENING_FLOAT is ignored because
   * PosSession.openingFloat is already
   * authoritative.
   */
  const movements =
    await tx.posCashMovement.findMany({
      where: {
        posSessionId,
      },

      select: {
        type:
          true,

        amount:
          true,
      },
    });

  let cashInTotal =
    0;

  let cashOutTotal =
    0;

  let cashRefundTotal =
    0;

  let adjustmentTotal =
    0;

  for (
    const movement of
    movements
  ) {
    const amount =
      round2(
        Number(
          movement.amount,
        ),
      );

    switch (
      movement.type
    ) {
      case "CASH_IN":
        cashInTotal =
          round2(
            cashInTotal +
              amount,
          );
        break;

      case "CASH_OUT":
        cashOutTotal =
          round2(
            cashOutTotal +
              amount,
          );
        break;

      case "REFUND":
        cashRefundTotal =
          round2(
            cashRefundTotal +
              amount,
          );
        break;

      case "ADJUSTMENT":
        adjustmentTotal =
          round2(
            adjustmentTotal +
              amount,
          );
        break;

      case "OPENING_FLOAT":
        break;
    }
  }

  const expectedCash =
    round2(
      openingFloat +
        completedCashSales +
        cashInTotal -
        cashOutTotal -
        cashRefundTotal +
        adjustmentTotal,
    );

  return {
    openingFloat:
      round2(
        openingFloat,
      ),

    completedCashSales,

    cashInTotal,

    cashOutTotal,

    cashRefundTotal,

    adjustmentTotal,

    expectedCash,
  };
}

/*
|--------------------------------------------------------------------------
| CREATE CASH MOVEMENT
|--------------------------------------------------------------------------
|
| CASH_IN:
| - positive amount
| - cashier may record against own OPEN session
|
| CASH_OUT:
| - positive amount
| - cashier may record against own OPEN session
| - cannot exceed calculated drawer cash
|
| ADJUSTMENT:
| - signed amount
| - cannot be zero
| - requires manager-level approval permission
|
| REFUND:
| - intentionally not accepted here
| - future refund workflow creates it
|
| OPENING_FLOAT:
| - intentionally not accepted here
| - PosSession.openingFloat is authoritative
|--------------------------------------------------------------------------
*/

router.post(
  "/",

  requirePermission(
    "erp.pos.access",
  ),

  async (
    req,
    res,
  ) => {
    if (
      !req.user
    ) {
      return res
        .status(401)
        .json({
          message:
            "Authentication required",
        });
    }

    const parsed =
      createCashMovementSchema.safeParse(
        req.body,
      );

    if (
      !parsed.success
    ) {
      return res
        .status(400)
        .json({
          message:
            "Invalid cash movement data",

          errors:
            parsed.error.flatten(),
        });
    }

    const type =
      parsed.data.type;

    const amount =
      round2(
        parsed.data.amount,
      );

    /*
     * CASH_IN / CASH_OUT must always
     * be positive.
     *
     * ADJUSTMENT is intentionally
     * signed so that:
     *
     * + amount = add drawer cash
     * - amount = remove drawer cash
     */
    if (
      (
        type ===
          "CASH_IN" ||
        type ===
          "CASH_OUT"
      ) &&
      amount <=
        0
    ) {
      return res
        .status(400)
        .json({
          message:
            "Cash in and cash out amounts must be greater than zero.",

          code:
            "INVALID_MOVEMENT_AMOUNT",
        });
    }

    if (
      type ===
        "ADJUSTMENT" &&
      amount ===
        0
    ) {
      return res
        .status(400)
        .json({
          message:
            "Cash adjustment amount cannot be zero.",

          code:
            "INVALID_MOVEMENT_AMOUNT",
        });
    }

    if (
      Math.abs(
        amount,
      ) >
      MAX_CASH_MOVEMENT_AMOUNT
    ) {
      return res
        .status(400)
        .json({
          message:
            "Cash movement amount exceeds the permitted POS limit.",

          code:
            "MOVEMENT_AMOUNT_TOO_LARGE",
        });
    }

    /*
     * We currently do not have a
     * dedicated cash-adjustment
     * permission.
     *
     * Until one is introduced,
     * erp.pos.approvals.update is the
     * existing manager-level control.
     */
    if (
      type ===
        "ADJUSTMENT" &&
      !hasPermission(
        req,
        "erp.pos.approvals.update",
      )
    ) {
      return res
        .status(403)
        .json({
          message:
            "Manager authorization is required to create a cash adjustment.",

          code:
            "ADJUSTMENT_PERMISSION_REQUIRED",
        });
    }

    try {
      const occurredAt =
        new Date();

      const result =
        await runSerializableTransaction(
          async (
            tx,
          ) => {
            const session =
              await tx.posSession.findUnique({
                where: {
                  id:
                    parsed.data.posSessionId,
                },

                select: {
                  id:
                    true,

                  sessionNo:
                    true,

                  status:
                    true,

                  openedById:
                    true,

                  openingFloat:
                    true,

                  businessDate:
                    true,
                },
              });

            if (
              !session
            ) {
              throw new Error(
                "POS_SESSION_NOT_FOUND",
              );
            }

            /*
             * Even managers must not use
             * this cashier endpoint to
             * mutate somebody else's
             * drawer.
             *
             * A future management cash
             * correction workflow can be
             * implemented separately.
             */
            if (
              session.openedById !==
              req.user!.id
            ) {
              throw new Error(
                "POS_SESSION_NOT_OWNED",
              );
            }

            /*
             * Freeze drawer mutations as
             * soon as Day End starts.
             */
            if (
              session.status !==
              "OPEN"
            ) {
              throw new Error(
                "POS_SESSION_NOT_OPEN",
              );
            }

            const drawerBefore =
              await calculateExpectedDrawerCash(
                tx,
                session.id,
                Number(
                  session.openingFloat,
                ),
              );

            /*
             * Prevent ordinary CASH_OUT
             * from making the calculated
             * physical drawer negative.
             *
             * Negative manager adjustment
             * is also protected below.
             */
            if (
              type ===
                "CASH_OUT" &&
              amount >
                drawerBefore.expectedCash
            ) {
              throw new Error(
                "INSUFFICIENT_DRAWER_CASH",
              );
            }

            if (
              type ===
                "ADJUSTMENT" &&
              amount <
                0 &&
              Math.abs(
                amount,
              ) >
                drawerBefore.expectedCash
            ) {
              throw new Error(
                "INSUFFICIENT_DRAWER_CASH",
              );
            }

            /*
             * Compare-and-check session
             * immediately before writing.
             *
             * This prevents a movement
             * from being written after
             * another request has moved
             * the session into CLOSING.
             */
            const stillOpen =
              await tx.posSession.findFirst({
                where: {
                  id:
                    session.id,

                  openedById:
                    req.user!.id,

                  status:
                    "OPEN",
                },

                select: {
                  id:
                    true,
                },
              });

            if (
              !stillOpen
            ) {
              throw new Error(
                "POS_SESSION_NOT_OPEN",
              );
            }

            const movement =
              await tx.posCashMovement.create({
                data: {
                  posSessionId:
                    session.id,

                  type,

                  amount,

                  reason:
                    parsed.data.reason,

                  reference:
                    normalizeNullableText(
                      parsed.data
                        .reference,
                    ),

                  createdById:
                    req.user!.id,

                  occurredAt,
                },
              });

            const drawerAfter =
              await calculateExpectedDrawerCash(
                tx,
                session.id,
                Number(
                  session.openingFloat,
                ),
              );

            await tx.auditLog.create({
              data: {
                userId:
                  req.user!.id,

                action:
                  "CREATE",

                entityType:
                  "PosCashMovement",

                entityId:
                  movement.id,

                afterJson: {
                  posSessionId:
                    session.id,

                  sessionNo:
                    session.sessionNo,

                  type,

                  amount,

                  reason:
                    parsed.data.reason,

                  reference:
                    normalizeNullableText(
                      parsed.data
                        .reference,
                    ),

                  drawerCashBefore:
                    drawerBefore.expectedCash,

                  drawerCashAfter:
                    drawerAfter.expectedCash,

                  createdById:
                    req.user!.id,

                  occurredAt:
                    occurredAt.toISOString(),
                },
              },
            });

            return {
              movement,

              drawerBefore,

              drawerAfter,
            };
          },
        );

      return res
        .status(201)
        .json({
          message:
            "Cash movement recorded successfully",

          movement:
            result.movement,

          drawer: {
            before:
              result.drawerBefore.expectedCash,

            after:
              result.drawerAfter.expectedCash,
          },
        });
    } catch (
      error
    ) {
      const mapped =
        getHttpError(
          getErrorMessage(
            error,
            "Failed to record cash movement",
          ),
        );

      return res
        .status(
          mapped.status,
        )
        .json({
          message:
            mapped.message,

          code:
            mapped.code,
        });
    }
  },
);

/*
|--------------------------------------------------------------------------
| CURRENT SESSION CASH MOVEMENTS
|--------------------------------------------------------------------------
|
| Cashier-safe endpoint.
|
| Only returns movements belonging to
| the authenticated user's current
| unfinished POS session.
|--------------------------------------------------------------------------
*/

router.get(
  "/current",

  requirePermission(
    "erp.pos.access",
  ),

  async (
    req,
    res,
  ) => {
    if (
      !req.user
    ) {
      return res
        .status(401)
        .json({
          message:
            "Authentication required",
        });
    }

    try {
      const session =
        await prisma.posSession.findFirst({
          where: {
            openedById:
              req.user.id,

            status: {
              in: [
                "OPEN",
                "CLOSING",
                "PENDING_APPROVAL",
              ],
            },
          },

          orderBy: {
            openedAt:
              "desc",
          },

          select: {
            id:
              true,

            sessionNo:
              true,

            status:
              true,

            openingFloat:
              true,

            openedAt:
              true,

            businessDate:
              true,
          },
        });

      if (
        !session
      ) {
        return res.json({
          session:
            null,

          movements:
            [],

          drawer:
            null,
        });
      }

      const movements =
        await prisma.posCashMovement.findMany({
          where: {
            posSessionId:
              session.id,
          },

          orderBy: [
            {
              occurredAt:
                "desc",
            },
            {
              createdAt:
                "desc",
            },
          ],

          take:
            500,

          select: {
            id:
              true,

            type:
              true,

            amount:
              true,

            reason:
              true,

            reference:
              true,

            occurredAt:
              true,

            createdAt:
              true,
          },
        });

      /*
       * This is informational only.
       *
       * Day End recalculates authoritative
       * totals inside its own transaction.
       */
      const completedCashPayments =
        await prisma.posPayment.findMany({
          where: {
            salesOrder: {
              posSessionId:
                session.id,
            },

            method:
              "CASH",

            status:
              "COMPLETED",
          },

          select: {
            amount:
              true,
          },
        });

      const completedCashSales =
        round2(
          completedCashPayments.reduce(
            (
              sum,
              payment,
            ) =>
              sum +
              Number(
                payment.amount,
              ),
            0,
          ),
        );

      let cashInTotal =
        0;

      let cashOutTotal =
        0;

      let cashRefundTotal =
        0;

      let adjustmentTotal =
        0;

      for (
        const movement of
        movements
      ) {
        const movementAmount =
          round2(
            Number(
              movement.amount,
            ),
          );

        switch (
          movement.type
        ) {
          case "CASH_IN":
            cashInTotal =
              round2(
                cashInTotal +
                  movementAmount,
              );
            break;

          case "CASH_OUT":
            cashOutTotal =
              round2(
                cashOutTotal +
                  movementAmount,
              );
            break;

          case "REFUND":
            cashRefundTotal =
              round2(
                cashRefundTotal +
                  movementAmount,
              );
            break;

          case "ADJUSTMENT":
            adjustmentTotal =
              round2(
                adjustmentTotal +
                  movementAmount,
              );
            break;

          case "OPENING_FLOAT":
            break;
        }
      }

      const openingFloat =
        round2(
          Number(
            session.openingFloat,
          ),
        );

      const expectedCash =
        round2(
          openingFloat +
            completedCashSales +
            cashInTotal -
            cashOutTotal -
            cashRefundTotal +
            adjustmentTotal,
        );

      return res.json({
        session: {
          id:
            session.id,

          sessionNo:
            session.sessionNo,

          status:
            session.status,

          businessDate:
            session.businessDate,

          openedAt:
            session.openedAt,

          openingFloat:
            session.openingFloat,
        },

        drawer: {
          openingFloat,

          completedCashSales,

          cashInTotal,

          cashOutTotal,

          cashRefundTotal,

          adjustmentTotal,

          expectedCash,
        },

        movements,
      });
    } catch (
      error
    ) {
      return res
        .status(500)
        .json({
          message:
            getErrorMessage(
              error,
              "Failed to load current POS cash movements",
            ),
        });
    }
  },
);

/*
|--------------------------------------------------------------------------
| MANAGEMENT CASH MOVEMENT HISTORY
|--------------------------------------------------------------------------
*/

router.get(
  "/",

  requirePermission(
    "erp.pos.sessions.read",
  ),

  async (
    req,
    res,
  ) => {
    const posSessionId =
      typeof req.query.posSessionId ===
      "string"
        ? req.query.posSessionId.trim()
        : "";

    try {
      const movements =
        await prisma.posCashMovement.findMany({
          where:
            posSessionId
              ? {
                  posSessionId,
                }
              : undefined,

          orderBy: [
            {
              occurredAt:
                "desc",
            },
            {
              createdAt:
                "desc",
            },
          ],

          take:
            500,

          include: {
            posSession: {
              select: {
                id:
                  true,

                sessionNo:
                  true,

                businessDate:
                  true,

                status:
                  true,

                openedById:
                  true,
              },
            },

            createdBy: {
              select: {
                id:
                  true,

                firstName:
                  true,

                lastName:
                  true,

                email:
                  true,
              },
            },
          },
        });

      return res.json({
        movements,
      });
    } catch (
      error
    ) {
      return res
        .status(500)
        .json({
          message:
            getErrorMessage(
              error,
              "Failed to load POS cash movements",
            ),
        });
    }
  },
);

export default router;
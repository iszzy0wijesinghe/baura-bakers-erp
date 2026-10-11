/** @format */

import { Router } from "express";
import { z } from "zod";

import { prisma } from "../../lib/prisma";
import { nextDocumentNumber } from "../../lib/documentSequence";
import { runSerializableTransaction } from "../../lib/transaction";

import {
  authMiddleware,
  requirePermission,
} from "../../middleware/auth.middleware";

import {
  getSriLankaDateParts,
  resolveBusinessDay,
} from "../business-calendar/businessCalendar.routes";

const router = Router();

router.use(authMiddleware);

const MAX_OPENING_FLOAT = 10_000_000;
const MAX_CLOSING_CASH = 10_000_000;

const ACTIVE_SESSION_STATUSES = [
  "OPEN",
  "CLOSING",
  "PENDING_APPROVAL",
] as const;

const denominationSchema = z.object({
  denominationValue: z.coerce
    .number()
    .finite()
    .positive()
    .max(100000)
    .refine(
      (value) => Number.isInteger(value * 100),
      "Denomination value cannot have more than two decimal places.",
    ),

  quantity: z.coerce.number().int().min(0).max(100000),
});

const openSessionSchema = z.object({
  openingNote: z.string().trim().max(500).optional().nullable(),

  denominations: z
    .array(denominationSchema)
    .min(1, "Opening cash denomination count is required")
    .max(100),
});

const startClosingSchema = z.object({
  cashierNote: z.string().trim().max(500).optional().nullable(),
});

const submitDayEndSchema = z.object({
  denominations: z
    .array(denominationSchema)
    .min(1, "Closing cash denomination count is required")
    .max(100),

  cashierNote: z.string().trim().max(500).optional().nullable(),

  varianceReason: z.string().trim().max(500).optional().nullable(),
});

const approveDayEndSchema = z.object({
  managerNote: z.string().trim().max(500).optional().nullable(),
});

const rejectDayEndSchema = z.object({
  managerNote: z
    .string()
    .trim()
    .min(1, "Manager rejection reason is required")
    .max(500),
});

function round2(value: number) {
  return Number(value.toFixed(2));
}

function normalizeNullableText(value: string | null | undefined) {
  return value?.trim() || null;
}

function normalizeDenominations(
  denominations: z.infer<typeof denominationSchema>[],
) {
  const quantities = new Map<number, number>();

  for (const denomination of denominations) {
    const value = round2(denomination.denominationValue);
    const previous = quantities.get(value) ?? 0;

    quantities.set(value, previous + denomination.quantity);
  }

  const normalized = [...quantities.entries()]
    .map(([denominationValue, quantity]) => ({
      denominationValue,
      quantity,
      amount: round2(denominationValue * quantity),
    }))
    .filter((denomination) => denomination.quantity > 0)
    .sort((a, b) => b.denominationValue - a.denominationValue);

  const total = round2(
    normalized.reduce((sum, denomination) => sum + denomination.amount, 0),
  );

  return {
    denominations: normalized,
    total,
  };
}

function getBusinessDateObject(date: string) {
  const parsed = new Date(`${date}T00:00:00.000Z`);

  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== date
  ) {
    throw new Error("Invalid business date.");
  }

  return parsed;
}

function getDateOnlyKey(value: Date) {
  return value.toISOString().slice(0, 10);
}

function getBusinessDateContext(
  sessionBusinessDate: Date,
  at = new Date(),
) {
  const currentLocal = getSriLankaDateParts(at);
  const businessDate = getDateOnlyKey(sessionBusinessDate);

  return {
    businessDate,
    currentDate: currentLocal.date,
    isOverdue: businessDate < currentLocal.date,
    isFutureDated: businessDate > currentLocal.date,
    isCurrentDate: businessDate === currentLocal.date,
    timeZone: "Asia/Colombo",
  };
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function getHttpError(message: string) {
  switch (message) {
    case "POS_SESSION_NOT_FOUND":
      return {
        status: 404,
        code: "POS_SESSION_NOT_FOUND",
        message: "POS session was not found.",
      };

    case "POS_SESSION_NOT_OWNED":
      return {
        status: 403,
        code: "POS_SESSION_NOT_OWNED",
        message: "You cannot manage another cashier's POS session.",
      };

    case "POS_SESSION_NOT_OPEN":
      return {
        status: 409,
        code: "POS_SESSION_NOT_OPEN",
        message: "Only an open POS session can begin Day End.",
      };

    case "POS_SESSION_NOT_CLOSING":
      return {
        status: 409,
        code: "POS_SESSION_NOT_CLOSING",
        message: "This POS session is not ready for Day End submission.",
      };

    case "POS_SESSION_NOT_PENDING_APPROVAL":
      return {
        status: 409,
        code: "POS_SESSION_NOT_PENDING_APPROVAL",
        message: "This POS session is not awaiting manager approval.",
      };

    case "POS_SESSION_FUTURE_BUSINESS_DATE":
      return {
        status: 409,
        code: "POS_SESSION_FUTURE_BUSINESS_DATE",
        message:
          "This POS session has a future business date. Contact management to investigate.",
      };

    case "POS_SESSION_BUSINESS_DATE_MISMATCH":
      return {
        status: 409,
        code: "POS_SESSION_BUSINESS_DATE_MISMATCH",
        message:
          "The POS session business date does not match the current Sri Lankan business date.",
      };

    case "DAY_END_NOT_FOUND":
      return {
        status: 404,
        code: "DAY_END_NOT_FOUND",
        message: "Day End record was not found.",
      };

    case "DAY_END_NOT_SUBMITTED":
      return {
        status: 409,
        code: "DAY_END_NOT_SUBMITTED",
        message: "This Day End is not awaiting manager approval.",
      };

    case "DAY_END_ALREADY_SUBMITTED":
      return {
        status: 409,
        code: "DAY_END_ALREADY_SUBMITTED",
        message:
          "This Day End has already been submitted or approved.",
      };

    case "DAY_END_INVALID_STATE":
      return {
        status: 409,
        code: "DAY_END_INVALID_STATE",
        message:
          "This Day End cannot be processed in its current state.",
      };

    case "SELF_DAY_END_APPROVAL_NOT_ALLOWED":
      return {
        status: 403,
        code: "SELF_DAY_END_APPROVAL_NOT_ALLOWED",
        message: "A cashier cannot approve their own Day End.",
      };

    case "SELF_DAY_END_REJECTION_NOT_ALLOWED":
      return {
        status: 403,
        code: "SELF_DAY_END_REJECTION_NOT_ALLOWED",
        message: "A cashier cannot reject their own Day End.",
      };

    case "DAY_END_SNAPSHOT_CHANGED":
      return {
        status: 409,
        code: "DAY_END_SNAPSHOT_CHANGED",
        message:
          "Day End financial data changed after submission. Reject the Day End and ask the cashier to recount and resubmit.",
      };

    case "DAY_END_VARIANCE_REASON_REQUIRED":
      return {
        status: 400,
        code: "DAY_END_VARIANCE_REASON_REQUIRED",
        message:
          "A variance reason is required when counted cash does not match expected cash.",
      };

    case "DAY_END_CLOSING_COUNT_CHANGED":
      return {
        status: 409,
        code: "DAY_END_CLOSING_COUNT_CHANGED",
        message:
          "The closing cash count changed after submission. Reject the Day End and ask the cashier to recount.",
      };

    default:
      return {
        status: 400,
        code: "POS_SESSION_ERROR",
        message,
      };
  }
}

type DayEndTotals = {
  grossSalesTotal: number;
  discountTotal: number;
  netSalesTotal: number;
  cashSalesTotal: number;
  cardSalesTotal: number;
  bankTransferTotal: number;
  otherPaymentTotal: number;
  refundTotal: number;
  voidTotal: number;
  cashInTotal: number;
  cashOutTotal: number;
  expectedCash: number;
  invoiceCount: number;
};

function hasDayEndSnapshotChanged(
  dayEnd: {
    grossSalesTotal: unknown;
    discountTotal: unknown;
    netSalesTotal: unknown;
    cashSalesTotal: unknown;
    cardSalesTotal: unknown;
    bankTransferTotal: unknown;
    otherPaymentTotal: unknown;
    refundTotal: unknown;
    voidTotal: unknown;
    cashInTotal: unknown;
    cashOutTotal: unknown;
    expectedCash: unknown;
    invoiceCount: number;
  },
  currentTotals: DayEndTotals,
) {
  return (
    round2(Number(dayEnd.grossSalesTotal)) !== currentTotals.grossSalesTotal ||
    round2(Number(dayEnd.discountTotal)) !== currentTotals.discountTotal ||
    round2(Number(dayEnd.netSalesTotal)) !== currentTotals.netSalesTotal ||
    round2(Number(dayEnd.cashSalesTotal)) !== currentTotals.cashSalesTotal ||
    round2(Number(dayEnd.cardSalesTotal)) !== currentTotals.cardSalesTotal ||
    round2(Number(dayEnd.bankTransferTotal)) !==
      currentTotals.bankTransferTotal ||
    round2(Number(dayEnd.otherPaymentTotal)) !==
      currentTotals.otherPaymentTotal ||
    round2(Number(dayEnd.refundTotal)) !== currentTotals.refundTotal ||
    round2(Number(dayEnd.voidTotal)) !== currentTotals.voidTotal ||
    round2(Number(dayEnd.cashInTotal)) !== currentTotals.cashInTotal ||
    round2(Number(dayEnd.cashOutTotal)) !== currentTotals.cashOutTotal ||
    round2(Number(dayEnd.expectedCash)) !== currentTotals.expectedCash ||
    dayEnd.invoiceCount !== currentTotals.invoiceCount
  );
}

async function calculateDayEndTotals(
  tx: Parameters<Parameters<typeof runSerializableTransaction>[0]>[0],
  posSessionId: string,
  openingFloat: number,
): Promise<DayEndTotals> {
  const completedSales = await tx.salesOrder.findMany({
    where: {
      posSessionId,
      status: "COMPLETED",
    },
    select: {
      id: true,
      grossTotal: true,
      discountTotal: true,
      netTotal: true,
    },
  });

  const grossSalesTotal = round2(
    completedSales.reduce((sum, sale) => sum + Number(sale.grossTotal), 0),
  );

  const discountTotal = round2(
    completedSales.reduce((sum, sale) => sum + Number(sale.discountTotal), 0),
  );

  const netSalesTotal = round2(
    completedSales.reduce((sum, sale) => sum + Number(sale.netTotal), 0),
  );

  const invoiceCount = completedSales.length;

  const payments = await tx.posPayment.findMany({
    where: {
      salesOrder: {
        posSessionId,
      },
      status: {
        in: ["COMPLETED", "REFUNDED", "VOIDED"],
      },
    },
    select: {
      method: true,
      status: true,
      amount: true,
    },
  });

  let cashSalesTotal = 0;
  let cardSalesTotal = 0;
  let bankTransferTotal = 0;
  let otherPaymentTotal = 0;
  let refundTotal = 0;
  let voidTotal = 0;

  for (const payment of payments) {
    const amount = round2(Number(payment.amount));

    if (payment.status === "REFUNDED") {
      refundTotal = round2(refundTotal + amount);
      continue;
    }

    if (payment.status === "VOIDED") {
      voidTotal = round2(voidTotal + amount);
      continue;
    }

    switch (payment.method) {
      case "CASH":
        cashSalesTotal = round2(cashSalesTotal + amount);
        break;

      case "CARD":
        cardSalesTotal = round2(cardSalesTotal + amount);
        break;

      case "BANK_TRANSFER":
        bankTransferTotal = round2(bankTransferTotal + amount);
        break;

      case "ONLINE":
      case "OTHER":
        otherPaymentTotal = round2(otherPaymentTotal + amount);
        break;
    }
  }

  const cashMovements = await tx.posCashMovement.findMany({
    where: {
      posSessionId,
    },
    select: {
      type: true,
      amount: true,
    },
  });

  let cashInTotal = 0;
  let cashOutTotal = 0;
  let cashRefundTotal = 0;
  let cashAdjustmentTotal = 0;

  for (const movement of cashMovements) {
    const amount = round2(Number(movement.amount));

    switch (movement.type) {
      case "CASH_IN":
        cashInTotal = round2(cashInTotal + amount);
        break;

      case "CASH_OUT":
        cashOutTotal = round2(cashOutTotal + amount);
        break;

      case "REFUND":
        cashRefundTotal = round2(cashRefundTotal + amount);
        break;

      case "ADJUSTMENT":
        // Adjustments are signed: positive adds cash, negative removes cash.
        cashAdjustmentTotal = round2(cashAdjustmentTotal + amount);
        break;

      case "OPENING_FLOAT":
        // Already represented by PosSession.openingFloat.
        break;
    }
  }

  const expectedCash = round2(
    openingFloat +
      cashSalesTotal +
      cashInTotal +
      cashAdjustmentTotal -
      cashOutTotal -
      cashRefundTotal,
  );

  return {
    grossSalesTotal,
    discountTotal,
    netSalesTotal,
    cashSalesTotal,
    cardSalesTotal,
    bankTransferTotal,
    otherPaymentTotal,
    refundTotal,
    voidTotal,
    cashInTotal,
    cashOutTotal,
    expectedCash,
    invoiceCount,
  };
}

/*
|--------------------------------------------------------------------------
| CURRENT POS SESSION
|--------------------------------------------------------------------------
*/

router.get(
  "/current",
  requirePermission("erp.pos.access"),
  async (req, res) => {
    if (!req.user) {
      return res.status(401).json({
        message: "Authentication required",
      });
    }

    try {
      const [session, business] = await Promise.all([
        prisma.posSession.findFirst({
          where: {
            openedById: req.user.id,
            status: {
              in: [...ACTIVE_SESSION_STATUSES],
            },
          },
          orderBy: {
            openedAt: "desc",
          },
          include: {
            cashCounts: {
              orderBy: [
                { countType: "asc" },
                { denominationValue: "desc" },
              ],
            },
            dayEnd: true,
          },
        }),
        resolveBusinessDay(),
      ]);

      const currentDate = getSriLankaDateParts().date;

      const dateContext = session
        ? getBusinessDateContext(session.businessDate)
        : null;

      const isOverdue = dateContext?.isOverdue ?? false;
      const isFutureDated = dateContext?.isFutureDated ?? false;

      const canSell = Boolean(
        session &&
          session.status === "OPEN" &&
          !isOverdue &&
          !isFutureDated &&
          business.isOpenDay &&
          business.isWithinOpeningHours,
      );

      return res.json({
        session,
        business,
        currentDate,
        sessionBusinessDate: dateContext?.businessDate ?? null,
        isOverdue,
        isFutureDated,
        requiresDayEnd: isOverdue,
        canSell,
        dateContext,
      });
    } catch (error) {
      return res.status(500).json({
        message: getErrorMessage(error, "Failed to load POS session"),
      });
    }
  },
);

/*
|--------------------------------------------------------------------------
| OPEN POS SESSION
|--------------------------------------------------------------------------
*/

router.post(
  "/open",
  requirePermission("erp.pos.sessions.open"),
  async (req, res) => {
    const parsed = openSessionSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        message: "Invalid POS opening data",
        errors: parsed.error.flatten(),
      });
    }

    if (!req.user) {
      return res.status(401).json({
        message: "Authentication required",
      });
    }

    try {
      const business = await resolveBusinessDay();

      if (!business.isOpenDay) {
        return res.status(409).json({
          message:
            business.reason || "The shop is closed for this business date.",
          code: "BUSINESS_DAY_CLOSED",
          business,
        });
      }

      if (!business.isWithinOpeningHours) {
        return res.status(409).json({
          message:
            "A POS session cannot be opened outside configured business hours.",
          code: "OUTSIDE_BUSINESS_HOURS",
          business,
        });
      }

      const opening = normalizeDenominations(parsed.data.denominations);

      if (opening.total > MAX_OPENING_FLOAT) {
        return res.status(400).json({
          message: "Opening cash amount exceeds the permitted POS limit.",
        });
      }

      const openedAt = new Date();
      const businessDate = getBusinessDateObject(business.businessDate);

      const session = await runSerializableTransaction(async (tx) => {
        const existing = await tx.posSession.findFirst({
          where: {
            openedById: req.user!.id,
            status: {
              in: [...ACTIVE_SESSION_STATUSES],
            },
          },
          select: {
            id: true,
            sessionNo: true,
            status: true,
            businessDate: true,
          },
        });

        if (existing) {
          throw new Error(
            `You already have an active POS session (${existing.sessionNo}).`,
          );
        }

        const currentLocal = getSriLankaDateParts();

        if (currentLocal.date !== business.businessDate) {
          throw new Error(
            "Business date changed while opening the POS session. Please retry.",
          );
        }

        const sessionNo = await nextDocumentNumber(
          tx,
          "POS_SESSION",
          "PSS",
          openedAt,
        );

        const created = await tx.posSession.create({
          data: {
            sessionNo,
            businessDate,
            status: "OPEN",
            openedById: req.user!.id,
            openedAt,
            openingFloat: opening.total,
            openingNote: normalizeNullableText(parsed.data.openingNote),
          },
        });

        for (const denomination of opening.denominations) {
          await tx.posCashDenominationCount.create({
            data: {
              posSessionId: created.id,
              countType: "OPENING",
              denominationValue: denomination.denominationValue,
              quantity: denomination.quantity,
              amount: denomination.amount,
              countedById: req.user!.id,
              countedAt: openedAt,
            },
          });
        }

        if (opening.total > 0) {
          await tx.posCashMovement.create({
            data: {
              posSessionId: created.id,
              type: "OPENING_FLOAT",
              amount: opening.total,
              reason: "POS session opening float",
              reference: created.sessionNo,
              createdById: req.user!.id,
              occurredAt: openedAt,
            },
          });
        }

        await tx.auditLog.create({
          data: {
            userId: req.user!.id,
            action: "OPEN",
            entityType: "PosSession",
            entityId: created.id,
            afterJson: {
              sessionNo: created.sessionNo,
              businessDate: business.businessDate,
              openingFloat: opening.total,
              openingDenominations: opening.denominations,
              openedById: req.user!.id,
              openedAt: openedAt.toISOString(),
            },
          },
        });

        return created;
      });

      const completeSession = await prisma.posSession.findUnique({
        where: {
          id: session.id,
        },
        include: {
          cashCounts: {
            where: {
              countType: "OPENING",
            },
            orderBy: {
              denominationValue: "desc",
            },
          },
          cashMovements: {
            orderBy: {
              occurredAt: "asc",
            },
          },
          dayEnd: true,
        },
      });

      return res.status(201).json({
        message: "POS session opened successfully",
        session: completeSession,
        business,
      });
    } catch (error) {
      return res.status(400).json({
        message: getErrorMessage(error, "Failed to open POS session"),
      });
    }
  },
);

/*
|--------------------------------------------------------------------------
| START DAY END
|--------------------------------------------------------------------------
| OPEN -> CLOSING
|--------------------------------------------------------------------------
*/

router.post(
  "/:id/day-end/start",
  requirePermission("erp.pos.access"),
  async (req, res) => {
    if (!req.user) {
      return res.status(401).json({
        message: "Authentication required",
      });
    }

    const parsed = startClosingSchema.safeParse(req.body ?? {});

    if (!parsed.success) {
      return res.status(400).json({
        message: "Invalid Day End data",
        errors: parsed.error.flatten(),
      });
    }

    const sessionId = Array.isArray(req.params.id)
      ? req.params.id[0]
      : req.params.id;

    if (!sessionId) {
      return res.status(400).json({
        message: "POS session ID is required",
      });
    }

    try {
      const startedAt = new Date();

      const result = await runSerializableTransaction(async (tx) => {
        const session = await tx.posSession.findUnique({
          where: {
            id: sessionId,
          },
          select: {
            id: true,
            sessionNo: true,
            status: true,
            openedById: true,
            businessDate: true,
            openingFloat: true,
          },
        });

        if (!session) {
          throw new Error("POS_SESSION_NOT_FOUND");
        }

        if (session.openedById !== req.user!.id) {
          throw new Error("POS_SESSION_NOT_OWNED");
        }

        if (session.status !== "OPEN") {
          throw new Error("POS_SESSION_NOT_OPEN");
        }

        const dateContext = getBusinessDateContext(
          session.businessDate,
          startedAt,
        );

        if (dateContext.isFutureDated) {
          throw new Error("POS_SESSION_FUTURE_BUSINESS_DATE");
        }

        const existingDayEnd = await tx.posDayEnd.findUnique({
          where: {
            posSessionId: session.id,
          },
          select: {
            id: true,
            status: true,
          },
        });

        if (
          existingDayEnd &&
          (existingDayEnd.status === "SUBMITTED" ||
            existingDayEnd.status === "APPROVED")
        ) {
          throw new Error("DAY_END_ALREADY_SUBMITTED");
        }

        const totals = await calculateDayEndTotals(
          tx,
          session.id,
          Number(session.openingFloat),
        );

        const updated = await tx.posSession.updateMany({
          where: {
            id: session.id,
            status: "OPEN",
            openedById: req.user!.id,
          },
          data: {
            status: "CLOSING",
            closingStartedAt: startedAt,
          },
        });

        if (updated.count !== 1) {
          throw new Error(
            "POS session changed while Day End was starting. Please retry.",
          );
        }

        const dayEnd = await tx.posDayEnd.upsert({
          where: {
            posSessionId: session.id,
          },
          create: {
            posSessionId: session.id,
            status: "DRAFT",
            ...totals,
            countedCash: 0,
            variance: round2(-totals.expectedCash),
            cashierNote: normalizeNullableText(parsed.data.cashierNote),
          },
          update: {
            status: "DRAFT",
            ...totals,
            countedCash: 0,
            variance: round2(-totals.expectedCash),
            varianceReason: null,
            cashierNote: normalizeNullableText(parsed.data.cashierNote),
            managerNote: null,
            submittedById: null,
            submittedAt: null,
            approvedById: null,
            approvedAt: null,
            rejectedAt: null,
          },
        });

        await tx.posCashDenominationCount.deleteMany({
          where: {
            posSessionId: session.id,
            countType: "CLOSING",
          },
        });

        await tx.auditLog.create({
          data: {
            userId: req.user!.id,
            action: "START_DAY_END",
            entityType: "PosSession",
            entityId: session.id,
            afterJson: {
              sessionNo: session.sessionNo,
              businessDate: dateContext.businessDate,
              currentDate: dateContext.currentDate,
              isOverdue: dateContext.isOverdue,
              status: "CLOSING",
              closingStartedAt: startedAt.toISOString(),
              totals,
            },
          },
        });

        return {
          session,
          dayEnd,
          totals,
          dateContext,
        };
      });

      return res.json({
        message: result.dateContext.isOverdue
          ? "Overdue POS session Day End started successfully"
          : "Day End started successfully",
        sessionId: result.session.id,
        sessionNo: result.session.sessionNo,
        status: "CLOSING",
        isOverdue: result.dateContext.isOverdue,
        businessDate: result.dateContext.businessDate,
        currentDate: result.dateContext.currentDate,
        dayEnd: result.dayEnd,
        totals: result.totals,
      });
    } catch (error) {
      const failure = getHttpError(
        getErrorMessage(error, "Failed to start Day End"),
      );

      return res.status(failure.status).json(failure);
    }
  },
);

/*
|--------------------------------------------------------------------------
| DAY END PREVIEW
|--------------------------------------------------------------------------
*/

router.get(
  "/:id/day-end",
  requirePermission("erp.pos.access"),
  async (req, res) => {
    if (!req.user) {
      return res.status(401).json({
        message: "Authentication required",
      });
    }

    const sessionId = Array.isArray(req.params.id)
      ? req.params.id[0]
      : req.params.id;

    if (!sessionId) {
      return res.status(400).json({
        message: "POS session ID is required",
      });
    }

    try {
      const result = await runSerializableTransaction(async (tx) => {
        const session = await tx.posSession.findUnique({
          where: {
            id: sessionId,
          },
          include: {
            cashCounts: {
              orderBy: [
                { countType: "asc" },
                { denominationValue: "desc" },
              ],
            },
            cashMovements: {
              orderBy: {
                occurredAt: "asc",
              },
            },
            dayEnd: true,
          },
        });

        if (!session) {
          throw new Error("POS_SESSION_NOT_FOUND");
        }

        if (session.openedById !== req.user!.id) {
          throw new Error("POS_SESSION_NOT_OWNED");
        }

        const totals = await calculateDayEndTotals(
          tx,
          session.id,
          Number(session.openingFloat),
        );

        return {
          session,
          totals,
          dateContext: getBusinessDateContext(session.businessDate),
        };
      });

      return res.json({
        session: result.session,
        totals: result.totals,
        dateContext: result.dateContext,
        isOverdue: result.dateContext.isOverdue,
      });
    } catch (error) {
      const failure = getHttpError(
        getErrorMessage(error, "Failed to load Day End"),
      );

      return res.status(failure.status).json(failure);
    }
  },
);

/*
|--------------------------------------------------------------------------
| SUBMIT DAY END
|--------------------------------------------------------------------------
| CLOSING -> PENDING_APPROVAL
|--------------------------------------------------------------------------
*/

router.post(
  "/:id/day-end/submit",
  requirePermission("erp.pos.day-end.submit"),
  async (req, res) => {
    if (!req.user) {
      return res.status(401).json({
        message: "Authentication required",
      });
    }

    const parsed = submitDayEndSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        message: "Invalid Day End submission",
        errors: parsed.error.flatten(),
      });
    }

    const sessionId = Array.isArray(req.params.id)
      ? req.params.id[0]
      : req.params.id;

    if (!sessionId) {
      return res.status(400).json({
        message: "POS session ID is required",
      });
    }

    const closing = normalizeDenominations(parsed.data.denominations);

    if (closing.total > MAX_CLOSING_CASH) {
      return res.status(400).json({
        message: "Closing cash amount exceeds the permitted POS limit.",
      });
    }

    try {
      const submittedAt = new Date();

      const result = await runSerializableTransaction(async (tx) => {
        const session = await tx.posSession.findUnique({
          where: {
            id: sessionId,
          },
          select: {
            id: true,
            sessionNo: true,
            status: true,
            openedById: true,
            openingFloat: true,
            businessDate: true,
          },
        });

        if (!session) {
          throw new Error("POS_SESSION_NOT_FOUND");
        }

        if (session.openedById !== req.user!.id) {
          throw new Error("POS_SESSION_NOT_OWNED");
        }

        if (session.status !== "CLOSING") {
          throw new Error("POS_SESSION_NOT_CLOSING");
        }

        const dayEnd = await tx.posDayEnd.findUnique({
          where: {
            posSessionId: session.id,
          },
        });

        if (!dayEnd) {
          throw new Error("DAY_END_NOT_FOUND");
        }

        if (dayEnd.status !== "DRAFT" && dayEnd.status !== "REJECTED") {
          throw new Error("DAY_END_INVALID_STATE");
        }

        const totals = await calculateDayEndTotals(
          tx,
          session.id,
          Number(session.openingFloat),
        );

        const countedCash = closing.total;
        const variance = round2(countedCash - totals.expectedCash);

        const varianceReason = normalizeNullableText(
          parsed.data.varianceReason,
        );

        if (variance !== 0 && !varianceReason) {
          throw new Error("DAY_END_VARIANCE_REASON_REQUIRED");
        }

        await tx.posCashDenominationCount.deleteMany({
          where: {
            posSessionId: session.id,
            countType: "CLOSING",
          },
        });

        for (const denomination of closing.denominations) {
          await tx.posCashDenominationCount.create({
            data: {
              posSessionId: session.id,
              countType: "CLOSING",
              denominationValue: denomination.denominationValue,
              quantity: denomination.quantity,
              amount: denomination.amount,
              countedById: req.user!.id,
              countedAt: submittedAt,
            },
          });
        }

        const updatedDayEnd = await tx.posDayEnd.update({
          where: {
            id: dayEnd.id,
          },
          data: {
            status: "SUBMITTED",
            ...totals,
            countedCash,
            variance,
            varianceReason: variance === 0 ? null : varianceReason,
            cashierNote: normalizeNullableText(parsed.data.cashierNote),
            managerNote: null,
            submittedById: req.user!.id,
            submittedAt,
            approvedById: null,
            approvedAt: null,
            rejectedAt: null,
          },
        });

        const updatedSession = await tx.posSession.updateMany({
          where: {
            id: session.id,
            openedById: req.user!.id,
            status: "CLOSING",
          },
          data: {
            status: "PENDING_APPROVAL",
          },
        });

        if (updatedSession.count !== 1) {
          throw new Error(
            "POS session changed while Day End was being submitted. Please retry.",
          );
        }

        const dateContext = getBusinessDateContext(
          session.businessDate,
          submittedAt,
        );

        await tx.auditLog.create({
          data: {
            userId: req.user!.id,
            action: "SUBMIT_DAY_END",
            entityType: "PosDayEnd",
            entityId: updatedDayEnd.id,
            afterJson: {
              posSessionId: session.id,
              sessionNo: session.sessionNo,
              businessDate: dateContext.businessDate,
              currentDate: dateContext.currentDate,
              isOverdue: dateContext.isOverdue,
              status: "SUBMITTED",
              totals,
              countedCash,
              variance,
              varianceReason: variance === 0 ? null : varianceReason,
              closingDenominations: closing.denominations,
              submittedById: req.user!.id,
              submittedAt: submittedAt.toISOString(),
            },
          },
        });

        return {
          session,
          dayEnd: updatedDayEnd,
          closing,
          dateContext,
        };
      });

      return res.json({
        message: "Day End submitted for manager approval",
        sessionId: result.session.id,
        sessionNo: result.session.sessionNo,
        sessionStatus: "PENDING_APPROVAL",
        isOverdue: result.dateContext.isOverdue,
        businessDate: result.dateContext.businessDate,
        dayEnd: result.dayEnd,
        closingDenominations: result.closing.denominations,
      });
    } catch (error) {
      const failure = getHttpError(
        getErrorMessage(error, "Failed to submit Day End"),
      );

      return res.status(failure.status).json(failure);
    }
  },
);

/*
|--------------------------------------------------------------------------
| PENDING DAY ENDS
|--------------------------------------------------------------------------
*/

router.get(
  "/day-end/pending",
  requirePermission("erp.pos.day-end.read"),
  async (_req, res) => {
    try {
      const dayEnds = await prisma.posDayEnd.findMany({
        where: {
          status: "SUBMITTED",
          posSession: {
            status: "PENDING_APPROVAL",
          },
        },
        orderBy: {
          submittedAt: "asc",
        },
        include: {
          submittedBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
          posSession: {
            include: {
              openedBy: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  email: true,
                },
              },
              cashCounts: {
                where: {
                  countType: "CLOSING",
                },
                orderBy: {
                  denominationValue: "desc",
                },
              },
              cashMovements: {
                orderBy: {
                  occurredAt: "asc",
                },
              },
            },
          },
        },
      });

      return res.json({
        dayEnds,
      });
    } catch (error) {
      return res.status(500).json({
        message: getErrorMessage(error, "Failed to load pending Day Ends"),
      });
    }
  },
);

/*
|--------------------------------------------------------------------------
| APPROVE DAY END
|--------------------------------------------------------------------------
| PENDING_APPROVAL -> CLOSED
|--------------------------------------------------------------------------
*/

router.post(
  "/:id/day-end/approve",
  requirePermission("erp.pos.day-end.approve"),
  async (req, res) => {
    if (!req.user) {
      return res.status(401).json({
        message: "Authentication required",
      });
    }

    const parsed = approveDayEndSchema.safeParse(req.body ?? {});

    if (!parsed.success) {
      return res.status(400).json({
        message: "Invalid Day End approval data",
        errors: parsed.error.flatten(),
      });
    }

    const sessionId = Array.isArray(req.params.id)
      ? req.params.id[0]
      : req.params.id;

    if (!sessionId) {
      return res.status(400).json({
        message: "POS session ID is required",
      });
    }

    try {
      const approvedAt = new Date();

      const result = await runSerializableTransaction(async (tx) => {
        const session = await tx.posSession.findUnique({
          where: {
            id: sessionId,
          },
          select: {
            id: true,
            sessionNo: true,
            status: true,
            openedById: true,
            openingFloat: true,
            businessDate: true,
          },
        });

        if (!session) {
          throw new Error("POS_SESSION_NOT_FOUND");
        }

        if (session.status !== "PENDING_APPROVAL") {
          throw new Error("POS_SESSION_NOT_PENDING_APPROVAL");
        }

        if (session.openedById === req.user!.id) {
          throw new Error("SELF_DAY_END_APPROVAL_NOT_ALLOWED");
        }

        const dayEnd = await tx.posDayEnd.findUnique({
          where: {
            posSessionId: session.id,
          },
        });

        if (!dayEnd) {
          throw new Error("DAY_END_NOT_FOUND");
        }

        if (dayEnd.status !== "SUBMITTED") {
          throw new Error("DAY_END_NOT_SUBMITTED");
        }

        const currentTotals = await calculateDayEndTotals(
          tx,
          session.id,
          Number(session.openingFloat),
        );

        if (hasDayEndSnapshotChanged(dayEnd, currentTotals)) {
          throw new Error("DAY_END_SNAPSHOT_CHANGED");
        }

        const closingCounts = await tx.posCashDenominationCount.findMany({
          where: {
            posSessionId: session.id,
            countType: "CLOSING",
          },
          select: {
            amount: true,
          },
        });

        const closingCountTotal = round2(
          closingCounts.reduce(
            (sum, count) => sum + Number(count.amount),
            0,
          ),
        );

        if (closingCountTotal !== round2(Number(dayEnd.countedCash))) {
          throw new Error("DAY_END_CLOSING_COUNT_CHANGED");
        }

        const approvedDayEnd = await tx.posDayEnd.update({
          where: {
            id: dayEnd.id,
          },
          data: {
            status: "APPROVED",
            managerNote: normalizeNullableText(parsed.data.managerNote),
            approvedById: req.user!.id,
            approvedAt,
            rejectedAt: null,
          },
        });

        const closedSession = await tx.posSession.updateMany({
          where: {
            id: session.id,
            status: "PENDING_APPROVAL",
          },
          data: {
            status: "CLOSED",
            closedById: req.user!.id,
            closedAt: approvedAt,
          },
        });

        if (closedSession.count !== 1) {
          throw new Error(
            "POS session changed while Day End was being approved.",
          );
        }

        const dateContext = getBusinessDateContext(
          session.businessDate,
          approvedAt,
        );

        await tx.auditLog.create({
          data: {
            userId: req.user!.id,
            action: "APPROVE_DAY_END",
            entityType: "PosDayEnd",
            entityId: approvedDayEnd.id,
            afterJson: {
              posSessionId: session.id,
              sessionNo: session.sessionNo,
              businessDate: dateContext.businessDate,
              currentDate: dateContext.currentDate,
              isOverdue: dateContext.isOverdue,
              dayEndStatus: "APPROVED",
              sessionStatus: "CLOSED",
              variance: Number(approvedDayEnd.variance),
              approvedById: req.user!.id,
              approvedAt: approvedAt.toISOString(),
              managerNote: approvedDayEnd.managerNote,
            },
          },
        });

        return {
          session,
          dayEnd: approvedDayEnd,
          dateContext,
        };
      });

      return res.json({
        message: "Day End approved and POS session closed successfully",
        sessionId: result.session.id,
        sessionNo: result.session.sessionNo,
        sessionStatus: "CLOSED",
        isOverdue: result.dateContext.isOverdue,
        businessDate: result.dateContext.businessDate,
        dayEnd: result.dayEnd,
      });
    } catch (error) {
      const failure = getHttpError(
        getErrorMessage(error, "Failed to approve Day End"),
      );

      return res.status(failure.status).json(failure);
    }
  },
);

/*
|--------------------------------------------------------------------------
| REJECT DAY END
|--------------------------------------------------------------------------
| PENDING_APPROVAL -> CLOSING
|--------------------------------------------------------------------------
*/

router.post(
  "/:id/day-end/reject",
  requirePermission("erp.pos.day-end.approve"),
  async (req, res) => {
    if (!req.user) {
      return res.status(401).json({
        message: "Authentication required",
      });
    }

    const parsed = rejectDayEndSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        message: "Invalid Day End rejection data",
        errors: parsed.error.flatten(),
      });
    }

    const sessionId = Array.isArray(req.params.id)
      ? req.params.id[0]
      : req.params.id;

    if (!sessionId) {
      return res.status(400).json({
        message: "POS session ID is required",
      });
    }

    try {
      const rejectedAt = new Date();

      const result = await runSerializableTransaction(async (tx) => {
        const session = await tx.posSession.findUnique({
          where: {
            id: sessionId,
          },
          select: {
            id: true,
            sessionNo: true,
            status: true,
            openedById: true,
            businessDate: true,
          },
        });

        if (!session) {
          throw new Error("POS_SESSION_NOT_FOUND");
        }

        if (session.status !== "PENDING_APPROVAL") {
          throw new Error("POS_SESSION_NOT_PENDING_APPROVAL");
        }

        if (session.openedById === req.user!.id) {
          throw new Error("SELF_DAY_END_REJECTION_NOT_ALLOWED");
        }

        const dayEnd = await tx.posDayEnd.findUnique({
          where: {
            posSessionId: session.id,
          },
        });

        if (!dayEnd) {
          throw new Error("DAY_END_NOT_FOUND");
        }

        if (dayEnd.status !== "SUBMITTED") {
          throw new Error("DAY_END_NOT_SUBMITTED");
        }

        const rejectedDayEnd = await tx.posDayEnd.update({
          where: {
            id: dayEnd.id,
          },
          data: {
            status: "REJECTED",
            managerNote: parsed.data.managerNote.trim(),
            approvedById: null,
            approvedAt: null,
            rejectedAt,
          },
        });

        const updatedSession = await tx.posSession.updateMany({
          where: {
            id: session.id,
            status: "PENDING_APPROVAL",
          },
          data: {
            status: "CLOSING",
          },
        });

        if (updatedSession.count !== 1) {
          throw new Error(
            "POS session changed while Day End was being rejected.",
          );
        }

        const dateContext = getBusinessDateContext(
          session.businessDate,
          rejectedAt,
        );

        await tx.auditLog.create({
          data: {
            userId: req.user!.id,
            action: "REJECT_DAY_END",
            entityType: "PosDayEnd",
            entityId: rejectedDayEnd.id,
            afterJson: {
              posSessionId: session.id,
              sessionNo: session.sessionNo,
              businessDate: dateContext.businessDate,
              currentDate: dateContext.currentDate,
              isOverdue: dateContext.isOverdue,
              dayEndStatus: "REJECTED",
              sessionStatus: "CLOSING",
              managerNote: parsed.data.managerNote.trim(),
              rejectedById: req.user!.id,
              rejectedAt: rejectedAt.toISOString(),
            },
          },
        });

        return {
          session,
          dayEnd: rejectedDayEnd,
          dateContext,
        };
      });

      return res.json({
        message: "Day End rejected. The cashier must correct and resubmit it.",
        sessionId: result.session.id,
        sessionNo: result.session.sessionNo,
        sessionStatus: "CLOSING",
        isOverdue: result.dateContext.isOverdue,
        businessDate: result.dateContext.businessDate,
        dayEnd: result.dayEnd,
      });
    } catch (error) {
      const failure = getHttpError(
        getErrorMessage(error, "Failed to reject Day End"),
      );

      return res.status(failure.status).json(failure);
    }
  },
);

/*
|--------------------------------------------------------------------------
| SESSION HISTORY
|--------------------------------------------------------------------------
*/

router.get(
  "/",
  requirePermission("erp.pos.sessions.read"),
  async (_req, res) => {
    try {
      const sessions = await prisma.posSession.findMany({
        orderBy: {
          openedAt: "desc",
        },
        take: 200,
        include: {
          openedBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
          closedBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
          cashCounts: {
            orderBy: [
              { countType: "asc" },
              { denominationValue: "desc" },
            ],
          },
          cashMovements: {
            orderBy: {
              occurredAt: "asc",
            },
          },
          dayEnd: {
            include: {
              submittedBy: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  email: true,
                },
              },
              approvedBy: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  email: true,
                },
              },
            },
          },
        },
      });

      const currentDate = getSriLankaDateParts().date;

      const enrichedSessions = sessions.map((session) => {
        const dateContext = getBusinessDateContext(session.businessDate);

        return {
          ...session,
          isOverdue:
            session.status !== "CLOSED" && dateContext.isOverdue,
          isFutureDated: dateContext.isFutureDated,
          businessDateKey: dateContext.businessDate,
        };
      });

      return res.json({
        sessions: enrichedSessions,
        currentDate,
      });
    } catch (error) {
      return res.status(500).json({
        message: getErrorMessage(error, "Failed to load POS sessions"),
      });
    }
  },
);

export default router;
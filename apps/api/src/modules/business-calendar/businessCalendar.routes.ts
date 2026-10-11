/** @format */

import { Router } from "express";
import { z } from "zod";

import { prisma } from "../../lib/prisma";
import { runSerializableTransaction } from "../../lib/transaction";

import {
  authMiddleware,
  requirePermission,
} from "../../middleware/auth.middleware";

import type { PosSessionStatus } from "@prisma/client";

const router = Router();

router.use(authMiddleware);

export const TIME_ZONE = "Asia/Colombo";

const timePattern = /^([01]\d|2[0-3]):([0-5]\d)$/;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

const UNFINISHED_POS_STATUSES = [
  "OPEN",
  "CLOSING",
  "PENDING_APPROVAL",
] as const;

const scheduleItemSchema = z.object({
  weekday: z.coerce.number().int().min(1).max(7),
  isOpen: z.boolean(),

  openingTime: z
    .string()
    .trim()
    .regex(timePattern, "Opening time must use HH:mm")
    .optional()
    .nullable(),

  closingTime: z
    .string()
    .trim()
    .regex(timePattern, "Closing time must use HH:mm")
    .optional()
    .nullable(),
});

const weeklyScheduleSchema = z
  .object({
    schedules: z.array(scheduleItemSchema).length(7),
  })
  .superRefine((data, ctx) => {
    const weekdays = data.schedules.map((item) => item.weekday);

    if (new Set(weekdays).size !== 7) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["schedules"],
        message: "Each weekday must appear exactly once.",
      });
    }

    data.schedules.forEach((item, index) => {
      if (!item.isOpen) return;

      if (!item.openingTime || !item.closingTime) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["schedules", index],
          message: "Opening and closing times are required.",
        });

        return;
      }

      if (item.openingTime >= item.closingTime) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["schedules", index, "closingTime"],
          message: "Closing time must be later than opening time.",
        });
      }
    });
  });

const calendarExceptionSchema = z
  .object({
    date: z.string().trim().regex(datePattern),
    type: z.enum(["CLOSED", "SPECIAL_HOURS"]),

    openingTime: z
      .string()
      .trim()
      .regex(timePattern)
      .optional()
      .nullable(),

    closingTime: z
      .string()
      .trim()
      .regex(timePattern)
      .optional()
      .nullable(),

    reason: z.string().trim().max(500).optional().nullable(),
  })
  .superRefine((data, ctx) => {
    if (!datePattern.test(data.date)) return;

    const parsedDate = new Date(`${data.date}T00:00:00.000Z`);

    if (
      Number.isNaN(parsedDate.getTime()) ||
      parsedDate.toISOString().slice(0, 10) !== data.date
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["date"],
        message: "Invalid calendar date.",
      });
    }

    if (data.type !== "SPECIAL_HOURS") return;

    if (!data.openingTime || !data.closingTime) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Special hours require opening and closing times.",
      });

      return;
    }

    if (data.openingTime >= data.closingTime) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["closingTime"],
        message: "Closing time must be later than opening time.",
      });
    }
  });

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function normalizeNullableText(value: string | null | undefined) {
  return value?.trim() || null;
}

function getDateOnlyKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function getWeekday(date: Date) {
  const javascriptWeekday = date.getUTCDay();

  return javascriptWeekday === 0 ? 7 : javascriptWeekday;
}

function isWithinTimeRange(
  currentTime: string | null,
  openingTime: string | null,
  closingTime: string | null,
) {
  if (!currentTime || !openingTime || !closingTime) {
    return false;
  }

  return currentTime >= openingTime && currentTime < closingTime;
}

export function parseDateOnly(value: string): Date {
  if (!datePattern.test(value)) {
    throw new Error("Date must use YYYY-MM-DD.");
  }

  const date = new Date(`${value}T00:00:00.000Z`);

  if (
    Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value
  ) {
    throw new Error("Invalid calendar date.");
  }

  return date;
}

export function getSriLankaDateParts(at = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });

  const parts = formatter.formatToParts(at);

  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );

  const date = `${values.year}-${values.month}-${values.day}`;
  const time = `${values.hour}:${values.minute}`;

  const dateObject = parseDateOnly(date);

  return {
    date,
    time,
    dateObject,
    weekday: getWeekday(dateObject),
  };
}

export type CalendarStatus = {
  businessDate: string;
  weekday: number;
  timeZone: string;
  currentTime: string;
  isOpenDay: boolean;
  isWithinOpeningHours: boolean;
  openingTime: string | null;
  closingTime: string | null;
  source: "EXCEPTION" | "WEEKLY";
  reason: string | null;
};

export async function resolveBusinessDate(
  dateString: string,
  currentTime: string | null = null,
): Promise<CalendarStatus> {
  const dateObject = parseDateOnly(dateString);
  const weekday = getWeekday(dateObject);

  const exception = await prisma.businessCalendarException.findUnique({
    where: {
      date: dateObject,
    },
  });

  if (exception) {
    const isOpenDay = exception.type === "SPECIAL_HOURS";

    const openingTime = isOpenDay ? exception.openingTime : null;
    const closingTime = isOpenDay ? exception.closingTime : null;

    return {
      businessDate: dateString,
      weekday,
      timeZone: TIME_ZONE,
      currentTime: currentTime ?? "",
      isOpenDay,
      isWithinOpeningHours:
        isOpenDay &&
        isWithinTimeRange(currentTime, openingTime, closingTime),
      openingTime,
      closingTime,
      source: "EXCEPTION",
      reason: exception.reason,
    };
  }

  const weekly = await prisma.businessWeeklySchedule.findUnique({
    where: {
      weekday,
    },
  });

  const isOpenDay = weekly?.isOpen ?? false;

  const openingTime = isOpenDay ? weekly?.openingTime ?? null : null;
  const closingTime = isOpenDay ? weekly?.closingTime ?? null : null;

  return {
    businessDate: dateString,
    weekday,
    timeZone: TIME_ZONE,
    currentTime: currentTime ?? "",
    isOpenDay,
    isWithinOpeningHours:
      isOpenDay &&
      isWithinTimeRange(currentTime, openingTime, closingTime),
    openingTime,
    closingTime,
    source: "WEEKLY",
    reason: weekly
      ? null
      : "Business schedule has not been configured for this day.",
  };
}

export async function resolveBusinessDay(at = new Date()) {
  const local = getSriLankaDateParts(at);

  return resolveBusinessDate(local.date, local.time);
}



type UnfinishedSession = {
  id: string;
  sessionNo: string;
  businessDate: Date;
  openedAt: Date;
  openedById: string;
  status: PosSessionStatus;
};

function describeSessionRecovery(
  session: UnfinishedSession,
  currentDate: string,
) {
  const businessDate = getDateOnlyKey(session.businessDate);

  const isOverdue = businessDate < currentDate;
  const isFutureDated = businessDate > currentDate;

  let nextAction:
    | "START_DAY_END"
    | "SUBMIT_DAY_END"
    | "APPROVE_DAY_END"
    | "NONE";

switch (session.status) {
  case "OPEN":
    nextAction = "START_DAY_END";
    break;

  case "CLOSING":
    nextAction = "SUBMIT_DAY_END";
    break;

  case "PENDING_APPROVAL":
    nextAction = "APPROVE_DAY_END";
    break;

  default:
    nextAction = "NONE";
}

  return {
    ...session,
    businessDateKey: businessDate,
    isOverdue,
    isFutureDated,
    requiresReconciliation: isOverdue || isFutureDated,
    nextAction,
  };
}

async function getUnfinishedSessions() {
  return prisma.posSession.findMany({
    where: {
      status: {
        in: [...UNFINISHED_POS_STATUSES],
      },
    },

    orderBy: [
      {
        businessDate: "asc",
      },
      {
        openedAt: "asc",
      },
    ],

    select: {
      id: true,
      sessionNo: true,
      businessDate: true,
      openedAt: true,
      openedById: true,
      status: true,
    },
  });
}

/*
|--------------------------------------------------------------------------
| CURRENT SRI LANKAN DATE AND TIME
|--------------------------------------------------------------------------
*/

router.get(
  "/today",
  requirePermission("erp.pos.access"),
  async (_req, res) => {
    const local = getSriLankaDateParts();

    return res.json({
      date: local.date,
      time: local.time,
      weekday: local.weekday,
      timeZone: TIME_ZONE,
    });
  },
);

/*
|--------------------------------------------------------------------------
| CURRENT BUSINESS CALENDAR STATUS
|--------------------------------------------------------------------------
|
| This reports whether the current calendar date
| is scheduled to operate.
|
| It does not represent a persisted accounting
| business-day OPEN/CLOSED lifecycle.
|--------------------------------------------------------------------------
*/

router.get(
  "/status",
  requirePermission("erp.pos.access"),
  async (_req, res) => {
    try {
      const status = await resolveBusinessDay();

      return res.json({
        status,
      });
    } catch (error) {
      return res.status(500).json({
        message: getErrorMessage(
          error,
          "Failed to resolve business status",
        ),
      });
    }
  },
);

/*
|--------------------------------------------------------------------------
| BUSINESS CALENDAR MANAGEMENT OVERVIEW
|--------------------------------------------------------------------------
*/

router.get(
  "/overview",
  requirePermission("erp.pos.business-calendar.read"),
  async (_req, res) => {
    try {
      const local = getSriLankaDateParts();

      const [status, schedules, exceptions, unfinishedSessions] =
        await Promise.all([
          resolveBusinessDay(),

          prisma.businessWeeklySchedule.findMany({
            orderBy: {
              weekday: "asc",
            },
          }),

          prisma.businessCalendarException.findMany({
            orderBy: {
              date: "asc",
            },
          }),

          getUnfinishedSessions(),
        ]);

      const sessions = unfinishedSessions.map((session) =>
        describeSessionRecovery(session, local.date),
      );

      const openSessions = sessions.filter(
        (session) => session.status === "OPEN",
      );

      const closingSessions = sessions.filter(
        (session) => session.status === "CLOSING",
      );

      const pendingApprovalSessions = sessions.filter(
        (session) => session.status === "PENDING_APPROVAL",
      );

      const overdueSessions = sessions.filter(
        (session) => session.isOverdue,
      );

      const futureDatedSessions = sessions.filter(
        (session) => session.isFutureDated,
      );

      const unresolvedCurrentDateSessions = sessions.filter(
        (session) => session.businessDateKey === local.date,
      );

      return res.json({
        timeZone: TIME_ZONE,
        currentDate: local.date,
        currentTime: local.time,
        status,
        schedules,
        exceptions,

        openSessions,
        closingSessions,
        pendingApprovalSessions,

        unfinishedSessions: sessions,
        overdueSessions,
        futureDatedSessions,
        unresolvedCurrentDateSessions,

        summary: {
          openSessionCount: openSessions.length,
          closingSessionCount: closingSessions.length,
          pendingApprovalCount: pendingApprovalSessions.length,
          unfinishedSessionCount: sessions.length,
          overdueSessionCount: overdueSessions.length,
          futureDatedSessionCount: futureDatedSessions.length,
          unresolvedCurrentDateSessionCount:
            unresolvedCurrentDateSessions.length,
          configuredWeekdays: schedules.length,
          exceptionCount: exceptions.length,
          hasUnresolvedSessions: sessions.length > 0,
          hasOverdueSessions: overdueSessions.length > 0,
        },
      });
    } catch (error) {
      return res.status(500).json({
        message: getErrorMessage(
          error,
          "Failed to load business calendar overview",
        ),
      });
    }
  },
);

/*
|--------------------------------------------------------------------------
| BUSINESS DATE RECOVERY OVERVIEW
|--------------------------------------------------------------------------
|
| Read-only recovery endpoint.
|
| Existing POS Day End routes remain responsible
| for the actual financial reconciliation.
|--------------------------------------------------------------------------
*/

router.get(
  "/recovery",
  requirePermission("erp.pos.business-calendar.read"),
  async (_req, res) => {
    try {
      const local = getSriLankaDateParts();

      const unfinishedSessions = await getUnfinishedSessions();

      const sessions = unfinishedSessions.map((session) =>
        describeSessionRecovery(session, local.date),
      );

      const overdueSessions = sessions.filter(
        (session) => session.isOverdue,
      );

      const futureDatedSessions = sessions.filter(
        (session) => session.isFutureDated,
      );

      return res.json({
        timeZone: TIME_ZONE,
        currentDate: local.date,
        currentTime: local.time,

        overdueSessions,
        futureDatedSessions,

        summary: {
          overdueSessionCount: overdueSessions.length,
          futureDatedSessionCount: futureDatedSessions.length,
          requiresAttention:
            overdueSessions.length > 0 ||
            futureDatedSessions.length > 0,
        },

        recoveryWorkflow: {
          OPEN: "START_DAY_END",
          CLOSING: "SUBMIT_DAY_END",
          PENDING_APPROVAL: "APPROVE_DAY_END",
        },
      });
    } catch (error) {
      return res.status(500).json({
        message: getErrorMessage(
          error,
          "Failed to load business date recovery information",
        ),
      });
    }
  },
);

/*
|--------------------------------------------------------------------------
| SELECTED CALENDAR DATE
|--------------------------------------------------------------------------
*/

router.get(
  "/date/:date",
  requirePermission("erp.pos.business-calendar.read"),
  async (req, res) => {
    try {
      const rawDate = Array.isArray(req.params.date)
        ? req.params.date[0]
        : req.params.date;

      if (!rawDate) {
        return res.status(400).json({
          message: "Date is required.",
        });
      }

      const local = getSriLankaDateParts();

      const status = await resolveBusinessDate(
        rawDate,
        rawDate === local.date ? local.time : null,
      );

      return res.json({
        status,
      });
    } catch (error) {
      return res.status(400).json({
        message: getErrorMessage(error, "Invalid date"),
      });
    }
  },
);

/*
|--------------------------------------------------------------------------
| WEEKLY BUSINESS SCHEDULE
|--------------------------------------------------------------------------
*/

router.get(
  "/weekly",
  requirePermission("erp.pos.business-calendar.read"),
  async (_req, res) => {
    try {
      const schedules = await prisma.businessWeeklySchedule.findMany({
        orderBy: {
          weekday: "asc",
        },
      });

      return res.json({
        timeZone: TIME_ZONE,
        schedules,
      });
    } catch (error) {
      return res.status(500).json({
        message: getErrorMessage(
          error,
          "Failed to load weekly business schedule",
        ),
      });
    }
  },
);

router.put(
  "/weekly",
  requirePermission("erp.pos.business-calendar.update"),
  async (req, res) => {
    const parsed = weeklyScheduleSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        message: "Invalid weekly business schedule",
        errors: parsed.error.flatten(),
      });
    }

    if (!req.user) {
      return res.status(401).json({
        message: "Authentication required",
      });
    }

    try {
      await runSerializableTransaction(async (tx) => {
        const before = await tx.businessWeeklySchedule.findMany({
          orderBy: {
            weekday: "asc",
          },
        });

        for (const schedule of parsed.data.schedules) {
          await tx.businessWeeklySchedule.upsert({
            where: {
              weekday: schedule.weekday,
            },

            create: {
              weekday: schedule.weekday,
              isOpen: schedule.isOpen,
              openingTime: schedule.isOpen
                ? schedule.openingTime!
                : null,
              closingTime: schedule.isOpen
                ? schedule.closingTime!
                : null,
            },

            update: {
              isOpen: schedule.isOpen,
              openingTime: schedule.isOpen
                ? schedule.openingTime!
                : null,
              closingTime: schedule.isOpen
                ? schedule.closingTime!
                : null,
            },
          });
        }

        await tx.auditLog.create({
          data: {
            userId: req.user!.id,
            action: "UPDATE",
            entityType: "BusinessWeeklySchedule",
            entityId: "WEEKLY",

            beforeJson: {
              timeZone: TIME_ZONE,
              schedules: before.map((schedule) => ({
                weekday: schedule.weekday,
                isOpen: schedule.isOpen,
                openingTime: schedule.openingTime,
                closingTime: schedule.closingTime,
              })),
            },

            afterJson: {
              timeZone: TIME_ZONE,
              schedules: parsed.data.schedules,
            },
          },
        });
      });

      const schedules = await prisma.businessWeeklySchedule.findMany({
        orderBy: {
          weekday: "asc",
        },
      });

      return res.json({
        message: "Weekly business schedule updated",
        timeZone: TIME_ZONE,
        schedules,
      });
    } catch (error) {
      return res.status(400).json({
        message: getErrorMessage(
          error,
          "Failed to update weekly business schedule",
        ),
      });
    }
  },
);

/*
|--------------------------------------------------------------------------
| CALENDAR EXCEPTIONS
|--------------------------------------------------------------------------
*/

router.get(
  "/exceptions",
  requirePermission("erp.pos.business-calendar.read"),
  async (_req, res) => {
    try {
      const exceptions =
        await prisma.businessCalendarException.findMany({
          orderBy: {
            date: "asc",
          },
        });

      return res.json({
        timeZone: TIME_ZONE,
        exceptions,
      });
    } catch (error) {
      return res.status(500).json({
        message: getErrorMessage(
          error,
          "Failed to load business calendar exceptions",
        ),
      });
    }
  },
);

router.put(
  "/exceptions",
  requirePermission("erp.pos.business-calendar.update"),
  async (req, res) => {
    const parsed = calendarExceptionSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        message: "Invalid business calendar exception",
        errors: parsed.error.flatten(),
      });
    }

    if (!req.user) {
      return res.status(401).json({
        message: "Authentication required",
      });
    }

    try {
      const date = parseDateOnly(parsed.data.date);

      const exception = await runSerializableTransaction(async (tx) => {
        const before = await tx.businessCalendarException.findUnique({
          where: {
            date,
          },
        });

        const openingTime =
          parsed.data.type === "SPECIAL_HOURS"
            ? parsed.data.openingTime!
            : null;

        const closingTime =
          parsed.data.type === "SPECIAL_HOURS"
            ? parsed.data.closingTime!
            : null;

        const reason = normalizeNullableText(parsed.data.reason);

        const saved = await tx.businessCalendarException.upsert({
          where: {
            date,
          },

          create: {
            date,
            type: parsed.data.type,
            openingTime,
            closingTime,
            reason,
          },

          update: {
            type: parsed.data.type,
            openingTime,
            closingTime,
            reason,
          },
        });

        await tx.auditLog.create({
          data: {
            userId: req.user!.id,
            action: before ? "UPDATE" : "CREATE",
            entityType: "BusinessCalendarException",
            entityId: saved.id,

            beforeJson: before
              ? {
                  date: parsed.data.date,
                  type: before.type,
                  openingTime: before.openingTime,
                  closingTime: before.closingTime,
                  reason: before.reason,
                }
              : undefined,

            afterJson: {
              date: parsed.data.date,
              type: saved.type,
              openingTime: saved.openingTime,
              closingTime: saved.closingTime,
              reason: saved.reason,
            },
          },
        });

        return saved;
      });

      return res.json({
        message: "Business calendar exception saved",
        exception,
      });
    } catch (error) {
      return res.status(400).json({
        message: getErrorMessage(
          error,
          "Failed to save business calendar exception",
        ),
      });
    }
  },
);

router.delete(
  "/exceptions/:date",
  requirePermission("erp.pos.business-calendar.update"),
  async (req, res) => {
    if (!req.user) {
      return res.status(401).json({
        message: "Authentication required",
      });
    }

    try {
      const rawDate = Array.isArray(req.params.date)
        ? req.params.date[0]
        : req.params.date;

      if (!rawDate) {
        return res.status(400).json({
          message: "Date is required.",
        });
      }

      const date = parseDateOnly(rawDate);

      const deleted = await runSerializableTransaction(async (tx) => {
        const existing = await tx.businessCalendarException.findUnique({
          where: {
            date,
          },
        });

        if (!existing) {
          return false;
        }

        const result = await tx.businessCalendarException.deleteMany({
          where: {
            id: existing.id,
          },
        });

        if (result.count !== 1) {
          return false;
        }

        await tx.auditLog.create({
          data: {
            userId: req.user!.id,
            action: "DELETE",
            entityType: "BusinessCalendarException",
            entityId: existing.id,

            beforeJson: {
              date: rawDate,
              type: existing.type,
              openingTime: existing.openingTime,
              closingTime: existing.closingTime,
              reason: existing.reason,
            },
          },
        });

        return true;
      });

      if (!deleted) {
        return res.status(404).json({
          message: "Business calendar exception not found",
        });
      }

      return res.json({
        message: "Business calendar exception deleted",
      });
    } catch (error) {
      return res.status(400).json({
        message: getErrorMessage(
          error,
          "Failed to delete business calendar exception",
        ),
      });
    }
  },
);

export default router;
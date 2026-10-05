/** @format */

import { Router } from "express";
import { z } from "zod";

import { prisma } from "../../lib/prisma";
import { runSerializableTransaction } from "../../lib/transaction";

import {
  authMiddleware,
  requirePermission,
} from "../../middleware/auth.middleware";

const router = Router();

router.use(authMiddleware);

const TIME_ZONE = "Asia/Colombo";

const timePattern = /^([01]\d|2[0-3]):([0-5]\d)$/;

const weeklyScheduleSchema = z.object({
  schedules: z
    .array(
      z.object({
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
      }),
    )
    .length(7, "Weekly schedule must contain exactly seven days"),
});

const calendarExceptionSchema = z.object({
  date: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must use YYYY-MM-DD"),

  type: z.enum(["CLOSED", "SPECIAL_HOURS"]),

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

  reason: z.string().trim().max(500).optional().nullable(),
});

function validateTimeRange(
  isOpen: boolean,
  openingTime: string | null | undefined,
  closingTime: string | null | undefined,
) {
  if (!isOpen) {
    return;
  }

  if (!openingTime || !closingTime) {
    throw new Error(
      "Opening and closing times are required for an open business day.",
    );
  }

  if (openingTime >= closingTime) {
    throw new Error("Closing time must be later than opening time.");
  }
}

function parseDateOnly(value: string) {
  const date = new Date(`${value}T00:00:00.000Z`);

  if (Number.isNaN(date.getTime())) {
    throw new Error("Invalid calendar date.");
  }

  if (date.toISOString().slice(0, 10) !== value) {
    throw new Error("Invalid calendar date.");
  }

  return date;
}

function getSriLankaDateParts(at = new Date()) {
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

  const javascriptWeekday = dateObject.getUTCDay();

  const isoWeekday = javascriptWeekday === 0 ? 7 : javascriptWeekday;

  return {
    date,
    time,
    dateObject,
    weekday: isoWeekday,
  };
}

async function resolveBusinessDay(at = new Date()) {
  const local = getSriLankaDateParts(at);

  const exception = await prisma.businessCalendarException.findUnique({
    where: {
      date: local.dateObject,
    },
  });

  if (exception) {
    if (exception.type === "CLOSED") {
      return {
        businessDate: local.date,

        weekday: local.weekday,

        timeZone: TIME_ZONE,

        currentTime: local.time,

        isOpenDay: false,

        isWithinOpeningHours: false,

        openingTime: null,

        closingTime: null,

        source: "EXCEPTION" as const,

        reason: exception.reason,
      };
    }

    const openingTime = exception.openingTime;

    const closingTime = exception.closingTime;

    const isWithinOpeningHours = Boolean(
      openingTime &&
      closingTime &&
      local.time >= openingTime &&
      local.time < closingTime,
    );

    return {
      businessDate: local.date,

      weekday: local.weekday,

      timeZone: TIME_ZONE,

      currentTime: local.time,

      isOpenDay: true,

      isWithinOpeningHours,

      openingTime,

      closingTime,

      source: "EXCEPTION" as const,

      reason: exception.reason,
    };
  }

  const weekly = await prisma.businessWeeklySchedule.findUnique({
    where: {
      weekday: local.weekday,
    },
  });

  if (!weekly || !weekly.isOpen) {
    return {
      businessDate: local.date,

      weekday: local.weekday,

      timeZone: TIME_ZONE,

      currentTime: local.time,

      isOpenDay: false,

      isWithinOpeningHours: false,

      openingTime: null,

      closingTime: null,

      source: "WEEKLY" as const,

      reason: weekly
        ? null
        : "Business schedule has not been configured for this day.",
    };
  }

  const isWithinOpeningHours = Boolean(
    weekly.openingTime &&
    weekly.closingTime &&
    local.time >= weekly.openingTime &&
    local.time < weekly.closingTime,
  );

  return {
    businessDate: local.date,

    weekday: local.weekday,

    timeZone: TIME_ZONE,

    currentTime: local.time,

    isOpenDay: true,

    isWithinOpeningHours,

    openingTime: weekly.openingTime,

    closingTime: weekly.closingTime,

    source: "WEEKLY" as const,

    reason: null,
  };
}

/*
|--------------------------------------------------------------------------
| CURRENT BUSINESS STATUS
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
        message:
          error instanceof Error
            ? error.message
            : "Failed to resolve business status",
      });
    }
  },
);

/*
|--------------------------------------------------------------------------
| GET WEEKLY SCHEDULE
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
        message:
          error instanceof Error
            ? error.message
            : "Failed to load weekly business schedule",
      });
    }
  },
);

/*
|--------------------------------------------------------------------------
| REPLACE WEEKLY SCHEDULE
|--------------------------------------------------------------------------
|
| weekday uses ISO-8601:
|
| 1 = Monday
| 2 = Tuesday
| 3 = Wednesday
| 4 = Thursday
| 5 = Friday
| 6 = Saturday
| 7 = Sunday
|--------------------------------------------------------------------------
*/

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
      const weekdays = parsed.data.schedules.map(
        (schedule) => schedule.weekday,
      );

      if (new Set(weekdays).size !== 7) {
        throw new Error("Each weekday must appear exactly once.");
      }

      for (const schedule of parsed.data.schedules) {
        validateTimeRange(
          schedule.isOpen,
          schedule.openingTime,
          schedule.closingTime,
        );
      }

      await runSerializableTransaction(async (tx) => {
        for (const schedule of parsed.data.schedules) {
          const openingTime = schedule.isOpen ? schedule.openingTime! : null;

          const closingTime = schedule.isOpen ? schedule.closingTime! : null;

          await tx.businessWeeklySchedule.upsert({
            where: {
              weekday: schedule.weekday,
            },

            create: {
              weekday: schedule.weekday,

              isOpen: schedule.isOpen,

              openingTime,

              closingTime,
            },

            update: {
              isOpen: schedule.isOpen,

              openingTime,

              closingTime,
            },
          });
        }

        await tx.auditLog.create({
          data: {
            userId: req.user!.id,

            action: "UPDATE",

            entityType: "BusinessWeeklySchedule",

            entityId: "WEEKLY",

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
        message:
          error instanceof Error
            ? error.message
            : "Failed to update weekly business schedule",
      });
    }
  },
);

/*
|--------------------------------------------------------------------------
| LIST CALENDAR EXCEPTIONS
|--------------------------------------------------------------------------
*/

router.get(
  "/exceptions",

  requirePermission("erp.pos.business-calendar.read"),

  async (_req, res) => {
    try {
      const exceptions = await prisma.businessCalendarException.findMany({
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
        message:
          error instanceof Error
            ? error.message
            : "Failed to load business calendar exceptions",
      });
    }
  },
);

/*
|--------------------------------------------------------------------------
| CREATE / REPLACE CALENDAR EXCEPTION
|--------------------------------------------------------------------------
*/

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
      if (parsed.data.type === "SPECIAL_HOURS") {
        validateTimeRange(
          true,
          parsed.data.openingTime,
          parsed.data.closingTime,
        );
      }

      const date = parseDateOnly(parsed.data.date);

      const exception = await runSerializableTransaction(async (tx) => {
        const saved = await tx.businessCalendarException.upsert({
          where: {
            date,
          },

          create: {
            date,

            type: parsed.data.type,

            openingTime:
              parsed.data.type === "SPECIAL_HOURS"
                ? parsed.data.openingTime!
                : null,

            closingTime:
              parsed.data.type === "SPECIAL_HOURS"
                ? parsed.data.closingTime!
                : null,

            reason: parsed.data.reason || null,
          },

          update: {
            type: parsed.data.type,

            openingTime:
              parsed.data.type === "SPECIAL_HOURS"
                ? parsed.data.openingTime!
                : null,

            closingTime:
              parsed.data.type === "SPECIAL_HOURS"
                ? parsed.data.closingTime!
                : null,

            reason: parsed.data.reason || null,
          },
        });

        await tx.auditLog.create({
          data: {
            userId: req.user!.id,

            action: "UPSERT",

            entityType: "BusinessCalendarException",

            entityId: saved.id,

            afterJson: {
              date: parsed.data.date,

              type: parsed.data.type,

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
        message:
          error instanceof Error
            ? error.message
            : "Failed to save business calendar exception",
      });
    }
  },
);

/*
|--------------------------------------------------------------------------
| DELETE CALENDAR EXCEPTION
|--------------------------------------------------------------------------
*/

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

      if (!rawDate || !/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
        return res.status(400).json({
          message: "Valid date is required",
        });
      }

      const date = parseDateOnly(rawDate);

      const existing = await prisma.businessCalendarException.findUnique({
        where: {
          date,
        },
      });

      if (!existing) {
        return res.status(404).json({
          message: "Business calendar exception not found",
        });
      }

      await runSerializableTransaction(async (tx) => {
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

        await tx.businessCalendarException.delete({
          where: {
            id: existing.id,
          },
        });
      });

      return res.json({
        message: "Business calendar exception deleted",
      });
    } catch (error) {
      return res.status(400).json({
        message:
          error instanceof Error
            ? error.message
            : "Failed to delete business calendar exception",
      });
    }
  },
);

export { TIME_ZONE, getSriLankaDateParts, resolveBusinessDay };

export default router;

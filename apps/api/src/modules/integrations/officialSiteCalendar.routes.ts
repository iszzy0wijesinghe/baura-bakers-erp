
/** @format */

import { timingSafeEqual } from "node:crypto";
import { Router } from "express";
import { prisma } from "../../lib/prisma";
import { env } from "../../config/env";

const router = Router();

const TIME_ZONE = "Asia/Colombo";
const DEFAULT_DAYS = 14;
const MAX_DAYS = 31;

function secureTokenMatches(provided: string, expected: string): boolean {
  const providedBuffer = Buffer.from(provided, "utf8");
  const expectedBuffer = Buffer.from(expected, "utf8");

  if (
    providedBuffer.length === 0 ||
    providedBuffer.length !== expectedBuffer.length
  ) {
    return false;
  }

  return timingSafeEqual(providedBuffer, expectedBuffer);
}

function getSriLankaToday(): string {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const parts = formatter.formatToParts(new Date());

  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );

  return `${values.year}-${values.month}-${values.day}`;
}

function parseDateOnly(value: string): Date {
  const date = new Date(`${value}T00:00:00.000Z`);

  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value
  ) {
    throw new Error("Invalid business calendar date.");
  }

  return date;
}

function addDays(value: string, amount: number): string {
  const date = parseDateOnly(value);
  date.setUTCDate(date.getUTCDate() + amount);

  return date.toISOString().slice(0, 10);
}

function getWeekday(date: string): number {
  const weekday = parseDateOnly(date).getUTCDay();

  return weekday === 0 ? 7 : weekday;
}

router.use((req, res, next) => {
  res.setHeader("Cache-Control", "private, no-store");

  const authorization = req.headers.authorization || "";
  const match = /^Bearer\s+(.+)$/i.exec(authorization);
  const providedToken = match?.[1]?.trim() || "";
  const expectedToken = env.ERP_INTEGRATION_TOKEN;

  if (
    !expectedToken ||
    !secureTokenMatches(providedToken, expectedToken)
  ) {
    return res.status(401).json({
      message: "Unauthorized integration request.",
    });
  }

  next();
});

/*
|--------------------------------------------------------------------------
| Official website business calendar
|--------------------------------------------------------------------------
|
| Read-only ERP calendar integration.
|
| This route uses the existing ERP_INTEGRATION_TOKEN.
| It does not use the ERP staff JWT middleware.
|
| The endpoint returns only operational calendar data.
|--------------------------------------------------------------------------
*/

router.get("/business-calendar", async (req, res) => {
  const rawDays = req.query.days;
  let days = DEFAULT_DAYS;

  if (rawDays !== undefined) {
    if (
      typeof rawDays !== "string" ||
      !/^\d+$/.test(rawDays)
    ) {
      return res.status(400).json({
        message: "Days must be a positive integer.",
      });
    }

    days = Number(rawDays);

    if (
      !Number.isSafeInteger(days) ||
      days < 1 ||
      days > MAX_DAYS
    ) {
      return res.status(400).json({
        message: `Days must be between 1 and ${MAX_DAYS}.`,
      });
    }
  }

  try {
    const startDate = getSriLankaToday();
    const endDate = addDays(startDate, days - 1);

    const [weeklyRows, exceptionRows] = await Promise.all([
      prisma.businessWeeklySchedule.findMany({
        orderBy: {
          weekday: "asc",
        },
        select: {
          weekday: true,
          isOpen: true,
          openingTime: true,
          closingTime: true,
        },
      }),
      prisma.businessCalendarException.findMany({
        where: {
          date: {
            gte: parseDateOnly(startDate),
            lte: parseDateOnly(endDate),
          },
        },
        orderBy: {
          date: "asc",
        },
        select: {
          date: true,
          type: true,
          openingTime: true,
          closingTime: true,
          reason: true,
        },
      }),
    ]);

    const weeklySchedule = weeklyRows.map((row) => ({
      weekday: row.weekday,
      isOpen: row.isOpen,
      openingTime: row.isOpen ? row.openingTime : null,
      closingTime: row.isOpen ? row.closingTime : null,
    }));

    const exceptions = exceptionRows.map((row) => ({
      date: row.date.toISOString().slice(0, 10),
      type: row.type,
      openingTime:
        row.type === "SPECIAL_HOURS" ? row.openingTime : null,
      closingTime:
        row.type === "SPECIAL_HOURS" ? row.closingTime : null,
      reason: row.reason,
    }));

    const weeklyByDay = new Map(
      weeklySchedule.map((row) => [row.weekday, row]),
    );

    const exceptionsByDate = new Map(
      exceptions.map((row) => [row.date, row]),
    );

    const dates = Array.from({ length: days }, (_, index) => {
      const date = addDays(startDate, index);
      const weekday = getWeekday(date);
      const exception = exceptionsByDate.get(date);
      const weekly = weeklyByDay.get(weekday);

      if (exception) {
        const isOpen = exception.type === "SPECIAL_HOURS";

        return {
          date,
          weekday,
          isOpen,
          openingTime: isOpen ? exception.openingTime : null,
          closingTime: isOpen ? exception.closingTime : null,
          source: "EXCEPTION" as const,
          reason: exception.reason,
        };
      }

      const isOpen = weekly?.isOpen ?? false;

      return {
        date,
        weekday,
        isOpen,
        openingTime: isOpen ? weekly?.openingTime ?? null : null,
        closingTime: isOpen ? weekly?.closingTime ?? null : null,
        source: "WEEKLY" as const,
        reason: weekly
          ? null
          : "Business schedule has not been configured.",
      };
    });

    return res.json({
      timeZone: TIME_ZONE,
      startDate,
      endDate,
      weeklySchedule,
      exceptions,
      dates,
    });
  } catch (error) {
    console.error("ERP business calendar integration failed:", error);

    return res.status(503).json({
      message: "Business calendar is temporarily unavailable.",
    });
  }
});

export default router;

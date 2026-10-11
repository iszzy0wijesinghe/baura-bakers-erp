/** @format */

import { apiRequest } from "./api";

export type BusinessCalendarStatus = {
  businessDate: string;
  weekday: number;
  timeZone: string;
  currentTime: string;
  isOpenDay: boolean;
  isWithinOpeningHours: boolean;
  openingTime: string | null;
  closingTime: string | null;
  source: "WEEKLY" | "EXCEPTION";
  reason: string | null;
};

export type WeeklySchedule = {
  id?: string;
  weekday: number;
  isOpen: boolean;
  openingTime: string | null;
  closingTime: string | null;
};

export type CalendarException = {
  id: string;
  date: string;
  type: "CLOSED" | "SPECIAL_HOURS";
  openingTime: string | null;
  closingTime: string | null;
  reason: string | null;
};

export type CalendarSession = {
  id: string;
  sessionNo: string;
  businessDate: string;
  businessDateKey: string;
  openedAt: string;
  openedById: string;
  status: "OPEN" | "CLOSING" | "PENDING_APPROVAL";
  isOverdue: boolean;
  isFutureDated: boolean;
  requiresReconciliation: boolean;
  nextAction:
    | "START_DAY_END"
    | "SUBMIT_DAY_END"
    | "APPROVE_DAY_END"
    | "NONE";
};

export type BusinessCalendarOverview = {
  timeZone: string;
  currentDate: string;
  currentTime: string;
  status: BusinessCalendarStatus;
  schedules: WeeklySchedule[];
  exceptions: CalendarException[];
  openSessions: CalendarSession[];
  closingSessions: CalendarSession[];
  pendingApprovalSessions: CalendarSession[];
  unfinishedSessions: CalendarSession[];
  overdueSessions: CalendarSession[];
  futureDatedSessions: CalendarSession[];
  summary: {
    openSessionCount: number;
    closingSessionCount: number;
    pendingApprovalCount: number;
    unfinishedSessionCount: number;
    overdueSessionCount: number;
    futureDatedSessionCount: number;
    configuredWeekdays: number;
    exceptionCount: number;
    hasUnresolvedSessions: boolean;
    hasOverdueSessions: boolean;
  };
};

export type CalendarExceptionInput = {
  date: string;
  type: "CLOSED" | "SPECIAL_HOURS";
  openingTime: string | null;
  closingTime: string | null;
  reason: string | null;
};

const BASE = "/business-calendar";

export const businessCalendarApi = {
  overview() {
    return apiRequest<BusinessCalendarOverview>(
      `${BASE}/overview`,
    );
  },

  status() {
    return apiRequest<{ status: BusinessCalendarStatus }>(
      `${BASE}/status`,
    );
  },

  weekly() {
    return apiRequest<{
      timeZone: string;
      schedules: WeeklySchedule[];
    }>(`${BASE}/weekly`);
  },

  updateWeekly(schedules: WeeklySchedule[]) {
    return apiRequest<{
      message: string;
      schedules: WeeklySchedule[];
    }>(`${BASE}/weekly`, {
      method: "PUT",
      body: JSON.stringify({
        schedules: schedules.map((schedule) => ({
          weekday: schedule.weekday,
          isOpen: schedule.isOpen,
          openingTime: schedule.isOpen
            ? schedule.openingTime
            : null,
          closingTime: schedule.isOpen
            ? schedule.closingTime
            : null,
        })),
      }),
    });
  },

  exceptions() {
    return apiRequest<{
      timeZone: string;
      exceptions: CalendarException[];
    }>(`${BASE}/exceptions`);
  },

  saveException(data: CalendarExceptionInput) {
    return apiRequest<{
      message: string;
      exception: CalendarException;
    }>(`${BASE}/exceptions`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  },

  deleteException(date: string) {
    return apiRequest<{ message: string }>(
      `${BASE}/exceptions/${date}`,
      {
        method: "DELETE",
      },
    );
  },

  date(date: string) {
    return apiRequest<{ status: BusinessCalendarStatus }>(
      `${BASE}/date/${date}`,
    );
  },
};
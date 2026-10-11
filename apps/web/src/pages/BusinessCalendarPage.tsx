/** @format */

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  AlertCircle,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Edit3,
  Plus,
  RefreshCw,
  Save,
  ShieldAlert,
  Trash2,
  X,
} from "lucide-react";

import { AppLayout } from "../layouts/AppLayout";
import { useAuth } from "../auth/AuthContext";

import {
  businessCalendarApi,
  type BusinessCalendarOverview,
  type CalendarException,
  type CalendarExceptionInput,
  type WeeklySchedule,
} from "../lib/businessCalendarApi";

const WEEKDAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

const SHORT_WEEKDAYS = [
  "Mon",
  "Tue",
  "Wed",
  "Thu",
  "Fri",
  "Sat",
  "Sun",
];

const CARD =
  "rounded-[18px] border border-bauraBorder bg-white shadow-[0_6px_22px_rgba(63,46,36,0.035)]";

const INPUT =
  "h-10 w-full rounded-xl border border-bauraBorder bg-white px-3 text-[11px] font-medium text-bauraInk outline-none transition focus:border-bauraGold";

const BUTTON =
  "inline-flex h-10 items-center justify-center gap-2 rounded-xl px-4 text-[11px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-50";

function localDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function formatDate(date: string) {
  const parsed = new Date(`${date}T00:00:00Z`);

  if (Number.isNaN(parsed.getTime())) return date;

  return parsed.toLocaleDateString("en-LK", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function formatTime(time: string | null) {
  if (!time) return "—";

  const [hours, minutes] = time.split(":").map(Number);

  const period = hours >= 12 ? "PM" : "AM";
  const hour = hours % 12 || 12;

  return `${hour}:${String(minutes).padStart(2, "0")} ${period}`;
}

function defaultSchedule(weekday: number): WeeklySchedule {
  return {
    weekday,
    isOpen: false,
    openingTime: null,
    closingTime: null,
  };
}

function normalizeSchedules(schedules: WeeklySchedule[]) {
  return Array.from({ length: 7 }, (_, index) => {
    const weekday = index + 1;

    return (
      schedules.find((item) => item.weekday === weekday) ??
      defaultSchedule(weekday)
    );
  });
}

function getErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Something went wrong. Please try again.";
}

function SectionHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 className="text-[14px] font-semibold tracking-tight text-bauraInk">
          {title}
        </h2>

        {description && (
          <p className="mt-1 text-[10px] leading-5 text-bauraMuted">
            {description}
          </p>
        )}
      </div>

      {action}
    </div>
  );
}

function StatusPill({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "success" | "warning" | "danger" | "neutral";
}) {
  const styles = {
    success: "bg-bauraSuccessSoft text-bauraSuccess",
    warning: "bg-bauraGoldSoft text-bauraGoldDark",
    danger: "bg-bauraDangerSoft text-bauraDanger",
    neutral: "bg-bauraCanvas2 text-bauraMuted",
  };

  return (
    <span
      className={`inline-flex items-center rounded-lg px-2.5 py-1 text-[9px] font-semibold ${styles[tone]}`}>
      {children}
    </span>
  );
}

type ExceptionFormState = {
  date: string;
  type: "CLOSED" | "SPECIAL_HOURS";
  openingTime: string;
  closingTime: string;
  reason: string;
};

function createExceptionForm(date = ""): ExceptionFormState {
  return {
    date,
    type: "CLOSED",
    openingTime: "08:00",
    closingTime: "20:00",
    reason: "",
  };
}

export function BusinessCalendarPage() {
  const { hasPermission } = useAuth();

  const canEdit = hasPermission(
    "erp.pos.business-calendar.update",
  );

  const [overview, setOverview] =
    useState<BusinessCalendarOverview | null>(null);

  const [schedules, setSchedules] = useState<WeeklySchedule[]>([]);

  const [loading, setLoading] = useState(true);
  const [savingWeekly, setSavingWeekly] = useState(false);
  const [savingException, setSavingException] = useState(false);
  const [deletingDate, setDeletingDate] = useState<string | null>(null);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [activeTab, setActiveTab] = useState<
    "overview" | "weekly" | "calendar" | "sessions"
  >("overview");

  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();

    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  const [exceptionModalOpen, setExceptionModalOpen] = useState(false);
  const [exceptionForm, setExceptionForm] =
    useState<ExceptionFormState>(createExceptionForm());

  const [editingDate, setEditingDate] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const data = await businessCalendarApi.overview();

      setOverview(data);
      setSchedules(normalizeSchedules(data.schedules));
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const exceptionsByDate = useMemo(() => {
    const map = new Map<string, CalendarException>();

    for (const exception of overview?.exceptions ?? []) {
      map.set(exception.date.slice(0, 10), exception);
    }

    return map;
  }, [overview]);

  const calendarDays = useMemo(() => {
    const year = selectedMonth.getFullYear();
    const month = selectedMonth.getMonth();

    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);

    const leadingDays = (firstDay.getDay() + 6) % 7;

    const days: Array<{
      date: string;
      day: number;
      inMonth: boolean;
      weekday: number;
    }> = [];

    for (let index = 0; index < 42; index++) {
      const date = new Date(
        year,
        month,
        index - leadingDays + 1,
      );

      days.push({
        date: localDateKey(date),
        day: date.getDate(),
        inMonth:
          date.getMonth() === month &&
          date.getFullYear() === year,
        weekday: (date.getDay() + 6) % 7 + 1,
      });
    }

    if (leadingDays + lastDay.getDate() <= 35) {
      return days.slice(0, 35);
    }

    return days;
  }, [selectedMonth]);

  const monthLabel = selectedMonth.toLocaleDateString("en-LK", {
    month: "long",
    year: "numeric",
  });

  function updateSchedule(
    weekday: number,
    changes: Partial<WeeklySchedule>,
  ) {
    setSchedules((current) =>
      current.map((schedule) =>
        schedule.weekday === weekday
          ? { ...schedule, ...changes }
          : schedule,
      ),
    );
  }

  async function saveWeeklySchedule() {
    if (!canEdit) return;

    for (const schedule of schedules) {
      if (!schedule.isOpen) continue;

      if (!schedule.openingTime || !schedule.closingTime) {
        setError(
          `${WEEKDAYS[schedule.weekday - 1]} requires opening and closing times.`,
        );
        return;
      }

      if (schedule.openingTime >= schedule.closingTime) {
        setError(
          `${WEEKDAYS[schedule.weekday - 1]}: Closing time must be later than opening time.`,
        );
        return;
      }
    }

    setSavingWeekly(true);
    setError("");
    setSuccess("");

    try {
      await businessCalendarApi.updateWeekly(schedules);

      setSuccess("Weekly opening hours updated successfully.");
      await loadData();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSavingWeekly(false);
    }
  }

  function openExceptionModal(
    date = "",
    existing?: CalendarException,
  ) {
    setError("");
    setSuccess("");

    if (existing) {
      setEditingDate(existing.date.slice(0, 10));

      setExceptionForm({
        date: existing.date.slice(0, 10),
        type: existing.type,
        openingTime: existing.openingTime ?? "08:00",
        closingTime: existing.closingTime ?? "20:00",
        reason: existing.reason ?? "",
      });
    } else {
      setEditingDate(null);
      setExceptionForm(createExceptionForm(date));
    }

    setExceptionModalOpen(true);
  }

  async function saveException() {
    if (!canEdit) return;

    if (!exceptionForm.date) {
      setError("Select a date.");
      return;
    }

    if (
      exceptionForm.type === "SPECIAL_HOURS" &&
      exceptionForm.openingTime >= exceptionForm.closingTime
    ) {
      setError("Closing time must be later than opening time.");
      return;
    }

    setSavingException(true);
    setError("");
    setSuccess("");

    try {
      const payload: CalendarExceptionInput = {
        date: exceptionForm.date,
        type: exceptionForm.type,
        openingTime:
          exceptionForm.type === "SPECIAL_HOURS"
            ? exceptionForm.openingTime
            : null,
        closingTime:
          exceptionForm.type === "SPECIAL_HOURS"
            ? exceptionForm.closingTime
            : null,
        reason: exceptionForm.reason.trim() || null,
      };

      await businessCalendarApi.saveException(payload);

      setExceptionModalOpen(false);
      setSuccess("Calendar exception saved successfully.");

      await loadData();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSavingException(false);
    }
  }

  async function deleteException(date: string) {
    if (!canEdit) return;

    const confirmed = window.confirm(
      `Remove the calendar exception for ${formatDate(date)}?`,
    );

    if (!confirmed) return;

    setDeletingDate(date);
    setError("");
    setSuccess("");

    try {
      await businessCalendarApi.deleteException(date);

      setSuccess("Calendar exception removed.");
      await loadData();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setDeletingDate(null);
    }
  }

  function moveMonth(direction: number) {
    setSelectedMonth(
      (current) =>
        new Date(
          current.getFullYear(),
          current.getMonth() + direction,
          1,
        ),
    );
  }

  const status = overview?.status;

  const todayIsOpen = Boolean(
    status?.isOpenDay && status?.isWithinOpeningHours,
  );

  const tabs = [
    { key: "overview", label: "Overview" },
    { key: "weekly", label: "Weekly Schedule" },
    { key: "calendar", label: "Holidays & Calendar" },
    { key: "sessions", label: "POS Sessions" },
  ] as const;

  return (
    <AppLayout
      title="Business Calendar"
      subtitle="Manage operating hours, holidays, special schedules and POS business-date exceptions."
      activeItem="Business Calendar"
      actions={
        <button
          type="button"
          onClick={() => void loadData()}
          disabled={loading}
          className={`${BUTTON} border border-bauraBorder bg-white text-bauraInk hover:bg-bauraCanvas2`}>
          <RefreshCw
            size={14}
            className={loading ? "animate-spin" : ""}
          />
          Refresh
        </button>
      }>
      <div className="space-y-5">
        {error && (
          <div className="flex items-start gap-3 rounded-xl border border-bauraDanger/20 bg-bauraDangerSoft p-4 text-[11px] text-bauraDanger">
            <AlertCircle size={16} className="mt-0.5 shrink-0" />
            <span className="flex-1">{error}</span>
            <button
              type="button"
              onClick={() => setError("")}
              aria-label="Dismiss error">
              <X size={15} />
            </button>
          </div>
        )}

        {success && (
          <div className="flex items-center gap-3 rounded-xl border border-bauraSuccess/20 bg-bauraSuccessSoft p-4 text-[11px] text-bauraSuccess">
            <Check size={16} />
            <span className="flex-1">{success}</span>
            <button
              type="button"
              onClick={() => setSuccess("")}
              aria-label="Dismiss notification">
              <X size={15} />
            </button>
          </div>
        )}

        {loading && !overview ? (
          <div className={`${CARD} flex min-h-[320px] items-center justify-center`}>
            <div className="flex items-center gap-3 text-[12px] text-bauraMuted">
              <RefreshCw size={18} className="animate-spin" />
              Loading business calendar...
            </div>
          </div>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className={`${CARD} p-5`}>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-medium text-bauraMuted">
                    Current Business Date
                  </span>
                  <CalendarDays size={16} className="text-bauraGoldDark" />
                </div>
                <p className="mt-4 text-[18px] font-semibold text-bauraInk">
                  {overview?.currentDate
                    ? formatDate(overview.currentDate)
                    : "—"}
                </p>
                <p className="mt-1 text-[10px] text-bauraMuted">
                  Asia/Colombo
                </p>
              </div>

              <div className={`${CARD} p-5`}>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-medium text-bauraMuted">
                    Shop Status
                  </span>
                  <Clock3 size={16} className="text-bauraGoldDark" />
                </div>
                <div className="mt-4">
                  <StatusPill
                    tone={todayIsOpen ? "success" : "danger"}>
                    {todayIsOpen ? "Currently Open" : "Currently Closed"}
                  </StatusPill>
                </div>
                <p className="mt-3 text-[10px] text-bauraMuted">
                  {status?.isOpenDay
                    ? `${formatTime(status.openingTime)} – ${formatTime(status.closingTime)}`
                    : "No scheduled operations today"}
                </p>
              </div>

              <div className={`${CARD} p-5`}>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-medium text-bauraMuted">
                    Unfinished POS Sessions
                  </span>
                  <ShieldAlert size={16} className="text-bauraGoldDark" />
                </div>
                <p className="mt-4 text-[23px] font-semibold text-bauraInk">
                  {overview?.summary.unfinishedSessionCount ?? 0}
                </p>
                <p className="mt-1 text-[10px] text-bauraMuted">
                  Awaiting completion or approval
                </p>
              </div>

              <div className={`${CARD} p-5`}>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-medium text-bauraMuted">
                    Overdue POS Sessions
                  </span>
                  <AlertCircle size={16} className="text-bauraGoldDark" />
                </div>
                <p className="mt-4 text-[23px] font-semibold text-bauraInk">
                  {overview?.summary.overdueSessionCount ?? 0}
                </p>
                <p className="mt-1 text-[10px] text-bauraMuted">
                  Require reconciliation
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-1 rounded-[15px] border border-bauraBorder bg-white p-1.5">
              {tabs.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTab(tab.key)}
                  className={`rounded-xl px-4 py-2.5 text-[10px] font-semibold transition ${
                    activeTab === tab.key
                      ? "bg-bauraPrimary text-white"
                      : "text-bauraMuted hover:bg-bauraCanvas2 hover:text-bauraInk"
                  }`}>
                  {tab.label}
                </button>
              ))}
            </div>

            {activeTab === "overview" && (
              <div className="grid gap-5 xl:grid-cols-[1.3fr_1fr]">
                <div className={`${CARD} p-5`}>
                  <SectionHeader
                    title="Today's Operations"
                    description="Operating hours are based on your configured weekly schedule and date exceptions."
                  />

                  <div className="mt-6 space-y-4">
                    <div className="flex items-center justify-between border-b border-bauraBorder pb-4">
                      <span className="text-[11px] text-bauraMuted">
                        Calendar status
                      </span>
                      <StatusPill
                        tone={status?.isOpenDay ? "success" : "danger"}>
                        {status?.isOpenDay
                          ? "Scheduled Open"
                          : "Scheduled Closed"}
                      </StatusPill>
                    </div>

                    <div className="flex items-center justify-between border-b border-bauraBorder pb-4">
                      <span className="text-[11px] text-bauraMuted">
                        Opening time
                      </span>
                      <span className="text-[11px] font-semibold text-bauraInk">
                        {formatTime(status?.openingTime ?? null)}
                      </span>
                    </div>

                    <div className="flex items-center justify-between border-b border-bauraBorder pb-4">
                      <span className="text-[11px] text-bauraMuted">
                        Closing time
                      </span>
                      <span className="text-[11px] font-semibold text-bauraInk">
                        {formatTime(status?.closingTime ?? null)}
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-bauraMuted">
                        Schedule source
                      </span>
                      <StatusPill>
                        {status?.source === "EXCEPTION"
                          ? "Date Exception"
                          : "Weekly Schedule"}
                      </StatusPill>
                    </div>

                    {status?.reason && (
                      <div className="rounded-xl bg-bauraCanvas2 p-3 text-[10px] leading-5 text-bauraMuted">
                        {status.reason}
                      </div>
                    )}
                  </div>
                </div>

                <div className={`${CARD} p-5`}>
                  <SectionHeader
                    title="Calendar Management"
                    description="Quick access to your operating schedule."
                  />

                  <div className="mt-5 space-y-3">
                    <button
                      type="button"
                      onClick={() => setActiveTab("weekly")}
                      className="flex w-full items-center justify-between rounded-xl border border-bauraBorder p-4 text-left transition hover:bg-bauraCanvas2">
                      <div>
                        <p className="text-[11px] font-semibold text-bauraInk">
                          Weekly Opening Hours
                        </p>
                        <p className="mt-1 text-[10px] text-bauraMuted">
                          Configure all seven days
                        </p>
                      </div>
                      <ChevronRight size={16} className="text-bauraMuted" />
                    </button>

                    <button
                      type="button"
                      onClick={() => setActiveTab("calendar")}
                      className="flex w-full items-center justify-between rounded-xl border border-bauraBorder p-4 text-left transition hover:bg-bauraCanvas2">
                      <div>
                        <p className="text-[11px] font-semibold text-bauraInk">
                          Holidays & Special Hours
                        </p>
                        <p className="mt-1 text-[10px] text-bauraMuted">
                          {overview?.exceptions.length ?? 0} configured exceptions
                        </p>
                      </div>
                      <ChevronRight size={16} className="text-bauraMuted" />
                    </button>

                    <button
                      type="button"
                      onClick={() => setActiveTab("sessions")}
                      className="flex w-full items-center justify-between rounded-xl border border-bauraBorder p-4 text-left transition hover:bg-bauraCanvas2">
                      <div>
                        <p className="text-[11px] font-semibold text-bauraInk">
                          POS Reconciliation
                        </p>
                        <p className="mt-1 text-[10px] text-bauraMuted">
                          Review unfinished business dates
                        </p>
                      </div>
                      <ChevronRight size={16} className="text-bauraMuted" />
                    </button>
                  </div>
                </div>
              </div>
            )}

            {activeTab === "weekly" && (
              <div className={`${CARD} p-5`}>
                <SectionHeader
                  title="Weekly Operating Schedule"
                  description="Set your regular opening and closing hours. Changes are saved for all seven weekdays."
                  action={
                    canEdit && (
                      <button
                        type="button"
                        onClick={() => void saveWeeklySchedule()}
                        disabled={savingWeekly}
                        className={`${BUTTON} bg-bauraPrimary text-white hover:opacity-90`}>
                        <Save size={14} />
                        {savingWeekly ? "Saving..." : "Save Schedule"}
                      </button>
                    )
                  }
                />

                <div className="mt-6 space-y-2">
                  {schedules.map((schedule) => (
                    <div
                      key={schedule.weekday}
                      className="grid gap-4 rounded-xl border border-bauraBorder p-4 md:grid-cols-[1fr_140px_180px_180px] md:items-center">
                      <div>
                        <p className="text-[11px] font-semibold text-bauraInk">
                          {WEEKDAYS[schedule.weekday - 1]}
                        </p>
                        <p className="mt-1 text-[9px] text-bauraMuted">
                          {schedule.isOpen
                            ? "Regular operating day"
                            : "Non-operating day"}
                        </p>
                      </div>

                      <label className="flex items-center gap-2 text-[10px] font-medium text-bauraInk">
                        <input
                          type="checkbox"
                          checked={schedule.isOpen}
                          disabled={!canEdit}
                          onChange={(event) =>
                            updateSchedule(schedule.weekday, {
                              isOpen: event.target.checked,
                              openingTime: event.target.checked
                                ? schedule.openingTime ?? "08:00"
                                : null,
                              closingTime: event.target.checked
                                ? schedule.closingTime ?? "20:00"
                                : null,
                            })
                          }
                          className="h-4 w-4 accent-bauraPrimary"
                        />
                        {schedule.isOpen ? "Open" : "Closed"}
                      </label>

                      <div>
                        <label className="mb-1.5 block text-[9px] font-medium text-bauraMuted">
                          Opening
                        </label>
                        <input
                          type="time"
                          value={schedule.openingTime ?? ""}
                          disabled={!canEdit || !schedule.isOpen}
                          onChange={(event) =>
                            updateSchedule(schedule.weekday, {
                              openingTime: event.target.value,
                            })
                          }
                          className={INPUT}
                        />
                      </div>

                      <div>
                        <label className="mb-1.5 block text-[9px] font-medium text-bauraMuted">
                          Closing
                        </label>
                        <input
                          type="time"
                          value={schedule.closingTime ?? ""}
                          disabled={!canEdit || !schedule.isOpen}
                          onChange={(event) =>
                            updateSchedule(schedule.weekday, {
                              closingTime: event.target.value,
                            })
                          }
                          className={INPUT}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeTab === "calendar" && (
              <div className="grid gap-5 xl:grid-cols-[1.5fr_1fr]">
                <div className={`${CARD} p-5`}>
                  <SectionHeader
                    title="Business Calendar"
                    description="Select a date to configure a closure or special operating hours."
                    action={
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => moveMonth(-1)}
                          className="flex h-9 w-9 items-center justify-center rounded-xl border border-bauraBorder text-bauraMuted hover:bg-bauraCanvas2">
                          <ChevronLeft size={16} />
                        </button>

                        <span className="min-w-[130px] text-center text-[11px] font-semibold text-bauraInk">
                          {monthLabel}
                        </span>

                        <button
                          type="button"
                          onClick={() => moveMonth(1)}
                          className="flex h-9 w-9 items-center justify-center rounded-xl border border-bauraBorder text-bauraMuted hover:bg-bauraCanvas2">
                          <ChevronRight size={16} />
                        </button>
                      </div>
                    }
                  />

                  <div className="mt-6 grid grid-cols-7 gap-1.5">
                    {SHORT_WEEKDAYS.map((day) => (
                      <div
                        key={day}
                        className="py-2 text-center text-[9px] font-semibold text-bauraMuted">
                        {day}
                      </div>
                    ))}

                    {calendarDays.map((day) => {
                      const exception = exceptionsByDate.get(day.date);

                      const weekly = schedules.find(
                        (item) => item.weekday === day.weekday,
                      );

                      const isClosed = exception
                        ? exception.type === "CLOSED"
                        : !weekly?.isOpen;

                      const isSpecial =
                        exception?.type === "SPECIAL_HOURS";

                      const isToday =
                        day.date === overview?.currentDate;

                      return (
                        <button
                          key={day.date}
                          type="button"
                          disabled={!canEdit}
                          onClick={() =>
                            openExceptionModal(day.date, exception)
                          }
                          className={`relative flex min-h-[72px] flex-col items-start rounded-xl border p-2 text-left transition ${
                            !day.inMonth
                              ? "border-transparent bg-bauraCanvas2/40 opacity-40"
                              : isSpecial
                                ? "border-bauraGold bg-bauraGoldSoft/40"
                                : isClosed
                                  ? "border-bauraBorder bg-bauraCanvas2"
                                  : "border-bauraBorder bg-white hover:border-bauraGold"
                          }`}>
                          <span
                            className={`text-[10px] font-semibold ${
                              isToday
                                ? "rounded-md bg-bauraPrimary px-1.5 py-0.5 text-white"
                                : "text-bauraInk"
                            }`}>
                            {day.day}
                          </span>

                          <span
                            className={`mt-auto text-[8px] font-medium ${
                              isSpecial
                                ? "text-bauraGoldDark"
                                : isClosed
                                  ? "text-bauraMuted"
                                  : "text-bauraSuccess"
                            }`}>
                            {isSpecial
                              ? "Special"
                              : isClosed
                                ? "Closed"
                                : "Open"}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  <div className="mt-5 flex flex-wrap gap-4 text-[9px] text-bauraMuted">
                    <span>● Open day</span>
                    <span>● Closed day</span>
                    <span>● Special hours</span>
                  </div>
                </div>

                <div className={`${CARD} p-5`}>
                  <SectionHeader
                    title="Holidays & Exceptions"
                    description="Configured closures and special opening hours."
                    action={
                      canEdit && (
                        <button
                          type="button"
                          onClick={() => openExceptionModal()}
                          className={`${BUTTON} bg-bauraPrimary text-white`}>
                          <Plus size={14} />
                          Add
                        </button>
                      )
                    }
                  />

                  <div className="mt-5 max-h-[540px] space-y-2 overflow-y-auto">
                    {(overview?.exceptions ?? []).length === 0 && (
                      <div className="rounded-xl bg-bauraCanvas2 p-5 text-center text-[10px] text-bauraMuted">
                        No holidays or special hours configured.
                      </div>
                    )}

                    {(overview?.exceptions ?? []).map((exception) => {
                      const date = exception.date.slice(0, 10);

                      return (
                        <div
                          key={exception.id}
                          className="rounded-xl border border-bauraBorder p-3">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className="text-[11px] font-semibold text-bauraInk">
                                {formatDate(date)}
                              </p>

                              <div className="mt-2">
                                <StatusPill
                                  tone={
                                    exception.type === "CLOSED"
                                      ? "danger"
                                      : "warning"
                                  }>
                                  {exception.type === "CLOSED"
                                    ? "Closed"
                                    : "Special Hours"}
                                </StatusPill>
                              </div>
                            </div>

                            {canEdit && (
                              <div className="flex gap-1">
                                <button
                                  type="button"
                                  onClick={() =>
                                    openExceptionModal(date, exception)
                                  }
                                  className="rounded-lg p-2 text-bauraMuted hover:bg-bauraCanvas2">
                                  <Edit3 size={13} />
                                </button>

                                <button
                                  type="button"
                                  disabled={deletingDate === date}
                                  onClick={() =>
                                    void deleteException(date)
                                  }
                                  className="rounded-lg p-2 text-bauraDanger hover:bg-bauraDangerSoft">
                                  <Trash2 size={13} />
                                </button>
                              </div>
                            )}
                          </div>

                          {exception.reason && (
                            <p className="mt-2 text-[10px] text-bauraMuted">
                              {exception.reason}
                            </p>
                          )}

                          {exception.type === "SPECIAL_HOURS" && (
                            <p className="mt-2 text-[10px] font-medium text-bauraInk">
                              {formatTime(exception.openingTime)}
                              {" – "}
                              {formatTime(exception.closingTime)}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {activeTab === "sessions" && (
              <div className={`${CARD} p-5`}>
                <SectionHeader
                  title="Unfinished POS Sessions"
                  description="Review active, closing and pending-approval sessions. Financial reconciliation is performed through the POS Day End workflow."
                />

                <div className="mt-5 overflow-x-auto">
                  <table className="w-full min-w-[700px] text-left">
                    <thead>
                      <tr className="border-b border-bauraBorder text-[9px] uppercase tracking-wider text-bauraMuted">
                        <th className="pb-3 font-semibold">Session</th>
                        <th className="pb-3 font-semibold">Business Date</th>
                        <th className="pb-3 font-semibold">Status</th>
                        <th className="pb-3 font-semibold">Date Check</th>
                        <th className="pb-3 font-semibold">Next Action</th>
                      </tr>
                    </thead>

                    <tbody>
                      {(overview?.unfinishedSessions ?? []).map(
                        (session) => (
                          <tr
                            key={session.id}
                            className="border-b border-bauraBorder/70">
                            <td className="py-4 text-[11px] font-semibold text-bauraInk">
                              {session.sessionNo}
                            </td>

                            <td className="py-4 text-[10px] text-bauraInk">
                              {formatDate(session.businessDateKey)}
                            </td>

                            <td className="py-4">
                              <StatusPill>
                                {session.status.replaceAll("_", " ")}
                              </StatusPill>
                            </td>

                            <td className="py-4">
                              {session.isOverdue ? (
                                <StatusPill tone="danger">
                                  Overdue
                                </StatusPill>
                              ) : session.isFutureDated ? (
                                <StatusPill tone="warning">
                                  Future Date
                                </StatusPill>
                              ) : (
                                <StatusPill tone="success">
                                  Current Date
                                </StatusPill>
                              )}
                            </td>

                            <td className="py-4 text-[10px] font-medium text-bauraInk">
                              {session.nextAction.replaceAll("_", " ")}
                            </td>
                          </tr>
                        ),
                      )}
                    </tbody>
                  </table>

                  {(overview?.unfinishedSessions ?? []).length === 0 && (
                    <div className="py-12 text-center text-[11px] text-bauraMuted">
                      No unfinished POS sessions.
                    </div>
                  )}
                </div>

                <div className="mt-5 flex items-start gap-3 rounded-xl border border-bauraBorder bg-bauraCanvas2 p-4">
                  <ShieldAlert
                    size={17}
                    className="mt-0.5 shrink-0 text-bauraGoldDark"
                  />

                  <p className="text-[10px] leading-5 text-bauraMuted">
                    Overdue sessions retain their original business dates.
                    Cashiers must complete Day End and a different authorized
                    manager must approve the reconciliation before the
                    session is closed.
                  </p>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {exceptionModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-[460px] rounded-[20px] border border-bauraBorder bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-[16px] font-semibold text-bauraInk">
                  {editingDate
                    ? "Edit Calendar Exception"
                    : "Add Calendar Exception"}
                </h3>

                <p className="mt-1 text-[10px] text-bauraMuted">
                  Configure a holiday, closure or special operating hours.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setExceptionModalOpen(false)}
                className="rounded-lg p-2 text-bauraMuted hover:bg-bauraCanvas2">
                <X size={17} />
              </button>
            </div>

            <div className="mt-6 space-y-4">
              <div>
                <label className="mb-1.5 block text-[10px] font-semibold text-bauraInk">
                  Date
                </label>

                <input
                  type="date"
                  value={exceptionForm.date}
                  disabled={Boolean(editingDate)}
                  onChange={(event) =>
                    setExceptionForm((current) => ({
                      ...current,
                      date: event.target.value,
                    }))
                  }
                  className={INPUT}
                />
              </div>

              <div>
                <label className="mb-1.5 block text-[10px] font-semibold text-bauraInk">
                  Exception Type
                </label>

                <select
                  value={exceptionForm.type}
                  onChange={(event) =>
                    setExceptionForm((current) => ({
                      ...current,
                      type: event.target.value as
                        | "CLOSED"
                        | "SPECIAL_HOURS",
                    }))
                  }
                  className={INPUT}>
                  <option value="CLOSED">Holiday / Closed</option>
                  <option value="SPECIAL_HOURS">
                    Special Opening Hours
                  </option>
                </select>
              </div>

              {exceptionForm.type === "SPECIAL_HOURS" && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1.5 block text-[10px] font-semibold text-bauraInk">
                      Opening Time
                    </label>

                    <input
                      type="time"
                      value={exceptionForm.openingTime}
                      onChange={(event) =>
                        setExceptionForm((current) => ({
                          ...current,
                          openingTime: event.target.value,
                        }))
                      }
                      className={INPUT}
                    />
                  </div>

                  <div>
                    <label className="mb-1.5 block text-[10px] font-semibold text-bauraInk">
                      Closing Time
                    </label>

                    <input
                      type="time"
                      value={exceptionForm.closingTime}
                      onChange={(event) =>
                        setExceptionForm((current) => ({
                          ...current,
                          closingTime: event.target.value,
                        }))
                      }
                      className={INPUT}
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="mb-1.5 block text-[10px] font-semibold text-bauraInk">
                  Reason / Description
                </label>

                <textarea
                  value={exceptionForm.reason}
                  onChange={(event) =>
                    setExceptionForm((current) => ({
                      ...current,
                      reason: event.target.value,
                    }))
                  }
                  maxLength={500}
                  rows={3}
                  placeholder="e.g. Public holiday, maintenance, special event"
                  className="w-full resize-none rounded-xl border border-bauraBorder p-3 text-[11px] text-bauraInk outline-none focus:border-bauraGold"
                />
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setExceptionModalOpen(false)}
                className={`${BUTTON} border border-bauraBorder bg-white text-bauraInk`}>
                Cancel
              </button>

              <button
                type="button"
                disabled={savingException}
                onClick={() => void saveException()}
                className={`${BUTTON} bg-bauraPrimary text-white`}>
                <Save size={14} />
                {savingException ? "Saving..." : "Save Exception"}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
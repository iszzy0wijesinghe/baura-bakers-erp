/** @format */

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  AlertCircle,
  ArrowDownRight,
  ArrowUpRight,
  Banknote,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  Clock3,
  Coins,
  Loader2,
  RefreshCw,
  Search,
  ShieldCheck,
  X,
  XCircle,
} from "lucide-react";

import { AppLayout } from "../layouts/AppLayout";

import { useAuth } from "../auth/AuthContext";

import {
  approvePosDayEnd,
  getPendingPosDayEnds,
  rejectPosDayEnd,
  type PosCashCount,
  type PosDayEnd,
  type PosSession,
} from "../lib/posSessionApi";

import { useToast } from "../ui/ToastProvider";

type PendingDayEnd = PosDayEnd & {
  posSession?: PosSession | null;
  session?: PosSession | null;
};

type Decision = "APPROVE" | "REJECT";

function numeric(value: unknown): number {
  const result = Number(value);
  return Number.isFinite(result) ? result : 0;
}

function money(value: unknown): string {
  return new Intl.NumberFormat("en-LK", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(numeric(value));
}

function formatDate(value?: string | null): string {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleDateString("en-LK", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function formatDateTime(value?: string | null): string {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("en-LK", {
    timeZone: "Asia/Colombo",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function getSession(item: PendingDayEnd): PosSession | null {
  return item.posSession ?? item.session ?? null;
}

function getClosingCounts(item: PendingDayEnd): PosCashCount[] {
  const session = getSession(item);

  return (session?.cashCounts ?? []).filter(
    (count) => count.countType === "CLOSING",
  );
}

function SummaryRow({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string | number;
  strong?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <span
        className={`text-[11px] ${
          strong ? "font-semibold text-bauraInk" : "text-bauraMuted"
        }`}
      >
        {label}
      </span>

      <span
        className={`text-right text-[11px] ${
          strong ? "font-extrabold" : "font-semibold"
        } text-bauraInk`}
      >
        Rs. {money(value)}
      </span>
    </div>
  );
}

function DetailLabel({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div>
      <p className="text-[9px] font-semibold uppercase tracking-[0.08em] text-bauraMuted">
        {label}
      </p>

      <p className="mt-1 text-[11px] font-semibold text-bauraInk">
        {value}
      </p>
    </div>
  );
}

export function PosDayEndApprovalsPage() {
  const toast = useToast();
  const { user } = useAuth();

  const [dayEnds, setDayEnds] = useState<PendingDayEnd[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [processing, setProcessing] = useState(false);

  const [search, setSearch] = useState("");
  const [decision, setDecision] = useState<Decision | null>(null);
  const [managerNote, setManagerNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (silent = false) => {
    if (silent) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      const response = await getPendingPosDayEnds();

      const items = (response.dayEnds ?? []) as PendingDayEnd[];

      setDayEnds(items);
      setError(null);

      setSelectedId((current) => {
        if (current && items.some((item) => item.id === current)) {
          return current;
        }

        return items[0]?.id ?? null;
      });
    } catch (caught) {
      const message =
        caught instanceof Error
          ? caught.message
          : "Unable to load pending Day Ends.";

      setError(message);

      if (silent) {
        toast.error("Refresh failed", message);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const keyword = search.trim().toLowerCase();

    if (!keyword) return dayEnds;

    return dayEnds.filter((item) => {
      const session = getSession(item);

      return [
        session?.sessionNo,
        session?.businessDate,
        session?.openedById,
        item.posSessionId,
        item.submittedById,
        item.varianceReason,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(keyword));
    });
  }, [dayEnds, search]);

  const selected =
    filtered.find((item) => item.id === selectedId) ??
    filtered[0] ??
    null;

  const selectedSession = selected ? getSession(selected) : null;

  const variance = selected ? numeric(selected.variance) : 0;

  const hasVariance = Math.abs(variance) >= 0.01;

  const isOwnSubmission =
    Boolean(selected?.submittedById) &&
    selected?.submittedById === user?.id;

  const pendingCount = dayEnds.length;

  const totalExpected = dayEnds.reduce(
    (sum, item) => sum + numeric(item.expectedCash),
    0,
  );

  const totalVariance = dayEnds.reduce(
    (sum, item) => sum + numeric(item.variance),
    0,
  );

  const mismatchedCount = dayEnds.filter(
    (item) => Math.abs(numeric(item.variance)) >= 0.01,
  ).length;

  function openDecision(value: Decision) {
    if (!selected || isOwnSubmission) return;

    setManagerNote("");
    setDecision(value);
  }

  async function confirmDecision() {
    if (!selected || !decision || processing) return;

    if (isOwnSubmission) {
      toast.error(
        "Approval not permitted",
        "You cannot approve or reject your own Day End.",
      );
      return;
    }

    if (decision === "REJECT" && !managerNote.trim()) {
      toast.warning(
        "Reason required",
        "Enter a reason before rejecting the reconciliation.",
      );
      return;
    }

    const sessionId = selected.posSessionId;

    setProcessing(true);

    try {
      if (decision === "APPROVE") {
        await approvePosDayEnd(sessionId, {
          managerNote: managerNote.trim() || null,
        });

        toast.success(
          "Day End approved",
          "The POS session has been closed successfully.",
        );
      } else {
        await rejectPosDayEnd(sessionId, {
          managerNote: managerNote.trim(),
        });

        toast.success(
          "Day End rejected",
          "The cashier can now recount and resubmit the drawer.",
        );
      }

      setDecision(null);
      setManagerNote("");

      await load(true);
    } catch (caught) {
      toast.error(
        "Unable to process Day End",
        caught instanceof Error
          ? caught.message
          : "The manager decision could not be completed.",
      );
    } finally {
      setProcessing(false);
    }
  }

  return (
    <AppLayout
      title="Day End Approvals"
      subtitle="Review submitted register reconciliations and authorize the final closing of POS sessions."
      activeItem="Day End Approvals"
      actions={
        <button
          type="button"
          onClick={() => void load(true)}
          disabled={refreshing || loading}
          className="inline-flex h-10 items-center gap-2 rounded-xl border border-bauraBorder bg-white px-4 text-[11px] font-semibold text-bauraInk transition hover:bg-bauraCanvas2 disabled:opacity-50"
        >
          <RefreshCw
            size={14}
            className={refreshing ? "animate-spin" : ""}
          />
          Refresh
        </button>
      }
    >
      <div className="space-y-5">
        {/* OVERVIEW */}

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label="Pending Approvals"
            value={String(pendingCount)}
            icon={ClipboardCheck}
            description="Awaiting manager review"
          />

          <MetricCard
            label="Expected Cash"
            value={`Rs. ${money(totalExpected)}`}
            icon={Banknote}
            description="Across pending registers"
          />

          <MetricCard
            label="Cash Variances"
            value={String(mismatchedCount)}
            icon={AlertCircle}
            description="Reconciliations with differences"
          />

          <MetricCard
            label="Net Variance"
            value={`Rs. ${money(Math.abs(totalVariance))}`}
            icon={totalVariance < 0 ? ArrowDownRight : ArrowUpRight}
            description={
              totalVariance < 0
                ? "Net cash shortage"
                : totalVariance > 0
                  ? "Net cash excess"
                  : "No net difference"
            }
          />
        </div>

        {error && (
          <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4">
            <AlertCircle
              size={17}
              className="mt-0.5 shrink-0 text-red-600"
            />

            <div className="flex-1">
              <p className="text-[12px] font-bold text-red-800">
                Unable to load approvals
              </p>

              <p className="mt-1 text-[11px] text-red-700">{error}</p>
            </div>

            <button
              type="button"
              onClick={() => void load(true)}
              className="text-[11px] font-bold text-red-800"
            >
              Retry
            </button>
          </div>
        )}

        {loading ? (
          <div className="flex min-h-[360px] items-center justify-center rounded-[20px] border border-bauraBorder bg-white">
            <div className="text-center">
              <Loader2
                size={25}
                className="mx-auto animate-spin text-bauraPrimary"
              />

              <p className="mt-3 text-[11px] text-bauraMuted">
                Loading pending approvals...
              </p>
            </div>
          </div>
        ) : (
          <div className="grid items-start gap-5 xl:grid-cols-[minmax(320px,0.85fr)_minmax(0,1.15fr)]">
            {/* PENDING QUEUE */}

            <section className="overflow-hidden rounded-[20px] border border-bauraBorder bg-white">
              <div className="border-b border-bauraBorder p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-[14px] font-extrabold text-bauraInk">
                      Pending Queue
                    </h2>

                    <p className="mt-1 text-[10px] text-bauraMuted">
                      Select a reconciliation to review.
                    </p>
                  </div>

                  <span className="rounded-full bg-bauraGoldSoft px-3 py-1.5 text-[10px] font-bold text-bauraPrimary">
                    {pendingCount} Pending
                  </span>
                </div>

                <div className="mt-4 flex h-10 items-center gap-2 rounded-xl border border-bauraBorder bg-bauraCanvas px-3">
                  <Search size={15} className="text-bauraMuted" />

                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search session or cashier..."
                    className="min-w-0 flex-1 bg-transparent text-[11px] outline-none placeholder:text-bauraMuted2"
                  />
                </div>
              </div>

              {filtered.length === 0 ? (
                <div className="px-6 py-16 text-center">
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50">
                    <CheckCircle2 size={25} className="text-emerald-600" />
                  </div>

                  <h3 className="mt-4 text-[14px] font-extrabold">
                    {search ? "No matching sessions" : "All caught up"}
                  </h3>

                  <p className="mx-auto mt-2 max-w-[260px] text-[11px] leading-5 text-bauraMuted">
                    {search
                      ? "Try a different search term."
                      : "There are currently no Day End submissions awaiting approval."}
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-bauraBorder">
                  {filtered.map((item) => {
                    const session = getSession(item);
                    const itemVariance = numeric(item.variance);
                    const active = selected?.id === item.id;

                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setSelectedId(item.id)}
                        className={`w-full px-5 py-4 text-left transition ${
                          active
                            ? "bg-bauraGoldSoft/40"
                            : "hover:bg-bauraCanvas2"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-[12px] font-extrabold text-bauraInk">
                              {session?.sessionNo ??
                                `Session ${item.posSessionId.slice(0, 8)}`}
                            </p>

                            <p className="mt-1 flex items-center gap-1.5 text-[10px] text-bauraMuted">
                              <CalendarDays size={12} />

                              {session
                                ? formatDate(session.businessDate)
                                : "Business date unavailable"}
                            </p>
                          </div>

                          <ChevronRight
                            size={16}
                            className={
                              active
                                ? "text-bauraPrimary"
                                : "text-bauraMuted"
                            }
                          />
                        </div>

                        <div className="mt-3 flex items-end justify-between gap-3">
                          <div>
                            <p className="text-[9px] text-bauraMuted">
                              Expected Cash
                            </p>

                            <p className="mt-1 text-[12px] font-extrabold text-bauraInk">
                              Rs. {money(item.expectedCash)}
                            </p>
                          </div>

                          <span
                            className={`rounded-lg px-2.5 py-1.5 text-[10px] font-bold ${
                              Math.abs(itemVariance) < 0.01
                                ? "bg-emerald-50 text-emerald-700"
                                : "bg-amber-50 text-amber-700"
                            }`}
                          >
                            {itemVariance > 0
                              ? "+"
                              : itemVariance < 0
                                ? "−"
                                : ""}
                            Rs. {money(Math.abs(itemVariance))}
                          </span>
                        </div>

                        <p className="mt-3 flex items-center gap-1.5 text-[9px] text-bauraMuted">
                          <Clock3 size={11} />
                          Submitted {formatDateTime(item.submittedAt)}
                        </p>
                      </button>
                    );
                  })}
                </div>
              )}
            </section>

            {/* RECONCILIATION REVIEW */}

            {selected ? (
              <section className="overflow-hidden rounded-[20px] border border-bauraBorder bg-white">
                <div className="flex flex-wrap items-start justify-between gap-4 border-b border-bauraBorder p-5">
                  <div>
                    <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-bauraGoldDark">
                      Reconciliation Review
                    </p>

                    <h2 className="mt-2 text-[18px] font-extrabold tracking-[-0.03em] text-bauraInk">
                      {selectedSession?.sessionNo ?? "POS Session"}
                    </h2>

                    <p className="mt-1 text-[10px] text-bauraMuted">
                      Review the cashier's submission before making a decision.
                    </p>
                  </div>

                  <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-2 text-[10px] font-bold text-amber-700">
                    Pending Approval
                  </span>
                </div>

                <div className="space-y-6 p-5">
                  <div className="grid gap-4 rounded-2xl bg-bauraCanvas2 p-4 sm:grid-cols-2">
                    <DetailLabel
                      label="Business Date"
                      value={
                        selectedSession
                          ? formatDate(selectedSession.businessDate)
                          : "Not provided by API"
                      }
                    />

                    <DetailLabel
                      label="Submitted"
                      value={formatDateTime(selected.submittedAt)}
                    />

                    <DetailLabel
                      label="Cashier ID"
                      value={
                        selected.submittedById ??
                        selectedSession?.openedById ??
                        "—"
                      }
                    />

                    <DetailLabel
                      label="Invoices"
                      value={String(selected.invoiceCount)}
                    />
                  </div>

                  <div>
                    <h3 className="flex items-center gap-2 text-[12px] font-extrabold text-bauraInk">
                      <Banknote size={15} className="text-bauraGoldDark" />
                      Cash Reconciliation
                    </h3>

                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <div className="rounded-2xl border border-bauraBorder bg-bauraCanvas2 p-4">
                        <p className="text-[10px] text-bauraMuted">
                          Expected Cash
                        </p>

                        <p className="mt-2 text-[20px] font-black text-bauraInk">
                          Rs. {money(selected.expectedCash)}
                        </p>
                      </div>

                      <div className="rounded-2xl border border-bauraBorder bg-bauraCanvas2 p-4">
                        <p className="text-[10px] text-bauraMuted">
                          Counted Cash
                        </p>

                        <p className="mt-2 text-[20px] font-black text-bauraPrimary">
                          Rs. {money(selected.countedCash)}
                        </p>
                      </div>
                    </div>

                    <div
                      className={`mt-3 rounded-2xl border p-4 ${
                        hasVariance
                          ? "border-amber-200 bg-amber-50"
                          : "border-emerald-200 bg-emerald-50"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-[0.08em]">
                            Cash Variance
                          </p>

                          <p
                            className={`mt-1 text-[22px] font-black ${
                              hasVariance
                                ? "text-amber-700"
                                : "text-emerald-700"
                            }`}
                          >
                            {variance > 0
                              ? "+"
                              : variance < 0
                                ? "−"
                                : ""}
                            Rs. {money(Math.abs(variance))}
                          </p>

                          <p className="mt-1 text-[10px]">
                            {!hasVariance
                              ? "Cash count matches the expected amount."
                              : variance < 0
                                ? "Cash shortage reported."
                                : "Cash excess reported."}
                          </p>
                        </div>

                        {hasVariance ? (
                          <AlertCircle
                            size={23}
                            className="shrink-0 text-amber-600"
                          />
                        ) : (
                          <CheckCircle2
                            size={23}
                            className="shrink-0 text-emerald-600"
                          />
                        )}
                      </div>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-[12px] font-extrabold text-bauraInk">
                      Sales & Payments
                    </h3>

                    <div className="mt-3 divide-y divide-bauraBorder rounded-2xl border border-bauraBorder px-4 py-2">
                      <SummaryRow
                        label="Gross Sales"
                        value={selected.grossSalesTotal}
                      />

                      <SummaryRow
                        label="Discounts"
                        value={selected.discountTotal}
                      />

                      <SummaryRow
                        label="Net Sales"
                        value={selected.netSalesTotal}
                        strong
                      />

                      <SummaryRow
                        label="Cash Sales"
                        value={selected.cashSalesTotal}
                      />

                      <SummaryRow
                        label="Card Sales"
                        value={selected.cardSalesTotal}
                      />

                      <SummaryRow
                        label="Bank Transfers"
                        value={selected.bankTransferTotal}
                      />

                      <SummaryRow
                        label="Other Payments"
                        value={selected.otherPaymentTotal}
                      />

                      <SummaryRow
                        label="Cash In"
                        value={selected.cashInTotal}
                      />

                      <SummaryRow
                        label="Cash Out"
                        value={selected.cashOutTotal}
                      />

                      <SummaryRow
                        label="Refunds"
                        value={selected.refundTotal}
                      />

                      <SummaryRow
                        label="Voids"
                        value={selected.voidTotal}
                      />
                    </div>
                  </div>

                  {/* DENOMINATION BREAKDOWN */}

                  <div>
                    <h3 className="flex items-center gap-2 text-[12px] font-extrabold text-bauraInk">
                      <Coins size={15} className="text-bauraGoldDark" />
                      Closing Denomination Count
                    </h3>

                    {getClosingCounts(selected).length > 0 ? (
                      <div className="mt-3 overflow-hidden rounded-2xl border border-bauraBorder">
                        <div className="grid grid-cols-3 bg-bauraCanvas2 px-4 py-3 text-[9px] font-bold uppercase tracking-[0.06em] text-bauraMuted">
                          <span>Denomination</span>
                          <span className="text-center">Quantity</span>
                          <span className="text-right">Total</span>
                        </div>

                        {getClosingCounts(selected)
                          .sort(
                            (a, b) =>
                              numeric(b.denominationValue) -
                              numeric(a.denominationValue),
                          )
                          .map((count) => (
                            <div
                              key={count.id}
                              className="grid grid-cols-3 border-t border-bauraBorder px-4 py-3 text-[11px]"
                            >
                              <span className="font-semibold">
                                Rs. {money(count.denominationValue)}
                              </span>

                              <span className="text-center">
                                {count.quantity}
                              </span>

                              <span className="text-right font-bold">
                                Rs. {money(count.amount)}
                              </span>
                            </div>
                          ))}
                      </div>
                    ) : (
                      <div className="mt-3 rounded-xl border border-dashed border-bauraBorder bg-bauraCanvas2 p-4">
                        <p className="text-[10px] leading-5 text-bauraMuted">
                          The pending-approvals response does not include
                          denomination records. The counted total is available,
                          but the individual notes and coins cannot be
                          verified from this response.
                        </p>
                      </div>
                    )}
                  </div>

                  {/* CASHIER NOTES */}

                  <div>
                    <h3 className="text-[12px] font-extrabold text-bauraInk">
                      Cashier Explanation
                    </h3>

                    <div className="mt-3 space-y-3">
                      <div className="rounded-xl bg-bauraCanvas2 p-4">
                        <p className="text-[9px] font-bold uppercase tracking-[0.08em] text-bauraMuted">
                          Variance Reason
                        </p>

                        <p className="mt-2 whitespace-pre-wrap text-[11px] leading-5 text-bauraInk">
                          {selected.varianceReason || "No variance reason."}
                        </p>
                      </div>

                      <div className="rounded-xl bg-bauraCanvas2 p-4">
                        <p className="text-[9px] font-bold uppercase tracking-[0.08em] text-bauraMuted">
                          Cashier Note
                        </p>

                        <p className="mt-2 whitespace-pre-wrap text-[11px] leading-5 text-bauraInk">
                          {selected.cashierNote || "No additional note."}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* MANAGER ACTIONS */}

                  <div className="border-t border-bauraBorder pt-5">
                    <div className="flex items-start gap-3 rounded-xl bg-bauraCanvas2 p-4">
                      <ShieldCheck
                        size={17}
                        className="mt-0.5 shrink-0 text-bauraGoldDark"
                      />

                      <p className="text-[10px] leading-5 text-bauraMuted">
                        Approval permanently closes this POS session.
                        Rejection returns it to cash reconciliation.
                        All existing transactions and business dates remain
                        unchanged.
                      </p>
                    </div>

                    {isOwnSubmission && (
                      <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
                        <p className="text-[10px] font-semibold text-amber-800">
                          You submitted this Day End. Another authorized
                          manager must review it.
                        </p>
                      </div>
                    )}

                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <button
                        type="button"
                        disabled={processing || isOwnSubmission}
                        onClick={() => openDecision("REJECT")}
                        className="flex h-11 items-center justify-center gap-2 rounded-xl border border-red-200 bg-white text-[11px] font-bold text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <XCircle size={16} />
                        Reject Day End
                      </button>

                      <button
                        type="button"
                        disabled={processing || isOwnSubmission}
                        onClick={() => openDecision("APPROVE")}
                        className="flex h-11 items-center justify-center gap-2 rounded-xl bg-bauraPrimary text-[11px] font-bold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <CheckCircle2 size={16} />
                        Approve Day End
                      </button>
                    </div>
                  </div>
                </div>
              </section>
            ) : (
              <div className="flex min-h-[360px] items-center justify-center rounded-[20px] border border-bauraBorder bg-white p-6 text-center">
                <div>
                  <ClipboardCheck
                    size={30}
                    className="mx-auto text-bauraGoldDark"
                  />

                  <h3 className="mt-4 text-[14px] font-extrabold">
                    No reconciliation selected
                  </h3>

                  <p className="mt-2 text-[11px] text-bauraMuted">
                    Select a pending Day End from the queue.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* CONFIRMATION MODAL */}

      {decision && selected && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4 backdrop-blur-[3px]"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !processing) {
              setDecision(null);
            }
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="decision-title"
            className="w-full max-w-[440px] overflow-hidden rounded-[22px] bg-white shadow-[0_25px_80px_rgba(0,0,0,0.18)]"
          >
            <div className="flex items-start justify-between p-6 pb-4">
              <div
                className={`flex h-12 w-12 items-center justify-center rounded-2xl ${
                  decision === "APPROVE"
                    ? "bg-emerald-50 text-emerald-700"
                    : "bg-red-50 text-red-700"
                }`}
              >
                {decision === "APPROVE" ? (
                  <CheckCircle2 size={22} />
                ) : (
                  <XCircle size={22} />
                )}
              </div>

              <button
                type="button"
                disabled={processing}
                onClick={() => setDecision(null)}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-bauraMuted hover:bg-bauraCanvas2"
                aria-label="Close"
              >
                <X size={17} />
              </button>
            </div>

            <div className="px-6">
              <h2
                id="decision-title"
                className="text-[19px] font-extrabold tracking-[-0.03em]"
              >
                {decision === "APPROVE"
                  ? "Approve Day End?"
                  : "Reject Day End?"}
              </h2>

              <p className="mt-2 text-[11px] leading-6 text-bauraMuted">
                {decision === "APPROVE"
                  ? "Confirm that you have reviewed the cash reconciliation. This action will close the POS session."
                  : "The cashier will be required to correct the reconciliation and submit it again."}
              </p>

              <div className="mt-4 rounded-xl bg-bauraCanvas2 p-4">
                <p className="text-[10px] text-bauraMuted">Session</p>

                <p className="mt-1 text-[12px] font-extrabold">
                  {selectedSession?.sessionNo ?? selected.posSessionId}
                </p>

                <p className="mt-2 text-[10px] text-bauraMuted">
                  Counted Cash: Rs. {money(selected.countedCash)}
                </p>
              </div>

              <label
                htmlFor="manager-note"
                className="mt-5 block text-[10px] font-bold text-bauraInk"
              >
                Manager Note {decision === "REJECT" ? "*" : "(optional)"}
              </label>

              <textarea
                id="manager-note"
                rows={4}
                maxLength={1000}
                value={managerNote}
                onChange={(event) => setManagerNote(event.target.value)}
                placeholder={
                  decision === "APPROVE"
                    ? "Optional approval note..."
                    : "Explain why this Day End is being rejected..."
                }
                className="mt-2 w-full resize-none rounded-xl border border-bauraBorder bg-white p-3 text-[11px] outline-none transition focus:border-bauraPrimary/40"
              />
            </div>

            <div className="mt-5 flex gap-3 border-t border-bauraBorder p-5">
              <button
                type="button"
                disabled={processing}
                onClick={() => setDecision(null)}
                className="h-11 flex-1 rounded-xl border border-bauraBorder text-[11px] font-bold text-bauraInk transition hover:bg-bauraCanvas2"
              >
                Cancel
              </button>

              <button
                type="button"
                disabled={
                  processing ||
                  (decision === "REJECT" && !managerNote.trim())
                }
                onClick={() => void confirmDecision()}
                className={`flex h-11 flex-1 items-center justify-center gap-2 rounded-xl text-[11px] font-bold text-white transition disabled:cursor-not-allowed disabled:opacity-50 ${
                  decision === "APPROVE"
                    ? "bg-bauraPrimary"
                    : "bg-red-600"
                }`}
              >
                {processing ? (
                  <>
                    <Loader2 size={15} className="animate-spin" />
                    Processing
                  </>
                ) : (
                  <>
                    {decision === "APPROVE" ? (
                      <Check size={15} />
                    ) : (
                      <X size={15} />
                    )}

                    {decision === "APPROVE"
                      ? "Confirm Approval"
                      : "Confirm Rejection"}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}

function MetricCard({
  label,
  value,
  description,
  icon: Icon,
}: {
  label: string;
  value: string;
  description: string;
  icon: typeof Banknote;
}) {
  return (
    <div className="rounded-[18px] border border-bauraBorder bg-white p-5">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-semibold text-bauraMuted">{label}</p>

        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-bauraGoldSoft">
          <Icon size={16} className="text-bauraGoldDark" />
        </div>
      </div>

      <p className="mt-3 text-[20px] font-extrabold tracking-[-0.035em] text-bauraInk">
        {value}
      </p>

      <p className="mt-1 text-[9px] text-bauraMuted">{description}</p>
    </div>
  );
}
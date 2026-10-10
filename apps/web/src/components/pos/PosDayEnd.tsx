/** @format */

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  AlertTriangle,
  ArrowLeft,
  Banknote,
  CheckCircle2,
  Clock3,
  Loader2,
  Minus,
  Plus,
  ReceiptText,
  Send,
  ShieldCheck,
} from "lucide-react";

import {
  getPosDayEnd,
  startPosDayEnd,
  submitPosDayEnd,
  type DayEndTotals,
  type PosDenominationInput,
  type PosSession,
} from "../../lib/posSessionApi";

import {
  useToast,
} from "../../ui/ToastProvider";

type Props = {
  session: PosSession;

  alreadyClosing?: boolean;

  onBack?: () => void;

  onSubmitted: () => void;
};

type Denomination = {
  value: number;
  label: string;
  imageUrl?: string | null;
  quantity: number;
};

/*
 * Cloudinary note / coin images can be placed
 * in imageUrl here when you have the final URLs.
 *
 * The actual cash values submitted to the backend
 * remain numeric and authoritative.
 */
const DEFAULT_DENOMINATIONS: Denomination[] = [
  {
    value: 5000,
    label: "Rs. 5,000",
    quantity: 0,
  },
  {
    value: 2000,
    label: "Rs. 2,000",
    quantity: 0,
  },
  {
    value: 1000,
    label: "Rs. 1,000",
    quantity: 0,
  },
  {
    value: 500,
    label: "Rs. 500",
    quantity: 0,
  },
  {
    value: 100,
    label: "Rs. 100",
    quantity: 0,
  },
  {
    value: 50,
    label: "Rs. 50",
    quantity: 0,
  },
  {
    value: 20,
    label: "Rs. 20",
    quantity: 0,
  },
  {
    value: 10,
    label: "Rs. 10",
    quantity: 0,
  },
  {
    value: 5,
    label: "Rs. 5",
    quantity: 0,
  },
  {
    value: 2,
    label: "Rs. 2",
    quantity: 0,
  },
  {
    value: 1,
    label: "Rs. 1",
    quantity: 0,
  },
];

function numberValue(
  value: unknown,
) {
  const parsed =
    Number(value);

  return Number.isFinite(
    parsed,
  )
    ? parsed
    : 0;
}

function money(
  value: number,
) {
  return new Intl.NumberFormat(
    "en-LK",
    {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    },
  ).format(
    numberValue(value),
  );
}

export function PosDayEnd({
  session,
  alreadyClosing = false,
  onBack,
  onSubmitted,
}: Props) {
  const toast =
    useToast();

  const [
    totals,
    setTotals,
  ] =
    useState<DayEndTotals | null>(
      null,
    );

  const [
    denominations,
    setDenominations,
  ] =
    useState<Denomination[]>(
      DEFAULT_DENOMINATIONS,
    );

  const [
    cashierNote,
    setCashierNote,
  ] = useState("");

  const [
    varianceReason,
    setVarianceReason,
  ] = useState("");

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    submitting,
    setSubmitting,
  ] = useState(false);

  const countedCash =
    useMemo(
      () =>
        denominations.reduce(
          (
            total,
            row,
          ) =>
            total +
            row.value *
              row.quantity,
          0,
        ),
      [
        denominations,
      ],
    );

  const expectedCash =
    totals?.expectedCash ??
    0;

  const variance =
    countedCash -
    expectedCash;

  function updateQuantity(
    value: number,
    quantity: number,
  ) {
    const safe =
      Math.max(
        0,
        Math.floor(
          Number.isFinite(
            quantity,
          )
            ? quantity
            : 0,
        ),
      );

    setDenominations(
      (current) =>
        current.map(
          (row) =>
            row.value ===
            value
              ? {
                  ...row,
                  quantity:
                    safe,
                }
              : row,
        ),
    );
  }

  async function load() {
    setLoading(
      true,
    );

    try {
      if (
        alreadyClosing ||
        session.status ===
          "CLOSING"
      ) {
        const response =
          await getPosDayEnd(
            session.id,
          );

        setTotals(
          response.totals,
        );
      } else {
        const response =
          await startPosDayEnd(
            session.id,
            {
              cashierNote:
                cashierNote.trim() ||
                null,
            },
          );

        setTotals(
          response.totals,
        );

        toast.info(
          "Day End started",
          "Billing is now locked while the drawer is reconciled.",
        );
      }
    } catch (error) {
      toast.error(
        "Unable to start Day End",
        error instanceof Error
          ? error.message
          : "Could not load Day End totals.",
      );
    } finally {
      setLoading(
        false,
      );
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.id]);

  async function submit() {
    if (
      !totals
    ) {
      return;
    }

    if (
      Math.abs(
        variance,
      ) >= 0.01 &&
      !varianceReason.trim()
    ) {
      toast.warning(
        "Variance reason required",
        "Explain why the counted drawer does not match the expected cash.",
      );

      return;
    }

    const payload:
      PosDenominationInput[] =
      denominations.map(
        (row) => ({
          denominationValue:
            row.value,

          quantity:
            row.quantity,
        }),
      );

    setSubmitting(
      true,
    );

    try {
      await submitPosDayEnd(
        session.id,
        {
          denominations:
            payload,

          cashierNote:
            cashierNote.trim() ||
            null,

          varianceReason:
            varianceReason.trim() ||
            null,
        },
      );

      toast.success(
        "Day End submitted",
        "The register is now waiting for manager approval.",
      );

      onSubmitted();
    } catch (error) {
      toast.error(
        "Day End failed",
        error instanceof Error
          ? error.message
          : "Unable to submit Day End.",
      );
    } finally {
      setSubmitting(
        false,
      );
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f4f4f1]">
        <div className="text-center">
          <Loader2
            size={24}
            className="mx-auto animate-spin text-bauraPrimary"
          />

          <p className="mt-3 text-[9px] font-bold text-bauraMuted">
            Preparing Day End...
          </p>
        </div>
      </div>
    );
  }

  if (!totals) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f4f4f1] p-6">
        <div className="max-w-sm text-center">
          <AlertTriangle
            size={28}
            className="mx-auto text-amber-500"
          />

          <h1 className="mt-4 text-[18px] font-extrabold">
            Day End unavailable
          </h1>

          <button
            type="button"
            onClick={() =>
              void load()
            }
            className="mt-5 h-10 rounded-xl bg-bauraPrimary px-5 text-[9px] font-bold text-white">
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f4f4f1] text-bauraInk">
      <header className="flex h-[64px] items-center border-b border-black/[0.07] bg-white px-5">
        <div className="flex items-center gap-3">
          {onBack &&
            session.status ===
              "OPEN" && (
              <button
                type="button"
                onClick={
                  onBack
                }
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-black/[0.08]">
                <ArrowLeft
                  size={14}
                />
              </button>
            )}

          <div>
            <p className="text-[13px] font-extrabold">
              Day End
            </p>

            <p className="mt-0.5 text-[8px] text-bauraMuted">
              {
                session.sessionNo
              }
            </p>
          </div>
        </div>

        <div className="ml-auto flex items-center gap-2 rounded-xl bg-amber-50 px-3 py-2 text-amber-700">
          <Clock3
            size={13}
          />

          <span className="text-[8px] font-bold">
            Sales locked
          </span>
        </div>
      </header>

      <main className="mx-auto grid max-w-[1500px] gap-5 p-5 xl:grid-cols-[minmax(0,1fr)_390px]">
        <section>
          <div className="rounded-[20px] border border-black/[0.07] bg-white p-5">
            <div className="flex items-center">
              <div>
                <p className="text-[8px] font-bold uppercase tracking-[0.1em] text-bauraGoldDark">
                  Drawer reconciliation
                </p>

                <h1 className="mt-1 text-[22px] font-extrabold tracking-[-0.04em]">
                  Count physical cash
                </h1>

                <p className="mt-1 text-[9px] text-bauraMuted">
                  Count every note and coin currently inside the register.
                </p>
              </div>

              <div className="ml-auto hidden rounded-2xl bg-[#f5f5f2] px-5 py-3 text-right sm:block">
                <p className="text-[7px] font-bold uppercase tracking-[0.08em] text-bauraMuted">
                  Expected Cash
                </p>

                <p className="mt-1 text-[17px] font-black">
                  Rs.{" "}
                  {money(
                    expectedCash,
                  )}
                </p>
              </div>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
              {denominations.map(
                (row) => (
                  <div
                    key={
                      row.value
                    }
                    className="overflow-hidden rounded-2xl border border-black/[0.07] bg-[#fafaf8]">
                    {row.imageUrl && (
                      <div className="aspect-[2/1] overflow-hidden bg-white">
                        <img
                          src={
                            row.imageUrl
                          }
                          alt={
                            row.label
                          }
                          className="h-full w-full object-contain"
                        />
                      </div>
                    )}

                    <div className="p-3">
                      <div className="flex items-center justify-between">
                        <p className="text-[10px] font-extrabold">
                          {
                            row.label
                          }
                        </p>

                        <Banknote
                          size={13}
                          className="text-bauraMuted"
                        />
                      </div>

                      <div className="mt-3 flex items-center rounded-xl border border-black/[0.07] bg-white p-1">
                        <button
                          type="button"
                          onClick={() =>
                            updateQuantity(
                              row.value,
                              row.quantity -
                                1,
                            )
                          }
                          className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-[#f4f4f1]">
                          <Minus
                            size={12}
                          />
                        </button>

                        <input
                          inputMode="numeric"
                          value={
                            row.quantity
                          }
                          onChange={(
                            event,
                          ) =>
                            updateQuantity(
                              row.value,
                              Number(
                                event.target
                                  .value,
                              ),
                            )
                          }
                          className="h-8 min-w-0 flex-1 bg-transparent text-center text-[10px] font-black outline-none"
                        />

                        <button
                          type="button"
                          onClick={() =>
                            updateQuantity(
                              row.value,
                              row.quantity +
                                1,
                            )
                          }
                          className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-[#f4f4f1]">
                          <Plus
                            size={12}
                          />
                        </button>
                      </div>

                      <p className="mt-2 text-right text-[8px] font-bold text-bauraMuted">
                        Rs.{" "}
                        {money(
                          row.value *
                            row.quantity,
                        )}
                      </p>
                    </div>
                  </div>
                ),
              )}
            </div>
          </div>
        </section>

        <aside className="space-y-4">
          <div className="rounded-[20px] border border-black/[0.07] bg-white p-5">
            <div className="flex items-center gap-2">
              <ReceiptText
                size={15}
              />

              <h2 className="text-[13px] font-extrabold">
                Session Summary
              </h2>
            </div>

            <div className="mt-5 space-y-2.5">
              <Summary
                label="Gross sales"
                value={
                  totals.grossSalesTotal
                }
              />

              <Summary
                label="Discounts"
                value={
                  totals.discountTotal
                }
              />

              <Summary
                label="Net sales"
                value={
                  totals.netSalesTotal
                }
                strong
              />

              <div className="my-3 border-t border-dashed border-black/10" />

              <Summary
                label="Cash sales"
                value={
                  totals.cashSalesTotal
                }
              />

              <Summary
                label="Card sales"
                value={
                  totals.cardSalesTotal
                }
              />

              <Summary
                label="Bank transfer"
                value={
                  totals.bankTransferTotal
                }
              />

              <Summary
                label="Other payments"
                value={
                  totals.otherPaymentTotal
                }
              />

              <div className="my-3 border-t border-dashed border-black/10" />

              <Summary
                label="Cash in"
                value={
                  totals.cashInTotal
                }
              />

              <Summary
                label="Cash out"
                value={
                  totals.cashOutTotal
                }
              />

              <Summary
                label="Refunds"
                value={
                  totals.refundTotal
                }
              />

              <div className="my-3 border-t border-dashed border-black/10" />

              <div className="flex items-center justify-between">
                <span className="text-[9px] text-bauraMuted">
                  Invoices
                </span>

                <span className="text-[10px] font-black">
                  {
                    totals.invoiceCount
                  }
                </span>
              </div>
            </div>
          </div>

          <div className="rounded-[20px] border border-black/[0.07] bg-white p-5">
            <p className="text-[8px] font-bold uppercase tracking-[0.08em] text-bauraMuted">
              Reconciliation
            </p>

            <div className="mt-4 space-y-3">
              <CashValue
                label="Expected"
                value={
                  expectedCash
                }
              />

              <CashValue
                label="Counted"
                value={
                  countedCash
                }
              />

              <div
                className={`rounded-xl p-3 ${
                  Math.abs(
                    variance,
                  ) <
                  0.01
                    ? "bg-emerald-50"
                    : "bg-amber-50"
                }`}>
                <p className="text-[7px] font-bold uppercase tracking-[0.08em] text-bauraMuted">
                  Variance
                </p>

                <p
                  className={`mt-1 text-[17px] font-black ${
                    Math.abs(
                      variance,
                    ) <
                    0.01
                      ? "text-emerald-700"
                      : "text-amber-700"
                  }`}>
                  {variance >
                  0
                    ? "+"
                    : ""}
                  Rs.{" "}
                  {money(
                    variance,
                  )}
                </p>
              </div>
            </div>

            {Math.abs(
              variance,
            ) >= 0.01 && (
              <div className="mt-4">
                <label className="text-[8px] font-bold text-bauraMuted">
                  VARIANCE REASON
                </label>

                <textarea
                  value={
                    varianceReason
                  }
                  onChange={(
                    event,
                  ) =>
                    setVarianceReason(
                      event.target
                        .value,
                    )
                  }
                  rows={3}
                  placeholder="Explain the cash difference..."
                  className="mt-1.5 w-full resize-none rounded-xl border border-amber-200 bg-amber-50/30 p-3 text-[9px] outline-none focus:border-amber-400"
                />
              </div>
            )}

            <div className="mt-4">
              <label className="text-[8px] font-bold text-bauraMuted">
                CASHIER NOTE
              </label>

              <textarea
                value={
                  cashierNote
                }
                onChange={(
                  event,
                ) =>
                  setCashierNote(
                    event.target
                      .value,
                  )
                }
                rows={3}
                placeholder="Optional closing note..."
                className="mt-1.5 w-full resize-none rounded-xl border border-black/[0.08] p-3 text-[9px] outline-none focus:border-bauraPrimary/40"
              />
            </div>

            <button
              type="button"
              disabled={
                submitting
              }
              onClick={() =>
                void submit()
              }
              className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-bauraPrimary text-[9px] font-extrabold text-white shadow-[0_10px_25px_rgba(91,55,38,0.16)] disabled:opacity-50">
              {submitting ? (
                <>
                  <Loader2
                    size={14}
                    className="animate-spin"
                  />

                  Submitting...
                </>
              ) : (
                <>
                  <Send
                    size={13}
                  />

                  Submit Day End
                </>
              )}
            </button>

            <div className="mt-3 flex items-start gap-2 rounded-xl bg-[#f6f6f3] p-3">
              <ShieldCheck
                size={13}
                className="mt-0.5 shrink-0 text-bauraGoldDark"
              />

              <p className="text-[7px] leading-4 text-bauraMuted">
                After submission the register remains locked until a manager approves the reconciliation.
              </p>
            </div>
          </div>
        </aside>
      </main>
    </div>
  );
}

function Summary({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: number;
  strong?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <span
        className={`text-[9px] ${
          strong
            ? "font-bold text-bauraInk"
            : "text-bauraMuted"
        }`}>
        {label}
      </span>

      <span
        className={`text-[9px] ${
          strong
            ? "font-black"
            : "font-bold"
        }`}>
        Rs.{" "}
        {money(
          value,
        )}
      </span>
    </div>
  );
}

function CashValue({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[9px] text-bauraMuted">
        {label}
      </span>

      <span className="text-[11px] font-black">
        Rs.{" "}
        {money(
          value,
        )}
      </span>
    </div>
  );
}
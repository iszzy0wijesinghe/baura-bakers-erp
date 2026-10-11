/** @format */

import { useEffect, useMemo, useState } from "react";

import {
  AlertTriangle,
  ArrowLeft,
  Banknote,
  CheckCircle2,
  Clock3,
  Coins,
  Loader2,
  Minus,
  Plus,
  ReceiptText,
  RefreshCw,
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

import { useToast } from "../../ui/ToastProvider";

type Props = {
  session: PosSession;
  alreadyClosing?: boolean;
  onBack?: () => void;
  onSubmitted: () => void;
};

type Denomination = {
  value: number;
  label: string;
  type: "NOTE" | "COIN";
  imageUrl: string | null;
  quantity: number;
};

const IMAGE_BASE = "/images/currency/lkr";

const DEFAULT_DENOMINATIONS: Denomination[] = [
  { value: 5000, label: "Rs. 5,000", type: "NOTE", imageUrl: `${IMAGE_BASE}/5000-F.webp`, quantity: 0 },
  { value: 2000, label: "Rs. 2,000", type: "NOTE", imageUrl: `${IMAGE_BASE}/2000.webp`, quantity: 0 },
  { value: 1000, label: "Rs. 1,000", type: "NOTE", imageUrl: `${IMAGE_BASE}/1000-F.webp`, quantity: 0 },
  { value: 500, label: "Rs. 500", type: "NOTE", imageUrl: `${IMAGE_BASE}/500-F.webp`, quantity: 0 },
  { value: 100, label: "Rs. 100", type: "NOTE", imageUrl: `${IMAGE_BASE}/100-F.webp`, quantity: 0 },
  { value: 50, label: "Rs. 50", type: "NOTE", imageUrl: `${IMAGE_BASE}/50-F.webp`, quantity: 0 },
  { value: 20, label: "Rs. 20", type: "NOTE", imageUrl: `${IMAGE_BASE}/20-F.webp`, quantity: 0 },
  { value: 10, label: "Rs. 10", type: "COIN", imageUrl: null, quantity: 0 },
  { value: 5, label: "Rs. 5", type: "COIN", imageUrl: null, quantity: 0 },
  { value: 2, label: "Rs. 2", type: "COIN", imageUrl: null, quantity: 0 },
  { value: 1, label: "Rs. 1", type: "COIN", imageUrl: null, quantity: 0 },
];

const moneyFormatter = new Intl.NumberFormat("en-LK", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function numberValue(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function money(value: unknown): string {
  return moneyFormatter.format(numberValue(value));
}

function formatDate(value: string | Date): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return date.toLocaleDateString("en-LK", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function getSriLankaToday(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Colombo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );

  return `${values.year}-${values.month}-${values.day}`;
}

function getBusinessDateKey(value: string | Date): string {
  return value instanceof Date
    ? value.toISOString().slice(0, 10)
    : value.slice(0, 10);
}

function DenominationVisual({
  denomination,
}: {
  denomination: Denomination;
}) {
  const [imageFailed, setImageFailed] = useState(false);

  if (denomination.type === "COIN") {
    return (
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px] border border-[#e8dfd2] bg-[#f7f2ea]">
        <Coins size={21} strokeWidth={1.6} className="text-bauraGoldDark" />
      </div>
    );
  }

  if (!denomination.imageUrl || imageFailed) {
    return (
      <div className="flex h-[82px] w-[146px] shrink-0 items-center justify-center rounded-xl border border-[#eae5df] bg-[#f6f4f0]">
        <Banknote size={27} strokeWidth={1.4} className="text-bauraGoldDark" />
      </div>
    );
  }

  return (
    <div className="flex h-[82px] w-[146px] shrink-0 items-center justify-center overflow-hidden rounded-xl border border-[#eae5df] bg-white p-1.5">
      <img
        src={denomination.imageUrl}
        alt={`${denomination.label} Sri Lankan banknote`}
        loading="lazy"
        draggable={false}
        onError={() => setImageFailed(true)}
        className="h-full w-full object-contain"
      />
    </div>
  );
}

function QuantityControl({
  denomination,
  onChange,
}: {
  denomination: Denomination;
  onChange: (quantity: number) => void;
}) {
  return (
    <div className="flex h-9 items-center overflow-hidden rounded-[10px] border border-black/[0.08] bg-white">
      <button
        type="button"
        onClick={() => onChange(denomination.quantity - 1)}
        disabled={denomination.quantity === 0}
        aria-label={`Decrease ${denomination.label} quantity`}
        className="flex h-full w-9 shrink-0 items-center justify-center text-bauraInk transition hover:bg-[#f4f1ed] disabled:cursor-not-allowed disabled:opacity-30"
      >
        <Minus size={13} />
      </button>

      <input
        type="number"
        min={0}
        max={100000}
        step={1}
        inputMode="numeric"
        value={denomination.quantity}
        onChange={(event) => onChange(Number(event.target.value))}
        aria-label={`${denomination.label} quantity`}
        className="h-full min-w-0 flex-1 bg-transparent text-center text-[12px] font-extrabold text-bauraInk outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />

      <button
        type="button"
        onClick={() => onChange(denomination.quantity + 1)}
        disabled={denomination.quantity >= 100000}
        aria-label={`Increase ${denomination.label} quantity`}
        className="flex h-full w-9 shrink-0 items-center justify-center text-bauraInk transition hover:bg-[#f4f1ed] disabled:cursor-not-allowed disabled:opacity-30"
      >
        <Plus size={13} />
      </button>
    </div>
  );
}

function NoteCard({
  denomination,
  onChange,
}: {
  denomination: Denomination;
  onChange: (quantity: number) => void;
}) {
  const hasQuantity = denomination.quantity > 0;

  return (
    <div
      className={`rounded-[17px] border bg-white p-3.5 transition-all duration-200 ${
        hasQuantity
          ? "border-bauraPrimary/30 shadow-[0_4px_18px_rgba(74,43,30,0.06)]"
          : "border-black/[0.075] hover:border-black/[0.14] hover:shadow-[0_4px_18px_rgba(0,0,0,0.035)]"
      }`}
    >
      <div className="flex items-center gap-3">
        <DenominationVisual denomination={denomination} />

        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[13px] font-extrabold tracking-[-0.02em] text-bauraInk">
              {denomination.label}
            </p>

            {hasQuantity && (
              <CheckCircle2 size={15} className="shrink-0 text-emerald-600" />
            )}
          </div>

          <p className="mt-1 text-[9px] font-medium text-bauraMuted">
            Banknote
          </p>

          <div className="mt-3">
            <QuantityControl denomination={denomination} onChange={onChange} />
          </div>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between border-t border-black/[0.055] pt-3">
        <span className="text-[9px] font-medium text-bauraMuted">
          {denomination.quantity} × Rs. {money(denomination.value)}
        </span>

        <span
          className={`text-[12px] font-extrabold ${
            hasQuantity ? "text-bauraPrimary" : "text-bauraInk"
          }`}
        >
          Rs. {money(denomination.value * denomination.quantity)}
        </span>
      </div>
    </div>
  );
}

function CoinCard({
  denomination,
  onChange,
}: {
  denomination: Denomination;
  onChange: (quantity: number) => void;
}) {
  const hasQuantity = denomination.quantity > 0;

  return (
    <div
      className={`rounded-[15px] border bg-white p-3.5 transition-all ${
        hasQuantity
          ? "border-bauraPrimary/30"
          : "border-black/[0.075] hover:border-black/[0.14]"
      }`}
    >
      <div className="flex items-center gap-3">
        <DenominationVisual denomination={denomination} />

        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-extrabold text-bauraInk">
            {denomination.label}
          </p>
          <p className="mt-0.5 text-[9px] text-bauraMuted">Coin</p>
        </div>
      </div>

      <div className="mt-3">
        <QuantityControl denomination={denomination} onChange={onChange} />
      </div>

      <div className="mt-3 flex items-center justify-between border-t border-black/[0.055] pt-3">
        <span className="text-[9px] text-bauraMuted">Subtotal</span>
        <span className="text-[11px] font-extrabold text-bauraInk">
          Rs. {money(denomination.value * denomination.quantity)}
        </span>
      </div>
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
    <div className="flex items-center justify-between gap-3">
      <span
        className={`text-[10px] ${
          strong ? "font-bold text-bauraInk" : "text-bauraMuted"
        }`}
      >
        {label}
      </span>

      <span
        className={`text-[10px] ${
          strong ? "font-black text-bauraInk" : "font-bold text-bauraInk"
        }`}
      >
        Rs. {money(value)}
      </span>
    </div>
  );
}

function CashValue({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: number;
  strong?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[10px] text-bauraMuted">{label}</span>
      <span
        className={`font-black ${
          strong ? "text-[16px] text-bauraPrimary" : "text-[12px] text-bauraInk"
        }`}
      >
        Rs. {money(value)}
      </span>
    </div>
  );
}

export function PosDayEnd({
  session,
  alreadyClosing = false,
  onBack,
  onSubmitted,
}: Props) {
  const toast = useToast();

  const [totals, setTotals] = useState<DayEndTotals | null>(null);
  const [denominations, setDenominations] = useState<Denomination[]>(
    DEFAULT_DENOMINATIONS.map((item) => ({ ...item })),
  );
  const [cashierNote, setCashierNote] = useState("");
  const [varianceReason, setVarianceReason] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const countedCash = useMemo(
    () =>
      denominations.reduce(
        (total, row) => total + row.value * row.quantity,
        0,
      ),
    [denominations],
  );

  const expectedCash = numberValue(totals?.expectedCash ?? 0);
  const variance = countedCash - expectedCash;
  const hasVariance = Math.abs(variance) >= 0.01;

  const businessDateKey = getBusinessDateKey(session.businessDate);
  const todayKey = getSriLankaToday();
  const isOverdue = businessDateKey < todayKey;
  const isFutureDated = businessDateKey > todayKey;

  const noteCount = denominations
    .filter((row) => row.type === "NOTE")
    .reduce((total, row) => total + row.quantity, 0);

  const coinCount = denominations
    .filter((row) => row.type === "COIN")
    .reduce((total, row) => total + row.quantity, 0);

  function updateQuantity(value: number, quantity: number) {
    const safe = Math.min(
      100000,
      Math.max(0, Math.floor(Number.isFinite(quantity) ? quantity : 0)),
    );

    setDenominations((current) =>
      current.map((row) =>
        row.value === value ? { ...row, quantity: safe } : row,
      ),
    );
  }

  async function load() {
    setLoading(true);

    try {
      if (alreadyClosing || session.status === "CLOSING") {
        const response = await getPosDayEnd(session.id);
        setTotals(response.totals);
      } else {
        const response = await startPosDayEnd(session.id, {
          cashierNote: cashierNote.trim() || null,
        });

        setTotals(response.totals);

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
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.id]);

  async function submit() {
    if (!totals || submitting || isFutureDated) return;

    if (hasVariance && !varianceReason.trim()) {
      toast.warning(
        "Variance reason required",
        "Explain why the counted drawer does not match the expected cash.",
      );
      return;
    }

    const payload: PosDenominationInput[] = denominations.map((row) => ({
      denominationValue: row.value,
      quantity: row.quantity,
    }));

    setSubmitting(true);

    try {
      await submitPosDayEnd(session.id, {
        denominations: payload,
        cashierNote: cashierNote.trim() || null,
        varianceReason: varianceReason.trim() || null,
      });

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
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f4f4f1]">
        <div className="text-center">
          <Loader2
            size={25}
            className="mx-auto animate-spin text-bauraPrimary"
          />
          <p className="mt-3 text-[10px] font-semibold text-bauraMuted">
            Preparing Day End...
          </p>
        </div>
      </div>
    );
  }

  if (!totals) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f4f4f1] p-6">
        <div className="w-full max-w-sm rounded-[22px] border border-black/[0.07] bg-white p-8 text-center shadow-sm">
          <AlertTriangle size={30} className="mx-auto text-amber-500" />

          <h1 className="mt-4 text-[18px] font-extrabold text-bauraInk">
            Day End unavailable
          </h1>

          <p className="mt-2 text-[11px] leading-5 text-bauraMuted">
            We couldn't load the cash reconciliation for this session.
          </p>

          <button
            type="button"
            onClick={() => void load()}
            className="mt-5 inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-bauraPrimary px-5 text-[10px] font-bold text-white"
          >
            <RefreshCw size={14} />
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f4f4f1] text-bauraInk">
      <header className="sticky top-0 z-20 flex min-h-[70px] items-center justify-between gap-4 border-b border-black/[0.07] bg-white px-5">
        <div className="flex items-center gap-3">
          {onBack && session.status === "OPEN" && (
            <button
              type="button"
              onClick={onBack}
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-black/[0.08] transition hover:bg-[#f4f4f1]"
              aria-label="Back"
            >
              <ArrowLeft size={15} />
            </button>
          )}

          <div>
            <p className="text-[14px] font-extrabold">Day End</p>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-[9px] text-bauraMuted">
              <span>{session.sessionNo}</span>
              <span>•</span>
              <span>{formatDate(session.businessDate)}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 rounded-xl bg-amber-50 px-3 py-2 text-amber-700">
          <Clock3 size={14} />
          <span className="text-[9px] font-bold">Sales locked</span>
        </div>
      </header>

      <main className="mx-auto grid max-w-[1500px] gap-5 p-4 sm:p-5 xl:grid-cols-[minmax(0,1fr)_390px]">
        <section className="min-w-0 space-y-4">
          {isOverdue && (
            <div className="flex items-start gap-3 rounded-[16px] border border-amber-200 bg-amber-50 p-4">
              <AlertTriangle
                size={17}
                className="mt-0.5 shrink-0 text-amber-700"
              />
              <div>
                <p className="text-[11px] font-extrabold text-amber-900">
                  Previous business date requires closing
                </p>
                <p className="mt-1 text-[10px] leading-5 text-amber-800">
                  This session belongs to{" "}
                  <strong>{formatDate(session.businessDate)}</strong>.
                  Complete its reconciliation and submit it for manager
                  approval. Existing sales remain on their original date.
                </p>
              </div>
            </div>
          )}

          {isFutureDated && (
            <div className="flex items-start gap-3 rounded-[16px] border border-red-200 bg-red-50 p-4">
              <AlertTriangle
                size={17}
                className="mt-0.5 shrink-0 text-red-700"
              />
              <p className="text-[10px] leading-5 text-red-800">
                This session has a future business date. Contact an
                administrator before completing reconciliation.
              </p>
            </div>
          )}

          <div className="overflow-hidden rounded-[20px] border border-black/[0.07] bg-white">
            <div className="flex flex-wrap items-center justify-between gap-4 p-5">
              <div>
                <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-bauraGoldDark">
                  Drawer Reconciliation
                </p>
                <h1 className="mt-1.5 text-[22px] font-extrabold tracking-[-0.04em]">
                  Count physical cash
                </h1>
                <p className="mt-1 text-[10px] leading-5 text-bauraMuted">
                  Enter the quantity of each banknote and coin in the drawer.
                </p>
              </div>

              <div className="rounded-2xl border border-black/[0.05] bg-[#f7f6f3] px-5 py-3 text-right">
                <p className="text-[8px] font-bold uppercase tracking-[0.08em] text-bauraMuted">
                  Expected Cash
                </p>
                <p className="mt-1 text-[18px] font-black">
                  Rs. {money(expectedCash)}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3 border-y border-black/[0.06] bg-[#fafaf8] px-5 py-3.5">
              <div>
                <p className="text-[9px] text-bauraMuted">Notes</p>
                <p className="mt-1 text-[14px] font-extrabold">{noteCount}</p>
              </div>
              <div>
                <p className="text-[9px] text-bauraMuted">Coins</p>
                <p className="mt-1 text-[14px] font-extrabold">{coinCount}</p>
              </div>
              <div>
                <p className="text-[9px] text-bauraMuted">Counted Cash</p>
                <p className="mt-1 text-[14px] font-extrabold text-bauraPrimary">
                  Rs. {money(countedCash)}
                </p>
              </div>
            </div>

            <div className="p-5">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Banknote size={16} className="text-bauraGoldDark" />
                  <h2 className="text-[12px] font-extrabold">
                    Sri Lankan Banknotes
                  </h2>
                </div>
                <span className="text-[9px] text-bauraMuted">
                  7 denominations
                </span>
              </div>

              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                {denominations
                  .filter((row) => row.type === "NOTE")
                  .map((row) => (
                    <NoteCard
                      key={row.value}
                      denomination={row}
                      onChange={(quantity) =>
                        updateQuantity(row.value, quantity)
                      }
                    />
                  ))}
              </div>

              <div className="mb-3 mt-7 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Coins size={16} className="text-bauraGoldDark" />
                  <h2 className="text-[12px] font-extrabold">
                    Sri Lankan Coins
                  </h2>
                </div>
                <span className="text-[9px] text-bauraMuted">
                  4 denominations
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                {denominations
                  .filter((row) => row.type === "COIN")
                  .map((row) => (
                    <CoinCard
                      key={row.value}
                      denomination={row}
                      onChange={(quantity) =>
                        updateQuantity(row.value, quantity)
                      }
                    />
                  ))}
              </div>
            </div>
          </div>
        </section>

        <aside className="min-w-0 space-y-4">
          <div className="rounded-[20px] border border-black/[0.07] bg-white p-5">
            <div className="flex items-center gap-2">
              <ReceiptText size={16} className="text-bauraGoldDark" />
              <h2 className="text-[13px] font-extrabold">Session Summary</h2>
            </div>

            <div className="mt-5 space-y-2.5">
              <Summary label="Gross sales" value={totals.grossSalesTotal} />
              <Summary label="Discounts" value={totals.discountTotal} />
              <Summary label="Net sales" value={totals.netSalesTotal} strong />

              <div className="my-3 border-t border-dashed border-black/10" />

              <Summary label="Cash sales" value={totals.cashSalesTotal} />
              <Summary label="Card sales" value={totals.cardSalesTotal} />
              <Summary label="Bank transfer" value={totals.bankTransferTotal} />
              <Summary label="Other payments" value={totals.otherPaymentTotal} />

              <div className="my-3 border-t border-dashed border-black/10" />

              <Summary label="Cash in" value={totals.cashInTotal} />
              <Summary label="Cash out" value={totals.cashOutTotal} />
              <Summary label="Refunds" value={totals.refundTotal} />

              <div className="my-3 border-t border-dashed border-black/10" />

              <div className="flex items-center justify-between">
                <span className="text-[10px] text-bauraMuted">Invoices</span>
                <span className="text-[11px] font-black">
                  {totals.invoiceCount}
                </span>
              </div>
            </div>
          </div>

          <div className="rounded-[20px] border border-black/[0.07] bg-white p-5">
            <p className="text-[9px] font-bold uppercase tracking-[0.08em] text-bauraMuted">
              Cash Reconciliation
            </p>

            <div className="mt-4 space-y-3">
              <CashValue label="Expected Cash" value={expectedCash} />
              <CashValue label="Counted Cash" value={countedCash} strong />

              <div
                className={`rounded-xl border p-3.5 ${
                  hasVariance
                    ? "border-amber-100 bg-amber-50"
                    : "border-emerald-100 bg-emerald-50"
                }`}
              >
                <div className="flex items-center justify-between">
                  <p className="text-[8px] font-bold uppercase tracking-[0.08em] text-bauraMuted">
                    Cash Variance
                  </p>
                  {!hasVariance && (
                    <CheckCircle2 size={15} className="text-emerald-700" />
                  )}
                </div>

                <p
                  className={`mt-1 text-[20px] font-black ${
                    hasVariance ? "text-amber-700" : "text-emerald-700"
                  }`}
                >
                  {variance > 0 ? "+" : variance < 0 ? "−" : ""}
                  Rs. {money(Math.abs(variance))}
                </p>

                <p className="mt-1 text-[9px] text-bauraMuted">
                  {!hasVariance
                    ? "Drawer matches expected cash."
                    : variance < 0
                      ? "Cash shortage detected."
                      : "Cash excess detected."}
                </p>
              </div>
            </div>

            {hasVariance && (
              <div className="mt-4">
                <label className="text-[9px] font-bold text-bauraMuted">
                  VARIANCE REASON *
                </label>
                <textarea
                  value={varianceReason}
                  onChange={(event) => setVarianceReason(event.target.value)}
                  rows={3}
                  placeholder="Explain the cash difference..."
                  className="mt-1.5 w-full resize-none rounded-xl border border-amber-200 bg-amber-50/30 p-3 text-[10px] outline-none transition focus:border-amber-400"
                />
              </div>
            )}

            <div className="mt-4">
              <label className="text-[9px] font-bold text-bauraMuted">
                CASHIER NOTE
              </label>
              <textarea
                value={cashierNote}
                onChange={(event) => setCashierNote(event.target.value)}
                rows={3}
                placeholder="Optional closing note..."
                className="mt-1.5 w-full resize-none rounded-xl border border-black/[0.08] p-3 text-[10px] outline-none transition focus:border-bauraPrimary/40"
              />
            </div>

            <button
              type="button"
              disabled={submitting || isFutureDated}
              onClick={() => void submit()}
              className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-bauraPrimary text-[10px] font-extrabold text-white shadow-[0_10px_25px_rgba(91,55,38,0.16)] transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? (
                <>
                  <Loader2 size={15} className="animate-spin" />
                  Submitting...
                </>
              ) : (
                <>
                  <Send size={14} />
                  Submit Day End
                </>
              )}
            </button>

            <div className="mt-3 flex items-start gap-2 rounded-xl bg-[#f6f6f3] p-3">
              <ShieldCheck
                size={14}
                className="mt-0.5 shrink-0 text-bauraGoldDark"
              />
              <p className="text-[9px] leading-5 text-bauraMuted">
                After submission, the register remains locked until a
                different authorized manager approves the reconciliation.
                Sales and cash records retain their original business date.
              </p>
            </div>
          </div>
        </aside>
      </main>
    </div>
  );
}
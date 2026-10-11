/** @format */

import { useMemo, useState } from "react";

import {
  AlertCircle,
  Banknote,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Coins,
  Minus,
  Plus,
  RefreshCw,
  ShieldCheck,
  Store,
  Wallet,
} from "lucide-react";

import {
  openPosSession,
  type PosBusinessDay,
  type PosDenominationInput,
  type PosSession,
} from "../../lib/posSessionApi";

import { useToast } from "../../ui/ToastProvider";

type Props = {
  business: PosBusinessDay;
  onOpened: (session: PosSession) => void;
};

type DenominationType = "NOTE" | "COIN";

type DenominationRow = {
  value: number;
  label: string;
  type: DenominationType;
  imageUrl: string | null;
  quantity: number;
};

const IMAGE_BASE = "/images/currency/lkr";

const MAX_QUANTITY = 100000;
const MAX_OPENING_FLOAT = 10000000;

const DEFAULT_DENOMINATIONS: DenominationRow[] = [
  {
    value: 5000,
    label: "Rs. 5,000",
    type: "NOTE",
    imageUrl: `${IMAGE_BASE}/5000-F.webp`,
    quantity: 0,
  },
  {
    value: 2000,
    label: "Rs. 2,000",
    type: "NOTE",
    imageUrl: `${IMAGE_BASE}/2000.webp`,
    quantity: 0,
  },
  {
    value: 1000,
    label: "Rs. 1,000",
    type: "NOTE",
    imageUrl: `${IMAGE_BASE}/1000-F.webp`,
    quantity: 0,
  },
  {
    value: 500,
    label: "Rs. 500",
    type: "NOTE",
    imageUrl: `${IMAGE_BASE}/500-F.webp`,
    quantity: 0,
  },
  {
    value: 100,
    label: "Rs. 100",
    type: "NOTE",
    imageUrl: `${IMAGE_BASE}/100-F.webp`,
    quantity: 0,
  },
  {
    value: 50,
    label: "Rs. 50",
    type: "NOTE",
    imageUrl: `${IMAGE_BASE}/50-F.webp`,
    quantity: 0,
  },
  {
    value: 20,
    label: "Rs. 20",
    type: "NOTE",
    imageUrl: `${IMAGE_BASE}/20-F.webp`,
    quantity: 0,
  },
  {
    value: 10,
    label: "Rs. 10",
    type: "COIN",
    imageUrl: null,
    quantity: 0,
  },
  {
    value: 5,
    label: "Rs. 5",
    type: "COIN",
    imageUrl: null,
    quantity: 0,
  },
  {
    value: 2,
    label: "Rs. 2",
    type: "COIN",
    imageUrl: null,
    quantity: 0,
  },
  {
    value: 1,
    label: "Rs. 1",
    type: "COIN",
    imageUrl: null,
    quantity: 0,
  },
];

function formatCurrency(value: number) {
  return `Rs. ${value.toLocaleString("en-LK", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatBusinessDate(value: string) {
  const date = new Date(`${value.slice(0, 10)}T00:00:00.000Z`);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-LK", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function normalizeQuantity(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(
    0,
    Math.min(MAX_QUANTITY, Math.floor(value)),
  );
}

function CurrencyVisual({
  denomination,
}: {
  denomination: DenominationRow;
}) {
  const [imageFailed, setImageFailed] = useState(false);

  if (denomination.type === "COIN") {
    return (
      <div className="flex h-[64px] w-[92px] shrink-0 items-center justify-center rounded-xl border border-[#e9e0d3] bg-[#f8f4ed] sm:h-[72px] sm:w-[112px]">
        <div className="flex h-[46px] w-[46px] items-center justify-center rounded-full border-[3px] border-[#cbb58e] bg-gradient-to-br from-[#fff9e9] via-[#ead8b5] to-[#d4bb8e] shadow-[0_3px_8px_rgba(85,60,30,0.10)]">
          <Coins
            size={22}
            strokeWidth={1.5}
            className="text-[#896c44]"
          />
        </div>
      </div>
    );
  }

  if (!denomination.imageUrl || imageFailed) {
    return (
      <div className="flex h-[64px] w-[92px] shrink-0 flex-col items-center justify-center gap-1 rounded-xl border border-[#eee8e0] bg-[#f8f6f2] sm:h-[72px] sm:w-[112px]">
        <Banknote
          size={22}
          strokeWidth={1.5}
          className="text-bauraGoldDark"
        />

        <span className="text-[9px] font-bold text-bauraInk">
          {denomination.label}
        </span>
      </div>
    );
  }

  return (
    <div className="flex h-[64px] w-[92px] shrink-0 items-center justify-center overflow-hidden rounded-xl border border-[#eeeae5] bg-white p-1.5 sm:h-[72px] sm:w-[112px]">
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
  value,
  quantity,
  onChange,
  disabled,
}: {
  value: number;
  quantity: number;
  onChange: (value: number, quantity: number) => void;
  disabled: boolean;
}) {
  return (
    <div className="flex h-[38px] w-[132px] items-center rounded-[11px] border border-black/[0.08] bg-[#faf9f7] p-1 sm:w-[142px]">
      <button
        type="button"
        disabled={disabled || quantity === 0}
        onClick={() => onChange(value, quantity - 1)}
        aria-label={`Decrease Rs. ${value} quantity`}
        className="flex h-[29px] w-[29px] shrink-0 items-center justify-center rounded-[8px] text-bauraMuted transition hover:bg-white hover:text-bauraInk disabled:cursor-not-allowed disabled:opacity-30">
        <Minus size={13} />
      </button>

      <input
        type="number"
        min={0}
        max={MAX_QUANTITY}
        step={1}
        inputMode="numeric"
        disabled={disabled}
        value={quantity}
        onChange={(event) =>
          onChange(value, Number(event.target.value))
        }
        aria-label={`Rs. ${value} quantity`}
        className="h-full min-w-0 flex-1 bg-transparent text-center text-[12px] font-extrabold text-bauraInk outline-none disabled:opacity-50 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />

      <button
        type="button"
        disabled={disabled || quantity >= MAX_QUANTITY}
        onClick={() => onChange(value, quantity + 1)}
        aria-label={`Increase Rs. ${value} quantity`}
        className="flex h-[29px] w-[29px] shrink-0 items-center justify-center rounded-[8px] text-bauraMuted transition hover:bg-white hover:text-bauraInk disabled:cursor-not-allowed disabled:opacity-30">
        <Plus size={13} />
      </button>
    </div>
  );
}

function DenominationItem({
  denomination,
  onChange,
  disabled,
}: {
  denomination: DenominationRow;
  onChange: (value: number, quantity: number) => void;
  disabled: boolean;
}) {
  const subtotal = denomination.value * denomination.quantity;
  const isCounted = denomination.quantity > 0;

  return (
    <div
      className={`group flex flex-col gap-3 px-4 py-3.5 transition-colors sm:flex-row sm:items-center sm:gap-4 sm:px-5 ${
        isCounted
          ? "bg-[#fdfbf8]"
          : "bg-white hover:bg-[#fdfcfb]"
      }`}>
      <div className="flex min-w-0 flex-1 items-center gap-3.5">
        <CurrencyVisual denomination={denomination} />

        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-[12px] font-extrabold tracking-[-0.02em] text-bauraInk">
              {denomination.label}
            </p>

            {isCounted && (
              <CheckCircle2
                size={13}
                className="shrink-0 text-emerald-600"
              />
            )}
          </div>

          <p className="mt-1 text-[9px] text-bauraMuted">
            {denomination.type === "NOTE"
              ? "Banknote"
              : "Coin"}
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 pl-0 sm:justify-end sm:pl-2">
        <QuantityControl
          value={denomination.value}
          quantity={denomination.quantity}
          onChange={onChange}
          disabled={disabled}
        />

        <div className="min-w-[112px] text-right sm:min-w-[130px]">
          <p
            className={`text-[11px] font-extrabold tabular-nums ${
              isCounted
                ? "text-bauraPrimary"
                : "text-bauraInk"
            }`}>
            {formatCurrency(subtotal)}
          </p>

          <p className="mt-1 text-[8px] text-bauraMuted">
            Subtotal
          </p>
        </div>
      </div>
    </div>
  );
}

function DenominationSection({
  title,
  description,
  type,
  denominations,
  onChange,
  disabled,
}: {
  title: string;
  description: string;
  type: DenominationType;
  denominations: DenominationRow[];
  onChange: (value: number, quantity: number) => void;
  disabled: boolean;
}) {
  const rows = denominations.filter(
    (denomination) => denomination.type === type,
  );

  const sectionTotal = rows.reduce(
    (sum, denomination) =>
      sum + denomination.value * denomination.quantity,
    0,
  );

  const sectionCount = rows.reduce(
    (sum, denomination) => sum + denomination.quantity,
    0,
  );

  return (
    <section className="overflow-hidden rounded-[20px] border border-black/[0.07] bg-white shadow-[0_8px_28px_rgba(47,33,23,0.025)]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-black/[0.06] px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-bauraGoldSoft text-bauraGoldDark">
            {type === "NOTE" ? (
              <Banknote size={17} strokeWidth={1.7} />
            ) : (
              <Coins size={17} strokeWidth={1.7} />
            )}
          </div>

          <div>
            <h2 className="text-[12px] font-extrabold text-bauraInk">
              {title}
            </h2>

            <p className="mt-0.5 text-[9px] text-bauraMuted">
              {description}
            </p>
          </div>
        </div>

        <div className="text-right">
          <p className="text-[12px] font-extrabold tabular-nums text-bauraPrimary">
            {formatCurrency(sectionTotal)}
          </p>

          <p className="mt-0.5 text-[9px] text-bauraMuted">
            {sectionCount} counted
          </p>
        </div>
      </div>

      <div className="divide-y divide-black/[0.055]">
        {rows.map((denomination) => (
          <DenominationItem
            key={denomination.value}
            denomination={denomination}
            onChange={onChange}
            disabled={disabled}
          />
        ))}
      </div>
    </section>
  );
}

function SummaryLine({
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
          strong
            ? "font-bold text-bauraInk"
            : "text-bauraMuted"
        }`}>
        {label}
      </span>

      <span
        className={`text-[11px] tabular-nums ${
          strong
            ? "font-extrabold text-bauraInk"
            : "font-bold text-bauraInk"
        }`}>
        {formatCurrency(value)}
      </span>
    </div>
  );
}

export function PosRegisterOpening({
  business,
  onOpened,
}: Props) {
  const toast = useToast();

  const [denominations, setDenominations] = useState<
    DenominationRow[]
  >(() => DEFAULT_DENOMINATIONS.map((row) => ({ ...row })));

  const [openingNote, setOpeningNote] = useState("");
  const [isOpening, setIsOpening] = useState(false);

  const totals = useMemo(() => {
    let notesTotal = 0;
    let coinsTotal = 0;
    let notesCount = 0;
    let coinsCount = 0;

    for (const denomination of denominations) {
      const amount =
        denomination.value * denomination.quantity;

      if (denomination.type === "NOTE") {
        notesTotal += amount;
        notesCount += denomination.quantity;
      } else {
        coinsTotal += amount;
        coinsCount += denomination.quantity;
      }
    }

    return {
      notesTotal,
      coinsTotal,
      notesCount,
      coinsCount,
      total: notesTotal + coinsTotal,
    };
  }, [denominations]);

  const exceedsLimit = totals.total > MAX_OPENING_FLOAT;

  const canOpen =
    business.isOpenDay &&
    business.isWithinOpeningHours &&
    !exceedsLimit &&
    !isOpening;

  function updateQuantity(
    denominationValue: number,
    quantity: number,
  ) {
    if (isOpening) {
      return;
    }

    const safeQuantity = normalizeQuantity(quantity);

    setDenominations((current) =>
      current.map((denomination) =>
        denomination.value === denominationValue
          ? {
              ...denomination,
              quantity: safeQuantity,
            }
          : denomination,
      ),
    );
  }

  async function handleOpenRegister() {
    if (isOpening) {
      return;
    }

    if (!business.isOpenDay) {
      toast.warning(
        "Business day closed",
        business.reason ||
          "The shop is closed for this business date.",
      );
      return;
    }

    if (!business.isWithinOpeningHours) {
      toast.warning(
        "Outside business hours",
        "The POS register cannot be opened outside configured business hours.",
      );
      return;
    }

    if (exceedsLimit) {
      toast.warning(
        "Opening float limit exceeded",
        `The opening float cannot exceed ${formatCurrency(
          MAX_OPENING_FLOAT,
        )}.`,
      );
      return;
    }

    const payload: PosDenominationInput[] = denominations.map(
      (denomination) => ({
        denominationValue: denomination.value,
        quantity: denomination.quantity,
      }),
    );

    setIsOpening(true);

    try {
      const response = await openPosSession({
        openingNote: openingNote.trim() || null,
        denominations: payload,
      });

      toast.success(
        "Register opened",
        `${response.session.sessionNo} is ready for sales.`,
      );

      onOpened(response.session);
    } catch (error) {
      toast.error(
        "Unable to open register",
        error instanceof Error
          ? error.message
          : "The POS register could not be opened.",
      );
    } finally {
      setIsOpening(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#f7f7f5] text-bauraInk">
      <header className="border-b border-black/[0.07] bg-white">
        <div className="mx-auto flex h-[72px] max-w-[1500px] items-center justify-between gap-4 px-4 sm:px-6 lg:px-10">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-bauraPrimary text-[15px] font-extrabold text-white">
              B
            </div>

            <div>
              <div className="flex items-center gap-2">
                <span className="text-[14px] font-extrabold tracking-[-0.035em]">
                  Baura
                </span>

                <span className="rounded-md bg-bauraGoldSoft px-2 py-0.5 text-[8px] font-bold uppercase tracking-[0.12em] text-bauraGoldDark">
                  POS
                </span>
              </div>

              <p className="mt-0.5 text-[9px] text-bauraMuted">
                Point of Sale
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 rounded-xl border border-black/[0.07] bg-[#faf9f7] px-3 py-2">
            <Store size={14} className="text-bauraMuted" />

            <span className="text-[9px] font-bold text-bauraInk">
              Register closed
            </span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1500px] px-4 py-7 sm:px-6 lg:px-10 lg:py-10">
        <div className="mb-7">
          <div className="mb-3 flex items-center gap-2 text-[9px] font-bold uppercase tracking-[0.13em] text-bauraGoldDark">
            <Wallet size={14} strokeWidth={1.8} />
            Cash Register
          </div>

          <h1 className="text-[28px] font-extrabold tracking-[-0.055em] text-bauraInk sm:text-[34px]">
            Open your register
          </h1>

          <p className="mt-2 max-w-[680px] text-[11px] leading-6 text-bauraMuted">
            Count the physical cash currently inside the drawer.
            The amount you record becomes the opening float for
            this POS session.
          </p>
        </div>

        <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_390px]">
          <div className="min-w-0 space-y-5">
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-[16px] border border-black/[0.06] bg-white p-4">
                <p className="text-[9px] font-semibold text-bauraMuted">
                  Banknotes
                </p>

                <p className="mt-2 text-[17px] font-extrabold tabular-nums">
                  {totals.notesCount}
                </p>

                <p className="mt-1 text-[9px] text-bauraMuted">
                  Notes counted
                </p>
              </div>

              <div className="rounded-[16px] border border-black/[0.06] bg-white p-4">
                <p className="text-[9px] font-semibold text-bauraMuted">
                  Coins
                </p>

                <p className="mt-2 text-[17px] font-extrabold tabular-nums">
                  {totals.coinsCount}
                </p>

                <p className="mt-1 text-[9px] text-bauraMuted">
                  Coins counted
                </p>
              </div>

              <div className="rounded-[16px] border border-black/[0.06] bg-white p-4">
                <p className="text-[9px] font-semibold text-bauraMuted">
                  Opening float
                </p>

                <p className="mt-2 text-[15px] font-extrabold tracking-[-0.03em] text-bauraPrimary sm:text-[17px]">
                  {formatCurrency(totals.total)}
                </p>

                <p className="mt-1 text-[9px] text-bauraMuted">
                  Total counted
                </p>
              </div>
            </div>

            <DenominationSection
              title="Sri Lankan Banknotes"
              description="Enter the number of notes in the drawer."
              type="NOTE"
              denominations={denominations}
              onChange={updateQuantity}
              disabled={isOpening}
            />

            <DenominationSection
              title="Sri Lankan Coins"
              description="Enter the number of coins in the drawer."
              type="COIN"
              denominations={denominations}
              onChange={updateQuantity}
              disabled={isOpening}
            />
          </div>

          <aside className="min-w-0">
            <div className="rounded-[20px] border border-black/[0.07] bg-white p-5 shadow-[0_18px_55px_rgba(49,34,24,0.045)] xl:sticky xl:top-6">
              <div className="flex items-start gap-3 border-b border-black/[0.07] pb-5">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-bauraGoldSoft text-bauraGoldDark">
                  <CalendarDays size={18} strokeWidth={1.7} />
                </div>

                <div className="min-w-0">
                  <p className="text-[9px] font-bold uppercase tracking-[0.1em] text-bauraMuted">
                    Business Date
                  </p>

                  <p className="mt-1.5 text-[12px] font-extrabold leading-5 text-bauraInk">
                    {formatBusinessDate(business.businessDate)}
                  </p>

                  <div className="mt-2 flex items-center gap-1.5">
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${
                        business.isOpenDay
                          ? "bg-emerald-500"
                          : "bg-red-500"
                      }`}
                    />

                    <span className="text-[9px] font-semibold text-bauraMuted">
                      {business.isOpenDay
                        ? "Scheduled business day"
                        : "Business day closed"}
                    </span>
                  </div>
                </div>
              </div>

              <div className="py-6">
                <p className="text-[9px] font-bold uppercase tracking-[0.11em] text-bauraMuted">
                  Opening Float
                </p>

                <p className="mt-2 text-[30px] font-extrabold tracking-[-0.055em] tabular-nums text-bauraPrimary">
                  {formatCurrency(totals.total)}
                </p>

                <p className="mt-2 text-[10px] leading-5 text-bauraMuted">
                  Automatically calculated from your physical
                  denomination count.
                </p>
              </div>

              <div className="space-y-3 border-y border-black/[0.07] py-5">
                <SummaryLine
                  label="Banknotes"
                  value={totals.notesTotal}
                />

                <SummaryLine
                  label="Coins"
                  value={totals.coinsTotal}
                />

                <div className="border-t border-dashed border-black/[0.09] pt-3">
                  <SummaryLine
                    label="Total opening cash"
                    value={totals.total}
                    strong
                  />
                </div>
              </div>

              <label className="mt-5 block">
                <span className="mb-2 block text-[9px] font-bold uppercase tracking-[0.1em] text-bauraMuted">
                  Opening Note
                  <span className="ml-1 font-medium normal-case tracking-normal">
                    (Optional)
                  </span>
                </span>

                <textarea
                  value={openingNote}
                  onChange={(event) =>
                    setOpeningNote(event.target.value)
                  }
                  maxLength={500}
                  rows={3}
                  disabled={isOpening}
                  placeholder="Add a note about the opening drawer..."
                  className="w-full resize-none rounded-xl border border-black/[0.09] bg-[#faf9f7] px-3.5 py-3 text-[11px] leading-5 text-bauraInk outline-none transition placeholder:text-bauraMuted/70 focus:border-bauraGold focus:bg-white disabled:opacity-60"
                />

                <p className="mt-1 text-right text-[9px] text-bauraMuted">
                  {openingNote.length}/500
                </p>
              </label>

              {!business.isOpenDay && (
                <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-red-100 bg-red-50 p-3">
                  <AlertCircle
                    size={15}
                    className="mt-0.5 shrink-0 text-red-600"
                  />

                  <div>
                    <p className="text-[10px] font-extrabold text-red-700">
                      Business day closed
                    </p>

                    <p className="mt-1 text-[9px] leading-5 text-red-600">
                      {business.reason ||
                        "The POS cannot be opened on this business date."}
                    </p>
                  </div>
                </div>
              )}

              {business.isOpenDay &&
                !business.isWithinOpeningHours && (
                  <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-amber-100 bg-amber-50 p-3">
                    <AlertCircle
                      size={15}
                      className="mt-0.5 shrink-0 text-amber-700"
                    />

                    <div>
                      <p className="text-[10px] font-extrabold text-amber-800">
                        Outside business hours
                      </p>

                      <p className="mt-1 text-[9px] leading-5 text-amber-700">
                        The register cannot be opened outside
                        configured business hours.
                      </p>
                    </div>
                  </div>
                )}

              {exceedsLimit && (
                <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-red-100 bg-red-50 p-3">
                  <AlertCircle
                    size={15}
                    className="mt-0.5 shrink-0 text-red-600"
                  />

                  <div>
                    <p className="text-[10px] font-extrabold text-red-700">
                      Opening float limit exceeded
                    </p>

                    <p className="mt-1 text-[9px] leading-5 text-red-600">
                      Maximum permitted opening cash is{" "}
                      {formatCurrency(MAX_OPENING_FLOAT)}.
                    </p>
                  </div>
                </div>
              )}

              <button
                type="button"
                disabled={!canOpen}
                onClick={() => void handleOpenRegister()}
                className="mt-5 flex h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-bauraPrimary px-4 text-[11px] font-extrabold text-white shadow-bauraButton transition hover:bg-bauraPrimaryDark disabled:cursor-not-allowed disabled:opacity-40">
                {isOpening ? (
                  <>
                    <RefreshCw
                      size={15}
                      className="animate-spin"
                    />

                    Opening register...
                  </>
                ) : (
                  <>
                    <ShieldCheck size={16} strokeWidth={1.8} />

                    Open Register

                    <ChevronRight size={15} />
                  </>
                )}
              </button>

              <div className="mt-4 flex items-start gap-2.5 rounded-xl bg-[#f8f6f2] p-3.5">
                <ShieldCheck
                  size={15}
                  className="mt-0.5 shrink-0 text-bauraGoldDark"
                />

                <p className="text-[9px] leading-5 text-bauraMuted">
                  Opening the register creates an auditable POS
                  session. Your opening cash count is recorded
                  against the current business date.
                </p>
              </div>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}
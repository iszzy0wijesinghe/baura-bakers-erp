/** @format */

import { useMemo, useState } from "react";

import {
  Banknote,
  CalendarDays,
  ChevronRight,
  Minus,
  Plus,
  RefreshCw,
  ShieldCheck,
  Store,
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

type DenominationRow = {
  value: number;
  label: string;
  quantity: number;
};

const DEFAULT_DENOMINATIONS: DenominationRow[] = [
  { value: 5000, label: "Rs. 5,000", quantity: 0 },
  { value: 2000, label: "Rs. 2,000", quantity: 0 },
  { value: 1000, label: "Rs. 1,000", quantity: 0 },
  { value: 500, label: "Rs. 500", quantity: 0 },
  { value: 100, label: "Rs. 100", quantity: 0 },
  { value: 50, label: "Rs. 50", quantity: 0 },
  { value: 20, label: "Rs. 20", quantity: 0 },
  { value: 10, label: "Rs. 10", quantity: 0 },
  { value: 5, label: "Rs. 5", quantity: 0 },
  { value: 2, label: "Rs. 2", quantity: 0 },
  { value: 1, label: "Rs. 1", quantity: 0 },
];

function formatCurrency(value: number) {
  return `Rs. ${value.toLocaleString("en-LK", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatBusinessDate(value: string) {
  const date = new Date(`${value}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-LK", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(date);
}

export function PosRegisterOpening({
  business,
  onOpened,
}: Props) {
  const toast = useToast();

  const [denominations, setDenominations] =
    useState<DenominationRow[]>(DEFAULT_DENOMINATIONS);

  const [openingNote, setOpeningNote] = useState("");

  const [isOpening, setIsOpening] = useState(false);

  const total = useMemo(
    () =>
      denominations.reduce(
        (sum, denomination) =>
          sum + denomination.value * denomination.quantity,
        0,
      ),
    [denominations],
  );

  function updateQuantity(
    denominationValue: number,
    quantity: number,
  ) {
    const safeQuantity = Math.max(
      0,
      Math.min(100000, Math.floor(quantity || 0)),
    );

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

  function increment(denominationValue: number) {
    setDenominations((current) =>
      current.map((denomination) =>
        denomination.value === denominationValue
          ? {
              ...denomination,
              quantity: denomination.quantity + 1,
            }
          : denomination,
      ),
    );
  }

  function decrement(denominationValue: number) {
    setDenominations((current) =>
      current.map((denomination) =>
        denomination.value === denominationValue
          ? {
              ...denomination,
              quantity: Math.max(
                0,
                denomination.quantity - 1,
              ),
            }
          : denomination,
      ),
    );
  }

  async function handleOpenRegister() {
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

    /*
     * Backend currently requires at least
     * one denomination row. We submit every
     * supported denomination, including zero
     * quantities, so opening evidence remains
     * explicit and consistent.
     */
    const payload: PosDenominationInput[] =
      denominations.map((denomination) => ({
        denominationValue: denomination.value,
        quantity: denomination.quantity,
      }));

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

  const canOpen =
    business.isOpenDay &&
    business.isWithinOpeningHours &&
    !isOpening;

  return (
    <div className="min-h-screen bg-[#f6f7f8] text-bauraInk">
      <header className="border-b border-black/[0.07] bg-white">
        <div className="mx-auto flex h-[72px] max-w-[1500px] items-center px-6 lg:px-10">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-bauraPrimary font-bold text-white">
              B
            </div>

            <div>
              <div className="flex items-center gap-2">
                <span className="text-[14px] font-bold tracking-[-0.03em]">
                  Baura
                </span>

                <span className="rounded-md bg-bauraGoldSoft px-2 py-0.5 text-[8px] font-bold uppercase tracking-[0.12em] text-bauraGoldDark">
                  POS
                </span>
              </div>

              <p className="text-[9px] text-bauraMuted">
                Point of Sale
              </p>
            </div>
          </div>

          <div className="ml-auto flex items-center gap-2 rounded-xl border border-black/[0.07] bg-[#fafafa] px-3 py-2">
            <Store size={14} className="text-bauraMuted" />

            <span className="text-[9px] font-semibold">
              Register closed
            </span>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-[1500px] gap-8 px-6 py-8 lg:grid-cols-[minmax(0,1fr)_430px] lg:px-10 lg:py-12">
        <section>
          <div className="max-w-2xl">
            <div className="mb-3 flex items-center gap-2 text-[9px] font-bold uppercase tracking-[0.12em] text-bauraGoldDark">
              <Banknote size={14} />

              Cash register
            </div>

            <h1 className="text-[28px] font-bold tracking-[-0.045em] sm:text-[34px]">
              Open your register
            </h1>

            <p className="mt-2 max-w-xl text-[11px] leading-5 text-bauraMuted">
              Count the physical cash currently in the drawer.
              This becomes the opening float for today&apos;s POS
              session.
            </p>
          </div>

          <div className="mt-7 overflow-hidden rounded-[18px] border border-black/[0.07] bg-white">
            <div className="grid grid-cols-[1fr_150px_150px] border-b border-black/[0.06] bg-[#fafafa] px-5 py-3">
              <span className="text-[8px] font-bold uppercase tracking-[0.1em] text-bauraMuted">
                Denomination
              </span>

              <span className="text-center text-[8px] font-bold uppercase tracking-[0.1em] text-bauraMuted">
                Quantity
              </span>

              <span className="text-right text-[8px] font-bold uppercase tracking-[0.1em] text-bauraMuted">
                Amount
              </span>
            </div>

            <div className="divide-y divide-black/[0.05]">
              {denominations.map((denomination) => (
                <div
                  key={denomination.value}
                  className="grid min-h-[62px] grid-cols-[1fr_150px_150px] items-center px-5">
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-bauraGoldSoft text-bauraGoldDark">
                      <Banknote size={14} />
                    </div>

                    <span className="text-[11px] font-bold">
                      {denomination.label}
                    </span>
                  </div>

                  <div className="mx-auto flex items-center rounded-lg border border-black/[0.08] bg-[#fafafa]">
                    <button
                      type="button"
                      onClick={() => decrement(denomination.value)}
                      className="flex h-8 w-8 items-center justify-center text-bauraMuted transition hover:bg-white hover:text-bauraInk">
                      <Minus size={12} />
                    </button>

                    <input
                      type="number"
                      min={0}
                      max={100000}
                      value={denomination.quantity}
                      onChange={(event) =>
                        updateQuantity(
                          denomination.value,
                          Number(event.target.value),
                        )
                      }
                      className="h-8 w-12 border-x border-black/[0.06] bg-white text-center text-[10px] font-bold outline-none"
                    />

                    <button
                      type="button"
                      onClick={() => increment(denomination.value)}
                      className="flex h-8 w-8 items-center justify-center text-bauraMuted transition hover:bg-white hover:text-bauraInk">
                      <Plus size={12} />
                    </button>
                  </div>

                  <p className="text-right text-[11px] font-semibold">
                    {formatCurrency(
                      denomination.value * denomination.quantity,
                    )}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <aside>
          <div className="sticky top-8 rounded-[20px] border border-black/[0.07] bg-white p-5 shadow-[0_18px_60px_rgba(0,0,0,0.06)]">
            <div className="flex items-start gap-3 border-b border-black/[0.06] pb-5">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-bauraGoldSoft text-bauraGoldDark">
                <CalendarDays size={17} />
              </div>

              <div>
                <p className="text-[8px] font-bold uppercase tracking-[0.1em] text-bauraMuted">
                  Business date
                </p>

                <p className="mt-1 text-[11px] font-bold">
                  {formatBusinessDate(business.businessDate)}
                </p>
              </div>
            </div>

            <div className="py-6">
              <p className="text-[8px] font-bold uppercase tracking-[0.12em] text-bauraMuted">
                Opening float
              </p>

              <p className="mt-2 text-[30px] font-bold tracking-[-0.05em] text-bauraPrimary">
                {formatCurrency(total)}
              </p>

              <p className="mt-2 text-[9px] leading-4 text-bauraMuted">
                Calculated automatically from the physical
                denomination count.
              </p>
            </div>

            <label className="block">
              <span className="mb-2 block text-[8px] font-bold uppercase tracking-[0.1em] text-bauraMuted">
                Opening note
              </span>

              <textarea
                value={openingNote}
                onChange={(event) =>
                  setOpeningNote(event.target.value)
                }
                maxLength={500}
                rows={4}
                placeholder="Optional note about the opening drawer..."
                className="w-full resize-none rounded-xl border border-black/[0.08] bg-[#fafafa] px-3 py-3 text-[10px] leading-5 outline-none transition focus:border-bauraGold focus:bg-white"
              />
            </label>

            {!business.isOpenDay && (
              <div className="mt-4 rounded-xl border border-red-100 bg-red-50 p-3">
                <p className="text-[9px] font-bold text-red-700">
                  Business day closed
                </p>

                <p className="mt-1 text-[8px] leading-4 text-red-600">
                  {business.reason ||
                    "The POS cannot be opened today."}
                </p>
              </div>
            )}

            {business.isOpenDay &&
              !business.isWithinOpeningHours && (
                <div className="mt-4 rounded-xl border border-amber-100 bg-amber-50 p-3">
                  <p className="text-[9px] font-bold text-amber-700">
                    Outside business hours
                  </p>

                  <p className="mt-1 text-[8px] leading-4 text-amber-700">
                    The register cannot be opened until configured
                    business hours.
                  </p>
                </div>
              )}

            <button
              type="button"
              disabled={!canOpen}
              onClick={handleOpenRegister}
              className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-bauraPrimary px-4 text-[10px] font-bold text-white shadow-bauraButton transition hover:bg-bauraPrimaryDark disabled:cursor-not-allowed disabled:opacity-40">
              {isOpening ? (
                <>
                  <RefreshCw
                    size={14}
                    className="animate-spin"
                  />

                  Opening register...
                </>
              ) : (
                <>
                  <ShieldCheck size={15} />

                  Open Register

                  <ChevronRight size={14} />
                </>
              )}
            </button>

            <p className="mt-3 text-center text-[8px] leading-4 text-bauraMuted">
              Opening the register creates an auditable POS session
              and enables sales for this cashier.
            </p>
          </div>
        </aside>
      </main>
    </div>
  );
}
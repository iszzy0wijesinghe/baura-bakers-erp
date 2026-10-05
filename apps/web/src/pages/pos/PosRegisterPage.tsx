import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  ArrowRight,
  Banknote,
  CalendarDays,
  CheckCircle2,
  Clock3,
  LogOut,
  RefreshCw,
  ShieldCheck,
  Store,
  WalletCards,
} from "lucide-react";

import {
  useNavigate,
} from "react-router-dom";

import {
  useAuth,
} from "../../auth/AuthContext";

import {
  getCurrentPosSession,
  openPosSession,
} from "../../lib/posApi";

import {
  useToast,
} from "../../ui/ToastProvider";

const LKR_DENOMINATIONS = [
  5000,
  2000,
  1000,
  500,
  100,
  50,
  20,
  10,
  5,
  2,
  1,
];

type Counts = Record<
  number,
  number
>;

function formatCurrency(
  value: number,
) {
  return `Rs. ${value.toLocaleString(
    "en-LK",
    {
      minimumFractionDigits:
        2,

      maximumFractionDigits:
        2,
    },
  )}`;
}

export function PosRegisterPage() {
  const navigate =
    useNavigate();

  const toast =
    useToast();

  const {
    user,
    logout,
  } = useAuth();

  const [
    counts,
    setCounts,
  ] =
    useState<Counts>(
      {},
    );

  const [
    openingNote,
    setOpeningNote,
  ] =
    useState("");

  const [
    isLoading,
    setIsLoading,
  ] =
    useState(true);

  const [
    isOpening,
    setIsOpening,
  ] =
    useState(false);

  const [
    businessDate,
    setBusinessDate,
  ] =
    useState("");

  const [
    businessOpen,
    setBusinessOpen,
  ] =
    useState(true);

  const [
    withinHours,
    setWithinHours,
  ] =
    useState(true);

  const [
    businessReason,
    setBusinessReason,
  ] =
    useState<
      string | null
    >(null);

  const total =
    useMemo(
      () =>
        LKR_DENOMINATIONS.reduce(
          (
            sum,
            denomination,
          ) =>
            sum +
            denomination *
              (counts[
                denomination
              ] || 0),
          0,
        ),
      [
        counts,
      ],
    );

  async function loadSession() {
    setIsLoading(
      true,
    );

    try {
      const data =
        await getCurrentPosSession();

      setBusinessDate(
        data.business
          .businessDate ||
          "",
      );

      setBusinessOpen(
        data.business
          .isOpenDay,
      );

      setWithinHours(
        data.business
          .isWithinOpeningHours,
      );

      setBusinessReason(
        typeof data.business
          .reason ===
          "string"
          ? data.business
              .reason
          : null,
      );

      if (
        data.session
      ) {
        navigate(
          "/pos",
          {
            replace:
              true,
          },
        );
      }
    } catch (error) {
      toast.error(
        "Unable to load register",
        error instanceof
          Error
          ? error.message
          : "Could not check the POS session.",
      );
    } finally {
      setIsLoading(
        false,
      );
    }
  }

  useEffect(
    () => {
      void loadSession();
    },
    [],
  );

  function updateCount(
    denomination:
      number,
    rawValue:
      string,
  ) {
    const parsed =
      Number.parseInt(
        rawValue,
        10,
      );

    const quantity =
      Number.isFinite(
        parsed,
      )
        ? Math.max(
            0,
            parsed,
          )
        : 0;

    setCounts(
      (
        current,
      ) => ({
        ...current,

        [denomination]:
          quantity,
      }),
    );
  }

  function clearCount() {
    setCounts(
      {},
    );
  }

  async function openRegister() {
    if (
      !businessOpen
    ) {
      toast.warning(
        "Business day closed",
        businessReason ||
          "The shop is closed for this business date.",
      );

      return;
    }

    if (
      !withinHours
    ) {
      toast.warning(
        "Outside business hours",
        "The register cannot be opened outside configured business hours.",
      );

      return;
    }

    setIsOpening(
      true,
    );

    try {
      const denominations =
        LKR_DENOMINATIONS.map(
          (
            denominationValue,
          ) => ({
            denominationValue,

            quantity:
              counts[
                denominationValue
              ] || 0,
          }),
        );

      const result =
        await openPosSession({
          openingNote:
            openingNote.trim() ||
            null,

          denominations,
        });

      toast.success(
        "Register opened",
        `${result.session.sessionNo} is ready for sales.`,
      );

      navigate(
        "/pos",
        {
          replace:
            true,
        },
      );
    } catch (error) {
      toast.error(
        "Unable to open register",
        error instanceof
          Error
          ? error.message
          : "Could not open the POS register.",
      );
    } finally {
      setIsOpening(
        false,
      );
    }
  }

  function signOut() {
    logout();

    navigate(
      "/pos/login",
      {
        replace:
          true,
      },
    );
  }

  if (
    isLoading
  ) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f7f6f2]">
        <div className="flex items-center gap-3 text-[12px] font-semibold text-bauraMuted">
          <RefreshCw
            size={17}
            className="animate-spin"
          />

          Checking register...
        </div>
      </main>
    );
  }

  const canOpen =
    businessOpen &&
    withinHours &&
    !isOpening;

  return (
    <main className="min-h-screen bg-[#f7f6f2] text-bauraInk">
      <header className="border-b border-black/[0.06] bg-white">
        <div className="mx-auto flex h-[72px] max-w-[1440px] items-center justify-between px-5 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-[13px] bg-bauraPrimary text-[13px] font-bold text-white">
              B
            </div>

            <div>
              <div className="flex items-center gap-2">
                <p className="text-[14px] font-bold tracking-[-0.03em]">
                  Baura
                </p>

                <span className="rounded-md bg-bauraGoldSoft px-2 py-0.5 text-[8px] font-bold uppercase tracking-[0.12em] text-bauraGoldDark">
                  POS
                </span>
              </div>

              <p className="text-[9px] text-bauraMuted">
                Register opening
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-[10px] font-semibold">
                {user?.firstName}{" "}
                {user?.lastName}
              </p>

              <p className="text-[8px] text-bauraMuted">
                {user?.roleName ||
                  "POS Staff"}
              </p>
            </div>

            <button
              type="button"
              onClick={
                signOut
              }
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-black/[0.07] bg-white text-bauraMuted transition hover:bg-[#f7f6f2] hover:text-bauraInk"
              aria-label="Sign out"
            >
              <LogOut
                size={16}
              />
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1280px] gap-6 px-5 py-7 lg:grid-cols-[minmax(0,1fr)_360px] lg:px-8 lg:py-9">
        <section>
          <div className="mb-6">
            <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-bauraGoldDark">
              Start shift
            </p>

            <h1 className="mt-2 text-[28px] font-bold tracking-[-0.045em]">
              Count the opening drawer
            </h1>

            <p className="mt-2 max-w-2xl text-[11px] leading-5 text-bauraMuted">
              Count the physical cash currently in the drawer before accepting the first sale. The opening float is calculated automatically from the denominations below.
            </p>
          </div>

          <div className="overflow-hidden rounded-[22px] border border-black/[0.06] bg-white shadow-sm">
            <div className="grid grid-cols-[1fr_130px_150px] border-b border-black/[0.06] bg-[#fafaf8] px-5 py-3 text-[8px] font-bold uppercase tracking-[0.09em] text-bauraMuted">
              <span>
                Denomination
              </span>

              <span className="text-center">
                Quantity
              </span>

              <span className="text-right">
                Amount
              </span>
            </div>

            {LKR_DENOMINATIONS.map(
              (
                denomination,
              ) => {
                const quantity =
                  counts[
                    denomination
                  ] || 0;

                const amount =
                  denomination *
                  quantity;

                return (
                  <div
                    key={
                      denomination
                    }
                    className="grid grid-cols-[1fr_130px_150px] items-center border-b border-black/[0.045] px-5 py-3.5 last:border-b-0"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-bauraGoldSoft text-bauraGoldDark">
                        <Banknote
                          size={16}
                        />
                      </div>

                      <div>
                        <p className="text-[12px] font-bold">
                          Rs.{" "}
                          {denomination.toLocaleString(
                            "en-LK",
                          )}
                        </p>

                        <p className="mt-0.5 text-[8px] text-bauraMuted">
                          {denomination >=
                          20
                            ? "Note"
                            : "Coin"}
                        </p>
                      </div>
                    </div>

                    <div className="flex justify-center">
                      <input
                        type="number"
                        min="0"
                        step="1"
                        inputMode="numeric"
                        value={
                          quantity ||
                          ""
                        }
                        onChange={(
                          event,
                        ) =>
                          updateCount(
                            denomination,
                            event
                              .target
                              .value,
                          )
                        }
                        className="h-10 w-[88px] rounded-xl border border-black/[0.08] bg-[#fafaf8] px-3 text-center text-[12px] font-bold outline-none transition focus:border-bauraGold focus:bg-white"
                        placeholder="0"
                      />
                    </div>

                    <p className="text-right text-[11px] font-bold">
                      {formatCurrency(
                        amount,
                      )}
                    </p>
                  </div>
                );
              },
            )}
          </div>

          <div className="mt-4 flex justify-end">
            <button
              type="button"
              onClick={
                clearCount
              }
              className="text-[9px] font-semibold text-bauraMuted transition hover:text-bauraInk"
            >
              Clear count
            </button>
          </div>
        </section>

        <aside className="space-y-5">
          <div className="rounded-[22px] bg-bauraPrimary p-6 text-white shadow-sm">
            <div className="flex h-11 w-11 items-center justify-center rounded-[14px] bg-white/10">
              <WalletCards
                size={20}
              />
            </div>

            <p className="mt-6 text-[9px] font-bold uppercase tracking-[0.12em] text-white/50">
              Opening float
            </p>

            <p className="mt-1 text-[28px] font-bold tracking-[-0.04em]">
              {formatCurrency(
                total,
              )}
            </p>

            <div className="mt-6 border-t border-white/10 pt-5">
              <div className="flex items-center justify-between">
                <span className="text-[9px] text-white/55">
                  Units counted
                </span>

                <span className="text-[10px] font-bold">
                  {Object.values(
                    counts,
                  ).reduce(
                    (
                      sum,
                      value,
                    ) =>
                      sum +
                      value,
                    0,
                  )}
                </span>
              </div>
            </div>
          </div>

          <div className="rounded-[22px] border border-black/[0.06] bg-white p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <Store
                size={17}
                className="text-bauraGoldDark"
              />

              <div>
                <p className="text-[10px] font-bold">
                  Business day
                </p>

                <p className="mt-0.5 text-[9px] text-bauraMuted">
                  Register availability
                </p>
              </div>
            </div>

            <div className="mt-5 space-y-3">
              <div className="flex items-center justify-between rounded-xl bg-[#fafaf8] px-3.5 py-3">
                <div className="flex items-center gap-2">
                  <CalendarDays
                    size={14}
                    className="text-bauraMuted"
                  />

                  <span className="text-[9px] text-bauraMuted">
                    Date
                  </span>
                </div>

                <span className="text-[9px] font-bold">
                  {businessDate ||
                    "—"}
                </span>
              </div>

              <div className="flex items-center justify-between rounded-xl bg-[#fafaf8] px-3.5 py-3">
                <div className="flex items-center gap-2">
                  <Clock3
                    size={14}
                    className="text-bauraMuted"
                  />

                  <span className="text-[9px] text-bauraMuted">
                    Hours
                  </span>
                </div>

                <span
                  className={`text-[9px] font-bold ${
                    withinHours
                      ? "text-emerald-600"
                      : "text-amber-600"
                  }`}
                >
                  {withinHours
                    ? "Open"
                    : "Outside hours"}
                </span>
              </div>

              <div className="flex items-center justify-between rounded-xl bg-[#fafaf8] px-3.5 py-3">
                <div className="flex items-center gap-2">
                  <ShieldCheck
                    size={14}
                    className="text-bauraMuted"
                  />

                  <span className="text-[9px] text-bauraMuted">
                    Day status
                  </span>
                </div>

                <span
                  className={`text-[9px] font-bold ${
                    businessOpen
                      ? "text-emerald-600"
                      : "text-red-600"
                  }`}
                >
                  {businessOpen
                    ? "Trading day"
                    : "Closed"}
                </span>
              </div>
            </div>

            {businessReason && (
              <p className="mt-4 rounded-xl bg-amber-50 px-3.5 py-3 text-[9px] leading-4 text-amber-800">
                {
                  businessReason
                }
              </p>
            )}
          </div>

          <div className="rounded-[22px] border border-black/[0.06] bg-white p-5 shadow-sm">
            <label className="block">
              <span className="text-[9px] font-bold">
                Opening note
              </span>

              <span className="ml-1 text-[8px] text-bauraMuted">
                optional
              </span>

              <textarea
                value={
                  openingNote
                }
                onChange={(
                  event,
                ) =>
                  setOpeningNote(
                    event
                      .target
                      .value,
                  )
                }
                maxLength={
                  500
                }
                rows={3}
                placeholder="Add a note about the opening drawer..."
                className="mt-2 w-full resize-none rounded-[14px] border border-black/[0.08] bg-[#fafaf8] p-3.5 text-[10px] leading-5 outline-none transition placeholder:text-bauraMuted2 focus:border-bauraGold focus:bg-white"
              />
            </label>

            <button
              type="button"
              disabled={
                !canOpen
              }
              onClick={
                openRegister
              }
              className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-[14px] bg-bauraPrimary px-4 text-[10px] font-bold text-white transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-40"
            >
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
                  <CheckCircle2
                    size={15}
                  />

                  Open register

                  <ArrowRight
                    size={14}
                  />
                </>
              )}
            </button>
          </div>
        </aside>
      </div>
    </main>
  );
}
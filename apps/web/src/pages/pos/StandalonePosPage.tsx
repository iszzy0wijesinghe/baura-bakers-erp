/** @format */

import {
  useCallback,
  useEffect,
  useState,
} from "react";

import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  LogOut,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";

import {
  PosRegisterOpening,
} from "../../components/pos/PosRegisterOpening";

import {
  PosSellingWorkspace,
} from "../../components/pos/PosSellingWorkspace";

import {
  PosDayEnd,
} from "../../components/pos/PosDayEnd";

import {
  getCurrentPosSession,
  type PosBusinessDay,
  type PosSession,
} from "../../lib/posSessionApi";

import {
  getPosProducts,
  type PosProduct,
} from "../../lib/posSellingApi";

import {
  useToast,
} from "../../ui/ToastProvider";

type PosView =
  | "SELLING"
  | "DAY_END";

export function StandalonePosPage() {
  const toast =
    useToast();

  const [
    session,
    setSession,
  ] =
    useState<PosSession | null>(
      null,
    );

  const [
    business,
    setBusiness,
  ] =
    useState<PosBusinessDay | null>(
      null,
    );

  const [
    products,
    setProducts,
  ] =
    useState<PosProduct[]>(
      [],
    );

  const [
    view,
    setView,
  ] =
    useState<PosView>(
      "SELLING",
    );

  const [
    isLoading,
    setIsLoading,
  ] = useState(true);

  const [
    loadingProducts,
    setLoadingProducts,
  ] = useState(false);

  /*
  |--------------------------------------------------------------------------
  | SESSION
  |--------------------------------------------------------------------------
  */

  const loadSession =
    useCallback(
      async (
        showSuccessToast =
          false,
      ) => {
        setIsLoading(
          true,
        );

        try {
          const response =
            await getCurrentPosSession();

          setSession(
            response.session,
          );

          setBusiness(
            response.business,
          );

          if (
            response.session
              ?.status ===
            "CLOSING"
          ) {
            setView(
              "DAY_END",
            );
          }

          if (
            showSuccessToast
          ) {
            toast.success(
              "POS refreshed",
              "Register status is up to date.",
            );
          }
        } catch (error) {
          toast.error(
            "Unable to load POS",
            error instanceof Error
              ? error.message
              : "Could not load the POS register.",
          );
        } finally {
          setIsLoading(
            false,
          );
        }
      },
      [
        toast,
      ],
    );

  /*
  |--------------------------------------------------------------------------
  | PRODUCTS
  |--------------------------------------------------------------------------
  */

  const loadProducts =
    useCallback(
      async (
        showSuccessToast =
          false,
      ) => {
        setLoadingProducts(
          true,
        );

        try {
          const response =
            await getPosProducts();

          setProducts(
            response.products,
          );

          if (
            showSuccessToast
          ) {
            toast.success(
              "Catalogue refreshed",
              "Products and stock are up to date.",
            );
          }
        } catch (error) {
          toast.error(
            "Products unavailable",
            error instanceof Error
              ? error.message
              : "Could not load POS products.",
          );
        } finally {
          setLoadingProducts(
            false,
          );
        }
      },
      [
        toast,
      ],
    );

  useEffect(() => {
    void loadSession();
  }, [
    loadSession,
  ]);

  useEffect(() => {
    if (
      session?.status !==
      "OPEN"
    ) {
      return;
    }

    void loadProducts();
  }, [
    session?.id,
    session?.status,
    loadProducts,
  ]);

  function logout() {
    localStorage.removeItem(
      "baura_token",
    );

    window.location.href =
      "/pos/login";
  }

  /*
  |--------------------------------------------------------------------------
  | LOADING
  |--------------------------------------------------------------------------
  */

  if (
    isLoading &&
    !business
  ) {
    return (
      <PosLoadingScreen />
    );
  }

  if (!business) {
    return (
      <PosLoadError
        onRetry={() =>
          void loadSession()
        }
        onLogout={
          logout
        }
      />
    );
  }

  /*
  |--------------------------------------------------------------------------
  | REGISTER NOT OPEN
  |--------------------------------------------------------------------------
  */

  if (!session) {
    return (
      <PosRegisterOpening
        business={
          business
        }
        onOpened={(
          openedSession,
        ) => {
          setSession(
            openedSession,
          );

          setView(
            "SELLING",
          );
        }}
      />
    );
  }

  /*
  |--------------------------------------------------------------------------
  | PENDING DAY END APPROVAL
  |--------------------------------------------------------------------------
  */

  if (
    session.status ===
    "PENDING_APPROVAL"
  ) {
    return (
      <PosPendingApprovalState
        session={
          session
        }
        onRefresh={() =>
          void loadSession()
        }
        onLogout={
          logout
        }
      />
    );
  }

  /*
  |--------------------------------------------------------------------------
  | CLOSED
  |--------------------------------------------------------------------------
  */

  if (
    session.status ===
    "CLOSED"
  ) {
    return (
      <PosClosedState
        session={
          session
        }
        onRefresh={() =>
          void loadSession()
        }
        onLogout={
          logout
        }
      />
    );
  }

  /*
  |--------------------------------------------------------------------------
  | DAY END
  |--------------------------------------------------------------------------
  */

  if (
    session.status ===
      "CLOSING" ||
    view ===
      "DAY_END"
  ) {
    return (
      <PosDayEnd
        session={
          session
        }
        alreadyClosing={
          session.status ===
          "CLOSING"
        }
        onBack={
          session.status ===
          "OPEN"
            ? () =>
                setView(
                  "SELLING",
                )
            : undefined
        }
        onSubmitted={() =>
          void loadSession()
        }
      />
    );
  }

  /*
  |--------------------------------------------------------------------------
  | SELLING
  |--------------------------------------------------------------------------
  */

  if (
    session.status ===
    "OPEN"
  ) {
    return (
      <PosSellingWorkspace
        session={
          session
        }
        products={
          products
        }
        loadingProducts={
          loadingProducts
        }
        onRefreshProducts={() =>
          void loadProducts(
            true,
          )
        }
        onLogout={
          logout
        }
        onDayEnd={() =>
          setView(
            "DAY_END",
          )
        }
        onSaleCompleted={() => {
          void loadProducts();
        }}
      />
    );
  }

  return (
    <PosLoadError
      onRetry={() =>
        void loadSession()
      }
      onLogout={
        logout
      }
    />
  );
}

/*
|--------------------------------------------------------------------------
| LOADING
|--------------------------------------------------------------------------
*/

function PosLoadingScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f4f4f1]">
      <div className="text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-white shadow-sm">
          <RefreshCw
            size={18}
            className="animate-spin text-bauraPrimary"
          />
        </div>

        <p className="mt-4 text-[11px] font-extrabold text-bauraInk">
          Loading POS
        </p>

        <p className="mt-1 text-[8px] text-bauraMuted">
          Checking register status...
        </p>
      </div>
    </div>
  );
}

/*
|--------------------------------------------------------------------------
| PENDING APPROVAL
|--------------------------------------------------------------------------
*/

function PosPendingApprovalState({
  session,
  onRefresh,
  onLogout,
}: {
  session: PosSession;
  onRefresh: () => void;
  onLogout: () => void;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f4f4f1] p-6">
      <div className="w-full max-w-[470px] rounded-[24px] border border-black/[0.07] bg-white p-7 shadow-[0_24px_80px_rgba(0,0,0,0.08)]">
        <div className="flex items-start">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-50 text-amber-600">
            <Clock3
              size={20}
            />
          </div>

          <div className="ml-auto rounded-xl bg-[#f5f5f2] px-3 py-2 text-right">
            <p className="text-[7px] font-bold uppercase tracking-[0.08em] text-bauraMuted">
              Session
            </p>

            <p className="mt-0.5 text-[8px] font-black">
              {
                session.sessionNo
              }
            </p>
          </div>
        </div>

        <p className="mt-6 text-[8px] font-bold uppercase tracking-[0.12em] text-amber-600">
          Day End submitted
        </p>

        <h1 className="mt-1 text-[24px] font-extrabold tracking-[-0.045em] text-bauraInk">
          Waiting for manager approval
        </h1>

        <p className="mt-2 text-[9px] leading-5 text-bauraMuted">
          The drawer reconciliation has been submitted successfully. This register stays locked until a manager approves or rejects the Day End.
        </p>

        <div className="mt-6 rounded-2xl border border-amber-100 bg-amber-50 p-4">
          <div className="flex items-center gap-2">
            <ShieldCheck
              size={14}
              className="text-amber-600"
            />

            <p className="text-[9px] font-extrabold text-amber-800">
              Billing disabled
            </p>
          </div>

          <p className="mt-2 text-[8px] leading-4 text-amber-700">
            No new invoice can be created from this register while Day End approval is pending.
          </p>
        </div>

        {session.dayEnd
          ?.managerNote && (
          <div className="mt-3 rounded-xl bg-[#f5f5f2] p-3">
            <p className="text-[7px] font-bold uppercase tracking-[0.08em] text-bauraMuted">
              Manager note
            </p>

            <p className="mt-1 text-[8px] leading-4">
              {
                session.dayEnd
                  .managerNote
              }
            </p>
          </div>
        )}

        <div className="mt-6 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={
              onLogout
            }
            className="flex h-11 items-center justify-center gap-2 rounded-xl border border-black/[0.08] text-[8px] font-extrabold text-bauraMuted transition hover:bg-[#fafafa] hover:text-bauraInk">
            <LogOut
              size={13}
            />

            Sign Out
          </button>

          <button
            type="button"
            onClick={
              onRefresh
            }
            className="flex h-11 items-center justify-center gap-2 rounded-xl bg-bauraPrimary text-[8px] font-extrabold text-white">
            <RefreshCw
              size={13}
            />

            Check Status
          </button>
        </div>
      </div>
    </div>
  );
}

/*
|--------------------------------------------------------------------------
| CLOSED
|--------------------------------------------------------------------------
*/

function PosClosedState({
  session,
  onRefresh,
  onLogout,
}: {
  session: PosSession;
  onRefresh: () => void;
  onLogout: () => void;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f4f4f1] p-6">
      <div className="w-full max-w-[450px] rounded-[24px] border border-black/[0.07] bg-white p-7 text-center shadow-[0_24px_80px_rgba(0,0,0,0.07)]">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
          <CheckCircle2
            size={23}
          />
        </div>

        <p className="mt-5 text-[8px] font-bold uppercase tracking-[0.12em] text-emerald-600">
          {
            session.sessionNo
          }
        </p>

        <h1 className="mt-2 text-[23px] font-extrabold tracking-[-0.045em]">
          Register closed
        </h1>

        <p className="mx-auto mt-2 max-w-sm text-[9px] leading-5 text-bauraMuted">
          Day End was approved and this POS session has been closed.
        </p>

        <div className="mt-6 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={
              onLogout
            }
            className="flex h-11 items-center justify-center gap-2 rounded-xl border border-black/[0.08] text-[8px] font-bold">
            <LogOut
              size={13}
            />

            Sign Out
          </button>

          <button
            type="button"
            onClick={
              onRefresh
            }
            className="flex h-11 items-center justify-center gap-2 rounded-xl bg-bauraPrimary text-[8px] font-bold text-white">
            <RefreshCw
              size={13}
            />

            Refresh POS
          </button>
        </div>
      </div>
    </div>
  );
}

/*
|--------------------------------------------------------------------------
| ERROR
|--------------------------------------------------------------------------
*/

function PosLoadError({
  onRetry,
  onLogout,
}: {
  onRetry: () => void;
  onLogout: () => void;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f4f4f1] p-6">
      <div className="w-full max-w-md rounded-[22px] border border-red-100 bg-white p-6 text-center shadow-sm">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-red-50 text-red-600">
          <AlertTriangle
            size={19}
          />
        </div>

        <h1 className="mt-4 text-[18px] font-extrabold tracking-[-0.03em]">
          POS unavailable
        </h1>

        <p className="mt-2 text-[9px] leading-5 text-bauraMuted">
          The register status could not be loaded.
        </p>

        <div className="mt-5 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={
              onLogout
            }
            className="h-10 rounded-xl border border-black/[0.08] text-[8px] font-bold">
            Sign Out
          </button>

          <button
            type="button"
            onClick={
              onRetry
            }
            className="h-10 rounded-xl bg-bauraPrimary text-[8px] font-bold text-white">
            Try Again
          </button>
        </div>
      </div>
    </div>
  );
}
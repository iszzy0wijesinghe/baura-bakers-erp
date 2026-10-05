/** @format */

import {
  useCallback,
  useEffect,
  useState,
} from "react";

import {
  AlertTriangle,
  Clock3,
  LogOut,
  RefreshCw,
} from "lucide-react";

import {
  PosRegisterOpening,
} from "../../components/pos/PosRegisterOpening";

import {
  PosSellingWorkspace,
} from "../../components/pos/PosSellingWorkspace";

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
    isLoading,
    setIsLoading,
  ] =
    useState(true);

  const [
    loadingProducts,
    setLoadingProducts,
  ] =
    useState(false);

  /*
  |--------------------------------------------------------------------------
  | LOAD CURRENT POS SESSION
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
            showSuccessToast
          ) {
            toast.success(
              "POS refreshed",
              "Register status is up to date.",
            );
          }
        } catch (
          error
        ) {
          toast.error(
            "Unable to load POS",
            error instanceof
              Error
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
  | LOAD POS PRODUCTS
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
              "Products refreshed",
              "POS catalogue and stock are up to date.",
            );
          }
        } catch (
          error
        ) {
          toast.error(
            "Products unavailable",
            error instanceof
              Error
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

  /*
  |--------------------------------------------------------------------------
  | INITIAL LOAD
  |--------------------------------------------------------------------------
  */

  useEffect(
    () => {
      void loadSession();
    },
    [
      loadSession,
    ],
  );

  /*
  |--------------------------------------------------------------------------
  | LOAD PRODUCTS WHEN REGISTER IS OPEN
  |--------------------------------------------------------------------------
  */

  useEffect(
    () => {
      if (
        session?.status !==
        "OPEN"
      ) {
        return;
      }

      void loadProducts();
    },
    [
      session?.id,
      session?.status,
      loadProducts,
    ],
  );

  /*
  |--------------------------------------------------------------------------
  | LOGOUT
  |--------------------------------------------------------------------------
  */

  function logout() {
    localStorage.removeItem(
      "baura_token",
    );

    window.location.href =
      "/pos/login";
  }

  /*
  |--------------------------------------------------------------------------
  | INITIAL LOADING
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

  /*
  |--------------------------------------------------------------------------
  | FAILED TO LOAD BUSINESS STATUS
  |--------------------------------------------------------------------------
  */

  if (
    !business
  ) {
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
  | NO ACTIVE SESSION
  |--------------------------------------------------------------------------
  |
  | Cashier must count opening cash and
  | open the register before billing.
  |--------------------------------------------------------------------------
  */

  if (
    !session
  ) {
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
        }}
      />
    );
  }

  /*
  |--------------------------------------------------------------------------
  | OPEN SESSION
  |--------------------------------------------------------------------------
  |
  | This is the actual POS.
  |
  | Products
  | Cart
  | Quantities
  | Customer
  | Payments
  | Sale completion
  | Receipt
  | Printing
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
        onDayEnd={() => {
          /*
           * Day End UI will replace
           * this handler.
           *
           * Do NOT change session status
           * from the frontend.
           *
           * The backend day-end/start
           * endpoint must do that.
           */
          toast.info(
            "Day End",
            "Day End reconciliation is the next POS screen to connect.",
          );
        }}
        onSaleCompleted={() => {
          /*
           * Stock changed after the sale.
           * Refresh the catalogue so the
           * cashier immediately sees the
           * new available quantities.
           */
          void loadProducts();
        }}
      />
    );
  }

  /*
  |--------------------------------------------------------------------------
  | CLOSING SESSION
  |--------------------------------------------------------------------------
  |
  | Once Day End starts, selling is locked.
  |--------------------------------------------------------------------------
  */

  if (
    session.status ===
    "CLOSING"
  ) {
    return (
      <PosClosingState
        session={
          session
        }
        onRefresh={() =>
          void loadSession(
            true,
          )
        }
        onLogout={
          logout
        }
      />
    );
  }

  /*
  |--------------------------------------------------------------------------
  | PENDING MANAGER APPROVAL
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
  | CLOSED / UNKNOWN SESSION STATE
  |--------------------------------------------------------------------------
  */

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
| LOADING SCREEN
|--------------------------------------------------------------------------
*/

function PosLoadingScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f6f7f8]">
      <div className="text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-white shadow-sm">
          <RefreshCw
            size={
              18
            }
            className="animate-spin text-bauraPrimary"
          />
        </div>

        <p className="mt-4 text-[11px] font-bold text-bauraInk">
          Loading POS
        </p>

        <p className="mt-1 text-[9px] text-bauraMuted">
          Checking register
          status...
        </p>
      </div>
    </div>
  );
}

/*
|--------------------------------------------------------------------------
| CLOSING STATE
|--------------------------------------------------------------------------
*/

function PosClosingState({
  session,
  onRefresh,
  onLogout,
}: {
  session:
    PosSession;

  onRefresh:
    () => void;

  onLogout:
    () => void;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f6f7f8] p-6">
      <div className="w-full max-w-lg rounded-[22px] border border-black/[0.07] bg-white p-7 shadow-[0_20px_70px_rgba(0,0,0,0.07)]">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
          <AlertTriangle
            size={
              19
            }
          />
        </div>

        <p className="mt-5 text-[8px] font-bold uppercase tracking-[0.12em] text-bauraMuted">
          {
            session.sessionNo
          }
        </p>

        <h1 className="mt-1 text-[22px] font-bold tracking-[-0.04em] text-bauraInk">
          Day End in
          progress
        </h1>

        <p className="mt-2 text-[10px] leading-5 text-bauraMuted">
          Sales are
          locked because
          the register has
          entered Day End.
          Complete the cash
          reconciliation
          before continuing.
        </p>

        <div className="mt-6 rounded-xl border border-amber-100 bg-amber-50 p-4">
          <p className="text-[9px] font-bold text-amber-800">
            Billing is
            disabled
          </p>

          <p className="mt-1 text-[8px] leading-4 text-amber-700">
            No new invoice
            can be created
            while this
            register is in
            the closing
            process.
          </p>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={
              onLogout
            }
            className="flex h-10 items-center justify-center gap-2 rounded-xl border border-black/[0.08] text-[9px] font-bold text-bauraMuted transition hover:bg-[#fafafa] hover:text-bauraInk">
            <LogOut
              size={
                13
              }
            />

            Sign Out
          </button>

          <button
            type="button"
            onClick={
              onRefresh
            }
            className="flex h-10 items-center justify-center gap-2 rounded-xl bg-bauraPrimary text-[9px] font-bold text-white transition hover:bg-bauraPrimaryDark">
            <RefreshCw
              size={
                13
              }
            />

            Refresh
          </button>
        </div>
      </div>
    </div>
  );
}

/*
|--------------------------------------------------------------------------
| PENDING APPROVAL STATE
|--------------------------------------------------------------------------
*/

function PosPendingApprovalState({
  session,
  onRefresh,
  onLogout,
}: {
  session:
    PosSession;

  onRefresh:
    () => void;

  onLogout:
    () => void;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f6f7f8] p-6">
      <div className="w-full max-w-lg rounded-[22px] border border-black/[0.07] bg-white p-7 text-center shadow-[0_20px_70px_rgba(0,0,0,0.07)]">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 text-amber-600">
          <Clock3
            size={
              22
            }
          />
        </div>

        <p className="mt-5 text-[8px] font-bold uppercase tracking-[0.12em] text-bauraMuted">
          {
            session.sessionNo
          }
        </p>

        <h1 className="mt-2 text-[23px] font-bold tracking-[-0.04em] text-bauraInk">
          Awaiting manager
          approval
        </h1>

        <p className="mx-auto mt-2 max-w-sm text-[10px] leading-5 text-bauraMuted">
          Day End has been
          submitted. This
          register is locked
          until a manager
          approves or rejects
          the closing
          reconciliation.
        </p>

        <div className="mt-6 rounded-xl border border-amber-100 bg-amber-50 p-4 text-left">
          <p className="text-[9px] font-bold text-amber-800">
            Sales are
            disabled
          </p>

          <p className="mt-1 text-[8px] leading-4 text-amber-700">
            A new invoice
            cannot be created
            while this
            session is
            waiting for
            approval.
          </p>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={
              onLogout
            }
            className="flex h-11 items-center justify-center gap-2 rounded-xl border border-black/[0.08] text-[9px] font-bold text-bauraMuted transition hover:bg-[#fafafa] hover:text-bauraInk">
            <LogOut
              size={
                13
              }
            />

            Sign Out
          </button>

          <button
            type="button"
            onClick={
              onRefresh
            }
            className="flex h-11 items-center justify-center gap-2 rounded-xl bg-bauraPrimary text-[9px] font-bold text-white transition hover:bg-bauraPrimaryDark">
            <RefreshCw
              size={
                13
              }
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
| CLOSED STATE
|--------------------------------------------------------------------------
*/

function PosClosedState({
  session,
  onRefresh,
  onLogout,
}: {
  session:
    PosSession;

  onRefresh:
    () => void;

  onLogout:
    () => void;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f6f7f8] p-6">
      <div className="w-full max-w-lg rounded-[22px] border border-black/[0.07] bg-white p-7 shadow-[0_20px_70px_rgba(0,0,0,0.07)]">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-bauraGoldSoft text-bauraGoldDark">
          <Clock3
            size={
              19
            }
          />
        </div>

        <p className="mt-5 text-[8px] font-bold uppercase tracking-[0.12em] text-bauraMuted">
          {
            session.sessionNo
          }
        </p>

        <h1 className="mt-1 text-[22px] font-bold tracking-[-0.04em] text-bauraInk">
          Register closed
        </h1>

        <p className="mt-2 text-[10px] leading-5 text-bauraMuted">
          This POS session
          has been closed.
          Refresh the POS to
          check whether a new
          register session can
          be opened.
        </p>

        <div className="mt-6 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={
              onLogout
            }
            className="flex h-10 items-center justify-center gap-2 rounded-xl border border-black/[0.08] text-[9px] font-bold text-bauraMuted transition hover:bg-[#fafafa] hover:text-bauraInk">
            <LogOut
              size={
                13
              }
            />

            Sign Out
          </button>

          <button
            type="button"
            onClick={
              onRefresh
            }
            className="flex h-10 items-center justify-center gap-2 rounded-xl bg-bauraPrimary text-[9px] font-bold text-white transition hover:bg-bauraPrimaryDark">
            <RefreshCw
              size={
                13
              }
            />

            Refresh
          </button>
        </div>
      </div>
    </div>
  );
}

/*
|--------------------------------------------------------------------------
| LOAD ERROR
|--------------------------------------------------------------------------
*/

function PosLoadError({
  onRetry,
  onLogout,
}: {
  onRetry:
    () => void;

  onLogout:
    () => void;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f6f7f8] p-6">
      <div className="w-full max-w-md rounded-[20px] border border-red-100 bg-white p-6 text-center shadow-sm">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-red-50 text-red-600">
          <AlertTriangle
            size={
              19
            }
          />
        </div>

        <h1 className="mt-4 text-[18px] font-bold tracking-[-0.03em] text-bauraInk">
          POS unavailable
        </h1>

        <p className="mt-2 text-[9px] leading-5 text-bauraMuted">
          The register
          status could not
          be loaded.
        </p>

        <div className="mt-5 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={
              onLogout
            }
            className="h-10 rounded-xl border border-black/[0.08] text-[9px] font-bold text-bauraInk transition hover:bg-[#fafafa]">
            Sign Out
          </button>

          <button
            type="button"
            onClick={
              onRetry
            }
            className="h-10 rounded-xl bg-bauraPrimary text-[9px] font-bold text-white transition hover:bg-bauraPrimaryDark">
            Try Again
          </button>
        </div>
      </div>
    </div>
  );
}
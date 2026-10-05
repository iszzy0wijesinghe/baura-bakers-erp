/** @format */

import type {
  ReactNode,
} from "react";

import {
  Navigate,
  useLocation,
} from "react-router-dom";

import {
  useAuth,
} from "../auth/AuthContext";

type ProtectedRouteProps = {
  children:
    ReactNode;

  permission?:
    string;

  anyPermissions?:
    string[];

  allPermissions?:
    string[];

  requirePosAccess?:
    boolean;
};

export function ProtectedRoute({
  children,
  permission,
  anyPermissions = [],
  allPermissions = [],
  requirePosAccess = false,
}: ProtectedRouteProps) {
  const location =
    useLocation();

  const {
    user,
    isLoading,
    canAccessErp,
    canAccessPos,
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,
  } = useAuth();

  const isStandalonePos =
    location.pathname ===
      "/pos" ||
    location.pathname.startsWith(
      "/pos/",
    );

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bauraCream text-bauraBrown">
        Loading Baura...
      </div>
    );
  }

  if (!user) {
    return (
      <Navigate
        to={
          isStandalonePos
            ? "/pos/login"
            : "/login"
        }
        replace
      />
    );
  }

  /*
   * Standalone POS users do not need
   * ERP dashboard access.
   *
   * POS access is controlled separately
   * through access.pos and the requested
   * POS permission.
   */
  if (
    !isStandalonePos &&
    !canAccessErp
  ) {
    return (
      <AccessDenied
        standalonePos={
          false
        }
      />
    );
  }

  if (
    requirePosAccess &&
    !canAccessPos
  ) {
    return (
      <AccessDenied
        standalonePos={
          isStandalonePos
        }
      />
    );
  }

  if (
    permission &&
    !hasPermission(
      permission,
    )
  ) {
    return (
      <AccessDenied
        standalonePos={
          isStandalonePos
        }
      />
    );
  }

  if (
    anyPermissions.length >
      0 &&
    !hasAnyPermission(
      anyPermissions,
    )
  ) {
    return (
      <AccessDenied
        standalonePos={
          isStandalonePos
        }
      />
    );
  }

  if (
    allPermissions.length >
      0 &&
    !hasAllPermissions(
      allPermissions,
    )
  ) {
    return (
      <AccessDenied
        standalonePos={
          isStandalonePos
        }
      />
    );
  }

  return (
    <>
      {children}
    </>
  );
}

function AccessDenied({
  standalonePos,
}: {
  standalonePos:
    boolean;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-bauraCanvas px-5">
      <div className="w-full max-w-[440px] rounded-[24px] border border-bauraBorder bg-white p-7 text-center shadow-sm">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-bauraGoldSoft text-bauraPrimary">
          <span className="text-lg font-bold">
            !
          </span>
        </div>

        <h1 className="mt-5 text-xl font-semibold text-bauraInk">
          Access unavailable
        </h1>

        <p className="mt-2 text-[11px] leading-5 text-bauraMuted">
          Your Baura account does not currently have permission to access this area.
        </p>

        <a
          href={
            standalonePos
              ? "/pos/login"
              : "/dashboard"
          }
          className="mt-6 inline-flex h-10 items-center justify-center rounded-xl bg-bauraPrimary px-5 text-[11px] font-semibold text-white transition hover:opacity-90"
        >
          {standalonePos
            ? "Return to POS login"
            : "Return to dashboard"}
        </a>
      </div>
    </div>
  );
}
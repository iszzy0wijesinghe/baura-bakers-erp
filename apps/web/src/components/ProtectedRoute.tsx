/** @format */

import type {
  ReactNode,
} from "react";

import {
  Navigate,
} from "react-router-dom";

import {
  useAuth,
} from "../auth/AuthContext";

type ProtectedRouteProps = {
  children: ReactNode;

  permission?: string;

  anyPermissions?: string[];

  allPermissions?: string[];

  requirePosAccess?: boolean;
};

export function ProtectedRoute({
  children,
  permission,
  anyPermissions = [],
  allPermissions = [],
  requirePosAccess = false,
}: ProtectedRouteProps) {
  const {
    user,
    isLoading,
    canAccessErp,
    canAccessPos,
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,
  } = useAuth();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bauraCream text-bauraBrown">
        Loading Baura ERP...
      </div>
    );
  }

  if (!user) {
    return (
      <Navigate
        to="/login"
        replace
      />
    );
  }

  if (!canAccessErp) {
    return (
      <AccessDenied />
    );
  }

  if (
    requirePosAccess &&
    !canAccessPos
  ) {
    return (
      <AccessDenied />
    );
  }

  if (
    permission &&
    !hasPermission(
      permission,
    )
  ) {
    return (
      <AccessDenied />
    );
  }

  if (
    anyPermissions.length > 0 &&
    !hasAnyPermission(
      anyPermissions,
    )
  ) {
    return (
      <AccessDenied />
    );
  }

  if (
    allPermissions.length > 0 &&
    !hasAllPermissions(
      allPermissions,
    )
  ) {
    return (
      <AccessDenied />
    );
  }

  return <>{children}</>;
}

function AccessDenied() {
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
          Your Baura account does not
          currently have permission to
          access this area.
        </p>

        <a
          href="/dashboard"
          className="mt-6 inline-flex h-10 items-center justify-center rounded-xl bg-bauraPrimary px-5 text-[11px] font-semibold text-white transition hover:opacity-90"
        >
          Return to dashboard
        </a>
      </div>
    </div>
  );
}
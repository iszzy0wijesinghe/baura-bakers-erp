/** @format */

import { apiRequest } from "./api";

/*
|--------------------------------------------------------------------------
| MANAGER APPROVALS
|--------------------------------------------------------------------------
*/

export type PosApprovalType =
  | "MANUAL_DISCOUNT"
  | "CANCEL_SALE"
  | "REFUND"
  | "RETURN";

export type PosApprovalStatus =
  | "PENDING"
  | "APPROVED"
  | "REJECTED"
  | "EXPIRED"
  | "USED";

export type PosApproval = {
  id: string;
  type: PosApprovalType;
  status: PosApprovalStatus;

  saleId?: string | null;

  amount?: string | number | null;

  reason?: string | null;

  expiresAt?: string | null;
  approvedAt?: string | null;
  usedAt?: string | null;
  createdAt?: string | null;
};

export async function requestPosApproval(payload: {
  type: PosApprovalType;
  saleId?: string | null;
  amount?: number | null;
  reason?: string | null;
  context?: Record<string, unknown> | null;
}) {
  return apiRequest<{
    message: string;
    approval: PosApproval;
  }>("/pos-approvals", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function getPosApprovalStatus(
  approvalId: string,
) {
  return apiRequest<{
    approval: PosApproval;
  }>(
    `/pos-approvals/${encodeURIComponent(
      approvalId,
    )}/status`,
  );
}

/*
|--------------------------------------------------------------------------
| CASH MOVEMENTS
|--------------------------------------------------------------------------
*/

export type PosCashMovementType =
  | "CASH_IN"
  | "CASH_OUT"
  | "ADJUSTMENT"
  | "REFUND"
  | "OPENING_FLOAT";

export type PosCashMovement = {
  id: string;
  type: PosCashMovementType;
  amount: string | number;
  reason: string;
  reference?: string | null;
  occurredAt: string;
  createdAt: string;
};

export type PosDrawerSummary = {
  openingFloat: number;
  completedCashSales: number;
  cashInTotal: number;
  cashOutTotal: number;
  cashRefundTotal: number;
  adjustmentTotal: number;
  expectedCash: number;
};

export type CurrentCashMovementsResponse = {
  session: {
    id: string;
    sessionNo: string;
    status: string;
    businessDate: string;
    openedAt: string;
    openingFloat: string | number;
  } | null;

  movements: PosCashMovement[];

  drawer: PosDrawerSummary | null;
};

export async function getCurrentPosCashMovements() {
  return apiRequest<CurrentCashMovementsResponse>(
    "/pos-cash-movements/current",
  );
}

export async function createPosCashMovement(payload: {
  posSessionId: string;
  type: "CASH_IN" | "CASH_OUT" | "ADJUSTMENT";
  amount: number;
  reason: string;
  reference?: string | null;
}) {
  return apiRequest<{
    message: string;
    movement: PosCashMovement;
    drawer?: {
      before?: number;
      after?: number;
      expectedCash?: number;
    };
  }>("/pos-cash-movements", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
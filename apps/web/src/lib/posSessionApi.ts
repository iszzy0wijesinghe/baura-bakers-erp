/** @format */

import { apiRequest } from "./api";

export type PosSessionStatus =
  | "OPEN"
  | "CLOSING"
  | "PENDING_APPROVAL"
  | "CLOSED";

export type DayEndStatus =
  | "DRAFT"
  | "SUBMITTED"
  | "APPROVED"
  | "REJECTED";

export type PosCountType =
  | "OPENING"
  | "CLOSING";

export type PosDenominationInput = {
  denominationValue: number;
  quantity: number;
};

export type PosCashCount = {
  id: string;
  posSessionId: string;
  countType: PosCountType;
  denominationValue: string | number;
  quantity: number;
  amount: string | number;
  countedById: string;
  countedAt: string;
  createdAt: string;
};

export type PosDayEnd = {
  id: string;
  posSessionId: string;
  status: DayEndStatus;

  grossSalesTotal: string | number;
  discountTotal: string | number;
  netSalesTotal: string | number;

  cashSalesTotal: string | number;
  cardSalesTotal: string | number;
  bankTransferTotal: string | number;
  otherPaymentTotal: string | number;

  refundTotal: string | number;
  voidTotal: string | number;

  cashInTotal: string | number;
  cashOutTotal: string | number;

  expectedCash: string | number;
  countedCash: string | number;
  variance: string | number;

  invoiceCount: number;

  varianceReason?: string | null;
  cashierNote?: string | null;
  managerNote?: string | null;

  submittedById?: string | null;
  submittedAt?: string | null;

  approvedById?: string | null;
  approvedAt?: string | null;

  rejectedAt?: string | null;

  createdAt: string;
  updatedAt: string;
};

export type PosSession = {
  id: string;
  sessionNo: string;
  businessDate: string;
  status: PosSessionStatus;

  openedById: string;
  openedAt: string;

  openingFloat: string | number;
  openingNote?: string | null;

  closingStartedAt?: string | null;

  closedById?: string | null;
  closedAt?: string | null;

  createdAt: string;
  updatedAt: string;

  cashCounts?: PosCashCount[];
  dayEnd?: PosDayEnd | null;
};

export type PosBusinessDay = {
  businessDate: string;
  isOpenDay: boolean;
  isWithinOpeningHours: boolean;
  reason?: string | null;

  [key: string]: unknown;
};

export type CurrentPosSessionResponse = {
  session: PosSession | null;
  business: PosBusinessDay;
};

export type OpenPosSessionPayload = {
  openingNote?: string | null;
  denominations: PosDenominationInput[];
};

export type OpenPosSessionResponse = {
  message: string;
  session: PosSession;
  business: PosBusinessDay;
};

export type StartDayEndPayload = {
  cashierNote?: string | null;
};

export type DayEndTotals = {
  grossSalesTotal: number;
  discountTotal: number;
  netSalesTotal: number;

  cashSalesTotal: number;
  cardSalesTotal: number;
  bankTransferTotal: number;
  otherPaymentTotal: number;

  refundTotal: number;
  voidTotal: number;

  cashInTotal: number;
  cashOutTotal: number;

  expectedCash: number;
  invoiceCount: number;
};

export type DayEndPreviewResponse = {
  session: PosSession;
  totals: DayEndTotals;
};

export type StartDayEndResponse = {
  message: string;

  sessionId: string;
  sessionNo: string;

  status: "CLOSING";

  dayEnd: PosDayEnd;
  totals: DayEndTotals;
};

export type SubmitDayEndPayload = {
  denominations: PosDenominationInput[];
  cashierNote?: string | null;
  varianceReason?: string | null;
};

export type ClosingDenomination = {
  denominationValue: number;
  quantity: number;
  amount: number;
};

export type SubmitDayEndResponse = {
  message: string;

  sessionId: string;
  sessionNo: string;

  sessionStatus: "PENDING_APPROVAL";

  dayEnd: PosDayEnd;

  closingDenominations: ClosingDenomination[];
};

export type PendingPosDayEndsResponse = {
  dayEnds: PosDayEnd[];
};

export type ApprovePosDayEndPayload = {
  managerNote?: string | null;
};

export type ApprovePosDayEndResponse = {
  message: string;

  sessionId: string;
  sessionNo: string;

  sessionStatus: "CLOSED";

  dayEnd: PosDayEnd;
};

export type RejectPosDayEndPayload = {
  managerNote: string;
};

export type RejectPosDayEndResponse = {
  message: string;

  sessionId: string;
  sessionNo: string;

  sessionStatus: "CLOSING";

  dayEnd: PosDayEnd;
};

/*
|--------------------------------------------------------------------------
| CURRENT SESSION
|--------------------------------------------------------------------------
*/

export async function getCurrentPosSession() {
  return apiRequest<CurrentPosSessionResponse>(
    "/pos-sessions/current",
  );
}

/*
|--------------------------------------------------------------------------
| OPEN SESSION
|--------------------------------------------------------------------------
*/

export async function openPosSession(
  payload: OpenPosSessionPayload,
) {
  return apiRequest<OpenPosSessionResponse>(
    "/pos-sessions/open",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
}

/*
|--------------------------------------------------------------------------
| START DAY END
|--------------------------------------------------------------------------
*/

export async function startPosDayEnd(
  sessionId: string,
  payload: StartDayEndPayload = {},
) {
  return apiRequest<StartDayEndResponse>(
    `/pos-sessions/${encodeURIComponent(
      sessionId,
    )}/day-end/start`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
}

/*
|--------------------------------------------------------------------------
| DAY END PREVIEW
|--------------------------------------------------------------------------
*/

export async function getPosDayEnd(
  sessionId: string,
) {
  return apiRequest<DayEndPreviewResponse>(
    `/pos-sessions/${encodeURIComponent(
      sessionId,
    )}/day-end`,
  );
}

/*
|--------------------------------------------------------------------------
| SUBMIT DAY END
|--------------------------------------------------------------------------
*/

export async function submitPosDayEnd(
  sessionId: string,
  payload: SubmitDayEndPayload,
) {
  return apiRequest<SubmitDayEndResponse>(
    `/pos-sessions/${encodeURIComponent(
      sessionId,
    )}/day-end/submit`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
}

/*
|--------------------------------------------------------------------------
| PENDING DAY ENDS
|--------------------------------------------------------------------------
*/

export async function getPendingPosDayEnds() {
  return apiRequest<PendingPosDayEndsResponse>(
    "/pos-sessions/day-end/pending",
  );
}

/*
|--------------------------------------------------------------------------
| APPROVE DAY END
|--------------------------------------------------------------------------
*/

export async function approvePosDayEnd(
  sessionId: string,
  payload: ApprovePosDayEndPayload = {},
) {
  return apiRequest<ApprovePosDayEndResponse>(
    `/pos-sessions/${encodeURIComponent(
      sessionId,
    )}/day-end/approve`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
}

/*
|--------------------------------------------------------------------------
| REJECT DAY END
|--------------------------------------------------------------------------
*/

export async function rejectPosDayEnd(
  sessionId: string,
  payload: RejectPosDayEndPayload,
) {
  return apiRequest<RejectPosDayEndResponse>(
    `/pos-sessions/${encodeURIComponent(
      sessionId,
    )}/day-end/reject`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
}
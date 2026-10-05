import {
  apiRequest,
} from "./api";

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

  countType:
    PosCountType;

  denominationValue:
    string | number;

  quantity: number;

  amount:
    string | number;

  countedById: string;
  countedAt: string;
  createdAt: string;
};

export type PosDayEnd = {
  id: string;
  posSessionId: string;

  status:
    DayEndStatus;

  grossSalesTotal:
    string | number;

  discountTotal:
    string | number;

  netSalesTotal:
    string | number;

  cashSalesTotal:
    string | number;

  cardSalesTotal:
    string | number;

  bankTransferTotal:
    string | number;

  otherPaymentTotal:
    string | number;

  refundTotal:
    string | number;

  voidTotal:
    string | number;

  cashInTotal:
    string | number;

  cashOutTotal:
    string | number;

  expectedCash:
    string | number;

  countedCash:
    string | number;

  variance:
    string | number;

  invoiceCount: number;

  varianceReason:
    string | null;

  cashierNote:
    string | null;

  managerNote:
    string | null;

  submittedById:
    string | null;

  submittedAt:
    string | null;

  approvedById:
    string | null;

  approvedAt:
    string | null;

  rejectedAt:
    string | null;

  createdAt: string;
  updatedAt: string;
};

export type PosSession = {
  id: string;
  sessionNo: string;

  businessDate:
    string;

  status:
    PosSessionStatus;

  openedById:
    string;

  openedAt:
    string;

  openingFloat:
    string | number;

  openingNote:
    string | null;

  closingStartedAt:
    string | null;

  closedById:
    string | null;

  closedAt:
    string | null;

  createdAt:
    string;

  updatedAt:
    string;

  cashCounts?:
    PosCashCount[];

  dayEnd?:
    PosDayEnd | null;
};

export type PosBusinessDay = {
  businessDate:
    string;

  isOpenDay:
    boolean;

  isWithinOpeningHours:
    boolean;

  reason?:
    string | null;

  [key: string]:
    unknown;
};

export type CurrentPosSessionResponse = {
  session:
    PosSession | null;

  business:
    PosBusinessDay;
};

export type OpenPosSessionInput = {
  openingNote?:
    string | null;

  denominations:
    PosDenominationInput[];
};

export type OpenPosSessionResponse = {
  message:
    string;

  session:
    PosSession;

  business:
    PosBusinessDay;
};

export type DayEndTotals = {
  grossSalesTotal:
    number;

  discountTotal:
    number;

  netSalesTotal:
    number;

  cashSalesTotal:
    number;

  cardSalesTotal:
    number;

  bankTransferTotal:
    number;

  otherPaymentTotal:
    number;

  refundTotal:
    number;

  voidTotal:
    number;

  cashInTotal:
    number;

  cashOutTotal:
    number;

  expectedCash:
    number;

  invoiceCount:
    number;
};

export type DayEndPreviewResponse = {
  session:
    PosSession;

  totals:
    DayEndTotals;
};

export async function getCurrentPosSession() {
  return apiRequest<
    CurrentPosSessionResponse
  >(
    "/pos-sessions/current",
  );
}

export async function openPosSession(
  input:
    OpenPosSessionInput,
) {
  return apiRequest<
    OpenPosSessionResponse
  >(
    "/pos-sessions/open",
    {
      method:
        "POST",

      body:
        JSON.stringify(
          input,
        ),
    },
  );
}

export async function startPosDayEnd(
  sessionId:
    string,

  cashierNote?:
    string | null,
) {
  return apiRequest<{
    message:
      string;

    sessionId:
      string;

    sessionNo:
      string;

    status:
      "CLOSING";

    dayEnd:
      PosDayEnd;

    totals:
      DayEndTotals;
  }>(
    `/pos-sessions/${sessionId}/day-end/start`,
    {
      method:
        "POST",

      body:
        JSON.stringify({
          cashierNote:
            cashierNote ||
            null,
        }),
    },
  );
}

export async function getPosDayEnd(
  sessionId:
    string,
) {
  return apiRequest<
    DayEndPreviewResponse
  >(
    `/pos-sessions/${sessionId}/day-end`,
  );
}

export async function submitPosDayEnd(
  sessionId:
    string,

  input: {
    denominations:
      PosDenominationInput[];

    cashierNote?:
      string | null;

    varianceReason?:
      string | null;
  },
) {
  return apiRequest<{
    message:
      string;

    sessionId:
      string;

    sessionNo:
      string;

    sessionStatus:
      "PENDING_APPROVAL";

    dayEnd:
      PosDayEnd;

    closingDenominations:
      {
        denominationValue:
          number;

        quantity:
          number;

        amount:
          number;
      }[];
  }>(
    `/pos-sessions/${sessionId}/day-end/submit`,
    {
      method:
        "POST",

      body:
        JSON.stringify(
          input,
        ),
    },
  );
}

export async function getPendingPosDayEnds() {
  return apiRequest<{
    dayEnds:
      PosDayEnd[];
  }>(
    "/pos-sessions/day-end/pending",
  );
}

export async function approvePosDayEnd(
  sessionId:
    string,

  managerNote?:
    string | null,
) {
  return apiRequest(
    `/pos-sessions/${sessionId}/day-end/approve`,
    {
      method:
        "POST",

      body:
        JSON.stringify({
          managerNote:
            managerNote ||
            null,
        }),
    },
  );
}

export async function rejectPosDayEnd(
  sessionId:
    string,

  managerNote:
    string,
) {
  return apiRequest(
    `/pos-sessions/${sessionId}/day-end/reject`,
    {
      method:
        "POST",

      body:
        JSON.stringify({
          managerNote,
        }),
    },
  );
}
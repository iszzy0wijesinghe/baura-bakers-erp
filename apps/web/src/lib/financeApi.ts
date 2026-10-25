/** @format */

import { apiRequest } from "./api";
export type FinanceAccount = {
  id: string;
  code: string;
  name: string;
  type: string;
  normalBalance: string;
  parentId: string | null;
  isActive: boolean;
  allowPosting: boolean;
};
export type FinancePeriod = {
  id: string;
  number: number;
  startsOn: string;
  endsOn: string;
  status: string;
  fiscalYearId: string;
  fiscalYear?: { label: string };
};
export type FinanceYear = {
  id: string;
  label: string;
  startsOn: string;
  endsOn: string;
  periods: FinancePeriod[];
};
export type TrialBalanceRow = FinanceAccount & {
  debit: string;
  credit: string;
};
export type FinanceJournal = {
  id: string;
  journalNo: string;
  description: string;
  accountingDate: string;
  status: string;
  lines: Array<{
    id: string;
    debit: string;
    credit: string;
    account: { code: string; name: string };
  }>;
};
export type Ledger = {
  account: FinanceAccount;
  openingBalance: string;
  closingBalance: string;
  lines: Array<{
    debit: string;
    credit: string;
    balance: string;
    journal: { journalNo: string; accountingDate: string; description: string };
  }>;
};
export type FinanceReportRow = {
  id: string;
  code: string;
  name: string;
  type: string;
  normalBalance: string;
  debit: string;
  credit: string;
  balance: string;
};
export type IncomeStatement = {
  from: string;
  through: string;
  currency: string;
  revenue: FinanceReportRow[];
  expenses: FinanceReportRow[];
  revenueTotal: string;
  expenseTotal: string;
  netProfit: string;
};
export type BalanceSheet = {
  through: string;
  currency: string;
  assets: FinanceReportRow[];
  liabilities: FinanceReportRow[];
  equity: FinanceReportRow[];
  assetTotal: string;
  liabilityTotal: string;
  equityTotal: string;
  currentEarnings: string;
  liabilitiesAndEquityTotal: string;
  difference: string;
  balanced: boolean;
  note: string;
};
export type FinanceMapping = {
  id: string;
  key: string;
  accountId: string;
  isActive: boolean;
  account: Pick<FinanceAccount, "id" | "code" | "name" | "type" | "isActive" | "allowPosting">;
};
export type FinanceMappingResponse = {
  expected: Record<string, string>;
  mappings: FinanceMapping[];
};
export const financeApi = {
  accountMappings: () => apiRequest<FinanceMappingResponse>("/finance/account-mappings"),
  updateAccountMapping: (key: string, accountId: string) =>
    apiRequest<FinanceMapping>(`/finance/account-mappings/${encodeURIComponent(key)}`, {
      method: "PUT", body: JSON.stringify({ accountId }),
    }),
  incomeStatement: (from: string, through: string) =>
    apiRequest<IncomeStatement>(
      `/finance/reports/income-statement?from=${encodeURIComponent(from)}&through=${encodeURIComponent(through)}`,
    ),
  balanceSheet: (through: string) =>
    apiRequest<BalanceSheet>(
      `/finance/reports/balance-sheet?through=${encodeURIComponent(through)}`,
    ),
  years: () => apiRequest<FinanceYear[]>("/finance/years"),
  accounts: () => apiRequest<FinanceAccount[]>("/finance/accounts"),
  periods: () => apiRequest<FinancePeriod[]>("/finance/periods"),
  journals: () => apiRequest<FinanceJournal[]>("/finance/journals?limit=100"),
  trialBalance: () => apiRequest<TrialBalanceRow[]>("/finance/trial-balance"),
  ledger: (id: string) =>
    apiRequest<Ledger>(`/finance/ledger/${encodeURIComponent(id)}`),
  postJournal: (body: {
    journalNo: string;
    accountingDate: string;
    description: string;
    idempotencyKey: string;
    lines: Array<{ accountId: string; debit: string; credit: string }>;
  }) =>
    apiRequest<FinanceJournal>("/finance/journals/post", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  reverseJournal: (
    id: string,
    body: { journalNo: string; accountingDate: string },
  ) =>
    apiRequest<FinanceJournal>(
      `/finance/journals/${encodeURIComponent(id)}/reverse`,
      { method: "POST", body: JSON.stringify(body) },
    ),
  updateAccount: (
    id: string,
    body: { name?: string; isActive?: boolean; allowPosting?: boolean },
  ) =>
    apiRequest<FinanceAccount>(`/finance/accounts/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  createAccount: (body: {
    code: string;
    name: string;
    type: string;
    normalBalance: string;
    parentId?: string | null;
  }) =>
    apiRequest<FinanceAccount>("/finance/accounts", {
      method: "POST",
      body: JSON.stringify(body),
    }),
};

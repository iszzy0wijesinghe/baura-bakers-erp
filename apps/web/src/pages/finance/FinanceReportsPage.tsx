/** @format */

import { useState } from "react";
import { Link } from "react-router-dom";
import { AppLayout } from "../../layouts/AppLayout";
import {
  financeApi,
  type FinanceReportRow,
  type IncomeStatement,
  type BalanceSheet,
} from "../../lib/financeApi";

const panel =
  "rounded-[18px] border border-bauraBorder bg-white p-5 shadow-[0_6px_22px_rgba(63,46,36,0.035)]";
const field =
  "h-10 rounded-xl border border-bauraBorder bg-white px-3 text-sm outline-none focus:border-bauraGold";
const action =
  "rounded-xl bg-bauraPrimary px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50";
const money = (value: string | number) =>
  new Intl.NumberFormat("en-LK", { style: "currency", currency: "LKR" }).format(
    Number(value),
  );
const today = () =>
  new Date().toLocaleDateString("en-CA", {
    timeZone: "Asia/Colombo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
const fiscalStart = (through: string) =>
  `${Number(through.slice(0, 4)) - (Number(through.slice(5, 7)) < 4 ? 1 : 0)}-04-01`;
function Section({
  title,
  rows,
  total,
  totalLabel,
}: {
  title: string;
  rows: FinanceReportRow[];
  total: string;
  totalLabel: string;
}) {
  return (
    <section className={panel}>
      <h3 className="mb-4 text-base font-bold text-bauraInk">{title}</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-bauraBorder text-xs text-bauraMuted">
              <th className="py-3">Code</th>
              <th>Account</th>
              <th className="text-right">Balance (LKR)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-bauraBorder/60">
                <td className="py-3 font-medium">{row.code}</td>
                <td>{row.name}</td>
                <td className="text-right tabular-nums">
                  {money(row.balance)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && (
          <p className="py-4 text-sm text-bauraMuted">
            No accounts in this category.
          </p>
        )}
      </div>
      <div className="mt-4 flex justify-between border-t border-bauraBorder pt-4 text-sm font-bold">
        <span>{totalLabel}</span>
        <span className="tabular-nums">{money(total)}</span>
      </div>
    </section>
  );
}

// Export only the report data already retrieved through permission-protected API calls.
// CSV values are escaped and formula-looking values are prefixed to avoid spreadsheet injection.
function csvCell(value: string | number): string {
  const raw = String(value);
  const safe =
    /^[\s]*[=+@\-\t\r]/.test(raw) && !/^-?\d+(?:\.\d+)?$/.test(raw)
      ? "'" + raw
      : raw;
  return '"' + safe.replace(/"/g, '""') + '"';
}
function downloadCsv(filename: string, rows: Array<Array<string | number>>) {
  const csv =
    "\uFEFF" +
    rows.map((row) => row.map(csvCell).join(",")).join("\r\n") +
    "\r\n";
  const url = URL.createObjectURL(
    new Blob([csv], { type: "text/csv;charset=utf-8" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function exportIncome(report: IncomeStatement) {
  const rows: Array<Array<string | number>> = [
    ["Baura Bakers - Income Statement"],
    ["From", report.from, "Through", report.through],
    ["Currency", "LKR"],
    ["Category", "Account code", "Account", "Amount (LKR)"],
    ...report.revenue.map((r) => ["Revenue", r.code, r.name, r.balance]),
    ["", "", "Total revenue", report.revenueTotal],
    ...report.expenses.map((r) => ["Expense", r.code, r.name, r.balance]),
    ["", "", "Total expenses", report.expenseTotal],
    ["", "", "Net profit / (loss)", report.netProfit],
    [
      "Notice",
      "Finance journals only; excludes unintegrated POS, purchasing and production",
    ],
  ];
  downloadCsv(
    `baura-income-statement-${report.from}-to-${report.through}.csv`,
    rows,
  );
}
function exportBalance(report: BalanceSheet) {
  const rows: Array<Array<string | number>> = [
    ["Baura Bakers - Balance Sheet"],
    ["As at", report.through],
    ["Currency", "LKR"],
    ["Category", "Account code", "Account", "Amount (LKR)"],
    ...report.assets.map((r) => ["Asset", r.code, r.name, r.balance]),
    ["", "", "Total assets", report.assetTotal],
    ...report.liabilities.map((r) => ["Liability", r.code, r.name, r.balance]),
    ["", "", "Total liabilities", report.liabilityTotal],
    ...report.equity.map((r) => ["Equity", r.code, r.name, r.balance]),
    ["", "", "Recorded equity", report.equityTotal],
    ["", "", "Accumulated earnings", report.currentEarnings],
    [
      "",
      "",
      "Liabilities + equity + earnings",
      report.liabilitiesAndEquityTotal,
    ],
    ["", "", "Balance sheet difference", report.difference],
    ["", "", "Reconciles", report.balanced ? "YES" : "NO"],
    [
      "Notice",
      "Finance journals only; excludes unintegrated POS, purchasing and production",
    ],
  ];
  downloadCsv(`baura-balance-sheet-${report.through}.csv`, rows);
}

export function FinanceReportsPage() {
  const [through, setThrough] = useState(today);
  const [from, setFrom] = useState(() => fiscalStart(today()));
  const [income, setIncome] = useState<IncomeStatement | null>(null);
  const [balance, setBalance] = useState<BalanceSheet | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [loadedDates, setLoadedDates] = useState("");
  async function load(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setIncome(null);
    setBalance(null);
    setLoadedDates("");
    if (from > through) {
      setError("Start date must be on or before the end date.");
      return;
    }
    setLoading(true);
    try {
      const [i, b] = await Promise.all([
        financeApi.incomeStatement(from, through),
        financeApi.balanceSheet(through),
      ]);
      setIncome(i);
      setBalance(b);
      setLoadedDates(`${from} to ${through}`);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Unable to load financial reports.",
      );
    } finally {
      setLoading(false);
    }
  }
  return (
    <AppLayout
      title="Financial Statements"
      subtitle="Income statement and balance sheet · posted ledger transactions"
      activeItem="Finance Management">
      <nav className="mb-5 flex flex-wrap gap-2 text-xs font-semibold">
        <Link
          className="rounded-xl border border-bauraBorder bg-white px-4 py-2"
          to="/dashboard/finance">
          Finance overview
        </Link>
        <Link
          className="rounded-xl border border-bauraBorder bg-white px-4 py-2"
          to="/dashboard/finance/ledger">
          General ledger
        </Link>
        <Link
          className="rounded-xl border border-bauraBorder bg-white px-4 py-2"
          to="/dashboard/finance/journals">
          Journals
        </Link>
      </nav>
      <form
        onSubmit={load}
        className={`${panel} mb-5 flex flex-wrap items-end gap-4`}>
        <label className="flex flex-col gap-2 text-xs font-semibold">
          From
          <input
            className={field}
            type="date"
            required
            value={from}
            max={through}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-2 text-xs font-semibold">
          Through
          <input
            className={field}
            type="date"
            required
            value={through}
            onChange={(e) => setThrough(e.target.value)}
          />
        </label>
        <button className={action} disabled={loading}>
          {loading ? "Generating…" : "Generate statements"}
        </button>
      </form>
      <p className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        These statements include posted Finance journal entries only. POS,
        purchasing, and production activity is not yet automatically reflected.
        Do not use these reports as complete business financial statements until
        integration and reconciliation are finished.
      </p>
      {error && (
        <p
          role="alert"
          className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </p>
      )}
      {!income && !balance && !loading && (
        <p className="text-sm text-bauraMuted">
          Choose a date range and select Generate statements.
        </p>
      )}
      {income && balance && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-bold text-bauraInk">
              Income Statement{" "}
              <span className="text-xs font-normal text-bauraMuted">
                ({loadedDates})
              </span>
            </h2>
            <div className="flex items-center gap-2">
              <span className="text-xs text-bauraMuted">Currency: LKR</span>
              <button
                type="button"
                onClick={() => exportIncome(income)}
                className="rounded-xl border border-bauraBorder bg-white px-3 py-2 text-xs font-semibold text-bauraPrimary hover:bg-bauraSurface">
                Export income CSV
              </button>
              <button
                type="button"
                onClick={() => exportBalance(balance)}
                className="rounded-xl border border-bauraBorder bg-white px-3 py-2 text-xs font-semibold text-bauraPrimary hover:bg-bauraSurface">
                Export balance CSV
              </button>
            </div>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <Section
              title="Revenue"
              rows={income.revenue}
              total={income.revenueTotal}
              totalLabel="Total revenue"
            />
            <Section
              title="Expenses"
              rows={income.expenses}
              total={income.expenseTotal}
              totalLabel="Total expenses"
            />
          </div>
          <div className={panel}>
            <div className="flex justify-between text-base font-bold">
              <span>Net profit / (loss)</span>
              <span className="tabular-nums">{money(income.netProfit)}</span>
            </div>
          </div>
          <h2 className="text-lg font-bold text-bauraInk">
            Balance Sheet{" "}
            <span className="text-xs font-normal text-bauraMuted">
              (as at {through})
            </span>
          </h2>
          <div className="grid gap-4 lg:grid-cols-2">
            <Section
              title="Assets"
              rows={balance.assets}
              total={balance.assetTotal}
              totalLabel="Total assets"
            />
            <div className="space-y-4">
              <Section
                title="Liabilities"
                rows={balance.liabilities}
                total={balance.liabilityTotal}
                totalLabel="Total liabilities"
              />
              <Section
                title="Equity"
                rows={balance.equity}
                total={balance.equityTotal}
                totalLabel="Recorded equity"
              />
            </div>
          </div>
          <div className={panel}>
            <div className="flex justify-between gap-4 text-sm">
              <span>Accumulated earnings in ledger</span>
              <strong>{money(balance.currentEarnings)}</strong>
            </div>
            <div className="mt-3 flex justify-between gap-4 text-sm">
              <span>Liabilities + equity + earnings</span>
              <strong>{money(balance.liabilitiesAndEquityTotal)}</strong>
            </div>
            <div className="mt-4 flex justify-between gap-4 border-t border-bauraBorder pt-4 text-sm font-bold">
              <span>Balance sheet difference</span>
              <span>{money(balance.difference)}</span>
            </div>
            <p
              role="status"
              className={`mt-3 text-sm font-semibold ${balance.balanced ? "text-emerald-700" : "text-red-700"}`}>
              {balance.balanced
                ? "Balance sheet reconciles"
                : "Balance sheet does not reconcile — review posted journals"}
            </p>
            <p className="mt-3 text-xs text-bauraMuted">{balance.note}</p>
          </div>
        </div>
      )}
    </AppLayout>
  );
}

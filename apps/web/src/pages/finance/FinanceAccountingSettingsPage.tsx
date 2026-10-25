import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { RefreshCw, Save, ShieldCheck } from "lucide-react";
import { AppLayout } from "../../layouts/AppLayout";
import { useAuth } from "../../auth/AuthContext";
import { financeApi, type FinanceAccount, type FinanceMappingResponse } from "../../lib/financeApi";

const descriptions: Record<string, string> = {
  POS_PAYMENT_CASH: "Cash collected at POS",
  POS_PAYMENT_CARD: "Card payments awaiting bank settlement",
  POS_PAYMENT_BANK_TRANSFER: "Transfers awaiting bank confirmation",
  POS_PAYMENT_ONLINE: "Online payments awaiting settlement",
  POS_PAYMENT_OTHER: "Other payment receivables",
  POS_SALES_REVENUE: "Revenue recognized on completed POS sales",
  POS_COGS: "Cost of goods sold",
  POS_FINISHED_GOODS_INVENTORY: "Finished goods inventory reduction",
};
const errorMessage = (error: unknown) => error instanceof Error ? error.message : "Unexpected error";

export function FinanceAccountingSettingsPage() {
  const { hasAnyPermission } = useAuth();
  const canManage = hasAnyPermission(["erp.finance.manage"]);
  const [accounts, setAccounts] = useState<FinanceAccount[]>([]);
  const [response, setResponse] = useState<FinanceMappingResponse | null>(null);
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const reload = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const [accountsData, mappingsData] = await Promise.all([financeApi.accounts(), financeApi.accountMappings()]);
      setAccounts(accountsData); setResponse(mappingsData);
      setSelected(Object.fromEntries(mappingsData.mappings.map(item => [item.key, item.accountId])));
    } catch (err) { setError(errorMessage(err)); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void reload(); }, [reload]);
  const configured = useMemo(() => new Map(response?.mappings.map(m => [m.key, m]) ?? []), [response]);
  const entries = Object.entries(response?.expected ?? {});
  const missing = entries.filter(([key]) => !configured.get(key)?.isActive).length;

  async function save(key: string) {
    const accountId = selected[key];
    if (!accountId || !canManage) return;
    setBusyKey(key); setError(""); setNotice("");
    try {
      await financeApi.updateAccountMapping(key, accountId);
      setNotice(`${descriptions[key] ?? key} mapping saved.`);
      await reload();
    } catch (err) { setError(errorMessage(err)); }
    finally { setBusyKey(""); }
  }

  return <AppLayout title="Accounting Settings" subtitle="Database-managed POS account mappings" activeItem="Finance Management" actions={<button type="button" onClick={() => void reload()} className="inline-flex items-center gap-2 rounded-xl border border-bauraBorder bg-white px-4 py-2 text-xs font-semibold"><RefreshCw size={14}/> Refresh</button>}>
    <nav className="mb-5 flex flex-wrap gap-2">
      <Link to="/dashboard/finance" className="rounded-xl border border-bauraBorder bg-white px-4 py-2 text-xs font-semibold">Overview</Link>
      <Link to="/dashboard/finance/accounts" className="rounded-xl border border-bauraBorder bg-white px-4 py-2 text-xs font-semibold">Chart of Accounts</Link>
      <Link to="/dashboard/finance/settings" className="rounded-xl bg-bauraPrimary px-4 py-2 text-xs font-semibold text-white">Accounting Settings</Link>
    </nav>
    <div className="rounded-[18px] border border-bauraBorder bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><h2 className="text-base font-bold text-bauraInk">Automatic journal account mappings</h2><p className="mt-1 text-xs text-bauraMuted">Choose the account used for each posting purpose. Existing journals are never rewritten.</p></div>
        <div className="rounded-xl bg-[#faf7f2] px-4 py-3 text-xs font-semibold text-bauraInk"><ShieldCheck size={16} className="mb-1"/>{response ? `${entries.length - missing} / ${entries.length} configured` : "Loading"}</div>
      </div>
      {missing > 0 && !loading && <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">{missing} mappings are missing or inactive. Transactions using these payment methods cannot be posted automatically until configured.</p>}
      {error && <p role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800">{error}</p>}
      {notice && <p role="status" className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">{notice}</p>}
      {loading ? <p className="py-8 text-sm text-bauraMuted">Loading accounting configuration…</p> : <div className="mt-5 space-y-3">{entries.map(([key, type]) => {
        const current = configured.get(key);
        const options = accounts.filter(a => a.type === type && a.isActive && a.allowPosting);
        const selectedAccount = selected[key] ?? "";
        const changed = selectedAccount !== (current?.accountId ?? "");
        return <div key={key} className="grid gap-3 rounded-xl border border-bauraBorder p-4 lg:grid-cols-[minmax(0,1fr)_minmax(240px,1fr)_auto] lg:items-center">
          <div><p className="text-sm font-semibold text-bauraInk">{descriptions[key] ?? key}</p><p className="mt-1 text-[11px] text-bauraMuted">{key} · {type}</p><p className={`mt-1 text-[11px] font-semibold ${current?.isActive ? "text-emerald-700" : "text-amber-700"}`}>{current?.isActive ? `Current: ${current.account.code} — ${current.account.name}` : "Not configured"}</p></div>
          <select aria-label={`Account for ${key}`} className="h-11 w-full rounded-xl border border-bauraBorder bg-white px-3 text-xs outline-none focus:border-bauraGold" value={selectedAccount} onChange={e => setSelected(prev => ({...prev, [key]: e.target.value}))} disabled={!canManage || !!busyKey}>
            <option value="">Select an account…</option>{options.map(a => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
          </select>
          <button type="button" onClick={() => void save(key)} disabled={!canManage || !selectedAccount || !!busyKey || (!changed && current?.isActive)} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-bauraPrimary px-4 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"><Save size={14}/>{busyKey === key ? "Saving…" : "Save"}</button>
        </div>;
      })}</div>}
      {!canManage && <p className="mt-4 text-xs text-bauraMuted">You have read-only access. Finance administrator permission is required to change mappings.</p>}
      <p className="mt-5 text-xs text-bauraMuted">Only active, postable accounts of the required type can be selected. Card and online payments should use clearing accounts until settled. Changes affect future postings only.</p>
    </div>
  </AppLayout>;
}

import { useCallback, useEffect, useMemo, useState } from "react";
import { AppLayout } from "../../layouts/AppLayout";
import { useAuth } from "../../auth/AuthContext";
import { apiRequest } from "../../lib/api";
import { financeApi, type FinanceAccount, type FinanceJournal } from "../../lib/financeApi";

type Kind = "EXPENSE" | "TRANSFER";
type Operation = FinanceJournal & { sourceType?: Kind; lines: Array<{ debit: string; credit: string; account: { code: string; name: string } }> };
const field = "w-full rounded-xl border border-bauraBorder bg-white px-3 py-2.5 text-sm outline-none focus:border-bauraGold";
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Colombo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const lkr = (amount: string | number) => new Intl.NumberFormat("en-LK", { style: "currency", currency: "LKR" }).format(Number(amount));
const err = (e: unknown) => e instanceof Error ? e.message : "Request failed";

export function FinanceOperationsPage() {
  const { hasAnyPermission } = useAuth();
  const canPost = hasAnyPermission(["erp.finance.journals.post"]);
  const [kind, setKind] = useState<Kind>("EXPENSE");
  const [accounts, setAccounts] = useState<FinanceAccount[]>([]);
  const [records, setRecords] = useState<Operation[]>([]);
  const [serverEnabled, setServerEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [form, setForm] = useState({ accountingDate: today(), reference: "", description: "", amount: "", expenseAccountId: "", fromAccountId: "", toAccountId: "" });
  const clientEnabled = import.meta.env.VITE_FINANCE_ENABLE_POSTING === "true";
  const postingEnabled = clientEnabled && serverEnabled && canPost;
  const assetAccounts = useMemo(() => accounts.filter(a => a.type === "ASSET" && a.isActive && a.allowPosting), [accounts]);
  const expenseAccounts = useMemo(() => accounts.filter(a => a.type === "EXPENSE" && a.isActive && a.allowPosting), [accounts]);
  const load = useCallback(async () => {
    try {
      const [a, r, s] = await Promise.all([
        financeApi.accounts(),
        apiRequest<Operation[]>("/finance/operations?limit=100"),
        apiRequest<{ enabled: boolean }>("/finance/operations/status")
      ]);
      setAccounts(a); setRecords(r); setServerEnabled(s.enabled); setError("");
    } catch (e) { setError(err(e)); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const set = (name: keyof typeof form, value: string) => setForm(old => ({ ...old, [name]: value }));
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!postingEnabled || busy) return;
    if (!/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(form.amount) || Number(form.amount) <= 0) { setError("Enter a positive amount with up to 2 decimals."); return; }
    if (kind === "TRANSFER" && form.toAccountId === form.fromAccountId) { setError("Select different source and destination accounts."); return; }
    setBusy(true); setError(""); setSuccess("");
    try {
      await apiRequest(`/finance/operations/${kind === "EXPENSE" ? "expenses" : "transfers"}`, {
        method: "POST", body: JSON.stringify({ ...form, idempotencyKey: crypto.randomUUID() })
      });
      setSuccess(`${kind === "EXPENSE" ? "Expense" : "Transfer"} recorded successfully.`);
      setForm(old => ({ ...old, reference: "", description: "", amount: "" }));
      await load();
    } catch (e) { setError(err(e)); }
    finally { setBusy(false); }
  };
  return <AppLayout>
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-8">
      <div><p className="text-xs font-semibold uppercase tracking-widest text-bauraGold">Finance Management</p><h1 className="mt-1 text-2xl font-bold text-bauraPrimary">Expenses & Cash / Bank Transfers</h1><p className="mt-2 text-sm text-slate-500">Double-entry transactions in LKR. Existing POS and inventory records are not modified.</p></div>
      {!postingEnabled && <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">Posting is locked until accounting tests pass. Read-only transaction history remains available. Enabling requires administrator permission and both backend and frontend posting flags.</div>}
      {error && <div role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</div>}
      {success && <div role="status" className="rounded-xl bg-green-50 p-4 text-sm text-green-700">{success}</div>}
      <div className="grid gap-6 lg:grid-cols-[1fr_1.15fr]">
        <section className="rounded-2xl border border-bauraBorder bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-bauraPrimary">New transaction</h2>
          <div className="mb-4 flex gap-2">{(["EXPENSE", "TRANSFER"] as const).map(value => <button key={value} type="button" onClick={() => setKind(value)} className={`rounded-xl px-4 py-2 text-sm font-semibold ${kind === value ? "bg-bauraPrimary text-white" : "bg-slate-100 text-slate-600"}`}>{value === "EXPENSE" ? "Expense" : "Cash / Bank Transfer"}</button>)}</div>
          <form onSubmit={submit} className="space-y-3">
            <label className="block text-sm">Accounting date<input className={`${field} mt-1`} type="date" required value={form.accountingDate} onChange={e => set("accountingDate", e.target.value)} /></label>
            <label className="block text-sm">Unique reference<input className={`${field} mt-1`} required minLength={4} maxLength={40} pattern="[A-Za-z0-9._/-]+" placeholder="EXP-2026-001" value={form.reference} onChange={e => set("reference", e.target.value)} /></label>
            <label className="block text-sm">Description<input className={`${field} mt-1`} required maxLength={500} value={form.description} onChange={e => set("description", e.target.value)} /></label>
            <label className="block text-sm">Amount (LKR)<input className={`${field} mt-1`} required inputMode="decimal" placeholder="0.00" value={form.amount} onChange={e => set("amount", e.target.value)} /></label>
            {kind === "EXPENSE" && <label className="block text-sm">Expense category<select className={`${field} mt-1`} required value={form.expenseAccountId} onChange={e => set("expenseAccountId", e.target.value)}><option value="">Select expense account</option>{expenseAccounts.map(a => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}</select></label>}
            <label className="block text-sm">{kind === "EXPENSE" ? "Paid from" : "Transfer from"}<select className={`${field} mt-1`} required value={form.fromAccountId} onChange={e => set("fromAccountId", e.target.value)}><option value="">Select asset account</option>{assetAccounts.map(a => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}</select></label>
            {kind === "TRANSFER" && <label className="block text-sm">Transfer to<select className={`${field} mt-1`} required value={form.toAccountId} onChange={e => set("toAccountId", e.target.value)}><option value="">Select destination account</option>{assetAccounts.map(a => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}</select></label>}
            <button type="submit" disabled={!postingEnabled || busy} className="w-full rounded-xl bg-bauraPrimary px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40">{busy ? "Saving…" : kind === "EXPENSE" ? "Record Expense" : "Record Transfer"}</button>
          </form>
        </section>
        <section className="rounded-2xl border border-bauraBorder bg-white p-5 shadow-sm"><div className="mb-4 flex items-center justify-between"><h2 className="text-lg font-semibold text-bauraPrimary">Transaction history</h2><button type="button" onClick={() => void load()} className="text-sm font-semibold text-bauraPrimary">Refresh</button></div>
          <div className="space-y-3">{records.length === 0 && <p className="text-sm text-slate-500">No expense or transfer journals recorded yet.</p>}{records.map(j => <article key={j.id} className="rounded-xl border border-bauraBorder p-3"><div className="flex items-start justify-between gap-3"><div><p className="font-semibold text-bauraPrimary">{j.journalNo}</p><p className="text-xs text-slate-500">{j.sourceType} · {String(j.accountingDate).slice(0, 10)} · {j.status}</p></div><strong className="text-sm">{lkr(j.lines?.reduce((sum, line) => sum + Number(line.debit), 0) ?? 0)}</strong></div><p className="mt-2 text-sm text-slate-600">{j.description}</p><div className="mt-2 text-xs text-slate-500">{j.lines?.map(line => `${line.account.code}: ${Number(line.debit) > 0 ? "DR" : "CR"} ${lkr(Number(line.debit) || Number(line.credit))}`).join(" · ")}</div></article>)}</div>
        </section>
      </div>
    </div>
  </AppLayout>;
}

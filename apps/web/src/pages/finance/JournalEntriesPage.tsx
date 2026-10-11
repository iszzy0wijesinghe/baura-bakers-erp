import { Fragment, useEffect, useMemo, useState } from "react";
import { Plus, RefreshCw, Trash2, AlertTriangle } from "lucide-react";
import { AppLayout } from "../../layouts/AppLayout";
import { useAuth } from "../../auth/AuthContext";
import { financeApi, type FinanceAccount, type FinanceJournal, type FinancePeriod } from "../../lib/financeApi";

type Line = { key: number; accountId: string; side: "DEBIT" | "CREDIT"; amount: string };
const field = "h-10 w-full rounded-xl border border-bauraBorder bg-white px-3 text-sm outline-none focus:border-bauraGold";
const btn = "inline-flex items-center justify-center gap-2 rounded-xl bg-bauraPrimary px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40";
const fmt = (n: number) => new Intl.NumberFormat("en-LK", { style: "currency", currency: "LKR" }).format(n / 100);
const parseCents = (s: string): number | null => {
  if (!/^\d{1,12}(\.\d{1,2})?$/.test(s.trim())) return null;
  const [whole, frac = ""] = s.trim().split(".");
  const n = Number(whole) * 100 + Number(frac.padEnd(2, "0"));
  return Number.isSafeInteger(n) ? n : null;
};
const errorMessage = (e: unknown) => e instanceof Error ? e.message : "Finance request failed";
const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Colombo", year: "numeric", month: "2-digit", day: "2-digit" });
const newLines = (): Line[] => [{ key: 1, accountId: "", side: "DEBIT", amount: "" }, { key: 2, accountId: "", side: "CREDIT", amount: "" }];
const postingEnabled = import.meta.env.VITE_FINANCE_ENABLE_POSTING === "true";

export function JournalEntriesPage() {
  const { hasAnyPermission } = useAuth();
  const canPost = postingEnabled && hasAnyPermission(["erp.finance.journals.post"]);
  const [journals, setJournals] = useState<FinanceJournal[]>([]);
  const [accounts, setAccounts] = useState<FinanceAccount[]>([]);
  const [periods, setPeriods] = useState<FinancePeriod[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [journalNo, setJournalNo] = useState("");
  const [accountingDate, setAccountingDate] = useState(today());
  const [description, setDescription] = useState("");
  const [lines, setLines] = useState<Line[]>(newLines);
  const [requestKey, setRequestKey] = useState(() => crypto.randomUUID());
  const [expanded, setExpanded] = useState<string | null>(null);

  async function reload() {
    setLoading(true); setError("");
    try {
      const [js, ac, ps] = await Promise.all([financeApi.journals(), financeApi.accounts(), financeApi.periods()]);
      setJournals(js); setAccounts(ac); setPeriods(ps);
    } catch (e) { setError(errorMessage(e)); }
    finally { setLoading(false); }
  }
  useEffect(() => { void reload(); }, []);
  const postable = useMemo(() => accounts.filter(a => a.isActive && a.allowPosting), [accounts]);
  const totals = useMemo(() => lines.reduce((t, line) => {
    const amount = parseCents(line.amount);
    if (amount !== null && amount > 0) t[line.side] += amount;
    return t;
  }, { DEBIT: 0, CREDIT: 0 }), [lines]);
  const openPeriod = periods.some(p => p.status === "OPEN" && accountingDate >= p.startsOn.slice(0, 10) && accountingDate <= p.endsOn.slice(0, 10));
  const linesValid = lines.length >= 2 && lines.length <= 100 && lines.every(l => l.accountId && postable.some(a => a.id === l.accountId) && (parseCents(l.amount) ?? 0) > 0);
  const formValid = /^[A-Za-z0-9._/-]{4,40}$/.test(journalNo) && description.trim().length > 0 && description.length <= 500 && linesValid && totals.DEBIT === totals.CREDIT && totals.DEBIT > 0 && openPeriod;
  function updateLine(key: number, patch: Partial<Line>) { setLines(v => v.map(l => l.key === key ? { ...l, ...patch } : l)); }
  function reset() { setLines(newLines()); setJournalNo(""); setDescription(""); setAccountingDate(today()); setRequestKey(crypto.randomUUID()); }
  async function submit(e: React.FormEvent) {
    e.preventDefault(); if (!canPost || !formValid || saving) return;
    if (!window.confirm(`Post journal ${journalNo} for ${fmt(totals.DEBIT)}? This creates permanent accounting entries.`)) return;
    setSaving(true); setError(""); setSuccess("");
    try {
      await financeApi.postJournal({ journalNo, accountingDate, description: description.trim(), idempotencyKey: requestKey,
        lines: lines.map(l => ({ accountId: l.accountId, debit: l.side === "DEBIT" ? l.amount : "0", credit: l.side === "CREDIT" ? l.amount : "0" })) });
      setSuccess(`Journal ${journalNo} posted successfully.`); reset(); setShowForm(false); await reload();
    } catch (e) { setError(`${errorMessage(e)}. Check journal history before retrying; this request keeps its idempotency key.`); }
    finally { setSaving(false); }
  }
  return <AppLayout title="Journal Entries" subtitle="Double-entry accounting · LKR" activeItem="Finance Management" actions={<button className={btn} type="button" onClick={() => void reload()}><RefreshCw size={15}/> Refresh</button>}>
    <div className="space-y-5">
      {!postingEnabled && <div className="flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><AlertTriangle size={19} className="shrink-0"/><div><strong>Posting is disabled by default.</strong> This page can review journals, and the entry form is prepared for testing. Only enable <code>VITE_FINANCE_ENABLE_POSTING=true</code> in a separate test environment after backend posting and reversal tests pass. Frontend flags are not security controls; the API enforces permissions.</div></div>}
      {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div>}
      {success && <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">{success}</div>}
      <div className="rounded-[18px] border border-bauraBorder bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-base font-bold text-bauraInk">Journal history</h2><p className="mt-1 text-xs text-bauraMuted">Posted entries and reversals are shown together.</p></div>{canPost && <button className={btn} onClick={() => setShowForm(v => !v)}><Plus size={16}/> {showForm ? "Close form" : "New journal"}</button>}</div>
        {showForm && canPost && <form onSubmit={submit} className="mt-5 space-y-4 rounded-2xl border border-bauraBorder bg-[#faf7f2] p-4">
          <div className="grid gap-3 md:grid-cols-3"><label className="text-xs font-semibold">Journal number<input className={`${field} mt-1`} required maxLength={40} value={journalNo} onChange={e => setJournalNo(e.target.value)} placeholder="JV-2026-0001"/></label><label className="text-xs font-semibold">Accounting date<input className={`${field} mt-1`} type="date" required value={accountingDate} onChange={e => setAccountingDate(e.target.value)}/></label><label className="text-xs font-semibold md:col-span-1">Description<input className={`${field} mt-1`} maxLength={500} required value={description} onChange={e => setDescription(e.target.value)} placeholder="Purpose of this journal"/></label></div>
          {!openPeriod && <p className="text-xs font-semibold text-red-700">The selected accounting date is not in an open period.</p>}
          <div className="overflow-x-auto"><table className="w-full min-w-[600px] text-left text-xs"><thead><tr>{["Account", "Entry", "Amount (LKR)", ""].map(h => <th key={h} className="p-2">{h}</th>)}</tr></thead><tbody>{lines.map(l => <tr key={l.key}><td className="p-1"><select required className={field} value={l.accountId} onChange={e => updateLine(l.key, { accountId: e.target.value })}><option value="">Select posting account</option>{postable.map(a => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}</select></td><td className="p-1"><select className={field} value={l.side} onChange={e => updateLine(l.key, { side: e.target.value as Line["side"] })}><option value="DEBIT">Debit</option><option value="CREDIT">Credit</option></select></td><td className="p-1"><input required inputMode="decimal" className={field} value={l.amount} placeholder="0.00" onChange={e => updateLine(l.key, { amount: e.target.value })}/></td><td className="p-1"><button type="button" disabled={lines.length <= 2} aria-label="Remove line" className="rounded-lg p-2 text-red-700 disabled:opacity-30" onClick={() => setLines(v => v.filter(x => x.key !== l.key))}><Trash2 size={17}/></button></td></tr>)}</tbody></table></div>
          <button type="button" className="rounded-xl border border-bauraBorder bg-white px-3 py-2 text-xs font-semibold" disabled={lines.length >= 100} onClick={() => setLines(v => [...v, { key: Math.max(...v.map(l => l.key)) + 1, accountId: "", side: "DEBIT", amount: "" }])}><Plus size={14} className="mr-1 inline"/> Add line</button>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-bauraBorder pt-3 text-sm"><div>Debit <strong>{fmt(totals.DEBIT)}</strong> · Credit <strong>{fmt(totals.CREDIT)}</strong><span className={`ml-3 font-semibold ${totals.DEBIT === totals.CREDIT && totals.DEBIT > 0 ? "text-emerald-700" : "text-red-700"}`}>{totals.DEBIT === totals.CREDIT && totals.DEBIT > 0 ? "Balanced" : `Difference: ${fmt(Math.abs(totals.DEBIT - totals.CREDIT))}`}</span></div><button type="submit" disabled={!formValid || saving} className={btn}>{saving ? "Posting…" : "Review & post journal"}</button></div>
        </form>}
        {loading ? <p className="py-8 text-sm text-bauraMuted">Loading journal records…</p> : <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[700px] text-left text-xs"><thead><tr>{["Journal", "Date", "Description", "Status", "Debit", "Credit", ""].map(h => <th key={h} className="border-b border-bauraBorder p-3">{h}</th>)}</tr></thead><tbody>{journals.map(j => <Fragment key={j.id}><tr key={j.id} className="border-b border-bauraBorder/60"><td className="p-3 font-semibold">{j.journalNo}</td><td className="p-3">{j.accountingDate.slice(0, 10)}</td><td className="p-3">{j.description}</td><td className="p-3">{j.status}</td><td className="p-3">{fmt(j.lines.reduce((n,l) => n + Math.round(Number(l.debit) * 100), 0))}</td><td className="p-3">{fmt(j.lines.reduce((n,l) => n + Math.round(Number(l.credit) * 100), 0))}</td><td className="p-3"><button type="button" className="font-semibold text-bauraPrimary" onClick={() => setExpanded(v => v === j.id ? null : j.id)}>{expanded === j.id ? "Hide" : "Lines"}</button></td></tr>{expanded === j.id && <tr key={`${j.id}-lines`}><td colSpan={7} className="bg-[#faf7f2] p-4"><div className="space-y-1">{j.lines.map((l, i) => <div key={l.id ?? i} className="flex flex-wrap justify-between gap-2 text-xs"><span>{l.account?.code} · {l.account?.name}</span><span>Dr {Number(l.debit).toFixed(2)} · Cr {Number(l.credit).toFixed(2)}</span></div>)}</div></td></tr>}</Fragment>)}</tbody></table>{journals.length === 0 && <p className="p-6 text-center text-sm text-bauraMuted">No journals posted yet.</p>}</div>}
      </div>
    </div>
  </AppLayout>;
}

import { useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  CalendarDays,
  Download,
  PackageSearch,
  PieChart,
  RefreshCw,
  TrendingUp,
  Zap,
  ArrowUpRight,
  Clock3,
  Wallet,
  Activity,
  ShieldAlert
} from "lucide-react";
import { AppLayout } from "../layouts/AppLayout";
import { apiRequest } from "../lib/api";
import { useToast } from "../ui/ToastProvider";

type BaseUnit = "G" | "ML" | "UNIT";

type Summary = {
  orderCount: number;
  grossRevenue: number;
  revenue: number;
  discount: number;
  cogs: number;
  profit: number;
  avgOrderValue: number;
  profitMarginPercent: number;
  inventoryValue: number;
  lowStockItems: number;
  outOfStockItems: number;
  activeProducts: number;
  activeIngredients: number;
};

type TrendItem = {
  date: string;
  revenue: number;
  grossRevenue: number;
  discount: number;
  cogs: number;
  profit: number;
  orderCount: number;
  marginPercent: number;
};

type ProductSale = {
  productId: string;
  displayName: string;
  qty: number;
  revenue: number;
  cogs: number;
  profit: number;
  orderCount: number;
  marginPercent: number;
};

type ChannelSale = {
  channelName: string;
  orderCount: number;
  revenue: number;
  cogs: number;
  profit: number;
  marginPercent: number;
};

type PaymentSale = {
  paymentMethod: string;
  orderCount: number;
  revenue: number;
  profit: number;
};

type InventoryRiskItem = {
  ingredientId: string;
  displayName: string;
  baseUnit: BaseUnit;
  qtyOnHand: number;
  stockValue: number;
  lowStockAlertQty: number | null;
  isOutOfStock: boolean;
  isLowStock: boolean;
  stockPriority: number;
  stockLotCount: number;
};

type AnalyticsData = {
  range: {
    from: string;
    to: string;
  };
  summary: Summary;
  trend: TrendItem[];
  productSales: ProductSale[];
  channelSales: ChannelSale[];
  paymentSales: PaymentSale[];
  inventoryRisk: InventoryRiskItem[];
};

const emptySummary: Summary = {
  orderCount: 0,
  grossRevenue: 0,
  revenue: 0,
  discount: 0,
  cogs: 0,
  profit: 0,
  avgOrderValue: 0,
  profitMarginPercent: 0,
  inventoryValue: 0,
  lowStockItems: 0,
  outOfStockItems: 0,
  activeProducts: 0,
  activeIngredients: 0
};

function colomboDateValue(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Colombo", year: "numeric", month: "2-digit", day: "2-digit"
  }).format(date);
}

function todayInputValue() {
  return colomboDateValue(new Date());
}

function daysAgoInputValue(days: number) {
  return colomboDateValue(new Date(Date.now() - days * 86400000));
}

function formatCurrency(value: number | string | undefined) {
  const amount = Number(value || 0);

  return `Rs. ${amount.toLocaleString("en-LK", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
}

function formatQty(value: number | string | undefined, unit?: string) {
  const amount = Number(value || 0);

  const cleanAmount = amount.toLocaleString("en-LK", {
    maximumFractionDigits: 3
  });

  return unit ? `${cleanAmount} ${unit}` : cleanAmount;
}

function formatDateLabel(value: string) {
  return new Date(value).toLocaleDateString("en-LK", {
    month: "short",
    day: "2-digit"
  });
}

function toCsvValue(value: unknown) {
  const text = String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

function downloadCsv(filename: string, rows: Record<string, unknown>[]) {
  if (rows.length === 0) return;

  const headers = Object.keys(rows[0]);

  const csv = [
    headers.map(toCsvValue).join(","),
    ...rows.map((row) => headers.map((header) => toCsvValue(row[header])).join(","))
  ].join("\n");

  const blob = new Blob([csv], {
    type: "text/csv;charset=utf-8;"
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;
  link.click();

  URL.revokeObjectURL(url);
}

function downloadSvg(svgId: string, filename: string) {
  const svg = document.getElementById(svgId);

  if (!svg) return;

  const serializer = new XMLSerializer();
  const source = serializer.serializeToString(svg);

  const blob = new Blob([source], {
    type: "image/svg+xml;charset=utf-8"
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;
  link.click();

  URL.revokeObjectURL(url);
}

export function AnalyticsPage() {
  const toast = useToast();
  const [fromDate, setFromDate] = useState(daysAgoInputValue(29));
  const [toDate, setToDate] = useState(todayInputValue());
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [appliedRange, setAppliedRange] = useState({ from: fromDate, to: toDate });

  const summary = analytics?.summary || emptySummary;

  const topProducts = useMemo(() => {
    return analytics?.productSales.slice(0, 10) || [];
  }, [analytics?.productSales]);

  const topChannels = useMemo(() => {
    return analytics?.channelSales.slice(0, 8) || [];
  }, [analytics?.channelSales]);

  async function loadAnalytics(from = appliedRange.from, to = appliedRange.to) {
    if (from > to) {
      toast.error("Invalid date range", "Start date must be on or before end date.");
      return;
    }
    setIsLoading(true);

    try {
      const query = new URLSearchParams({
        from,
        to
      });

      const data = await apiRequest<AnalyticsData>(
        `/analytics/advanced?${query.toString()}`
      );

      setAnalytics(data);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to load analytics";
      toast.error("Failed to load analytics", message);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadAnalytics();
  }, []);

  useEffect(() => {
    if (!autoRefresh) return;

    const timer = window.setInterval(() => {
      void loadAnalytics();
    }, 30000);

    return () => window.clearInterval(timer);
  }, [autoRefresh, appliedRange.from, appliedRange.to]);

  function applyRange() {
    if (fromDate > toDate) {
      toast.error("Invalid date range", "Start date must be on or before end date.");
      return;
    }
    setAppliedRange({ from: fromDate, to: toDate });
    void loadAnalytics(fromDate, toDate);
  }

  function setPreset(days: number) {
    const to = todayInputValue();
    const from = daysAgoInputValue(days - 1);
    setFromDate(from);
    setToDate(to);
    setAppliedRange({ from, to });
    void loadAnalytics(from, to);
  }

  return (
    <AppLayout
      activeItem="Analytics"
      title="Analytics"
      subtitle="Advanced realtime sales, profit, stock and platform analytics."
      actions={
        <>
          <button
            onClick={() => setAutoRefresh((prev) => !prev)}
            className={`flex items-center gap-2 rounded-lg px-4 py-3 text-sm font-semibold shadow-[0_1px_2px_rgba(45,33,27,0.03)] ${
              autoRefresh
                ? "bg-green-100 text-green-700"
                : "border border-bauraBorder bg-white"
            }`}
          >
            <Zap size={16} />
            {autoRefresh ? "Realtime On" : "Realtime Off"}
          </button>

          <button
            onClick={() => void loadAnalytics()}
            className="erp-button-secondary"
          >
            <RefreshCw size={16} className={isLoading ? "animate-spin" : ""} />
            Refresh
          </button>
        </>
      }
    >
      <div className="mx-auto grid w-full min-w-0 max-w-[1600px] gap-5 pb-10 sm:gap-6">
        <section className="relative isolate overflow-hidden rounded-[24px] bg-bauraBrown px-5 py-6 text-bauraCream shadow-[0_16px_44px_rgba(45,33,27,0.14)] sm:px-8 sm:py-8 lg:px-10">
          <div className="pointer-events-none absolute -right-16 -top-28 h-80 w-80 rounded-full border-[45px] border-white/[0.04]" />
          <div className="pointer-events-none absolute bottom-[-130px] right-[25%] h-64 w-64 rounded-full bg-bauraGold/10 blur-3xl" />
          <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.2em] text-bauraGold"><Activity size={15} /> Business intelligence</div>
              <h2 className="mt-3 text-[clamp(1.65rem,3vw,2.6rem)] font-bold leading-tight tracking-tight">Your business, in focus.</h2>
              <p className="mt-3 max-w-xl text-sm leading-6 text-bauraCream/75">A clear view of sales performance, profitability and inventory health—without the clutter.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-2 text-xs font-semibold"><Clock3 size={14} /> Sri Lanka time</span>
              <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-2 text-xs font-semibold"><span className={`h-2 w-2 rounded-full ${autoRefresh ? "bg-emerald-400" : "bg-bauraGold"}`} />{autoRefresh ? "Auto-refreshing" : "On demand"}</span>
            </div>
          </div>
        </section>

        <section className="min-w-0 rounded-[22px] border border-bauraBorder bg-white p-4 shadow-[0_4px_20px_rgba(45,33,27,0.035)] sm:p-5">
          <div className="flex flex-col gap-5 2xl:flex-row 2xl:items-end 2xl:justify-between">
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-bauraGold">Reporting period</p>
              <h3 className="mt-1 text-lg font-bold text-bauraBrown">Explore your performance</h3>
              <p className="mt-1 text-xs text-bauraMuted">All figures reflect the selected reporting period.</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {[{ label: "Today", days: 1 }, { label: "7 days", days: 7 }, { label: "30 days", days: 30 }, { label: "90 days", days: 90 }].map((preset) => (
                  <button key={preset.days} type="button" onClick={() => setPreset(preset.days)} className="rounded-full border border-bauraBorder bg-[#FFF9F2] px-3 py-1.5 text-xs font-semibold text-bauraBrown transition hover:border-bauraGold hover:bg-bauraGold/10">{preset.label}</button>
                ))}
              </div>
            </div>
            <div className="grid w-full min-w-0 grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_auto] 2xl:w-auto">
              <DateInput label="From" value={fromDate} onChange={setFromDate} />
              <DateInput label="To" value={toDate} onChange={setToDate} />
              <button type="button" onClick={applyRange} disabled={isLoading} className="flex min-h-11 items-center justify-center gap-2 self-end rounded-xl bg-bauraBrown px-5 py-3 text-sm font-bold text-bauraCream transition hover:opacity-90 disabled:opacity-60"><CalendarDays size={16} /> Apply</button>
            </div>
          </div>
        </section>

        <section className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
          <MetricCard label="Net Revenue" value={isLoading && !analytics ? "Loading…" : formatCurrency(summary.revenue)} note={`${summary.orderCount} orders in period`} icon={<Wallet size={19} />} />
          <MetricCard label="Gross Profit" value={isLoading && !analytics ? "Loading…" : formatCurrency(summary.profit)} note={`${summary.profitMarginPercent}% gross margin`} icon={<TrendingUp size={19} />} positive={summary.profit >= 0} />
          <MetricCard label="Cost of Sales" value={isLoading && !analytics ? "Loading…" : formatCurrency(summary.cogs)} note="Reported cost of goods" icon={<PieChart size={19} />} />
          <MetricCard label="Average Order" value={isLoading && !analytics ? "Loading…" : formatCurrency(summary.avgOrderValue)} note="Revenue per order" icon={<ArrowUpRight size={19} />} />
          <MetricCard label="Stock Alerts" value={isLoading && !analytics ? "Loading…" : String(summary.lowStockItems + summary.outOfStockItems)} note={`${summary.outOfStockItems} out · ${summary.lowStockItems} low`} icon={<ShieldAlert size={19} />} alert={summary.lowStockItems + summary.outOfStockItems > 0} />
        </section>

        <section className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,0.65fr)]">
          <Panel
            title="Sales & Profit Curve"
            subtitle="Realtime curve from completed POS orders."
            action={
              <div className="flex flex-wrap gap-2">
                <SmallButton
                  onClick={() =>
                    downloadCsv("sales-trend.csv", analytics?.trend || [])
                  }
                >
                  <Download size={14} />
                  CSV
                </SmallButton>
                <SmallButton
                  onClick={() =>
                    downloadSvg("sales-profit-curve", "sales-profit-curve.svg")
                  }
                >
                  <Download size={14} />
                  SVG
                </SmallButton>
              </div>
            }
          >
            <SalesProfitCurve
              svgId="sales-profit-curve"
              data={analytics?.trend || []}
            />
          </Panel>

          <Panel
            title="Profit Structure"
            subtitle="Revenue, cost and margin summary."
            action={
              <SmallButton
                onClick={() =>
                  downloadCsv("analytics-summary.csv", [
                    {
                      revenue: summary.revenue,
                      grossRevenue: summary.grossRevenue,
                      discount: summary.discount,
                      cogs: summary.cogs,
                      profit: summary.profit,
                      marginPercent: summary.profitMarginPercent,
                      inventoryValue: summary.inventoryValue
                    }
                  ])
                }
              >
                <Download size={14} />
                CSV
              </SmallButton>
            }
          >
            <div className="grid gap-3">
              <StructureRow
                label="Gross Revenue"
                value={formatCurrency(summary.grossRevenue)}
              />
              <StructureRow
                label="Discount"
                value={formatCurrency(summary.discount)}
              />
              <StructureRow
                label="Net Revenue"
                value={formatCurrency(summary.revenue)}
              />
              <StructureRow label="COGS" value={formatCurrency(summary.cogs)} />
              <StructureRow
                label="Profit"
                value={formatCurrency(summary.profit)}
                highlight
              />
              <div className="rounded-xl bg-white p-4">
                <p className="text-sm text-bauraMuted">Profit Margin</p>
                <p className="mt-2 text-3xl font-black text-bauraBrown">
                  {summary.profitMarginPercent}%
                </p>
              </div>
            </div>
          </Panel>
        </section>

        <section className="grid min-w-0 gap-5 xl:grid-cols-2">
          <Panel
            title="Item-wise Sales"
            subtitle="Top products by selected-period revenue."
            action={
              <SmallButton
                onClick={() =>
                  downloadCsv("item-wise-sales.csv", analytics?.productSales || [])
                }
              >
                <Download size={14} />
                CSV
              </SmallButton>
            }
          >
            <HorizontalBarList
              data={topProducts.map((item) => ({
                id: item.productId,
                label: item.displayName,
                value: item.revenue,
                subValue: `${formatQty(item.qty)} sold · Profit ${formatCurrency(
                  item.profit
                )} · ${item.marginPercent}%`
              }))}
              valueFormatter={formatCurrency}
              emptyText="No item-wise sales data yet."
            />
          </Panel>

          <Panel
            title="Platform-wise Sales"
            subtitle="Revenue and profit grouped by sales channel."
            action={
              <SmallButton
                onClick={() =>
                  downloadCsv("platform-wise-sales.csv", analytics?.channelSales || [])
                }
              >
                <Download size={14} />
                CSV
              </SmallButton>
            }
          >
            <HorizontalBarList
              data={topChannels.map((item) => ({
                id: item.channelName,
                label: item.channelName,
                value: item.revenue,
                subValue: `${item.orderCount} orders · Profit ${formatCurrency(
                  item.profit
                )} · ${item.marginPercent}%`
              }))}
              valueFormatter={formatCurrency}
              emptyText="No platform-wise sales data yet."
            />
          </Panel>
        </section>

        <section className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <Panel
            title="Payment Method Analysis"
            subtitle="Revenue split by payment method."
            action={
              <SmallButton
                onClick={() =>
                  downloadCsv("payment-method-sales.csv", analytics?.paymentSales || [])
                }
              >
                <Download size={14} />
                CSV
              </SmallButton>
            }
          >
            <HorizontalBarList
              data={(analytics?.paymentSales || []).map((item) => ({
                id: item.paymentMethod,
                label: item.paymentMethod,
                value: item.revenue,
                subValue: `${item.orderCount} orders · Profit ${formatCurrency(
                  item.profit
                )}`
              }))}
              valueFormatter={formatCurrency}
              emptyText="No payment sales data yet."
            />
          </Panel>

          <Panel
            title="Inventory Risk Analysis"
            subtitle="API-driven active ingredient stock priority."
            action={
              <SmallButton
                onClick={() =>
                  downloadCsv("inventory-risk.csv", analytics?.inventoryRisk || [])
                }
              >
                <Download size={14} />
                CSV
              </SmallButton>
            }
          >
            {!analytics?.inventoryRisk.length ? (
              <EmptyState text="No inventory data yet." />
            ) : (
              <div className="baura-scrollbar max-h-96 overflow-auto pr-1">
                <div className="grid gap-3">
                  {analytics.inventoryRisk.map((item) => (
                    <InventoryRiskRow key={item.ingredientId} item={item} />
                  ))}
                </div>
              </div>
            )}
          </Panel>
        </section>
      </div>
    </AppLayout>
  );
}

function DateInput({
  label,
  value,
  onChange
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block min-w-0">
      <span className="mb-2 block text-xs font-bold uppercase tracking-[0.14em] text-bauraMuted">
        {label}
      </span>
      <input
        type="date"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="erp-input block w-full min-w-0 rounded-xl font-semibold"
      />
    </label>
  );
}

function MetricCard({
  label,
  value,
  note,
  icon,
  positive,
  alert = false
}: {
  label: string;
  value: string;
  note: string;
  icon: React.ReactNode;
  positive?: boolean;
  alert?: boolean;
}) {
  return (
    <div
      className={`min-w-0 rounded-[20px] border p-5 shadow-[0_4px_18px_rgba(45,33,27,0.035)] transition-shadow hover:shadow-[0_10px_28px_rgba(45,33,27,0.075)] ${
        alert
          ? "border-amber-200 bg-amber-50"
          : "border-bauraBorder bg-white"
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-bauraMuted">{label}</p>
        <div
          className={`flex h-11 w-11 items-center justify-center rounded-lg ${
            alert
              ? "bg-amber-100 text-amber-700"
              : "bg-bauraBrown text-bauraGold"
          }`}
        >
          {icon}
        </div>
      </div>

      <h3
        className={`mt-4 break-words text-[clamp(1.2rem,1.8vw,1.65rem)] font-extrabold tracking-tight ${
          positive === false ? "text-red-700" : "text-bauraBrown"
        }`}
      >
        {value}
      </h3>

      <p className="mt-1 text-xs text-bauraMuted">{note}</p>
    </div>
  );
}

function Panel({
  title,
  subtitle,
  action,
  children
}: {
  title: string;
  subtitle: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0 overflow-hidden rounded-[22px] border border-bauraBorder bg-white p-4 shadow-[0_4px_20px_rgba(45,33,27,0.035)] sm:p-6">
      <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h3 className="text-lg font-bold tracking-tight text-bauraBrown">{title}</h3>
          <p className="mt-1 text-sm text-bauraMuted">{subtitle}</p>
        </div>

        {action}
      </div>

      {children}
    </div>
  );
}

function SmallButton({
  children,
  onClick
}: {
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center justify-center gap-2 rounded-lg border border-bauraBorder bg-[#FFF9F2] px-3 py-2 text-xs font-bold text-bauraBrown transition hover:border-bauraGold hover:bg-bauraGold/10"
    >
      {children}
    </button>
  );
}

function SalesProfitCurve({
  svgId,
  data
}: {
  svgId: string;
  data: TrendItem[];
}) {
  const width = 920;
  const height = 320;
  const padding = 44;

  const maxValue = Math.max(
    1,
    ...data.map((item) => Math.max(item.revenue, item.profit, item.cogs))
  );

  function getX(index: number) {
    if (data.length <= 1) return padding;
    return padding + (index / (data.length - 1)) * (width - padding * 2);
  }

  function getY(value: number) {
    return height - padding - (value / maxValue) * (height - padding * 2);
  }

  function makePath(key: "revenue" | "profit" | "cogs") {
    if (data.length === 0) return "";

    return data
      .map((item, index) => {
        const command = index === 0 ? "M" : "L";
        return `${command} ${getX(index)} ${getY(item[key])}`;
      })
      .join(" ");
  }

  return (
    <div className="min-w-0 overflow-hidden rounded-xl bg-white p-1 sm:p-2">
      {data.length === 0 ? (
        <EmptyState text="No trend data yet." />
      ) : (
        <div className="w-full min-w-0">
          <svg
            id={svgId}
            width="100%"
            height="auto"
            viewBox={`0 0 ${width} ${height}`}
            xmlns="http://www.w3.org/2000/svg"
            className="block h-auto w-full" preserveAspectRatio="xMidYMid meet"
          >
            <rect width={width} height={height} rx="24" fill="#FFF8F0" />

            {[0, 0.25, 0.5, 0.75, 1].map((tick) => {
              const y = padding + tick * (height - padding * 2);

              return (
                <line
                  key={tick}
                  x1={padding}
                  x2={width - padding}
                  y1={y}
                  y2={y}
                  stroke="#7A3E1D"
                  strokeOpacity="0.08"
                />
              );
            })}

            <path
              d={makePath("revenue")}
              fill="none"
              stroke="#5A2E18"
              strokeWidth="4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            <path
              d={makePath("profit")}
              fill="none"
              stroke="#B8860B"
              strokeWidth="4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            <path
              d={makePath("cogs")}
              fill="none"
              stroke="#C16A3A"
              strokeWidth="3"
              strokeDasharray="8 8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {data.map((item, index) => (
              <g key={item.date}>
                <circle
                  cx={getX(index)}
                  cy={getY(item.revenue)}
                  r="5"
                  fill="#5A2E18"
                />
                <text
                  x={getX(index)}
                  y={height - 18}
                  textAnchor="middle"
                  fontSize="11"
                  fill="#5A2E18"
                  opacity="0.75"
                >
                  {formatDateLabel(item.date)}
                </text>
              </g>
            ))}

            <g transform={`translate(${padding}, 24)`}>
              <circle cx="0" cy="0" r="5" fill="#5A2E18" />
              <text x="12" y="4" fontSize="12" fill="#5A2E18">
                Revenue
              </text>

              <circle cx="90" cy="0" r="5" fill="#B8860B" />
              <text x="102" y="4" fontSize="12" fill="#5A2E18">
                Profit
              </text>

              <circle cx="165" cy="0" r="5" fill="#C16A3A" />
              <text x="177" y="4" fontSize="12" fill="#5A2E18">
                COGS
              </text>
            </g>
          </svg>
        </div>
      )}
    </div>
  );
}

function HorizontalBarList({
  data,
  valueFormatter,
  emptyText
}: {
  data: Array<{
    id: string;
    label: string;
    value: number;
    subValue: string;
  }>;
  valueFormatter: (value: number) => string;
  emptyText: string;
}) {
  const maxValue = Math.max(1, ...data.map((item) => item.value));

  if (data.length === 0) {
    return <EmptyState text={emptyText} />;
  }

  return (
    <div className="baura-scrollbar max-h-96 overflow-auto pr-1">
      <div className="grid gap-3">
        {data.map((item, index) => {
          const percentage = Math.max((item.value / maxValue) * 100, 4);

          return (
            <div
              key={item.id}
              className="rounded-xl border border-bauraBorder bg-white p-4"
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                <div className="min-w-0">
                  <p className="text-xs font-bold text-bauraGold">
                    #{index + 1}
                  </p>
                  <h4 className="mt-1 truncate font-bold text-bauraBrown">
                    {item.label}
                  </h4>
                  <p className="mt-1 break-words text-xs text-bauraMuted">
                    {item.subValue}
                  </p>
                </div>

                <p className="break-words text-sm font-black text-bauraBrown sm:shrink-0 sm:text-right">
                  {valueFormatter(item.value)}
                </p>
              </div>

              <div className="mt-3 h-3 overflow-hidden rounded-full bg-bauraBrown/10">
                <div
                  className="h-full rounded-full bg-bauraBrown"
                  style={{ width: `${percentage}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StructureRow({
  label,
  value,
  highlight = false
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-2 rounded-xl px-4 py-3 ${
        highlight ? "bg-bauraBrown text-bauraCream" : "bg-white"
      }`}
    >
      <span className={highlight ? "text-bauraCream/70" : "text-bauraMuted"}>
        {label}
      </span>
      <span className={`break-words text-right font-bold ${highlight ? "text-bauraGold" : ""}`}>
        {value}
      </span>
    </div>
  );
}

function InventoryRiskRow({ item }: { item: InventoryRiskItem }) {
  return (
    <div
      className={`rounded-xl border p-4 ${
        item.isOutOfStock
          ? "border-red-200 bg-red-50"
          : item.isLowStock
          ? "border-amber-200 bg-amber-50"
          : "border-bauraBorder bg-white"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className="truncate font-bold text-bauraBrown">
            {item.displayName}
          </h4>
          <p className="mt-1 text-sm text-bauraMuted">
            {formatQty(item.qtyOnHand, item.baseUnit)} on hand ·{" "}
            {item.stockLotCount} lots
          </p>
        </div>

        <span
          className={`rounded-full px-3 py-1 text-xs font-bold ${
            item.isOutOfStock
              ? "bg-red-100 text-red-700"
              : item.isLowStock
              ? "bg-amber-100 text-amber-700"
              : "bg-green-100 text-green-700"
          }`}
        >
          {item.isOutOfStock ? "Out" : item.isLowStock ? "Low" : "OK"}
        </span>
      </div>

      <p className="mt-2 text-xs text-bauraMuted">
        Value: {formatCurrency(item.stockValue)}
        {item.lowStockAlertQty !== null
          ? ` · Alert: ${formatQty(item.lowStockAlertQty, item.baseUnit)}`
          : ""}
      </p>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-xl bg-white p-6 text-center text-sm text-bauraMuted">
      {text}
    </div>
  );
}
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  Boxes,
  CakeSlice,
  ChevronRight,
  PackageSearch,
  RefreshCw,
  ShoppingCart,
  TrendingUp,
  Warehouse,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { AppLayout } from "../layouts/AppLayout";
import { useAuth } from "../auth/AuthContext";
import { apiRequest } from "../lib/api";

type DashboardSummary = {
  todaySales: number;
  todayProfit: number;
  todayOrders: number;
  monthSales: number;
  monthProfit: number;
  monthCogs: number;
  inventoryValue: number;
  lowStockItems: number;
  outOfStockItems: number;
  activeProducts: number;
  activeIngredients: number;
};

type SalesTrendItem = {
  date: string;
  sales: number;
  profit: number;
  orderCount: number;
};

type TopProduct = {
  productId: string;
  displayName: string;
  qty: number;
  revenue: number;
  cogs: number;
  profit: number;
};

type ChannelSale = {
  channelName: string;
  orderCount: number;
  revenue: number;
  cogs: number;
  profit: number;
};

type LowStockItem = {
  ingredientId: string;
  displayName: string;
  baseUnit: "G" | "ML" | "UNIT";
  qtyOnHand: number;
  stockValue: number;
  lowStockAlertQty: number | null;
  isOutOfStock: boolean;
  isLowStock: boolean;
  stockLotCount: number;
};

type RecentSale = {
  id: string;
  orderNo: string;
  salesChannel: string;
  paymentMethod: string;
  netTotal: string;
  cogsTotal: string;
  profitTotal: string;
  soldAt: string;
  itemCount: number;
};

type DashboardAnalytics = {
  summary: DashboardSummary;
  salesTrend: SalesTrendItem[];
  topProducts: TopProduct[];
  channelSales: ChannelSale[];
  lowStock: LowStockItem[];
  recentSales: RecentSale[];
};

const emptySummary: DashboardSummary = {
  todaySales: 0,
  todayProfit: 0,
  todayOrders: 0,
  monthSales: 0,
  monthProfit: 0,
  monthCogs: 0,
  inventoryValue: 0,
  lowStockItems: 0,
  outOfStockItems: 0,
  activeProducts: 0,
  activeIngredients: 0,
};

const modules = [
  {
    title: "Ingredients",
    description: "Manage ingredient brands, package sizes and base units.",
    icon: Boxes,
    path: "/dashboard/ingredients",
  },
  {
    title: "Carter Inventory",
    description: "Track purchased stock carter-wise with FIFO costing.",
    icon: Warehouse,
    path: "/dashboard/carters",
  },
  {
    title: "Products & Recipes",
    description: "Create bakery products and ingredient recipes.",
    icon: CakeSlice,
    path: "/dashboard/products",
  },
  {
    title: "POS Sales",
    description: "Fast sale screen with automatic stock deduction.",
    icon: ShoppingCart,
    path: "/pos",
  },
];

function formatCurrency(value: number | string | undefined) {
  const amount = Number(value || 0);

  return `Rs. ${amount.toLocaleString("en-LK", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatQty(value: number | string | undefined, unit?: string) {
  const amount = Number(value || 0);

  const cleanAmount = amount.toLocaleString("en-LK", {
    maximumFractionDigits: 3,
  });

  return unit ? `${cleanAmount} ${unit}` : cleanAmount;
}

function formatDate(value: string) {
  return new Date(value).toLocaleString("en-LK", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatTrendDate(value: string) {
  return new Date(value).toLocaleDateString("en-LK", {
    month: "short",
    day: "2-digit",
  });
}

export function DashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [analytics, setAnalytics] = useState<DashboardAnalytics | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const summary = analytics?.summary || emptySummary;

  const maxTrendSales = useMemo(() => {
    if (!analytics?.salesTrend.length) return 0;

    return Math.max(...analytics.salesTrend.map((item) => item.sales));
  }, [analytics?.salesTrend]);

  async function loadAnalytics() {
    setIsLoading(true);
    setError("");

    try {
      const data = await apiRequest<DashboardAnalytics>("/analytics/dashboard");
      setAnalytics(data);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to load analytics";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadAnalytics();
  }, []);

  return (
    <AppLayout
      activeItem="Dashboard"
      title={`Welcome back, ${user?.firstName || "User"}`}
      subtitle="Monitor sales, FIFO inventory, POS activity and bakery profit."
      actions={
        <>
          <button
            onClick={loadAnalytics}
            className="flex items-center gap-2 rounded-2xl border border-bauraBrown/10 bg-bauraSoft px-4 py-3 text-sm font-semibold shadow-sm"
          >
            <RefreshCw size={16} className={isLoading ? "animate-spin" : ""} />
            Refresh
          </button>

          <button
            onClick={() => navigate("/pos")}
            className="rounded-2xl bg-bauraBrown px-5 py-3 text-sm font-bold text-bauraCream shadow-sm"
          >
            Open POS
          </button>
        </>
      }
    >
      <div className="flex min-h-full flex-col gap-5">
        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <section className="grid shrink-0 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <SummaryCard
            title="Today Sales"
            value={
              isLoading ? "Loading..." : formatCurrency(summary.todaySales)
            }
            note={`${summary.todayOrders} completed order${
              summary.todayOrders === 1 ? "" : "s"
            } today`}
            icon={<ShoppingCart size={22} />}
          />

          <SummaryCard
            title="Today Profit"
            value={
              isLoading ? "Loading..." : formatCurrency(summary.todayProfit)
            }
            note="Net sales minus FIFO COGS"
            icon={<TrendingUp size={22} />}
          />

          <SummaryCard
            title="Inventory Value"
            value={
              isLoading ? "Loading..." : formatCurrency(summary.inventoryValue)
            }
            note={`${summary.activeIngredients} active ingredients`}
            icon={<Warehouse size={22} />}
          />

          <SummaryCard
            title="Stock Alerts"
            value={
              isLoading
                ? "Loading..."
                : String(summary.lowStockItems + summary.outOfStockItems)
            }
            note={`${summary.outOfStockItems} out · ${summary.lowStockItems} low`}
            icon={<PackageSearch size={22} />}
            alert={summary.lowStockItems + summary.outOfStockItems > 0}
          />
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          <MiniMetric
            label="Month Sales"
            value={formatCurrency(summary.monthSales)}
          />
          <MiniMetric
            label="Month COGS"
            value={formatCurrency(summary.monthCogs)}
          />
          <MiniMetric
            label="Month Profit"
            value={formatCurrency(summary.monthProfit)}
          />
        </section>

        <section className="grid gap-5 xl:grid-cols-[1.35fr_0.65fr]">
          <div className="rounded-[2rem] border border-bauraBrown/10 bg-bauraSoft p-5 shadow-sm">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <h3 className="text-xl font-bold">7-Day Sales Trend</h3>
                <p className="mt-1 text-sm text-bauraBrown/60">
                  Sales and profit generated from completed POS orders.
                </p>
              </div>

              <button
                onClick={() => navigate("/pos")}
                className="flex items-center gap-2 rounded-2xl border border-bauraBrown/10 bg-white/60 px-4 py-2 text-sm font-semibold"
              >
                Open POS
                <ChevronRight size={16} />
              </button>
            </div>

            <div className="mt-5 grid min-h-64 items-end gap-3 rounded-3xl bg-white/50 p-4 sm:grid-cols-7">
              {analytics?.salesTrend && analytics.salesTrend.length > 0 ? (
                analytics.salesTrend.map((item) => {
                  const percentage =
                    maxTrendSales > 0
                      ? Math.max((item.sales / maxTrendSales) * 100, 5)
                      : 5;

                  return (
                    <div
                      key={item.date}
                      className="flex h-56 flex-col justify-end gap-2"
                    >
                      <div className="rounded-2xl bg-bauraBrown/10 p-2 text-center text-[11px] font-bold text-bauraBrown">
                        {formatCurrency(item.sales)}
                      </div>

                      <div className="flex flex-1 items-end rounded-2xl bg-bauraCream">
                        <div
                          className="w-full rounded-2xl bg-bauraBrown"
                          style={{ height: `${percentage}%` }}
                        />
                      </div>

                      <p className="text-center text-xs font-semibold text-bauraBrown/55">
                        {formatTrendDate(item.date)}
                      </p>
                    </div>
                  );
                })
              ) : (
                <div className="col-span-full flex h-full items-center justify-center text-sm text-bauraBrown/60">
                  No sales trend data yet.
                </div>
              )}
            </div>
          </div>

          <aside className="rounded-[2rem] border border-bauraBrown/10 bg-bauraSoft p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold">Low Stock Attention</h3>
                <p className="mt-1 text-sm text-bauraBrown/60">
                  Active ingredients only.
                </p>
              </div>

              <AlertTriangle
                size={22}
                className={
                  summary.lowStockItems + summary.outOfStockItems > 0
                    ? "text-amber-600"
                    : "text-bauraBrown/40"
                }
              />
            </div>

            <div className="baura-scrollbar mt-4 max-h-80 overflow-auto pr-1">
              {!analytics?.lowStock.length ? (
                <EmptyState text="No low stock items." />
              ) : (
                <div className="grid gap-3">
                  {analytics.lowStock.map((item) => (
                    <div
                      key={item.ingredientId}
                      className={`rounded-3xl border p-4 ${
                        item.isOutOfStock
                          ? "border-red-200 bg-red-50"
                          : "border-amber-200 bg-amber-50"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h4 className="font-bold text-bauraBrown">
                            {item.displayName}
                          </h4>
                          <p className="mt-1 text-sm text-bauraBrown/60">
                            {formatQty(item.qtyOnHand, item.baseUnit)} on hand
                          </p>
                        </div>

                        <span
                          className={`rounded-full px-3 py-1 text-xs font-bold ${
                            item.isOutOfStock
                              ? "bg-red-100 text-red-700"
                              : "bg-amber-100 text-amber-700"
                          }`}
                        >
                          {item.isOutOfStock ? "Out" : "Low"}
                        </span>
                      </div>

                      <p className="mt-2 text-xs text-bauraBrown/50">
                        Stock value: {formatCurrency(item.stockValue)}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </aside>
        </section>

        <section className="grid gap-5 xl:grid-cols-[1fr_1fr]">
          <AnalyticsPanel
            title="Item-wise Sales"
            subtitle="Top products by monthly revenue."
          >
            {!analytics?.topProducts.length ? (
              <EmptyState text="No product sales yet." />
            ) : (
              <div className="grid gap-3">
                {analytics.topProducts.map((product, index) => (
                  <RankedRow
                    key={product.productId}
                    rank={index + 1}
                    title={product.displayName}
                    subtitle={`${formatQty(product.qty)} sold · Profit ${formatCurrency(
                      product.profit,
                    )}`}
                    value={formatCurrency(product.revenue)}
                  />
                ))}
              </div>
            )}
          </AnalyticsPanel>

          <AnalyticsPanel
            title="Platform-wise Sales"
            subtitle="Monthly sales grouped by channel."
          >
            {!analytics?.channelSales.length ? (
              <EmptyState text="No channel sales yet." />
            ) : (
              <div className="grid gap-3">
                {analytics.channelSales.map((channel, index) => (
                  <RankedRow
                    key={channel.channelName}
                    rank={index + 1}
                    title={channel.channelName}
                    subtitle={`${channel.orderCount} order${
                      channel.orderCount === 1 ? "" : "s"
                    } · Profit ${formatCurrency(channel.profit)}`}
                    value={formatCurrency(channel.revenue)}
                  />
                ))}
              </div>
            )}
          </AnalyticsPanel>
        </section>

        <section className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
          <div className="rounded-[2rem] border border-bauraBrown/10 bg-bauraSoft p-5 shadow-sm">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <h3 className="text-xl font-bold">Recent Sales</h3>
                <p className="mt-1 text-sm text-bauraBrown/60">
                  Latest completed POS orders with revenue and profit.
                </p>
              </div>

              <button
                onClick={() => navigate("/pos")}
                className="flex w-fit items-center gap-2 rounded-2xl border border-bauraBrown/10 bg-white/70 px-4 py-2 text-sm font-semibold"
              >
                Open POS
                <ChevronRight size={16} />
              </button>
            </div>

            <div className="baura-scrollbar mt-4 max-h-[430px] overflow-auto pr-1">
              {!analytics?.recentSales.length ? (
                <EmptyState text="No recent sales yet." />
              ) : (
                <div className="overflow-hidden rounded-3xl border border-bauraBrown/10 bg-white/50">
                  <div className="grid grid-cols-[1fr_0.8fr_0.7fr_0.7fr] gap-3 border-b border-bauraBrown/10 bg-white/70 px-4 py-3 text-xs font-bold uppercase tracking-[0.14em] text-bauraBrown/45">
                    <span>Order</span>
                    <span>Channel</span>
                    <span className="text-right">Net</span>
                    <span className="text-right">Profit</span>
                  </div>

                  <div className="divide-y divide-bauraBrown/10">
                    {analytics.recentSales.map((sale) => (
                      <CompactSaleRow key={sale.id} sale={sale} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="grid gap-5">
            <aside className="rounded-[2rem] bg-bauraPosDark p-5 text-bauraCream shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-bauraGold">
                POS + FIFO
              </p>

              <h3 className="mt-2 text-2xl font-bold">Costing is live</h3>

              <p className="mt-2 text-sm leading-6 text-bauraCream/70">
                POS sales reduce Carter stock lots using FIFO. Profit is
                calculated from actual consumed ingredient costs.
              </p>

              <div className="mt-4 grid gap-3">
                <DarkMetric
                  label="Month Sales"
                  value={formatCurrency(summary.monthSales)}
                />
                <DarkMetric
                  label="Month COGS"
                  value={formatCurrency(summary.monthCogs)}
                />
                <DarkMetric
                  label="Month Profit"
                  value={formatCurrency(summary.monthProfit)}
                  highlight
                />
              </div>

              <button
                onClick={() => navigate("/pos")}
                className="mt-4 w-full rounded-2xl bg-bauraGold px-5 py-3 text-sm font-bold text-bauraBrown"
              >
                Open POS
              </button>
            </aside>

            <aside className="rounded-[2rem] border border-bauraBrown/10 bg-bauraSoft p-5 shadow-sm">
              <div>
                <h3 className="text-lg font-bold">Quick Actions</h3>
                <p className="mt-1 text-sm text-bauraBrown/60">
                  Jump to main ERP modules.
                </p>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {modules.map((module) => {
                  const Icon = module.icon;

                  return (
                    <button
                      key={module.title}
                      onClick={() => navigate(module.path)}
                      className="group rounded-3xl border border-bauraBrown/10 bg-white/60 p-4 text-left transition hover:-translate-y-0.5 hover:bg-white hover:shadow-sm"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-bauraBrown text-bauraCream">
                          <Icon size={20} />
                        </div>

                        <div className="min-w-0">
                          <h4 className="truncate text-sm font-bold">
                            {module.title}
                          </h4>
                          <p className="mt-1 line-clamp-1 text-xs text-bauraBrown/55">
                            {module.description}
                          </p>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </aside>
          </div>
        </section>
      </div>
    </AppLayout>
  );
}

function SummaryCard({
  title,
  value,
  note,
  icon,
  alert = false,
}: {
  title: string;
  value: string;
  note: string;
  icon: ReactNode;
  alert?: boolean;
}) {
  return (
    <div
      className={`rounded-[2rem] border p-5 shadow-sm ${
        alert
          ? "border-amber-200 bg-amber-50"
          : "border-bauraBrown/10 bg-bauraSoft"
      }`}
    >
      <div className="flex items-center justify-between">
        <p className="text-sm text-bauraBrown/60">{title}</p>
        <div
          className={`flex h-11 w-11 items-center justify-center rounded-2xl ${
            alert
              ? "bg-amber-100 text-amber-700"
              : "bg-bauraBrown text-bauraGold"
          }`}
        >
          {icon}
        </div>
      </div>
      <h2 className="mt-3 text-2xl font-bold xl:text-3xl">{value}</h2>
      <p className="mt-1 text-xs text-bauraBrown/50">{note}</p>
    </div>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[2rem] border border-bauraBrown/10 bg-bauraSoft p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-bauraBrown/45">
        {label}
      </p>
      <p className="mt-2 text-xl font-bold text-bauraBrown">{value}</p>
    </div>
  );
}

function AnalyticsPanel({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-[2rem] border border-bauraBrown/10 bg-bauraSoft p-5 shadow-sm">
      <div>
        <h3 className="text-xl font-bold">{title}</h3>
        <p className="mt-1 text-sm text-bauraBrown/60">{subtitle}</p>
      </div>

      <div className="baura-scrollbar mt-4 max-h-96 overflow-auto pr-1">
        {children}
      </div>
    </div>
  );
}

function RankedRow({
  rank,
  title,
  subtitle,
  value,
}: {
  rank: number;
  title: string;
  subtitle: string;
  value: string;
}) {
  return (
    <div className="rounded-3xl border border-bauraBrown/10 bg-white/60 p-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-bauraBrown text-sm font-bold text-bauraGold">
            {rank}
          </div>

          <div className="min-w-0">
            <h4 className="truncate font-bold">{title}</h4>
            <p className="mt-1 truncate text-sm text-bauraBrown/60">
              {subtitle}
            </p>
          </div>
        </div>

        <p className="shrink-0 text-sm font-bold text-bauraBrown">{value}</p>
      </div>
    </div>
  );
}

function CompactSaleRow({ sale }: { sale: RecentSale }) {
  const profit = Number(sale.profitTotal || 0);

  return (
    <div className="grid grid-cols-[1fr_0.8fr_0.7fr_0.7fr] items-center gap-3 px-4 py-3 text-sm">
      <div className="min-w-0">
        <h4 className="truncate font-bold text-bauraBrown">{sale.orderNo}</h4>
        <p className="mt-0.5 truncate text-xs text-bauraBrown/50">
          {formatDate(sale.soldAt)} · {sale.itemCount} item
          {sale.itemCount === 1 ? "" : "s"}
        </p>
      </div>

      <div className="min-w-0">
        <p className="truncate font-semibold text-bauraBrown/75">
          {sale.salesChannel}
        </p>
        <p className="mt-0.5 truncate text-xs text-bauraBrown/45">
          {sale.paymentMethod}
        </p>
      </div>

      <p className="text-right font-bold text-bauraBrown">
        {formatCurrency(sale.netTotal)}
      </p>

      <p
        className={`text-right font-bold ${
          profit >= 0 ? "text-green-700" : "text-red-700"
        }`}
      >
        {formatCurrency(sale.profitTotal)}
      </p>
    </div>
  );
}

function DarkMetric({
  label,
  value,
  highlight = false
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="flex items-center justify-between rounded-3xl bg-white/10 px-4 py-3">
      <span className="text-sm text-bauraCream/70">{label}</span>
      <span
        className={`font-bold ${
          highlight ? "text-xl text-bauraGold" : "text-bauraCream"
        }`}
      >
        {value}
      </span>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-3xl bg-white/50 p-6 text-center text-sm text-bauraBrown/60">
      {text}
    </div>
  );
}

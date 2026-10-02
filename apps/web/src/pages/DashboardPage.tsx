import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  AlertTriangle,
  ArrowUpRight,
  ChefHat,
  ChevronRight,
  CircleDollarSign,
  PackageCheck,
  RefreshCw,
  ShoppingCart,
  Sparkles,
  TrendingUp
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { AppLayout } from "../layouts/AppLayout";
import { useAuth } from "../auth/AuthContext";
import { apiRequest } from "../lib/api";
import { useToast } from "../ui/ToastProvider";

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

type BakeryStockData = {
  summary: {
    activeProducts: number;
    productsInStock: number;
    lowStockProducts: number;
    outOfStockProducts: number;
    totalAvailableUnits: number;
    totalStockValue: number;
  };
};

type ProductionBatch = {
  id: string;
  batchNo: string;
  productDisplayName: string;
  producedQty: string;
  status: "DRAFT" | "POSTED" | "VOID";
  productionDate: string;
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
  activeIngredients: 0
};

function formatCurrency(value: number | string | undefined) {
  return `Rs. ${Number(value || 0).toLocaleString("en-LK", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
}

function formatCompactCurrency(value: number | string | undefined) {
  const amount = Number(value || 0);

  if (Math.abs(amount) >= 1_000_000) {
    return `Rs. ${(amount / 1_000_000).toFixed(1)}M`;
  }

  if (Math.abs(amount) >= 1000) {
    return `Rs. ${(amount / 1000).toFixed(1)}K`;
  }

  return formatCurrency(amount);
}

function formatQty(
  value: number | string | undefined,
  unit?: string
) {
  const formatted = Number(value || 0).toLocaleString("en-LK", {
    maximumFractionDigits: 3
  });

  return unit ? `${formatted} ${unit}` : formatted;
}

function formatDate(value: string) {
  return new Date(value).toLocaleString("en-LK", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function formatTrendDate(value: string) {
  return new Date(value).toLocaleDateString("en-LK", {
    month: "short",
    day: "2-digit"
  });
}

export function DashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();

  const [analytics, setAnalytics] =
    useState<DashboardAnalytics | null>(null);

  const [bakeryStock, setBakeryStock] =
    useState<BakeryStockData | null>(null);

  const [productionBatches, setProductionBatches] =
    useState<ProductionBatch[]>([]);

  const [isLoading, setIsLoading] = useState(true);

  const summary = analytics?.summary || emptySummary;

  const draftBatches = useMemo(
    () =>
      productionBatches.filter(
        (batch) => batch.status === "DRAFT"
      ).length,
    [productionBatches]
  );

  const maxTrendSales = useMemo(() => {
    if (!analytics?.salesTrend.length) {
      return 0;
    }

    return Math.max(
      ...analytics.salesTrend.map((item) => item.sales)
    );
  }, [analytics?.salesTrend]);

  const totalAlerts =
    summary.lowStockItems +
    summary.outOfStockItems +
    (bakeryStock?.summary.lowStockProducts || 0) +
    (bakeryStock?.summary.outOfStockProducts || 0);

  async function loadDashboard(showToast = false) {
    setIsLoading(true);

    try {
      const analyticsData =
        await apiRequest<DashboardAnalytics>(
          "/analytics/dashboard"
        );

      setAnalytics(analyticsData);

      const [stockResult, productionResult] =
        await Promise.allSettled([
          apiRequest<BakeryStockData>(
            "/bakery-stock"
          ),
          apiRequest<{
            batches: ProductionBatch[];
          }>("/production")
        ]);

      if (stockResult.status === "fulfilled") {
        setBakeryStock(stockResult.value);
      }

      if (productionResult.status === "fulfilled") {
        setProductionBatches(
          productionResult.value.batches
        );
      }

      if (showToast) {
        toast.success(
          "Dashboard refreshed",
          "Latest bakery operations are now displayed."
        );
      }
    } catch (error) {
      toast.error(
        "Unable to load dashboard",
        error instanceof Error
          ? error.message
          : "Please try again."
      );
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadDashboard();
  }, []);

  return (
    <AppLayout
      activeItem="Dashboard"
      title={`Welcome back, ${user?.firstName || "User"}`}
      subtitle="A live view of sales, production, bakery stock and ingredient inventory."
      actions={
        <>
          <button
            type="button"
            onClick={() => loadDashboard(true)}
            className="erp-button-secondary"
          >
            <RefreshCw
              size={14}
              className={isLoading ? "animate-spin" : ""}
            />
            Refresh
          </button>

          <button
            type="button"
            onClick={() => navigate("/pos")}
            className="erp-button-primary"
          >
            <ShoppingCart size={14} />
            Open POS
          </button>
        </>
      }
    >
      <div className="grid gap-4">
        <section className="grid gap-4 md:grid-cols-2 2xl:grid-cols-4">
          <KpiCard
            label="Today Sales"
            value={
              isLoading
                ? "Loading..."
                : formatCompactCurrency(summary.todaySales)
            }
            note={`${summary.todayOrders} completed order${
              summary.todayOrders === 1 ? "" : "s"
            }`}
            icon={<CircleDollarSign size={19} />}
            accent="gold"
          />

          <KpiCard
            label="Month Profit"
            value={
              isLoading
                ? "Loading..."
                : formatCompactCurrency(summary.monthProfit)
            }
            note={`Sales ${formatCompactCurrency(
              summary.monthSales
            )}`}
            icon={<TrendingUp size={19} />}
            accent="brown"
          />

          <KpiCard
            label="Bakery Stock"
            value={
              isLoading
                ? "Loading..."
                : formatQty(
                    bakeryStock?.summary.totalAvailableUnits || 0
                  )
            }
            note={`${
              bakeryStock?.summary.productsInStock || 0
            } sellable products`}
            icon={<PackageCheck size={19} />}
            accent="green"
          />

          <KpiCard
            label="Stock Alerts"
            value={
              isLoading
                ? "Loading..."
                : String(totalAlerts)
            }
            note={`${summary.outOfStockItems} raw out · ${
              bakeryStock?.summary.outOfStockProducts || 0
            } finished out`}
            icon={<AlertTriangle size={19} />}
            accent={totalAlerts > 0 ? "red" : "green"}
          />
        </section>

        <section className="grid gap-4 2xl:grid-cols-[0.72fr_1.28fr]">
          <InventoryPanel
            items={analytics?.lowStock || []}
            onOpenInventory={() =>
              navigate("/dashboard/ingredients")
            }
          />

          <SalesPerformancePanel
            data={analytics?.salesTrend || []}
            maxSales={maxTrendSales}
            monthSales={summary.monthSales}
            monthCogs={summary.monthCogs}
            monthProfit={summary.monthProfit}
          />
        </section>

        <section className="grid gap-4 2xl:grid-cols-[1.2fr_0.8fr]">
          <RecentSalesPanel
            sales={analytics?.recentSales || []}
            onOpenPos={() => navigate("/pos")}
          />

          <div className="grid gap-4">
            <OperationsCard
              draftBatches={draftBatches}
              finishedStock={
                bakeryStock?.summary.totalAvailableUnits || 0
              }
              onProduction={() =>
                navigate("/dashboard/production")
              }
              onStock={() =>
                navigate("/dashboard/bakery-stock")
              }
            />

            <TopProductsPanel
              products={analytics?.topProducts || []}
            />
          </div>
        </section>
      </div>
    </AppLayout>
  );
}

function KpiCard({
  label,
  value,
  note,
  icon,
  accent
}: {
  label: string;
  value: string;
  note: string;
  icon: ReactNode;
  accent: "gold" | "brown" | "green" | "red";
}) {
  const accentMap = {
    gold: {
      icon:
        "bg-bauraGoldSoft text-bauraGoldDark",
      chip:
        "bg-bauraGoldSoft text-bauraGoldDark",
      decoration:
        "bg-bauraGoldSoft"
    },
    brown: {
      icon:
        "bg-bauraPrimarySoft text-bauraPrimary",
      chip:
        "bg-bauraPrimarySoft text-bauraPrimary",
      decoration:
        "bg-bauraPrimarySoft"
    },
    green: {
      icon:
        "bg-bauraSuccessSoft text-bauraSuccess",
      chip:
        "bg-bauraSuccessSoft text-bauraSuccess",
      decoration:
        "bg-bauraSuccessSoft"
    },
    red: {
      icon:
        "bg-bauraDangerSoft text-bauraDanger",
      chip:
        "bg-bauraDangerSoft text-bauraDanger",
      decoration:
        "bg-bauraDangerSoft"
    }
  };

  const style = accentMap[accent];

  return (
    <div className="relative overflow-hidden rounded-[18px] border border-bauraBorder bg-white p-5 shadow-bauraCard transition duration-200 hover:shadow-bauraCardHover">
      <div
        aria-hidden="true"
        className={`absolute -right-6 -top-9 h-28 w-28 rounded-full opacity-65 ${style.decoration}`}
      />

      <div
        aria-hidden="true"
        className="absolute -right-1 top-3 h-14 w-14 rounded-full border border-bauraBorder/50"
      />

      <div className="relative flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[9px] font-semibold uppercase tracking-[0.11em] text-bauraMuted">
            {label}
          </p>

          <h2 className="mt-2 truncate text-[25px] font-semibold tracking-[-0.04em] text-bauraInk">
            {value}
          </h2>
        </div>

        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${style.icon}`}
        >
          {icon}
        </div>
      </div>

      <div className="relative mt-4">
        <span
          className={`inline-flex rounded-lg px-2.5 py-1 text-[8px] font-semibold uppercase tracking-[0.04em] ${style.chip}`}
        >
          {note}
        </span>
      </div>
    </div>
  );
}

function InventoryPanel({
  items,
  onOpenInventory
}: {
  items: LowStockItem[];
  onOpenInventory: () => void;
}) {
  const visibleItems = items.slice(0, 4);

  return (
    <section className="erp-panel overflow-hidden p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="erp-section-title">
            Inventory
          </h2>

          <p className="erp-section-subtitle">
            Ingredient stock requiring attention.
          </p>
        </div>

        <button
          type="button"
          onClick={onOpenInventory}
          className="text-[9px] font-semibold uppercase tracking-[0.06em] text-bauraGoldDark transition hover:text-bauraPrimary"
        >
          Details
        </button>
      </div>

      <div className="mt-7 grid gap-6">
        {visibleItems.length === 0 ? (
          <div className="rounded-2xl border border-green-100 bg-bauraSuccessSoft px-4 py-5 text-center">
            <PackageCheck
              size={21}
              className="mx-auto text-bauraSuccess"
            />

            <p className="mt-2 text-[10px] font-semibold text-bauraSuccess">
              Ingredient stock is healthy.
            </p>
          </div>
        ) : (
          visibleItems.map((item) => {
            const alert = Number(
              item.lowStockAlertQty || 0
            );

            const percentage =
              alert > 0
                ? Math.min(
                    Math.max(
                      (item.qtyOnHand / alert) * 100,
                      3
                    ),
                    100
                  )
                : item.isOutOfStock
                  ? 3
                  : 55;

            return (
              <div key={item.ingredientId}>
                <div className="flex items-center justify-between gap-3">
                  <p
                    className={`truncate text-[10px] font-semibold uppercase tracking-[0.05em] ${
                      item.isOutOfStock
                        ? "text-bauraDanger"
                        : item.isLowStock
                          ? "text-bauraWarning"
                          : "text-bauraMuted"
                    }`}
                  >
                    {item.displayName}
                  </p>

                  <p
                    className={`text-[10px] font-semibold ${
                      item.isOutOfStock
                        ? "text-bauraDanger"
                        : "text-bauraInk"
                    }`}
                  >
                    {formatQty(
                      item.qtyOnHand,
                      item.baseUnit
                    )}
                  </p>
                </div>

                <div className="mt-2 h-2 overflow-hidden rounded-full bg-bauraPrimarySoft">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      item.isOutOfStock
                        ? "bg-bauraDanger"
                        : item.isLowStock
                          ? "bg-gradient-to-r from-bauraWarning to-bauraGold"
                          : "bg-gradient-to-r from-bauraPrimary to-bauraGold"
                    }`}
                    style={{
                      width: `${percentage}%`
                    }}
                  />
                </div>
              </div>
            );
          })
        )}
      </div>

      {visibleItems.length > 0 && (
        <div className="mt-7 rounded-[16px] border border-[#EBDDCB] bg-gradient-to-br from-[#FFF9F0] to-[#F8EFE4] p-4">
          <div className="flex gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-bauraGoldSoft text-bauraGoldDark">
              <Sparkles size={15} />
            </div>

            <div>
              <p className="text-[9px] font-semibold uppercase tracking-[0.06em] text-bauraGoldDark">
                Stock recommendation
              </p>

              <p className="mt-1 text-[9px] leading-5 text-bauraInk2">
                Review low-stock ingredients before the
                next production run.
              </p>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function SalesPerformancePanel({
  data,
  maxSales,
  monthSales,
  monthCogs,
  monthProfit
}: {
  data: SalesTrendItem[];
  maxSales: number;
  monthSales: number;
  monthCogs: number;
  monthProfit: number;
}) {
  return (
    <section className="erp-panel overflow-hidden p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="erp-section-title">
            Sales Performance
          </h2>

          <p className="erp-section-subtitle">
            Revenue generated from completed sales during
            the last seven days.
          </p>
        </div>

        <div className="flex gap-4 text-[8px] font-semibold uppercase tracking-[0.07em] text-bauraMuted">
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-bauraGoldDark" />
            Revenue
          </div>

          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-bauraBorder" />
            Daily Scale
          </div>
        </div>
      </div>

      <div className="mt-7 h-[260px]">
        {data.length === 0 ? (
          <div className="flex h-full items-center justify-center rounded-2xl bg-bauraCanvas2 text-[10px] text-bauraMuted">
            No sales performance data yet.
          </div>
        ) : (
          <div className="flex h-full items-end gap-3 border-b border-bauraBorder px-2">
            {data.map((item, index) => {
              const height =
                maxSales > 0
                  ? Math.max(
                      (item.sales / maxSales) * 100,
                      8
                    )
                  : 8;

              const latest =
                index === data.length - 1;

              return (
                <div
                  key={item.date}
                  className="flex h-full min-w-0 flex-1 flex-col justify-end"
                >
                  <div className="group relative flex flex-1 items-end justify-center">
                    <div
                      className={`w-full max-w-[56px] rounded-t-[16px] transition-all duration-300 ${
                        latest
                          ? "bg-gradient-to-t from-bauraPrimaryDark via-bauraPrimary to-bauraGold"
                          : "bg-gradient-to-t from-bauraGoldSoft via-[#E4C79D] to-bauraGold"
                      }`}
                      style={{
                        height: `${height}%`
                      }}
                    />

                    <div className="pointer-events-none absolute bottom-[calc(100%+6px)] hidden whitespace-nowrap rounded-lg bg-bauraInk px-2 py-1 text-[8px] font-semibold text-white shadow-lg group-hover:block">
                      {formatCompactCurrency(item.sales)}
                    </div>
                  </div>

                  <p className="py-3 text-center text-[8px] font-semibold uppercase tracking-[0.08em] text-bauraMuted">
                    {formatTrendDate(item.date)}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <PerformanceMetric
          label="Month Revenue"
          value={formatCompactCurrency(monthSales)}
        />

        <PerformanceMetric
          label="Production / COGS"
          value={formatCompactCurrency(monthCogs)}
        />

        <PerformanceMetric
          label="Gross Profit"
          value={formatCompactCurrency(monthProfit)}
          highlight
        />
      </div>
    </section>
  );
}

function PerformanceMetric({
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
      className={`rounded-2xl border px-4 py-3.5 ${
        highlight
          ? "border-[#EAD8BD] bg-bauraGoldSoft/55"
          : "border-transparent bg-bauraCanvas2"
      }`}
    >
      <p className="text-[8px] font-semibold uppercase tracking-[0.08em] text-bauraMuted">
        {label}
      </p>

      <p
        className={`mt-1.5 text-[18px] font-semibold tracking-[-0.03em] ${
          highlight
            ? "text-bauraPrimary"
            : "text-bauraInk"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function RecentSalesPanel({
  sales,
  onOpenPos
}: {
  sales: RecentSale[];
  onOpenPos: () => void;
}) {
  return (
    <section className="erp-panel overflow-hidden">
      <div className="flex items-start justify-between gap-3 border-b border-bauraBorder px-5 py-4">
        <div>
          <h2 className="erp-section-title">
            Recent Sales
          </h2>

          <p className="erp-section-subtitle">
            Latest completed POS transactions.
          </p>
        </div>

        <button
          type="button"
          onClick={onOpenPos}
          className="flex items-center gap-1 text-[9px] font-semibold text-bauraGoldDark transition hover:text-bauraPrimary"
        >
          Open POS
          <ChevronRight size={13} />
        </button>
      </div>

      <div className="baura-scrollbar overflow-x-auto">
        <table className="min-w-full text-left">
          <thead>
            <tr className="border-b border-bauraBorder bg-bauraCanvas2 text-[8px] font-semibold uppercase tracking-[0.09em] text-bauraMuted">
              <th className="px-5 py-3">
                Order
              </th>

              <th className="px-5 py-3">
                Channel
              </th>

              <th className="px-5 py-3 text-right">
                Net
              </th>

              <th className="px-5 py-3 text-right">
                Profit
              </th>
            </tr>
          </thead>

          <tbody className="divide-y divide-bauraBorder">
            {sales.length === 0 ? (
              <tr>
                <td
                  colSpan={4}
                  className="px-5 py-12 text-center text-[10px] text-bauraMuted"
                >
                  No recent sales.
                </td>
              </tr>
            ) : (
              sales
                .slice(0, 8)
                .map((sale) => (
                  <tr
                    key={sale.id}
                    className="text-[10px] transition hover:bg-bauraCanvas2"
                  >
                    <td className="px-5 py-3.5">
                      <p className="font-semibold text-bauraInk">
                        {sale.orderNo}
                      </p>

                      <p className="mt-0.5 text-[8px] text-bauraMuted">
                        {formatDate(sale.soldAt)} ·{" "}
                        {sale.itemCount} item
                        {sale.itemCount === 1 ? "" : "s"}
                      </p>
                    </td>

                    <td className="px-5 py-3.5 text-bauraMuted">
                      {sale.salesChannel}
                    </td>

                    <td className="px-5 py-3.5 text-right font-semibold text-bauraInk">
                      {formatCurrency(sale.netTotal)}
                    </td>

                    <td className="px-5 py-3.5 text-right font-semibold text-bauraSuccess">
                      {formatCurrency(sale.profitTotal)}
                    </td>
                  </tr>
                ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function OperationsCard({
  draftBatches,
  finishedStock,
  onProduction,
  onStock
}: {
  draftBatches: number;
  finishedStock: number;
  onProduction: () => void;
  onStock: () => void;
}) {
  return (
    <section className="relative overflow-hidden rounded-[20px] bg-gradient-to-br from-bauraPrimaryDark via-bauraPrimary to-[#7B5238] p-5 text-white shadow-[0_16px_40px_rgba(74,46,31,0.20)]">
      <div
        aria-hidden="true"
        className="absolute -right-10 -top-16 h-44 w-44 rounded-full border border-bauraGold/20"
      />

      <div
        aria-hidden="true"
        className="absolute -right-2 -top-5 h-32 w-32 rounded-full bg-bauraGold/10"
      />

      <div
        aria-hidden="true"
        className="absolute bottom-[-70px] left-[-40px] h-40 w-40 rounded-full bg-black/10"
      />

      <div className="relative">
        <div className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-bauraGold" />

          <p className="text-[8px] font-semibold uppercase tracking-[0.12em] text-white/70">
            Production Operations
          </p>
        </div>

        <h2 className="mt-2 text-[20px] font-semibold tracking-[-0.03em]">
          Bakery production is connected to POS.
        </h2>

        <p className="mt-2 max-w-sm text-[9px] leading-5 text-white/70">
          Post production batches to create sellable
          finished stock. POS then consumes directly from
          Bakery Stock.
        </p>

        <div className="mt-5 grid grid-cols-2 gap-2.5">
          <div className="rounded-2xl border border-white/10 bg-white/[0.08] p-3 backdrop-blur-sm">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-bauraGold/15 text-bauraGoldSoft">
              <ChefHat size={15} />
            </div>

            <p className="mt-3 text-[19px] font-semibold">
              {draftBatches}
            </p>

            <p className="mt-0.5 text-[8px] font-medium uppercase tracking-[0.07em] text-white/60">
              Draft batches
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.08] p-3 backdrop-blur-sm">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-bauraGold/15 text-bauraGoldSoft">
              <PackageCheck size={15} />
            </div>

            <p className="mt-3 text-[19px] font-semibold">
              {formatQty(finishedStock)}
            </p>

            <p className="mt-0.5 text-[8px] font-medium uppercase tracking-[0.07em] text-white/60">
              Sellable units
            </p>
          </div>
        </div>

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={onProduction}
            className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-xl bg-bauraGoldSoft text-[9px] font-semibold text-bauraPrimary transition hover:bg-white"
          >
            Production
            <ArrowUpRight size={12} />
          </button>

          <button
            type="button"
            onClick={onStock}
            className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.08] text-[9px] font-semibold text-white transition hover:bg-white/[0.14]"
          >
            Bakery Stock
          </button>
        </div>
      </div>
    </section>
  );
}

function TopProductsPanel({
  products
}: {
  products: TopProduct[];
}) {
  return (
    <section className="erp-panel p-5">
      <div>
        <h2 className="erp-section-title">
          Top Products
        </h2>

        <p className="erp-section-subtitle">
          Highest revenue products this month.
        </p>
      </div>

      <div className="mt-4 grid gap-2.5">
        {products.length === 0 ? (
          <p className="py-5 text-center text-[10px] text-bauraMuted">
            No product sales yet.
          </p>
        ) : (
          products
            .slice(0, 4)
            .map((product, index) => (
              <div
                key={product.productId}
                className="flex items-center gap-3 rounded-xl border border-transparent bg-bauraCanvas2 p-3 transition hover:border-bauraBorder hover:bg-white"
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-bauraGoldSoft text-[10px] font-bold text-bauraGoldDark">
                  {index + 1}
                </div>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-[10px] font-semibold text-bauraInk">
                    {product.displayName}
                  </p>

                  <p className="mt-0.5 text-[8px] text-bauraMuted">
                    {formatQty(product.qty)} sold
                  </p>
                </div>

                <div className="text-right">
                  <p className="text-[10px] font-semibold text-bauraInk">
                    {formatCompactCurrency(product.revenue)}
                  </p>

                  <p className="mt-0.5 text-[8px] font-medium text-bauraSuccess">
                    +{formatCompactCurrency(product.profit)}
                  </p>
                </div>
              </div>
            ))
        )}
      </div>
    </section>
  );
}
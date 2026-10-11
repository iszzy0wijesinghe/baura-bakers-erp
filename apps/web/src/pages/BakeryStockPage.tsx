import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import type { ReactNode } from "react";
import {
  AlertTriangle,
  ChefHat,
  Eye,
  PackageCheck,
  RefreshCw,
  Search,
  ShoppingCart,
  WalletCards,
  Layers3,
  CalendarClock,
  ArrowUpRight,
  ArrowDownRight,
  Boxes,
  X
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { AppLayout } from "../layouts/AppLayout";
import { apiRequest } from "../lib/api";
import { Modal } from "../ui/Modal";
import { useToast } from "../ui/ToastProvider";

type StockStatus =
  | "IN_STOCK"
  | "LOW_STOCK"
  | "OUT_OF_STOCK"
  | "EXPIRED_ONLY";

type BakeryStockItem = {
  productId: string;
  productSizeId: string | null;
  productSizeLabel: string | null;
  officialSiteSizeId: number | null;
  isLegacyStock: boolean;
  name: string;
  variantName: string | null;
  displayName: string;
  sellPrice: string | number | null;
  availableQty: number;
  expiredQty: number;
  totalOnHand: number;
  weightedAverageCost: number;
  sellableValue: number;
  expiredValue: number;
  stockValue: number;
  lotCount: number;
  finishedStockAlertQty: string | number | null;
  status: StockStatus;
};

type BakeryStockSummary = {
  activeProducts: number;
  stockVariants: number;
  productsInStock: number;
  lowStockProducts: number;
  outOfStockProducts: number;
  totalAvailableUnits: number;
  totalExpiredUnits: number;
  totalStockValue: number;
  totalExpiredValue: number;
};

type BakeryStockResponse = {
  summary: BakeryStockSummary;
  items: BakeryStockItem[];
};

type ProductSizeOption = {
  id: string;
  label: string;
  officialSiteSizeId: number;
  price: string | number;
};

type StockCalculation = {
  availableQty: number;
  expiredQty: number;
  totalOnHand: number;
  weightedAverageCost: number;
  sellableValue: number;
  expiredValue: number;
  stockValue: number;
  lotCount: number;
  status: StockStatus;
};

type BakeryStockDetail = {
  product: {
    id: string;
    displayName: string;
    sellPrice: string | number | null;
    finishedStockAlertQty: string | number | null;
    productSizeId: string | null;
    productSizeLabel: string | null;
    sizes: ProductSizeOption[];
  };
  stock: StockCalculation;
  lots: Array<{
    id: string;
    productionBatchId: string;
    batchNo: string;
    productSizeId: string | null;
    productSizeLabel: string | null;
    producedQty: string | number;
    remainingQty: string | number;
    unitCost: string | number;
    producedAt: string;
    expiryDate: string | null;
    rejectedQty: string | number;
    isExpired: boolean;
    stockValue: number;
  }>;
  movements: Array<{
    id: string;
    movementType: string;
    stockLotId: string | null;
    productSizeId: string | null;
    productSizeLabel: string | null;
    refType: string | null;
    refId: string | null;
    qtyDelta: string | number;
    unitCost: string | number | null;
    costAmount: string | number | null;
    note: string | null;
    occurredAt: string;
  }>;
};

type DetailSelection = {
  productId: string;
  productSizeId: string | null;
  isLegacyStock: boolean;
  displayName: string;
};

type StockFilter = "ALL" | StockStatus;
type SizeFilter = "ALL" | "SIZED" | "STANDARD" | "LEGACY";

const EMPTY_SUMMARY: BakeryStockSummary = {
  activeProducts: 0,
  stockVariants: 0,
  productsInStock: 0,
  lowStockProducts: 0,
  outOfStockProducts: 0,
  totalAvailableUnits: 0,
  totalExpiredUnits: 0,
  totalStockValue: 0,
  totalExpiredValue: 0
};

function formatCurrency(
  value: number | string | null | undefined
): string {
  return `Rs. ${Number(value ?? 0).toLocaleString("en-LK", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
}

function formatQty(
  value: number | string | null | undefined
): string {
  return Number(value ?? 0).toLocaleString("en-LK", {
    maximumFractionDigits: 3
  });
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  return date.toLocaleString("en-LK", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "No expiry";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  return date.toLocaleDateString("en-LK", {
    year: "numeric",
    month: "short",
    day: "2-digit"
  });
}

function getSizeLabel(item: BakeryStockItem): string {
  if (item.isLegacyStock) return "Unassigned / Legacy";
  return item.productSizeLabel || "Standard";
}

function getDetailUrl(selection: DetailSelection): string {
  const base = `/bakery-stock/${encodeURIComponent(
    selection.productId
  )}`;

  if (selection.isLegacyStock) {
    return `${base}?productSizeId=legacy`;
  }

  if (selection.productSizeId) {
    return `${base}?productSizeId=${encodeURIComponent(
      selection.productSizeId
    )}`;
  }

  return base;
}

function getMovementLabel(type: string): string {
  return type.replace(/_/g, " ");
}

function getMovementPositive(delta: string | number): boolean {
  return Number(delta) >= 0;
}

export function BakeryStockPage() {
  const navigate = useNavigate();
  const toast = useToast();

  const [data, setData] = useState<BakeryStockResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StockFilter>("ALL");
  const [sizeFilter, setSizeFilter] = useState<SizeFilter>("ALL");

  const [detail, setDetail] = useState<BakeryStockDetail | null>(null);
  const [detailSelection, setDetailSelection] =
    useState<DetailSelection | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const detailRequestRef = useRef(0);
  const stockRequestRef = useRef(0);

  const summary = data?.summary ?? EMPTY_SUMMARY;

  const filtered = useMemo(() => {
    const keyword = search.trim().toLowerCase();

    return (data?.items ?? []).filter((item) => {
      const searchableText = [
        item.name,
        item.variantName,
        item.displayName,
        item.productSizeLabel,
        item.officialSiteSizeId?.toString()
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      const matchesSearch =
        !keyword || searchableText.includes(keyword);

      const matchesStatus =
        status === "ALL" || item.status === status;

      let matchesSize = true;

      if (sizeFilter === "SIZED") {
        matchesSize = Boolean(item.productSizeId);
      } else if (sizeFilter === "STANDARD") {
        matchesSize =
          item.productSizeId === null && !item.isLegacyStock;
      } else if (sizeFilter === "LEGACY") {
        matchesSize = item.isLegacyStock;
      }

      return matchesSearch && matchesStatus && matchesSize;
    });
  }, [data, search, status, sizeFilter]);

  const hasActiveFilters =
    search.trim().length > 0 ||
    status !== "ALL" ||
    sizeFilter !== "ALL";

  const loadStock = useCallback(
    async (showSuccess = false) => {
      const requestId = ++stockRequestRef.current;
      setLoading(true);

      try {
        const response = await apiRequest<BakeryStockResponse>(
          "/bakery-stock"
        );

        if (requestId !== stockRequestRef.current) return;

        setData(response);

        if (showSuccess) {
          toast.success("Bakery Stock refreshed");
        }
      } catch (error) {
        if (requestId !== stockRequestRef.current) return;

        toast.error(
          "Unable to load Bakery Stock",
          error instanceof Error
            ? error.message
            : "Please try again."
        );
      } finally {
        if (requestId === stockRequestRef.current) {
          setLoading(false);
        }
      }
    },
    [toast]
  );

  useEffect(() => {
    void loadStock();

    return () => {
      stockRequestRef.current += 1;
      detailRequestRef.current += 1;
    };
  }, [loadStock]);

  const openProduct = useCallback(
    async (item: BakeryStockItem) => {
      const selection: DetailSelection = {
        productId: item.productId,
        productSizeId: item.productSizeId,
        isLegacyStock: item.isLegacyStock,
        displayName: item.displayName
      };

      const requestId = ++detailRequestRef.current;

      setDetailSelection(selection);
      setDetail(null);
      setDetailLoading(true);

      try {
        const response = await apiRequest<BakeryStockDetail>(
          getDetailUrl(selection)
        );

        if (requestId !== detailRequestRef.current) return;

        setDetail(response);
      } catch (error) {
        if (requestId !== detailRequestRef.current) return;

        setDetailSelection(null);

        toast.error(
          "Unable to load stock details",
          error instanceof Error
            ? error.message
            : "Please try again."
        );
      } finally {
        if (requestId === detailRequestRef.current) {
          setDetailLoading(false);
        }
      }
    },
    [toast]
  );

  const closeDetail = useCallback(() => {
    detailRequestRef.current += 1;
    setDetail(null);
    setDetailSelection(null);
    setDetailLoading(false);
  }, []);

  return (
    <AppLayout
      activeItem="Bakery Stock"
      title="Bakery Stock"
      subtitle="Size-specific finished products, production lots, inventory costs and POS-ready quantities."
      actions={
        <>
          <button
            type="button"
            onClick={() => void loadStock(true)}
            disabled={loading}
            className="erp-button-secondary"
          >
            <RefreshCw
              size={14}
              className={loading ? "animate-spin" : ""}
            />
            Refresh
          </button>

          <button
            type="button"
            onClick={() => navigate("/dashboard/production")}
            className="erp-button-primary"
          >
            <ChefHat size={14} />
            New Production
          </button>
        </>
      }
    >
      <section className="mb-4 overflow-hidden rounded-[18px] border border-[#EADFCF] bg-gradient-to-r from-[#FFFDF8] to-[#FAF2E6] p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-bauraGoldSoft text-bauraGoldDark">
              <PackageCheck size={18} />
            </div>

            <div>
              <p className="text-[10px] font-semibold text-bauraInk">
                Production creates Bakery Stock
              </p>

              <p className="mt-1 max-w-2xl text-[9px] leading-5 text-bauraMuted">
                Every posted production batch adds finished goods to its
                selected product size. Stock availability and production
                costs are tracked independently for each size.
              </p>

              <p className="mt-1 text-[9px] leading-5 text-bauraMuted">
                POS should consume the matching product size only.
                Historical stock without a size remains separate.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => navigate("/pos")}
            className="erp-button-secondary shrink-0"
          >
            <ShoppingCart size={14} />
            Open POS
          </button>
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          label="Sellable Units"
          value={formatQty(summary.totalAvailableUnits)}
          note={`${summary.productsInStock} stock variants available`}
          icon={<PackageCheck size={18} />}
        />

        <SummaryCard
          label="Finished Stock Value"
          value={formatCurrency(summary.totalStockValue)}
          note="Ingredient and production expense costs"
          icon={<WalletCards size={18} />}
        />

        <SummaryCard
          label="Low Stock Variants"
          value={String(summary.lowStockProducts)}
          note="At or below the configured alert level"
          icon={<AlertTriangle size={18} />}
          warning={summary.lowStockProducts > 0}
        />

        <SummaryCard
          label="No Sellable Stock"
          value={String(summary.outOfStockProducts)}
          note="Out of stock or expired-only variants"
          icon={<Boxes size={18} />}
          warning={summary.outOfStockProducts > 0}
        />
      </div>

      <section className="mt-4 grid gap-3 sm:grid-cols-3">
        <MiniStat
          label="Active Products"
          value={String(summary.activeProducts)}
          icon={<PackageCheck size={15} />}
        />

        <MiniStat
          label="Tracked Stock Variants"
          value={String(summary.stockVariants)}
          icon={<Layers3 size={15} />}
        />

        <MiniStat
          label="Expired Inventory"
          value={`${formatQty(summary.totalExpiredUnits)} units`}
          description={formatCurrency(summary.totalExpiredValue)}
          icon={<CalendarClock size={15} />}
          warning={summary.totalExpiredUnits > 0}
        />
      </section>

      {!loading && data?.items.length === 0 && (
        <section className="erp-panel mt-4 p-6 sm:p-8">
          <div className="mx-auto max-w-xl text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-bauraGoldSoft text-bauraGoldDark">
              <PackageCheck size={22} />
            </div>

            <h2 className="mt-4 text-[18px] font-semibold tracking-[-0.025em] text-bauraInk">
              No finished products are configured yet
            </h2>

            <p className="mt-2 text-[10px] leading-6 text-bauraMuted">
              Create products and their size-specific recipes, then post a
              production batch. Finished stock will appear here under
              the appropriate product size.
            </p>

            <div className="mt-5 flex flex-wrap justify-center gap-2">
              <button
                type="button"
                onClick={() => navigate("/dashboard/products")}
                className="erp-button-secondary"
              >
                Products & Recipes
              </button>

              <button
                type="button"
                onClick={() => navigate("/dashboard/production")}
                className="erp-button-primary"
              >
                <ChefHat size={14} />
                Production
              </button>
            </div>
          </div>
        </section>
      )}

      {(loading || Boolean(data?.items.length)) && (
        <section className="erp-panel mt-4 overflow-hidden">
          <div className="flex flex-col gap-4 border-b border-bauraBorder px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="erp-section-title">
                Finished Products
              </h2>

              <p className="erp-section-subtitle">
                {filtered.length} shown · {data?.items.length ?? 0} stock
                variants
              </p>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="erp-search sm:w-64">
                <Search size={15} className="text-bauraMuted" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search product or size..."
                  className="w-full bg-transparent text-[11px] outline-none"
                />
              </div>

              <select
                value={sizeFilter}
                onChange={(event) =>
                  setSizeFilter(event.target.value as SizeFilter)
                }
                className="erp-input sm:w-40"
              >
                <option value="ALL">All Sizes</option>
                <option value="SIZED">Sized Products</option>
                <option value="STANDARD">Standard Products</option>
                <option value="LEGACY">Legacy Stock</option>
              </select>

              <select
                value={status}
                onChange={(event) =>
                  setStatus(event.target.value as StockFilter)
                }
                className="erp-input sm:w-40"
              >
                <option value="ALL">All Status</option>
                <option value="IN_STOCK">In Stock</option>
                <option value="LOW_STOCK">Low Stock</option>
                <option value="OUT_OF_STOCK">Out of Stock</option>
                <option value="EXPIRED_ONLY">Expired Only</option>
              </select>

              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={() => {
                    setSearch("");
                    setStatus("ALL");
                    setSizeFilter("ALL");
                  }}
                  className="erp-button-secondary"
                >
                  <X size={13} />
                  Clear
                </button>
              )}
            </div>
          </div>

          <div className="baura-scrollbar overflow-x-auto">
            <table className="min-w-full text-left">
              <thead className="erp-table-header">
                <tr>
                  <th className="px-5 py-3">Product</th>
                  <th className="px-5 py-3">Size</th>
                  <th className="px-5 py-3 text-right">Sellable</th>
                  <th className="px-5 py-3 text-right">Expired</th>
                  <th className="px-5 py-3 text-right">Avg Cost</th>
                  <th className="px-5 py-3 text-right">Value</th>
                  <th className="px-5 py-3 text-right">Lots</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3 text-right">Action</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-bauraBorder">
                {loading ? (
                  <tr>
                    <td
                      colSpan={9}
                      className="px-5 py-12 text-center text-[11px] text-bauraMuted"
                    >
                      Loading Bakery Stock...
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td
                      colSpan={9}
                      className="px-5 py-12 text-center text-[11px] text-bauraMuted"
                    >
                      No finished products match the selected filters.
                    </td>
                  </tr>
                ) : (
                  filtered.map((item) => (
                    <tr
                      key={`${item.productId}:${item.productSizeId ?? (
                        item.isLegacyStock ? "legacy" : "standard"
                      )}`}
                      className="bg-white text-[11px] transition hover:bg-bauraCanvas2"
                    >
                      <td className="px-5 py-3.5">
                        <p className="font-semibold text-bauraInk">
                          {item.variantName
                            ? `${item.name} - ${item.variantName}`
                            : item.name}
                        </p>

                        <p className="mt-0.5 text-[9px] text-bauraMuted">
                          Sell {formatCurrency(item.sellPrice)}
                        </p>
                      </td>

                      <td className="px-5 py-3.5">
                        <SizeBadge
                          label={getSizeLabel(item)}
                          legacy={item.isLegacyStock}
                          standard={
                            !item.productSizeId && !item.isLegacyStock
                          }
                        />
                      </td>

                      <td className="px-5 py-3.5 text-right text-[13px] font-semibold text-bauraInk">
                        {formatQty(item.availableQty)}
                      </td>

                      <td
                        className={`px-5 py-3.5 text-right ${
                          item.expiredQty > 0
                            ? "font-semibold text-bauraDanger"
                            : "text-bauraMuted"
                        }`}
                      >
                        {formatQty(item.expiredQty)}
                      </td>

                      <td className="px-5 py-3.5 text-right font-medium">
                        {formatCurrency(item.weightedAverageCost)}
                      </td>

                      <td className="px-5 py-3.5 text-right font-semibold">
                        {formatCurrency(item.stockValue)}
                      </td>

                      <td className="px-5 py-3.5 text-right text-bauraMuted">
                        {item.lotCount}
                      </td>

                      <td className="px-5 py-3.5">
                        <StockStatusBadge status={item.status} />
                      </td>

                      <td className="px-5 py-3.5 text-right">
                        <button
                          type="button"
                          onClick={() => void openProduct(item)}
                          className="erp-button-secondary h-8 px-3"
                        >
                          <Eye size={12} />
                          View
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {!loading && filtered.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-bauraBorder bg-bauraCanvas2/50 px-5 py-3">
              <p className="text-[9px] text-bauraMuted">
                Inventory is grouped by product and size. Expired
                quantities are excluded from sellable stock.
              </p>

              <p className="text-[10px] font-semibold text-bauraInk">
                {filtered.length} variants ·{" "}
                {formatQty(
                  filtered.reduce(
                    (total, item) => total + item.availableQty,
                    0
                  )
                )}{" "}
                sellable units
              </p>
            </div>
          )}
        </section>
      )}

      <Modal
        open={Boolean(detailSelection)}
        onClose={closeDetail}
        title={
          detailSelection?.displayName || "Bakery Stock Details"
        }
        subtitle="Size-specific production lots, available stock and movement history."
        widthClassName="max-w-5xl"
      >
        {detailLoading || !detail ? (
          <div className="py-12 text-center text-[10px] text-bauraMuted">
            Loading stock details...
          </div>
        ) : (
          <div className="grid gap-5">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <DetailMetric
                label="Sellable Units"
                value={formatQty(detail.stock.availableQty)}
                note="Available for POS"
              />

              <DetailMetric
                label="Expired Units"
                value={formatQty(detail.stock.expiredQty)}
                note="Excluded from sales"
                warning={detail.stock.expiredQty > 0}
              />

              <DetailMetric
                label="Average Unit Cost"
                value={formatCurrency(
                  detail.stock.weightedAverageCost
                )}
                note="Weighted production cost"
              />

              <DetailMetric
                label="Sellable Stock Value"
                value={formatCurrency(detail.stock.stockValue)}
                note="Remaining sellable inventory"
              />
            </div>

            <section className="overflow-hidden rounded-[16px] border border-bauraBorder">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-bauraBorder bg-bauraCanvas2 px-4 py-3">
                <div>
                  <p className="text-[11px] font-semibold text-bauraInk">
                    Current Production Lots
                  </p>

                  <p className="mt-0.5 text-[9px] text-bauraMuted">
                    {detail.lots.length} lots with remaining stock
                  </p>
                </div>

                <StockStatusBadge status={detail.stock.status} />
              </div>

              {detail.lots.length === 0 ? (
                <div className="px-5 py-10 text-center">
                  <PackageCheck
                    size={22}
                    className="mx-auto text-bauraMuted2"
                  />

                  <p className="mt-3 text-[10px] font-medium text-bauraMuted">
                    No remaining finished stock for this selection.
                  </p>
                </div>
              ) : (
                <div className="baura-scrollbar overflow-x-auto">
                  <table className="min-w-full text-left text-[10px]">
                    <thead className="erp-table-header">
                      <tr>
                        <th className="px-4 py-2.5">Batch</th>
                        <th className="px-4 py-2.5">Size</th>
                        <th className="px-4 py-2.5">Produced</th>
                        <th className="px-4 py-2.5">Expiry</th>
                        <th className="px-4 py-2.5 text-right">
                          Original
                        </th>
                        <th className="px-4 py-2.5 text-right">
                          Remaining
                        </th>
                        <th className="px-4 py-2.5 text-right">
                          Unit Cost
                        </th>
                        <th className="px-4 py-2.5 text-right">
                          Value
                        </th>
                        <th className="px-4 py-2.5">State</th>
                      </tr>
                    </thead>

                    <tbody className="divide-y divide-bauraBorder">
                      {detail.lots.map((lot) => (
                        <tr key={lot.id}>
                          <td className="px-4 py-3 font-semibold text-bauraInk">
                            {lot.batchNo}
                          </td>

                          <td className="px-4 py-3">
                            <SizeBadge
                              label={
                                lot.productSizeLabel ||
                                (detailSelection?.isLegacyStock
                                  ? "Legacy"
                                  : "Standard")
                              }
                              legacy={
                                !lot.productSizeId &&
                                detailSelection?.isLegacyStock
                              }
                              standard={
                                !lot.productSizeId &&
                                !detailSelection?.isLegacyStock
                              }
                            />
                          </td>

                          <td className="px-4 py-3 text-bauraMuted">
                            {formatDateTime(lot.producedAt)}
                          </td>

                          <td className="px-4 py-3 text-bauraMuted">
                            {formatDate(lot.expiryDate)}
                          </td>

                          <td className="px-4 py-3 text-right">
                            {formatQty(lot.producedQty)}
                          </td>

                          <td className="px-4 py-3 text-right font-semibold text-bauraInk">
                            {formatQty(lot.remainingQty)}
                          </td>

                          <td className="px-4 py-3 text-right">
                            {formatCurrency(lot.unitCost)}
                          </td>

                          <td className="px-4 py-3 text-right font-semibold">
                            {formatCurrency(lot.stockValue)}
                          </td>

                          <td className="px-4 py-3">
                            {lot.isExpired ? (
                              <span className="erp-badge bg-bauraDangerSoft text-bauraDanger">
                                Expired
                              </span>
                            ) : (
                              <span className="erp-badge bg-bauraSuccessSoft text-bauraSuccess">
                                Sellable
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section className="overflow-hidden rounded-[16px] border border-bauraBorder">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-bauraBorder bg-bauraCanvas2 px-4 py-3">
                <div>
                  <p className="text-[11px] font-semibold text-bauraInk">
                    Stock Movement History
                  </p>

                  <p className="mt-0.5 text-[9px] text-bauraMuted">
                    Latest {detail.movements.length} movements for this
                    selection
                  </p>
                </div>

                <span className="erp-badge bg-bauraGoldSoft text-bauraGoldDark">
                  <Layers3 size={11} />
                  Movements
                </span>
              </div>

              {detail.movements.length === 0 ? (
                <p className="px-5 py-10 text-center text-[10px] text-bauraMuted">
                  No stock movements recorded.
                </p>
              ) : (
                <div className="divide-y divide-bauraBorder">
                  {detail.movements.map((movement) => {
                    const positive = getMovementPositive(
                      movement.qtyDelta
                    );

                    return (
                      <div
                        key={movement.id}
                        className="grid gap-3 px-4 py-3 text-[10px] sm:grid-cols-[125px_1fr_auto] sm:items-center"
                      >
                        <div>
                          <span className="erp-badge bg-bauraGoldSoft/60 text-bauraPrimary">
                            {getMovementLabel(movement.movementType)}
                          </span>
                        </div>

                        <div>
                          <p className="font-medium text-bauraInk">
                            {movement.note || "Stock movement"}
                          </p>

                          <p className="mt-1 text-[9px] text-bauraMuted">
                            {formatDateTime(movement.occurredAt)}
                            {movement.productSizeLabel
                              ? ` · ${movement.productSizeLabel}`
                              : ""}
                          </p>

                          {movement.costAmount !== null && (
                            <p className="mt-1 text-[9px] text-bauraMuted">
                              Cost:{" "}
                              {formatCurrency(movement.costAmount)}
                            </p>
                          )}
                        </div>

                        <div
                          className={`flex items-center justify-end gap-1.5 font-semibold ${
                            positive
                              ? "text-bauraSuccess"
                              : "text-bauraDanger"
                          }`}
                        >
                          {positive ? (
                            <ArrowUpRight size={14} />
                          ) : (
                            <ArrowDownRight size={14} />
                          )}

                          {Number(movement.qtyDelta) > 0 ? "+" : ""}
                          {formatQty(movement.qtyDelta)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
        )}
      </Modal>
    </AppLayout>
  );
}

function SummaryCard({
  label,
  value,
  note,
  icon,
  warning = false
}: {
  label: string;
  value: string;
  note: string;
  icon: ReactNode;
  warning?: boolean;
}) {
  return (
    <div className={`erp-kpi ${warning ? "border-amber-200" : ""}`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[9px] font-semibold uppercase tracking-[0.09em] text-bauraMuted">
            {label}
          </p>

          <p className="mt-2 text-[22px] font-semibold tracking-[-0.04em] text-bauraInk">
            {value}
          </p>

          <p className="mt-1 text-[9px] text-bauraMuted">
            {note}
          </p>
        </div>

        <div
          className={`flex h-9 w-9 items-center justify-center rounded-xl ${
            warning
              ? "bg-bauraWarningSoft text-bauraWarning"
              : "bg-bauraGoldSoft text-bauraGoldDark"
          }`}
        >
          {icon}
        </div>
      </div>
    </div>
  );
}

function MiniStat({
  label,
  value,
  description,
  icon,
  warning = false
}: {
  label: string;
  value: string;
  description?: string;
  icon: ReactNode;
  warning?: boolean;
}) {
  return (
    <div className="rounded-[15px] border border-bauraBorder bg-white px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[9px] font-semibold uppercase tracking-[0.07em] text-bauraMuted">
          {label}
        </p>

        <span
          className={
            warning ? "text-bauraWarning" : "text-bauraGoldDark"
          }
        >
          {icon}
        </span>
      </div>

      <p className="mt-2 text-[16px] font-semibold text-bauraInk">
        {value}
      </p>

      {description && (
        <p className="mt-1 text-[9px] text-bauraMuted">
          {description}
        </p>
      )}
    </div>
  );
}

function DetailMetric({
  label,
  value,
  note,
  warning = false
}: {
  label: string;
  value: string;
  note: string;
  warning?: boolean;
}) {
  return (
    <div
      className={`rounded-[14px] border p-3 ${
        warning
          ? "border-amber-200 bg-amber-50/40"
          : "border-bauraBorder bg-bauraCanvas2/50"
      }`}
    >
      <p className="text-[9px] font-medium text-bauraMuted">
        {label}
      </p>

      <p className="mt-1.5 text-[17px] font-semibold text-bauraInk">
        {value}
      </p>

      <p className="mt-1 text-[9px] text-bauraMuted">
        {note}
      </p>
    </div>
  );
}

function SizeBadge({
  label,
  legacy = false,
  standard = false
}: {
  label: string;
  legacy?: boolean;
  standard?: boolean;
}) {
  if (legacy) {
    return (
      <span className="erp-badge bg-bauraWarningSoft text-bauraWarning">
        {label}
      </span>
    );
  }

  if (standard) {
    return (
      <span className="erp-badge bg-bauraCanvas2 text-bauraMuted">
        {label}
      </span>
    );
  }

  return (
    <span className="erp-badge bg-bauraGoldSoft text-bauraGoldDark">
      {label}
    </span>
  );
}

function StockStatusBadge({
  status
}: {
  status: StockStatus;
}) {
  switch (status) {
    case "IN_STOCK":
      return (
        <span className="erp-badge bg-bauraSuccessSoft text-bauraSuccess">
          In Stock
        </span>
      );

    case "LOW_STOCK":
      return (
        <span className="erp-badge bg-bauraWarningSoft text-bauraWarning">
          Low Stock
        </span>
      );

    case "EXPIRED_ONLY":
      return (
        <span className="erp-badge bg-bauraDangerSoft text-bauraDanger">
          Expired Only
        </span>
      );

    default:
      return (
        <span className="erp-badge bg-bauraDangerSoft text-bauraDanger">
          Out of Stock
        </span>
      );
  }
}
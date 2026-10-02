import {
  useEffect,
  useMemo,
  useState
} from "react";

import type {
  ReactNode
} from "react";

import {
  AlertTriangle,
  ChefHat,
  Eye,
  PackageCheck,
  RefreshCw,
  Search,
  ShoppingCart,
  WalletCards
} from "lucide-react";

import {
  useNavigate
} from "react-router-dom";

import {
  AppLayout
} from "../layouts/AppLayout";

import {
  apiRequest
} from "../lib/api";

import {
  Modal
} from "../ui/Modal";

import {
  useToast
} from "../ui/ToastProvider";

type StockStatus =
  | "IN_STOCK"
  | "LOW_STOCK"
  | "OUT_OF_STOCK"
  | "EXPIRED_ONLY";

type BakeryStockItem = {
  productId: string;
  name: string;

  variantName:
    | string
    | null;

  displayName:
    string;

  sellPrice:
    string;

  availableQty:
    number;

  expiredQty:
    number;

  totalOnHand:
    number;

  weightedAverageCost:
    number;

  sellableValue:
    number;

  stockValue:
    number;

  lotCount:
    number;

  finishedStockAlertQty:
    | string
    | null;

  status:
    StockStatus;
};

type BakeryStockResponse = {
  summary: {
    activeProducts:
      number;

    productsInStock:
      number;

    lowStockProducts:
      number;

    outOfStockProducts:
      number;

    totalAvailableUnits:
      number;

    totalStockValue:
      number;
  };

  items:
    BakeryStockItem[];
};

type BakeryStockDetail = {
  product: {
    id: string;
    displayName: string;
    sellPrice: string;

    finishedStockAlertQty:
      | string
      | null;
  };

  lots: Array<{
    id: string;

    productionBatchId:
      string;

    batchNo: string;

    producedQty:
      string;

    remainingQty:
      string;

    unitCost:
      string;

    producedAt:
      string;

    expiryDate:
      | string
      | null;

    rejectedQty:
      string;

    isExpired:
      boolean;

    stockValue:
      number;
  }>;

  movements: Array<{
    id: string;
    movementType: string;

    stockLotId:
      | string
      | null;

    refType:
      | string
      | null;

    refId:
      | string
      | null;

    qtyDelta:
      string;

    unitCost:
      | string
      | null;

    costAmount:
      | string
      | null;

    note:
      | string
      | null;

    occurredAt:
      string;
  }>;
};

function formatCurrency(
  value:
    | number
    | string
    | null
    | undefined
) {
  return `Rs. ${Number(
    value || 0
  ).toLocaleString(
    "en-LK",
    {
      minimumFractionDigits:
        2,

      maximumFractionDigits:
        2
    }
  )}`;
}

function formatQty(
  value:
    | number
    | string
    | null
    | undefined
) {
  return Number(
    value || 0
  ).toLocaleString(
    "en-LK",
    {
      maximumFractionDigits:
        3
    }
  );
}

function formatDateTime(
  value:
    | string
    | null
    | undefined
) {
  if (!value) {
    return "—";
  }

  return new Date(
    value
  ).toLocaleString(
    "en-LK",
    {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    }
  );
}

export function BakeryStockPage() {
  const navigate =
    useNavigate();

  const toast =
    useToast();

  const [
    data,
    setData
  ] =
    useState<
      BakeryStockResponse | null
    >(null);

  const [
    loading,
    setLoading
  ] =
    useState(true);

  const [
    search,
    setSearch
  ] =
    useState("");

  const [
    status,
    setStatus
  ] =
    useState<
      | "ALL"
      | StockStatus
    >("ALL");

  const [
    detail,
    setDetail
  ] =
    useState<
      BakeryStockDetail | null
    >(null);

  const [
    detailLoading,
    setDetailLoading
  ] =
    useState(false);

  const filtered =
    useMemo(() => {
      const keyword =
        search
          .trim()
          .toLowerCase();

      return (
        data?.items ||
        []
      ).filter(
        (item) => {
          const matchesSearch =
            !keyword ||
            item.displayName
              .toLowerCase()
              .includes(
                keyword
              );

          const matchesStatus =
            status ===
              "ALL" ||
            item.status ===
              status;

          return (
            matchesSearch &&
            matchesStatus
          );
        }
      );
    }, [
      data,
      search,
      status
    ]);

  async function loadStock(
    showSuccess = false
  ) {
    setLoading(
      true
    );

    try {
      const response =
        await apiRequest<BakeryStockResponse>(
          "/bakery-stock"
        );

      setData(
        response
      );

      if (
        showSuccess
      ) {
        toast.success(
          "Bakery Stock refreshed"
        );
      }
    } catch (error) {
      toast.error(
        "Unable to load Bakery Stock",

        error instanceof Error
          ? error.message
          : "Please try again."
      );

      setData({
        summary: {
          activeProducts: 0,
          productsInStock: 0,
          lowStockProducts: 0,
          outOfStockProducts: 0,
          totalAvailableUnits: 0,
          totalStockValue: 0
        },

        items: []
      });
    } finally {
      setLoading(
        false
      );
    }
  }

  useEffect(() => {
    loadStock();
  }, []);

  async function openProduct(
    productId: string
  ) {
    setDetailLoading(
      true
    );

    try {
      const response =
        await apiRequest<BakeryStockDetail>(
          `/bakery-stock/${productId}`
        );

      setDetail(
        response
      );
    } catch (error) {
      toast.error(
        "Unable to load stock details",

        error instanceof Error
          ? error.message
          : "Please try again."
      );
    } finally {
      setDetailLoading(
        false
      );
    }
  }

  const summary =
    data?.summary;

  return (
    <AppLayout
      activeItem="Bakery Stock"
      title="Bakery Stock"
      subtitle="Finished baked and prepared products available for POS sale."
      actions={
        <>
          <button
            type="button"
            onClick={() =>
              loadStock(
                true
              )
            }
            className="erp-button-secondary"
          >
            <RefreshCw
              size={14}
              className={
                loading
                  ? "animate-spin"
                  : ""
              }
            />

            Refresh
          </button>

          <button
            type="button"
            onClick={() =>
              navigate(
                "/dashboard/production"
              )
            }
            className="erp-button-primary"
          >
            <ChefHat
              size={14}
            />

            New Production
          </button>
        </>
      }
    >
      <section className="mb-4 overflow-hidden rounded-[18px] border border-[#EADFCF] bg-gradient-to-r from-[#FFFDF8] to-[#FAF2E6] p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-bauraGoldSoft text-bauraGoldDark">
              <PackageCheck
                size={18}
              />
            </div>

            <div>
              <p className="text-[10px] font-semibold text-bauraInk">
                Production creates Bakery Stock
              </p>

              <p className="mt-1 max-w-2xl text-[9px] leading-5 text-bauraMuted">
                Products appear here after a production batch is posted.
                POS consumes from this stock — it does not deduct ingredients directly.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() =>
              navigate(
                "/pos"
              )
            }
            className="erp-button-secondary shrink-0"
          >
            <ShoppingCart
              size={14}
            />

            Open POS
          </button>
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          label="Sellable Units"
          value={formatQty(
            summary?.totalAvailableUnits
          )}
          note={`${
            summary?.productsInStock ||
            0
          } products in stock`}
          icon={
            <PackageCheck
              size={18}
            />
          }
        />

        <SummaryCard
          label="Finished Stock Value"
          value={formatCurrency(
            summary?.totalStockValue
          )}
          note="Ingredient cost carried in stock"
          icon={
            <WalletCards
              size={18}
            />
          }
        />

        <SummaryCard
          label="Low Stock Products"
          value={String(
            summary?.lowStockProducts ||
              0
          )}
          note="Below product alert level"
          icon={
            <AlertTriangle
              size={18}
            />
          }
          warning={Boolean(
            summary?.lowStockProducts
          )}
        />

        <SummaryCard
          label="No Sellable Stock"
          value={String(
            summary?.outOfStockProducts ||
              0
          )}
          note="Out of stock or expired"
          icon={
            <PackageCheck
              size={18}
            />
          }
          warning={Boolean(
            summary?.outOfStockProducts
          )}
        />
      </div>

      {!loading &&
        data?.items.length ===
          0 && (
          <section className="erp-panel mt-4 p-6 sm:p-8">
            <div className="mx-auto max-w-xl text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-bauraGoldSoft text-bauraGoldDark">
                <PackageCheck
                  size={22}
                />
              </div>

              <h2 className="mt-4 text-[18px] font-semibold tracking-[-0.025em] text-bauraInk">
                No finished products are configured yet
              </h2>

              <p className="mt-2 text-[10px] leading-6 text-bauraMuted">
                Create products with recipes first, then post a production batch.
                The good output will automatically appear here as Bakery Stock.
              </p>

              <div className="mt-5 flex flex-wrap justify-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    navigate(
                      "/dashboard/products"
                    )
                  }
                  className="erp-button-secondary"
                >
                  Products & Recipes
                </button>

                <button
                  type="button"
                  onClick={() =>
                    navigate(
                      "/dashboard/production"
                    )
                  }
                  className="erp-button-primary"
                >
                  <ChefHat
                    size={14}
                  />

                  Production
                </button>
              </div>
            </div>
          </section>
        )}

      {(loading ||
        Boolean(
          data?.items.length
        )) && (
        <section className="erp-panel mt-4 overflow-hidden">
          <div className="flex flex-col gap-4 border-b border-bauraBorder px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="erp-section-title">
                Finished Products
              </h2>

              <p className="erp-section-subtitle">
                {filtered.length} shown ·{" "}
                {data?.items.length ||
                  0}{" "}
                products
              </p>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="erp-search sm:w-72">
                <Search
                  size={15}
                  className="text-bauraMuted"
                />

                <input
                  value={
                    search
                  }
                  onChange={(
                    event
                  ) =>
                    setSearch(
                      event.target
                        .value
                    )
                  }
                  placeholder="Search finished product..."
                  className="w-full bg-transparent text-[11px] outline-none"
                />
              </div>

              <select
                value={
                  status
                }
                onChange={(
                  event
                ) =>
                  setStatus(
                    event.target
                      .value as
                      | "ALL"
                      | StockStatus
                  )
                }
                className="erp-input sm:w-44"
              >
                <option value="ALL">
                  All Status
                </option>

                <option value="IN_STOCK">
                  In Stock
                </option>

                <option value="LOW_STOCK">
                  Low Stock
                </option>

                <option value="OUT_OF_STOCK">
                  Out of Stock
                </option>

                <option value="EXPIRED_ONLY">
                  Expired Only
                </option>
              </select>
            </div>
          </div>

          <div className="baura-scrollbar overflow-x-auto">
            <table className="min-w-full text-left">
              <thead className="erp-table-header">
                <tr>
                  <th className="px-5 py-3">
                    Product
                  </th>

                  <th className="px-5 py-3 text-right">
                    Sellable
                  </th>

                  <th className="px-5 py-3 text-right">
                    Expired
                  </th>

                  <th className="px-5 py-3 text-right">
                    Avg Cost
                  </th>

                  <th className="px-5 py-3 text-right">
                    Value
                  </th>

                  <th className="px-5 py-3 text-right">
                    Lots
                  </th>

                  <th className="px-5 py-3">
                    Status
                  </th>

                  <th className="px-5 py-3 text-right">
                    Action
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-bauraBorder">
                {loading ? (
                  <tr>
                    <td
                      colSpan={8}
                      className="px-5 py-12 text-center text-[11px] text-bauraMuted"
                    >
                      Loading Bakery Stock...
                    </td>
                  </tr>
                ) : filtered.length ===
                  0 ? (
                  <tr>
                    <td
                      colSpan={8}
                      className="px-5 py-12 text-center text-[11px] text-bauraMuted"
                    >
                      No finished products match the selected filter.
                    </td>
                  </tr>
                ) : (
                  filtered.map(
                    (item) => (
                      <tr
                        key={
                          item.productId
                        }
                        className="bg-white text-[11px] transition hover:bg-bauraCanvas2"
                      >
                        <td className="px-5 py-3.5">
                          <p className="font-semibold text-bauraInk">
                            {
                              item.displayName
                            }
                          </p>

                          <p className="mt-0.5 text-[9px] text-bauraMuted">
                            Sell{" "}
                            {formatCurrency(
                              item.sellPrice
                            )}
                          </p>
                        </td>

                        <td className="px-5 py-3.5 text-right text-[13px] font-semibold text-bauraInk">
                          {formatQty(
                            item.availableQty
                          )}
                        </td>

                        <td
                          className={`px-5 py-3.5 text-right ${
                            item.expiredQty >
                            0
                              ? "font-semibold text-bauraDanger"
                              : "text-bauraMuted"
                          }`}
                        >
                          {formatQty(
                            item.expiredQty
                          )}
                        </td>

                        <td className="px-5 py-3.5 text-right font-medium">
                          {formatCurrency(
                            item.weightedAverageCost
                          )}
                        </td>

                        <td className="px-5 py-3.5 text-right font-semibold">
                          {formatCurrency(
                            item.stockValue
                          )}
                        </td>

                        <td className="px-5 py-3.5 text-right text-bauraMuted">
                          {
                            item.lotCount
                          }
                        </td>

                        <td className="px-5 py-3.5">
                          <StockStatusBadge
                            status={
                              item.status
                            }
                          />
                        </td>

                        <td className="px-5 py-3.5 text-right">
                          <button
                            type="button"
                            onClick={() =>
                              openProduct(
                                item.productId
                              )
                            }
                            className="erp-button-secondary h-8 px-3"
                          >
                            <Eye
                              size={12}
                            />

                            View
                          </button>
                        </td>
                      </tr>
                    )
                  )
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <Modal
        open={
          Boolean(
            detail
          ) ||
          detailLoading
        }
        onClose={() => {
          if (
            !detailLoading
          ) {
            setDetail(
              null
            );
          }
        }}
        title={
          detail?.product
            .displayName ||
          "Bakery Stock Details"
        }
        subtitle="Finished stock lots created by posted production batches."
        widthClassName="max-w-4xl"
      >
        {detailLoading ||
        !detail ? (
          <div className="py-12 text-center text-[10px] text-bauraMuted">
            Loading stock details...
          </div>
        ) : (
          <div className="grid gap-5">
            <section className="overflow-hidden rounded-[16px] border border-bauraBorder">
              <div className="border-b border-bauraBorder bg-bauraCanvas2 px-4 py-3">
                <p className="text-[11px] font-semibold">
                  Current Production Lots
                </p>
              </div>

              {detail.lots.length ===
              0 ? (
                <div className="px-5 py-10 text-center">
                  <PackageCheck
                    size={22}
                    className="mx-auto text-bauraMuted2"
                  />

                  <p className="mt-3 text-[10px] font-medium text-bauraMuted">
                    This product has no remaining finished stock.
                  </p>
                </div>
              ) : (
                <div className="baura-scrollbar overflow-x-auto">
                  <table className="min-w-full text-left text-[10px]">
                    <thead className="erp-table-header">
                      <tr>
                        <th className="px-4 py-2.5">
                          Batch
                        </th>

                        <th className="px-4 py-2.5">
                          Produced
                        </th>

                        <th className="px-4 py-2.5">
                          Expiry
                        </th>

                        <th className="px-4 py-2.5 text-right">
                          Original
                        </th>

                        <th className="px-4 py-2.5 text-right">
                          Remaining
                        </th>

                        <th className="px-4 py-2.5 text-right">
                          Cost
                        </th>

                        <th className="px-4 py-2.5">
                          State
                        </th>
                      </tr>
                    </thead>

                    <tbody className="divide-y divide-bauraBorder">
                      {detail.lots.map(
                        (lot) => (
                          <tr
                            key={
                              lot.id
                            }
                          >
                            <td className="px-4 py-3 font-semibold">
                              {
                                lot.batchNo
                              }
                            </td>

                            <td className="px-4 py-3 text-bauraMuted">
                              {formatDateTime(
                                lot.producedAt
                              )}
                            </td>

                            <td className="px-4 py-3 text-bauraMuted">
                              {formatDateTime(
                                lot.expiryDate
                              )}
                            </td>

                            <td className="px-4 py-3 text-right">
                              {formatQty(
                                lot.producedQty
                              )}
                            </td>

                            <td className="px-4 py-3 text-right font-semibold">
                              {formatQty(
                                lot.remainingQty
                              )}
                            </td>

                            <td className="px-4 py-3 text-right">
                              {formatCurrency(
                                lot.unitCost
                              )}
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
                        )
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section className="overflow-hidden rounded-[16px] border border-bauraBorder">
              <div className="border-b border-bauraBorder bg-bauraCanvas2 px-4 py-3">
                <p className="text-[11px] font-semibold">
                  Stock Movement History
                </p>
              </div>

              {detail.movements.length ===
              0 ? (
                <p className="px-5 py-10 text-center text-[10px] text-bauraMuted">
                  No stock movements recorded.
                </p>
              ) : (
                <div className="divide-y divide-bauraBorder">
                  {detail.movements
                    .slice(
                      0,
                      30
                    )
                    .map(
                      (movement) => (
                        <div
                          key={
                            movement.id
                          }
                          className="grid gap-2 px-4 py-3 text-[10px] sm:grid-cols-[120px_1fr_auto] sm:items-center"
                        >
                          <div>
                            <span className="erp-badge bg-bauraGoldSoft/60 text-bauraPrimary">
                              {
                                movement.movementType
                              }
                            </span>
                          </div>

                          <div>
                            <p className="font-medium text-bauraInk">
                              {movement.note ||
                                "Stock movement"}
                            </p>

                            <p className="mt-0.5 text-[8px] text-bauraMuted">
                              {formatDateTime(
                                movement.occurredAt
                              )}
                            </p>
                          </div>

                          <p
                            className={`font-semibold ${
                              Number(
                                movement.qtyDelta
                              ) <
                              0
                                ? "text-bauraDanger"
                                : "text-bauraSuccess"
                            }`}
                          >
                            {Number(
                              movement.qtyDelta
                            ) >
                            0
                              ? "+"
                              : ""}
                            {formatQty(
                              movement.qtyDelta
                            )}
                          </p>
                        </div>
                      )
                    )}
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
    <div
      className={`erp-kpi ${
        warning
          ? "border-amber-200"
          : ""
      }`}
    >
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

function StockStatusBadge({
  status
}: {
  status:
    StockStatus;
}) {
  switch (
    status
  ) {
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
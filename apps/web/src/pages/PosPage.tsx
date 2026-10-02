import {
  useEffect,
  useMemo,
  useState
} from "react";

import {
  AlertTriangle,
  Banknote,
  CheckCircle2,
  Minus,
  PackageCheck,
  Plus,
  RefreshCw,
  Search,
  ShoppingCart,
  Trash2,
  X
} from "lucide-react";

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

type PaymentMethod =
  | "CASH"
  | "CARD"
  | "BANK_TRANSFER"
  | "ONLINE"
  | "OTHER";

type PosProduct = {
  id: string;
  name: string;

  variantName:
    | string
    | null;

  displayName: string;

  sellPrice:
    | string
    | number;

  availableQty: number;

  isInStock: boolean;

  finishedStockAlertQty:
    | string
    | number
    | null;
};

type SalesChannel = {
  id: string;
  name: string;
  isActive: boolean;
};

type CartItem = {
  productId: string;
  displayName: string;
  qty: number;
  unitSellPrice: number;
  availableQty: number;
};

type CompletedSale = {
  id: string;
  orderNo: string;
  grossTotal: string;
  discountTotal: string;
  netTotal: string;
  cogsTotal: string;
  profitTotal: string;
  paymentMethod: PaymentMethod;
  soldAt: string;
};

const paymentMethods:
  PaymentMethod[] = [
    "CASH",
    "CARD",
    "BANK_TRANSFER",
    "ONLINE",
    "OTHER"
  ];

function formatCurrency(
  value:
    | number
    | string
    | null
    | undefined
) {
  const amount =
    Number(
      value || 0
    );

  return `Rs. ${amount.toLocaleString(
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

function formatPaymentMethod(
  value:
    PaymentMethod
) {
  return value
    .split("_")
    .map(
      (part) =>
        part.charAt(0) +
        part
          .slice(1)
          .toLowerCase()
    )
    .join(" ");
}

export function PosPage() {
  const toast =
    useToast();

  const [
    products,
    setProducts
  ] =
    useState<
      PosProduct[]
    >([]);

  const [
    channels,
    setChannels
  ] =
    useState<
      SalesChannel[]
    >([]);

  const [
    cart,
    setCart
  ] =
    useState<
      CartItem[]
    >([]);

  const [
    search,
    setSearch
  ] =
    useState("");

  const [
    salesChannelId,
    setSalesChannelId
  ] =
    useState("");

  const [
    paymentMethod,
    setPaymentMethod
  ] =
    useState<PaymentMethod>(
      "CASH"
    );

  const [
    discountTotal,
    setDiscountTotal
  ] =
    useState("");

  const [
    completedSale,
    setCompletedSale
  ] =
    useState<
      CompletedSale | null
    >(null);

  const [
    isLoading,
    setIsLoading
  ] =
    useState(true);

  const [
    isCompletingSale,
    setIsCompletingSale
  ] =
    useState(false);

  const filteredProducts =
    useMemo(() => {
      const keyword =
        search
          .trim()
          .toLowerCase();

      if (!keyword) {
        return products;
      }

      return products.filter(
        (product) =>
          product.displayName
            .toLowerCase()
            .includes(
              keyword
            )
      );
    }, [
      products,
      search
    ]);

  const grossTotal =
    useMemo(() => {
      return cart.reduce(
        (
          total,
          item
        ) =>
          total +
          item.qty *
            item.unitSellPrice,
        0
      );
    }, [
      cart
    ]);

  const safeDiscountTotal =
    useMemo(() => {
      const discount =
        Number(
          discountTotal ||
            0
        );

      if (
        Number.isNaN(
          discount
        )
      ) {
        return 0;
      }

      return Math.min(
        Math.max(
          discount,
          0
        ),
        grossTotal
      );
    }, [
      discountTotal,
      grossTotal
    ]);

  const netTotal =
    grossTotal -
    safeDiscountTotal;

  const totalCartQty =
    useMemo(
      () =>
        cart.reduce(
          (
            total,
            item
          ) =>
            total +
            item.qty,
          0
        ),
      [
        cart
      ]
    );

  const availableProductCount =
    useMemo(
      () =>
        products.filter(
          (product) =>
            product.isInStock &&
            Number(
              product.availableQty
            ) >
              0
        ).length,
      [
        products
      ]
    );

  async function loadPosData(
    showToast = false
  ) {
    setIsLoading(
      true
    );

    try {
      const [
        productsData,
        channelsData
      ] =
        await Promise.all([
          apiRequest<{
            products:
              PosProduct[];
          }>(
            "/sales/products"
          ),

          apiRequest<{
            channels:
              SalesChannel[];
          }>(
            "/sales/channels"
          )
        ]);

      setProducts(
        productsData.products
      );

      setChannels(
        channelsData.channels.filter(
          (channel) =>
            channel.isActive
        )
      );

      /*
       * Refresh the stock limits already stored in cart.
       *
       * This matters after another POS terminal or sale changes
       * Bakery Stock while this screen is open.
       */
      setCart(
        (current) =>
          current
            .map(
              (item) => {
                const latest =
                  productsData.products.find(
                    (
                      product
                    ) =>
                      product.id ===
                      item.productId
                  );

                if (
                  !latest
                ) {
                  return null;
                }

                const availableQty =
                  Number(
                    latest.availableQty ||
                      0
                  );

                if (
                  availableQty <=
                  0
                ) {
                  return null;
                }

                return {
                  ...item,

                  unitSellPrice:
                    Number(
                      latest.sellPrice
                    ),

                  availableQty,

                  qty:
                    Math.min(
                      item.qty,
                      availableQty
                    )
                };
              }
            )
            .filter(
              (
                item
              ): item is CartItem =>
                item !==
                null
            )
      );

      if (
        showToast
      ) {
        toast.success(
          "POS refreshed",
          "Latest Bakery Stock is now available."
        );
      }
    } catch (error) {
      toast.error(
        "Failed to load POS",

        error instanceof Error
          ? error.message
          : "Unable to load POS data."
      );
    } finally {
      setIsLoading(
        false
      );
    }
  }

  useEffect(() => {
    loadPosData();
  }, []);

  function addToCart(
    product:
      PosProduct
  ) {
    const availableQty =
      Number(
        product.availableQty ||
          0
      );

    if (
      !product.isInStock ||
      availableQty <= 0
    ) {
      toast.warning(
        "Out of stock",
        `${product.displayName} is not available in Bakery Stock.`
      );

      return;
    }

    setCart(
      (current) => {
        const existing =
          current.find(
            (item) =>
              item.productId ===
              product.id
          );

        if (existing) {
          if (
            existing.qty >=
            availableQty
          ) {
            toast.warning(
              "Stock limit reached",
              `Only ${formatQty(
                availableQty
              )} ${product.displayName} available.`
            );

            return current;
          }

          return current.map(
            (item) =>
              item.productId ===
              product.id
                ? {
                    ...item,

                    qty:
                      Math.min(
                        item.qty +
                          1,

                        availableQty
                      ),

                    availableQty,

                    unitSellPrice:
                      Number(
                        product.sellPrice
                      )
                  }
                : item
          );
        }

        return [
          ...current,

          {
            productId:
              product.id,

            displayName:
              product.displayName,

            qty: 1,

            unitSellPrice:
              Number(
                product.sellPrice
              ),

            availableQty
          }
        ];
      }
    );
  }

  function increaseQty(
    productId:
      string
  ) {
    let reachedLimit =
      false;

    let productName =
      "";

    let stockLimit =
      0;

    setCart(
      (current) =>
        current.map(
          (item) => {
            if (
              item.productId !==
              productId
            ) {
              return item;
            }

            if (
              item.qty >=
              item.availableQty
            ) {
              reachedLimit =
                true;

              productName =
                item.displayName;

              stockLimit =
                item.availableQty;

              return item;
            }

            return {
              ...item,

              qty:
                item.qty +
                1
            };
          }
        )
    );

    if (
      reachedLimit
    ) {
      toast.warning(
        "Stock limit reached",
        `Only ${formatQty(
          stockLimit
        )} ${productName} available.`
      );
    }
  }

  function decreaseQty(
    productId:
      string
  ) {
    setCart(
      (current) =>
        current
          .map(
            (item) =>
              item.productId ===
              productId
                ? {
                    ...item,

                    qty:
                      Math.max(
                        item.qty -
                          1,
                        0
                      )
                  }
                : item
          )
          .filter(
            (item) =>
              item.qty >
              0
          )
    );
  }

  function updateQty(
    productId:
      string,
    value: string
  ) {
    const parsed =
      Number(value);

    setCart(
      (current) =>
        current
          .map(
            (item) => {
              if (
                item.productId !==
                productId
              ) {
                return item;
              }

              if (
                Number.isNaN(
                  parsed
                )
              ) {
                return item;
              }

              const nextQty =
                Math.min(
                  Math.max(
                    parsed,
                    0
                  ),

                  item.availableQty
                );

              return {
                ...item,

                qty:
                  nextQty
              };
            }
          )
          .filter(
            (item) =>
              item.qty >
              0
          )
    );
  }

  function removeFromCart(
    productId:
      string
  ) {
    setCart(
      (current) =>
        current.filter(
          (item) =>
            item.productId !==
            productId
        )
    );
  }

  function clearSale() {
    setCart([]);

    setDiscountTotal(
      ""
    );

    setPaymentMethod(
      "CASH"
    );

    setSalesChannelId(
      ""
    );
  }

  async function completeSale() {
    if (
      cart.length ===
      0
    ) {
      toast.info(
        "Cart is empty",
        "Add products before completing the sale."
      );

      return;
    }

    if (
      netTotal <=
      0
    ) {
      toast.warning(
        "Invalid sale total",
        "Net total must be greater than zero."
      );

      return;
    }

    const invalidStockItem =
      cart.find(
        (item) =>
          item.qty >
          item.availableQty
      );

    if (
      invalidStockItem
    ) {
      toast.warning(
        "Stock changed",
        `${invalidStockItem.displayName} only has ${formatQty(
          invalidStockItem.availableQty
        )} available. Refresh POS before completing the sale.`
      );

      return;
    }

    setIsCompletingSale(
      true
    );

    try {
      const data =
        await apiRequest<{
          message: string;
          sale:
            CompletedSale;
        }>(
          "/sales",
          {
            method:
              "POST",

            body:
              JSON.stringify(
                {
                  salesChannelId:
                    salesChannelId ||
                    null,

                  paymentMethod,

                  discountTotal:
                    safeDiscountTotal,

                  /*
                   * Server owns the sale price.
                   * Client only submits product + quantity.
                   */
                  items:
                    cart.map(
                      (item) => ({
                        productId:
                          item.productId,

                        qty:
                          item.qty
                      })
                    )
                }
              )
          }
        );

      toast.success(
        "Sale completed",
        "Bakery Stock was reduced successfully."
      );

      setCompletedSale(
        data.sale
      );

      clearSale();

      await loadPosData();
    } catch (error) {
      toast.error(
        "Sale failed",

        error instanceof Error
          ? error.message
          : "Failed to complete sale."
      );

      /*
       * Reload stock after a failed sale too.
       * The failure may be caused by another terminal consuming stock.
       */
      await loadPosData();
    } finally {
      setIsCompletingSale(
        false
      );
    }
  }

  return (
    <AppLayout
      activeItem="POS Sales"
      title="POS Sales"
      subtitle="Sell finished bakery products directly from Bakery Stock."
      actions={
        <>
          <button
            type="button"
            onClick={() =>
              loadPosData(
                true
              )
            }
            disabled={
              isLoading
            }
            className="erp-button-secondary"
          >
            <RefreshCw
              size={14}
              className={
                isLoading
                  ? "animate-spin"
                  : ""
              }
            />

            Refresh
          </button>

          <button
            type="button"
            onClick={
              clearSale
            }
            disabled={
              cart.length ===
              0
            }
            className="erp-button-danger"
          >
            <X
              size={14}
            />

            Clear Sale
          </button>
        </>
      }
    >
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <PosMetric
          label="Active Products"
          value={String(
            products.length
          )}
          note="Configured for POS"
        />

        <PosMetric
          label="Available Products"
          value={String(
            availableProductCount
          )}
          note="Have sellable Bakery Stock"
        />

        <PosMetric
          label="Cart Quantity"
          value={formatQty(
            totalCartQty
          )}
          note={`${cart.length} product${
            cart.length ===
            1
              ? ""
              : "s"
          } selected`}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.25fr_0.75fr]">
        <section className="erp-panel overflow-hidden">
          <div className="flex flex-col gap-4 border-b border-bauraBorder px-5 py-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="erp-section-title">
                Products
              </h2>

              <p className="erp-section-subtitle">
                {
                  filteredProducts.length
                }{" "}
                shown ·{" "}
                {
                  products.length
                }{" "}
                active products
              </p>
            </div>

            <div className="erp-search md:w-80">
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
                    event
                      .target
                      .value
                  )
                }
                placeholder="Search products..."
                className="w-full bg-transparent text-[11px] text-bauraInk outline-none placeholder:text-bauraMuted2"
              />
            </div>
          </div>

          <div className="baura-scrollbar max-h-[calc(100vh-310px)] min-h-[420px] overflow-auto p-4">
            {isLoading ? (
              <EmptyState
                text="Loading Bakery Stock..."
              />
            ) : filteredProducts.length ===
              0 ? (
              <EmptyState
                text="No products available for POS."
              />
            ) : (
              <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
                {filteredProducts.map(
                  (
                    product
                  ) => {
                    const cartItem =
                      cart.find(
                        (
                          item
                        ) =>
                          item.productId ===
                          product.id
                      );

                    const availableQty =
                      Number(
                        product.availableQty ||
                          0
                      );

                    const isAvailable =
                      product.isInStock &&
                      availableQty >
                        0;

                    const threshold =
                      product.finishedStockAlertQty ===
                      null
                        ? null
                        : Number(
                            product.finishedStockAlertQty
                          );

                    const lowStock =
                      isAvailable &&
                      threshold !==
                        null &&
                      availableQty <=
                        threshold;

                    return (
                      <button
                        key={
                          product.id
                        }
                        type="button"
                        disabled={
                          !isAvailable
                        }
                        onClick={() =>
                          addToCart(
                            product
                          )
                        }
                        className={`relative overflow-hidden rounded-[16px] border p-4 text-left transition duration-200 ${
                          isAvailable
                            ? "border-bauraBorder bg-white hover:border-bauraGold/60 hover:shadow-bauraCardHover"
                            : "cursor-not-allowed border-bauraBorder bg-bauraCanvas2 opacity-65"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-bauraGoldSoft text-bauraGoldDark">
                            <PackageCheck
                              size={20}
                            />
                          </div>

                          {cartItem && (
                            <span className="rounded-lg bg-bauraPrimary px-2.5 py-1 text-[9px] font-semibold text-white">
                              x
                              {
                                cartItem.qty
                              }
                            </span>
                          )}
                        </div>

                        <h3 className="mt-4 line-clamp-2 text-[12px] font-semibold leading-5 text-bauraInk">
                          {
                            product.displayName
                          }
                        </h3>

                        <p className="mt-1 text-[14px] font-semibold text-bauraPrimary">
                          {formatCurrency(
                            product.sellPrice
                          )}
                        </p>

                        <div className="mt-4 flex items-center justify-between gap-2">
                          {!isAvailable ? (
                            <span className="erp-badge bg-bauraDangerSoft text-bauraDanger">
                              Out of Stock
                            </span>
                          ) : lowStock ? (
                            <span className="erp-badge bg-bauraWarningSoft text-bauraWarning">
                              <AlertTriangle
                                size={10}
                                className="mr-1"
                              />

                              Low Stock
                            </span>
                          ) : (
                            <span className="erp-badge bg-bauraSuccessSoft text-bauraSuccess">
                              In Stock
                            </span>
                          )}

                          <span className="text-[9px] font-semibold text-bauraMuted">
                            {formatQty(
                              availableQty
                            )}{" "}
                            available
                          </span>
                        </div>
                      </button>
                    );
                  }
                )}
              </div>
            )}
          </div>
        </section>

        <section className="erp-panel flex min-h-[600px] flex-col overflow-hidden">
          <div className="flex items-start justify-between gap-3 border-b border-bauraBorder px-5 py-4">
            <div>
              <h2 className="erp-section-title">
                Current Sale
              </h2>

              <p className="erp-section-subtitle">
                {
                  cart.length
                }{" "}
                product
                {cart.length ===
                1
                  ? ""
                  : "s"}{" "}
                ·{" "}
                {formatQty(
                  totalCartQty
                )}{" "}
                units
              </p>
            </div>

            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-bauraGoldSoft text-bauraGoldDark">
              <ShoppingCart
                size={18}
              />
            </div>
          </div>

          <div className="grid gap-3 border-b border-bauraBorder p-4 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
            <label>
              <span className="erp-label">
                Sales Channel
              </span>

              <select
                value={
                  salesChannelId
                }
                onChange={(
                  event
                ) =>
                  setSalesChannelId(
                    event
                      .target
                      .value
                  )
                }
                className="erp-input"
              >
                <option value="">
                  Direct / Shop Sale
                </option>

                {channels.map(
                  (
                    channel
                  ) => (
                    <option
                      key={
                        channel.id
                      }
                      value={
                        channel.id
                      }
                    >
                      {
                        channel.name
                      }
                    </option>
                  )
                )}
              </select>
            </label>

            <label>
              <span className="erp-label">
                Payment Method
              </span>

              <select
                value={
                  paymentMethod
                }
                onChange={(
                  event
                ) =>
                  setPaymentMethod(
                    event
                      .target
                      .value as
                      PaymentMethod
                  )
                }
                className="erp-input"
              >
                {paymentMethods.map(
                  (
                    method
                  ) => (
                    <option
                      key={
                        method
                      }
                      value={
                        method
                      }
                    >
                      {formatPaymentMethod(
                        method
                      )}
                    </option>
                  )
                )}
              </select>
            </label>
          </div>

          <div className="baura-scrollbar min-h-[200px] flex-1 overflow-auto p-4">
            {cart.length ===
            0 ? (
              <div className="flex h-full min-h-[220px] items-center justify-center">
                <div className="max-w-xs text-center">
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-bauraGoldSoft text-bauraGoldDark">
                    <ShoppingCart
                      size={21}
                    />
                  </div>

                  <p className="mt-3 text-[11px] font-semibold text-bauraInk">
                    Cart is empty
                  </p>

                  <p className="mt-1 text-[9px] leading-5 text-bauraMuted">
                    Select an in-stock Bakery Stock product to begin the sale.
                  </p>
                </div>
              </div>
            ) : (
              <div className="grid gap-3">
                {cart.map(
                  (
                    item
                  ) => (
                    <div
                      key={
                        item.productId
                      }
                      className="rounded-[14px] border border-bauraBorder bg-white p-3.5"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h3 className="truncate text-[11px] font-semibold text-bauraInk">
                            {
                              item.displayName
                            }
                          </h3>

                          <p className="mt-1 text-[9px] text-bauraMuted">
                            {formatCurrency(
                              item.unitSellPrice
                            )}{" "}
                            each ·{" "}
                            {formatQty(
                              item.availableQty
                            )}{" "}
                            available
                          </p>
                        </div>

                        <button
                          type="button"
                          onClick={() =>
                            removeFromCart(
                              item.productId
                            )
                          }
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-bauraDangerSoft text-bauraDanger transition hover:bg-red-100"
                        >
                          <Trash2
                            size={13}
                          />
                        </button>
                      </div>

                      <div className="mt-3 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() =>
                              decreaseQty(
                                item.productId
                              )
                            }
                            className="flex h-8 w-8 items-center justify-center rounded-lg border border-bauraBorder bg-white text-bauraInk transition hover:bg-bauraCanvas2"
                          >
                            <Minus
                              size={13}
                            />
                          </button>

                          <input
                            type="number"
                            min="0"
                            max={
                              item.availableQty
                            }
                            step="1"
                            value={
                              item.qty
                            }
                            onChange={(
                              event
                            ) =>
                              updateQty(
                                item.productId,

                                event
                                  .target
                                  .value
                              )
                            }
                            className="h-8 w-16 rounded-lg border border-bauraBorder bg-white text-center text-[10px] font-semibold text-bauraInk outline-none focus:border-bauraGold"
                          />

                          <button
                            type="button"
                            disabled={
                              item.qty >=
                              item.availableQty
                            }
                            onClick={() =>
                              increaseQty(
                                item.productId
                              )
                            }
                            className="flex h-8 w-8 items-center justify-center rounded-lg border border-bauraBorder bg-white text-bauraInk transition hover:bg-bauraCanvas2 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            <Plus
                              size={13}
                            />
                          </button>
                        </div>

                        <p className="text-[11px] font-semibold text-bauraInk">
                          {formatCurrency(
                            item.qty *
                              item.unitSellPrice
                          )}
                        </p>
                      </div>
                    </div>
                  )
                )}
              </div>
            )}
          </div>

          <div className="border-t border-bauraBorder bg-bauraCanvas2 p-4">
            <div className="rounded-[14px] border border-bauraBorder bg-white p-4">
              <div className="grid gap-3">
                <SummaryRow
                  label="Gross Total"
                  value={formatCurrency(
                    grossTotal
                  )}
                />

                <div className="flex items-center justify-between gap-4">
                  <span className="text-[10px] text-bauraMuted">
                    Discount
                  </span>

                  <input
                    type="number"
                    min="0"
                    max={
                      grossTotal
                    }
                    value={
                      discountTotal
                    }
                    onChange={(
                      event
                    ) =>
                      setDiscountTotal(
                        event
                          .target
                          .value
                      )
                    }
                    placeholder="0.00"
                    className="h-9 w-32 rounded-lg border border-bauraBorder bg-white px-3 text-right text-[10px] font-semibold text-bauraInk outline-none focus:border-bauraGold"
                  />
                </div>

                <div className="border-t border-bauraBorder pt-3">
                  <SummaryRow
                    label="Net Total"
                    value={formatCurrency(
                      netTotal
                    )}
                    large
                  />
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={
                completeSale
              }
              disabled={
                isCompletingSale ||
                cart.length ===
                  0 ||
                netTotal <=
                  0
              }
              className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-bauraPrimary px-5 text-[11px] font-semibold text-white shadow-bauraButton transition hover:bg-bauraPrimaryDark disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isCompletingSale ? (
                <>
                  <RefreshCw
                    size={15}
                    className="animate-spin"
                  />

                  Completing Sale...
                </>
              ) : (
                <>
                  <Banknote
                    size={15}
                  />

                  Complete Sale ·{" "}
                  {formatCurrency(
                    netTotal
                  )}
                </>
              )}
            </button>
          </div>
        </section>
      </div>

      <Modal
        open={Boolean(
          completedSale
        )}
        onClose={() =>
          setCompletedSale(
            null
          )
        }
        title="Sale Completed"
        subtitle="Finished Bakery Stock was reduced and the sale cost was recorded."
        widthClassName="max-w-xl"
      >
        {completedSale && (
          <div className="grid gap-4">
            <div className="rounded-[14px] border border-green-100 bg-bauraSuccessSoft p-4">
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-bauraSuccess">
                  <CheckCircle2
                    size={17}
                  />
                </div>

                <div>
                  <p className="text-[11px] font-semibold text-bauraSuccess">
                    {
                      completedSale.orderNo
                    }
                  </p>

                  <p className="mt-1 text-[9px] leading-5 text-bauraMuted">
                    Sale completed successfully and finished stock was consumed using Bakery Stock lots.
                  </p>
                </div>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <PreviewStat
                label="Gross Total"
                value={formatCurrency(
                  completedSale.grossTotal
                )}
              />

              <PreviewStat
                label="Discount"
                value={formatCurrency(
                  completedSale.discountTotal
                )}
              />

              <PreviewStat
                label="Net Total"
                value={formatCurrency(
                  completedSale.netTotal
                )}
              />

              <PreviewStat
                label="COGS"
                value={formatCurrency(
                  completedSale.cogsTotal
                )}
              />

              <PreviewStat
                label="Gross Profit"
                value={formatCurrency(
                  completedSale.profitTotal
                )}
              />

              <PreviewStat
                label="Payment"
                value={formatPaymentMethod(
                  completedSale.paymentMethod
                )}
              />
            </div>

            <button
              type="button"
              onClick={() =>
                setCompletedSale(
                  null
                )
              }
              className="erp-button-primary w-full"
            >
              Done
            </button>
          </div>
        )}
      </Modal>
    </AppLayout>
  );
}

function PosMetric({
  label,
  value,
  note
}: {
  label: string;
  value: string;
  note: string;
}) {
  return (
    <div className="erp-kpi">
      <p className="text-[8px] font-semibold uppercase tracking-[0.09em] text-bauraMuted">
        {label}
      </p>

      <p className="mt-2 text-[20px] font-semibold tracking-[-0.04em] text-bauraInk">
        {value}
      </p>

      <p className="mt-1 text-[9px] text-bauraMuted">
        {note}
      </p>
    </div>
  );
}

function EmptyState({
  text
}: {
  text: string;
}) {
  return (
    <div className="rounded-[14px] border border-dashed border-bauraBorder bg-bauraCanvas2 p-8 text-center text-[10px] text-bauraMuted">
      {text}
    </div>
  );
}

function SummaryRow({
  label,
  value,
  large = false
}: {
  label: string;
  value: string;
  large?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span
        className={
          large
            ? "text-[11px] font-semibold text-bauraInk"
            : "text-[10px] text-bauraMuted"
        }
      >
        {label}
      </span>

      <span
        className={
          large
            ? "text-[18px] font-semibold tracking-[-0.03em] text-bauraPrimary"
            : "text-[11px] font-semibold text-bauraInk"
        }
      >
        {value}
      </span>
    </div>
  );
}

function PreviewStat({
  label,
  value
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-[14px] border border-bauraBorder bg-bauraCanvas2 p-4">
      <p className="text-[8px] font-semibold uppercase tracking-[0.09em] text-bauraMuted">
        {label}
      </p>

      <p className="mt-2 truncate text-[12px] font-semibold text-bauraInk">
        {value}
      </p>
    </div>
  );
}
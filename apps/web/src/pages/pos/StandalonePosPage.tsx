import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  AlertTriangle,
  ChevronRight,
  CircleUserRound,
  CreditCard,
  LogOut,
  Minus,
  PackageOpen,
  Phone,
  Plus,
  RefreshCw,
  Search,
  ShoppingBag,
  Trash2,
  UserPlus,
  WalletCards,
  X,
} from "lucide-react";

import {
  apiRequest,
} from "../../lib/api";

import {
  useToast,
} from "../../ui/ToastProvider";

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
  imageUrl?:
    | string
    | null;
  sellPrice:
    | string
    | number;
  availableQty: number;
  isInStock: boolean;
  isLowStock?: boolean;
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
  imageUrl:
    | string
    | null;
  qty: number;
  unitSellPrice: number;
  availableQty: number;
};

type Customer = {
  id: string;
  firstName: string;
  lastName?: string | null;
  phone: string;
  email?: string | null;
  source?: string | null;
};

type CompletedSale = {
  id: string;
  orderNo: string;
  grossTotal: string;
  discountTotal: string;
  netTotal: string;
  paymentMethod: PaymentMethod;
  soldAt: string;
};

const paymentMethods:
  {
    value: PaymentMethod;
    label: string;
  }[] = [
    {
      value: "CASH",
      label: "Cash",
    },
    {
      value: "CARD",
      label: "Card",
    },
    {
      value: "BANK_TRANSFER",
      label: "Bank",
    },
    {
      value: "ONLINE",
      label: "Online",
    },
  ];

function formatCurrency(
  value:
    | number
    | string
    | null
    | undefined,
) {
  return `Rs. ${Number(
    value || 0,
  ).toLocaleString(
    "en-LK",
    {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    },
  )}`;
}

function formatQty(
  value:
    | number
    | string
    | null
    | undefined,
) {
  return Number(
    value || 0,
  ).toLocaleString(
    "en-LK",
    {
      maximumFractionDigits: 3,
    },
  );
}

export function StandalonePosPage() {
  const toast =
    useToast();

  const [
    products,
    setProducts,
  ] =
    useState<
      PosProduct[]
    >([]);

  const [
    channels,
    setChannels,
  ] =
    useState<
      SalesChannel[]
    >([]);

  const [
    cart,
    setCart,
  ] =
    useState<
      CartItem[]
    >([]);

  const [
    search,
    setSearch,
  ] =
    useState("");

  const [
    salesChannelId,
    setSalesChannelId,
  ] =
    useState("");

  const [
    paymentMethod,
    setPaymentMethod,
  ] =
    useState<PaymentMethod>(
      "CASH",
    );

  const [
    customerPhone,
    setCustomerPhone,
  ] =
    useState("");

  const [
    customer,
    setCustomer,
  ] =
    useState<
      Customer | null
    >(null);

  const [
    isSearchingCustomer,
    setIsSearchingCustomer,
  ] =
    useState(false);

  const [
    isLoading,
    setIsLoading,
  ] =
    useState(true);

  const [
    isCompleting,
    setIsCompleting,
  ] =
    useState(false);

  const [
    completedSale,
    setCompletedSale,
  ] =
    useState<
      CompletedSale | null
    >(null);

  const filteredProducts =
    useMemo(
      () => {
        const keyword =
          search
            .trim()
            .toLowerCase();

        if (!keyword) {
          return products;
        }

        return products.filter(
          (
            product,
          ) =>
            product.displayName
              .toLowerCase()
              .includes(
                keyword,
              ),
        );
      },
      [
        products,
        search,
      ],
    );

  const grossTotal =
    useMemo(
      () =>
        cart.reduce(
          (
            total,
            item,
          ) =>
            total +
            item.qty *
              item.unitSellPrice,
          0,
        ),
      [
        cart,
      ],
    );

  const totalQty =
    useMemo(
      () =>
        cart.reduce(
          (
            total,
            item,
          ) =>
            total +
            item.qty,
          0,
        ),
      [
        cart,
      ],
    );

  async function loadPosData(
    showToast = false,
  ) {
    setIsLoading(
      true,
    );

    try {
      const [
        productsData,
        channelsData,
      ] =
        await Promise.all([
          apiRequest<{
            products:
              PosProduct[];
          }>(
            "/sales/products",
          ),

          apiRequest<{
            channels:
              SalesChannel[];
          }>(
            "/sales/channels",
          ),
        ]);

      setProducts(
        productsData.products,
      );

      setChannels(
        channelsData.channels.filter(
          (
            channel,
          ) =>
            channel.isActive,
        ),
      );

      setCart(
        (
          current,
        ) =>
          current
            .map(
              (
                item,
              ) => {
                const product =
                  productsData.products.find(
                    (
                      currentProduct,
                    ) =>
                      currentProduct.id ===
                      item.productId,
                  );

                if (
                  !product ||
                  !product.isInStock
                ) {
                  return null;
                }

                const availableQty =
                  Number(
                    product.availableQty,
                  );

                if (
                  availableQty <=
                  0
                ) {
                  return null;
                }

                return {
                  ...item,

                  availableQty,

                  unitSellPrice:
                    Number(
                      product.sellPrice,
                    ),

                  imageUrl:
                    product.imageUrl ||
                    null,

                  qty:
                    Math.min(
                      item.qty,
                      availableQty,
                    ),
                };
              },
            )
            .filter(
              (
                item,
              ): item is CartItem =>
                item !==
                null,
            ),
      );

      if (
        showToast
      ) {
        toast.success(
          "POS refreshed",
          "Stock and prices are up to date.",
        );
      }
    } catch (
      error
    ) {
      toast.error(
        "Unable to load POS",
        error instanceof
          Error
          ? error.message
          : "Could not load POS.",
      );
    } finally {
      setIsLoading(
        false,
      );
    }
  }

  useEffect(
    () => {
      loadPosData();
    },
    [],
  );

  function addToCart(
    product:
      PosProduct,
  ) {
    const availableQty =
      Number(
        product.availableQty ||
          0,
      );

    if (
      !product.isInStock ||
      availableQty <=
        0
    ) {
      toast.warning(
        "Out of stock",
        `${product.displayName} is currently unavailable.`,
      );

      return;
    }

    setCart(
      (
        current,
      ) => {
        const existing =
          current.find(
            (
              item,
            ) =>
              item.productId ===
              product.id,
          );

        if (
          existing
        ) {
          if (
            existing.qty >=
            availableQty
          ) {
            toast.warning(
              "Stock limit reached",
              `Only ${formatQty(
                availableQty,
              )} available.`,
            );

            return current;
          }

          return current.map(
            (
              item,
            ) =>
              item.productId ===
              product.id
                ? {
                    ...item,

                    qty:
                      item.qty +
                      1,

                    availableQty,

                    unitSellPrice:
                      Number(
                        product.sellPrice,
                      ),
                  }
                : item,
          );
        }

        return [
          ...current,

          {
            productId:
              product.id,

            displayName:
              product.displayName,

            imageUrl:
              product.imageUrl ||
              null,

            qty: 1,

            unitSellPrice:
              Number(
                product.sellPrice,
              ),

            availableQty,
          },
        ];
      },
    );
  }

  function increaseQty(
    productId:
      string,
  ) {
    setCart(
      (
        current,
      ) =>
        current.map(
          (
            item,
          ) => {
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
              toast.warning(
                "Stock limit reached",
                `Only ${formatQty(
                  item.availableQty,
                )} available.`,
              );

              return item;
            }

            return {
              ...item,
              qty:
                item.qty +
                1,
            };
          },
        ),
    );
  }

  function decreaseQty(
    productId:
      string,
  ) {
    setCart(
      (
        current,
      ) =>
        current
          .map(
            (
              item,
            ) =>
              item.productId ===
              productId
                ? {
                    ...item,

                    qty:
                      item.qty -
                      1,
                  }
                : item,
          )
          .filter(
            (
              item,
            ) =>
              item.qty >
              0,
          ),
    );
  }

  function removeItem(
    productId:
      string,
  ) {
    setCart(
      (
        current,
      ) =>
        current.filter(
          (
            item,
          ) =>
            item.productId !==
            productId,
        ),
    );
  }

  function clearSale() {
    setCart([]);
    setCustomer(null);
    setCustomerPhone("");
    setPaymentMethod(
      "CASH",
    );
    setSalesChannelId(
      "",
    );
  }

  async function findCustomer() {
    const phone =
      customerPhone.trim();

    if (
      phone.length <
      7
    ) {
      toast.info(
        "Enter phone number",
        "Enter a valid customer phone number.",
      );

      return;
    }

    setIsSearchingCustomer(
      true,
    );

    try {
      /*
       * This endpoint will be added to
       * the backend customer integration.
       *
       * Backend should search:
       * 1. ERP customer database
       * 2. Official website customer DB
       * 3. Merge/link the customer
       */
      const data =
        await apiRequest<{
          customer:
            Customer | null;
        }>(
          `/pos/customers/lookup?phone=${encodeURIComponent(
            phone,
          )}`,
        );

      setCustomer(
        data.customer,
      );

      if (
        !data.customer
      ) {
        toast.info(
          "Customer not found",
          "You can register this customer from the POS.",
        );
      }
    } catch (
      error
    ) {
      setCustomer(
        null,
      );

      toast.error(
        "Customer lookup failed",
        error instanceof
          Error
          ? error.message
          : "Unable to search customer.",
      );
    } finally {
      setIsSearchingCustomer(
        false,
      );
    }
  }

  async function completeSale() {
    if (
      cart.length ===
      0
    ) {
      toast.info(
        "Cart is empty",
        "Add at least one product.",
      );

      return;
    }

    setIsCompleting(
      true,
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
                    0,

                  /*
                   * customerId will be
                   * added to the backend
                   * sales schema once
                   * customer integration
                   * is added.
                   */

                  items:
                    cart.map(
                      (
                        item,
                      ) => ({
                        productId:
                          item.productId,

                        qty:
                          item.qty,
                      }),
                    ),
                },
              ),
          },
        );

      setCompletedSale(
        data.sale,
      );

      clearSale();

      await loadPosData();
    } catch (
      error
    ) {
      toast.error(
        "Sale failed",
        error instanceof
          Error
          ? error.message
          : "Unable to complete sale.",
      );

      await loadPosData();
    } finally {
      setIsCompleting(
        false,
      );
    }
  }

  function logout() {
    localStorage.removeItem(
      "baura_token",
    );

    window.location.href =
      "/pos/login";
  }

  return (
    <div className="min-h-screen bg-[#f7f6f2] text-bauraInk">
      <header className="sticky top-0 z-40 border-b border-black/[0.06] bg-white/95 backdrop-blur-xl">
        <div className="flex h-[72px] items-center gap-5 px-5 lg:px-7">
          <div className="flex min-w-fit items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-[13px] bg-bauraPrimary text-[13px] font-bold text-white shadow-sm">
              B
            </div>

            <div>
              <div className="flex items-center gap-2">
                <p className="text-[14px] font-bold tracking-[-0.03em] text-bauraInk">
                  Baura
                </p>

                <span className="rounded-md bg-bauraGoldSoft px-2 py-0.5 text-[8px] font-bold uppercase tracking-[0.12em] text-bauraGoldDark">
                  POS
                </span>
              </div>

              <p className="text-[9px] text-bauraMuted">
                Point of Sale
              </p>
            </div>
          </div>

          <div className="mx-auto hidden max-w-2xl flex-1 md:block">
            <div className="flex h-11 items-center gap-3 rounded-[14px] border border-black/[0.07] bg-[#f8f8f6] px-4 transition focus-within:border-bauraGold focus-within:bg-white">
              <Search
                size={17}
                className="text-bauraMuted"
              />

              <input
                value={
                  search
                }
                onChange={(
                  event,
                ) =>
                  setSearch(
                    event
                      .target
                      .value,
                  )
                }
                placeholder="Search products..."
                className="w-full bg-transparent text-[12px] font-medium outline-none placeholder:text-bauraMuted2"
              />

              {search && (
                <button
                  type="button"
                  onClick={() =>
                    setSearch(
                      "",
                    )
                  }
                  className="text-bauraMuted transition hover:text-bauraInk"
                >
                  <X
                    size={15}
                  />
                </button>
              )}
            </div>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={() =>
                loadPosData(
                  true,
                )
              }
              disabled={
                isLoading
              }
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-black/[0.07] bg-white text-bauraMuted transition hover:bg-[#f8f8f6] hover:text-bauraInk"
              title="Refresh"
            >
              <RefreshCw
                size={16}
                className={
                  isLoading
                    ? "animate-spin"
                    : ""
                }
              />
            </button>

            <div className="hidden items-center gap-3 rounded-xl border border-black/[0.07] bg-white px-3 py-2 sm:flex">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-bauraGoldSoft text-bauraGoldDark">
                <CircleUserRound
                  size={15}
                />
              </div>

              <div className="pr-2">
                <p className="text-[9px] font-semibold text-bauraInk">
                  POS User
                </p>

                <p className="text-[8px] text-bauraMuted">
                  Cashier
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={
                logout
              }
              className="flex h-10 w-10 items-center justify-center rounded-xl text-bauraMuted transition hover:bg-red-50 hover:text-red-600"
              title="Sign out"
            >
              <LogOut
                size={16}
              />
            </button>
          </div>
        </div>

        <div className="border-t border-black/[0.04] px-5 pb-3 pt-3 md:hidden">
          <div className="flex h-10 items-center gap-3 rounded-xl border border-black/[0.07] bg-[#f8f8f6] px-3">
            <Search
              size={15}
              className="text-bauraMuted"
            />

            <input
              value={
                search
              }
              onChange={(
                event,
              ) =>
                setSearch(
                  event
                    .target
                    .value,
                )
              }
              placeholder="Search products..."
              className="w-full bg-transparent text-[11px] outline-none"
            />
          </div>
        </div>
      </header>

      <main className="grid min-h-[calc(100vh-72px)] xl:grid-cols-[minmax(0,1fr)_430px]">
        <section className="min-w-0 border-r border-black/[0.06]">
          <div className="flex items-center justify-between gap-4 border-b border-black/[0.05] bg-white px-5 py-4 lg:px-7">
            <div>
              <h1 className="text-[17px] font-bold tracking-[-0.035em]">
                Products
              </h1>

              <p className="mt-1 text-[9px] text-bauraMuted">
                {
                  filteredProducts.length
                }{" "}
                products available to browse
              </p>
            </div>

            <div className="rounded-xl bg-bauraGoldSoft px-3 py-2 text-right">
              <p className="text-[8px] font-semibold uppercase tracking-[0.08em] text-bauraGoldDark">
                Cart
              </p>

              <p className="text-[11px] font-bold text-bauraPrimary">
                {formatQty(
                  totalQty,
                )}{" "}
                items
              </p>
            </div>
          </div>

          <div className="p-4 lg:p-6">
            {isLoading ? (
              <PosEmptyState
                icon={
                  <RefreshCw
                    size={22}
                    className="animate-spin"
                  />
                }
                title="Loading products"
                description="Getting the latest products and Bakery Stock."
              />
            ) : filteredProducts.length ===
              0 ? (
              <PosEmptyState
                icon={
                  <PackageOpen
                    size={22}
                  />
                }
                title="No products found"
                description="Try another product name or refresh the POS."
              />
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
                {filteredProducts.map(
                  (
                    product,
                  ) => {
                    const availableQty =
                      Number(
                        product.availableQty ||
                          0,
                      );

                    const available =
                      product.isInStock &&
                      availableQty >
                        0;

                    const inCart =
                      cart.find(
                        (
                          item,
                        ) =>
                          item.productId ===
                          product.id,
                      );

                    return (
                      <button
                        key={
                          product.id
                        }
                        type="button"
                        disabled={
                          !available
                        }
                        onClick={() =>
                          addToCart(
                            product,
                          )
                        }
                        className={`group relative overflow-hidden rounded-[18px] border bg-white text-left transition duration-200 ${
                          available
                            ? "border-black/[0.07] hover:-translate-y-0.5 hover:border-bauraGold/60 hover:shadow-lg"
                            : "cursor-not-allowed border-black/[0.05] opacity-50"
                        }`}
                      >
                        <div className="relative aspect-[1.18/1] overflow-hidden bg-[#f3f1eb]">
                          {product.imageUrl ? (
                            <img
                              src={
                                product.imageUrl
                              }
                              alt={
                                product.displayName
                              }
                              className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-bauraGoldDark">
                              <ShoppingBag
                                size={28}
                                strokeWidth={
                                  1.5
                                }
                              />
                            </div>
                          )}

                          {inCart && (
                            <span className="absolute right-2 top-2 flex h-7 min-w-7 items-center justify-center rounded-full bg-bauraPrimary px-2 text-[9px] font-bold text-white shadow">
                              {
                                inCart.qty
                              }
                            </span>
                          )}

                          {!available && (
                            <div className="absolute inset-0 flex items-center justify-center bg-white/70 backdrop-blur-[2px]">
                              <span className="rounded-lg bg-white px-2.5 py-1.5 text-[8px] font-bold uppercase tracking-[0.08em] text-red-600 shadow-sm">
                                Sold out
                              </span>
                            </div>
                          )}
                        </div>

                        <div className="p-3">
                          <p className="line-clamp-2 min-h-[32px] text-[11px] font-semibold leading-4 text-bauraInk">
                            {
                              product.displayName
                            }
                          </p>

                          <div className="mt-3 flex items-end justify-between gap-2">
                            <p className="text-[13px] font-bold tracking-[-0.02em] text-bauraPrimary">
                              {formatCurrency(
                                product.sellPrice,
                              )}
                            </p>

                            <p
                              className={`text-[8px] font-semibold ${
                                product.isLowStock
                                  ? "text-amber-600"
                                  : "text-bauraMuted"
                              }`}
                            >
                              {product.isLowStock && (
                                <AlertTriangle
                                  size={9}
                                  className="mr-0.5 inline"
                                />
                              )}

                              {formatQty(
                                availableQty,
                              )}
                            </p>
                          </div>
                        </div>
                      </button>
                    );
                  },
                )}
              </div>
            )}
          </div>
        </section>

        <aside className="flex min-h-[700px] flex-col bg-white xl:sticky xl:top-[72px] xl:h-[calc(100vh-72px)]">
          <div className="border-b border-black/[0.06] p-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-[14px] font-bold tracking-[-0.025em]">
                  Current order
                </h2>

                <p className="mt-1 text-[8px] text-bauraMuted">
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
                    totalQty,
                  )}{" "}
                  items
                </p>
              </div>

              {cart.length >
                0 && (
                <button
                  type="button"
                  onClick={
                    clearSale
                  }
                  className="rounded-lg px-2.5 py-1.5 text-[8px] font-semibold text-red-500 transition hover:bg-red-50"
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          <div className="border-b border-black/[0.06] p-4">
            {customer ? (
              <div className="rounded-[15px] border border-bauraGold/25 bg-bauraGoldSoft/50 p-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-bauraGoldDark shadow-sm">
                    <CircleUserRound
                      size={17}
                    />
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[10px] font-bold">
                      {
                        customer.firstName
                      }{" "}
                      {
                        customer.lastName
                      }
                    </p>

                    <p className="mt-0.5 text-[8px] text-bauraMuted">
                      {
                        customer.phone
                      }
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setCustomer(
                        null,
                      );

                      setCustomerPhone(
                        "",
                      );
                    }}
                    className="flex h-7 w-7 items-center justify-center rounded-lg text-bauraMuted hover:bg-white"
                  >
                    <X
                      size={13}
                    />
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-[8px] font-bold uppercase tracking-[0.08em] text-bauraMuted">
                    Customer
                  </p>

                  <button
                    type="button"
                    className="flex items-center gap-1 text-[8px] font-semibold text-bauraPrimary"
                  >
                    <UserPlus
                      size={11}
                    />

                    Register
                  </button>
                </div>

                <div className="flex gap-2">
                  <div className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-xl border border-black/[0.07] bg-[#f8f8f6] px-3 focus-within:border-bauraGold">
                    <Phone
                      size={14}
                      className="shrink-0 text-bauraMuted"
                    />

                    <input
                      value={
                        customerPhone
                      }
                      onChange={(
                        event,
                      ) =>
                        setCustomerPhone(
                          event
                            .target
                            .value,
                        )
                      }
                      onKeyDown={(
                        event,
                      ) => {
                        if (
                          event.key ===
                          "Enter"
                        ) {
                          findCustomer();
                        }
                      }}
                      placeholder="Customer phone"
                      className="min-w-0 flex-1 bg-transparent text-[10px] font-medium outline-none"
                    />
                  </div>

                  <button
                    type="button"
                    disabled={
                      isSearchingCustomer
                    }
                    onClick={
                      findCustomer
                    }
                    className="flex h-10 w-10 items-center justify-center rounded-xl bg-bauraPrimary text-white transition hover:bg-bauraPrimaryDark disabled:opacity-50"
                  >
                    {isSearchingCustomer ? (
                      <RefreshCw
                        size={14}
                        className="animate-spin"
                      />
                    ) : (
                      <ChevronRight
                        size={16}
                      />
                    )}
                  </button>
                </div>
              </>
            )}
          </div>

          <div className="baura-scrollbar min-h-[200px] flex-1 overflow-y-auto p-4">
            {cart.length ===
            0 ? (
              <div className="flex h-full min-h-[230px] items-center justify-center">
                <div className="max-w-[220px] text-center">
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[#f3f1eb] text-bauraGoldDark">
                    <ShoppingBag
                      size={20}
                    />
                  </div>

                  <p className="mt-3 text-[10px] font-bold">
                    Your order is empty
                  </p>

                  <p className="mt-1 text-[8px] leading-4 text-bauraMuted">
                    Select a product to add it to the current sale.
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                {cart.map(
                  (
                    item,
                  ) => (
                    <div
                      key={
                        item.productId
                      }
                      className="flex gap-3 rounded-[14px] border border-black/[0.06] p-2.5"
                    >
                      <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-[#f3f1eb]">
                        {item.imageUrl ? (
                          <img
                            src={
                              item.imageUrl
                            }
                            alt={
                              item.displayName
                            }
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-bauraGoldDark">
                            <ShoppingBag
                              size={18}
                            />
                          </div>
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[9px] font-semibold">
                              {
                                item.displayName
                              }
                            </p>

                            <p className="mt-0.5 text-[8px] text-bauraMuted">
                              {formatCurrency(
                                item.unitSellPrice,
                              )}
                            </p>
                          </div>

                          <button
                            type="button"
                            onClick={() =>
                              removeItem(
                                item.productId,
                              )
                            }
                            className="flex h-6 w-6 items-center justify-center rounded-md text-bauraMuted transition hover:bg-red-50 hover:text-red-500"
                          >
                            <Trash2
                              size={11}
                            />
                          </button>
                        </div>

                        <div className="mt-2 flex items-center justify-between">
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() =>
                                decreaseQty(
                                  item.productId,
                                )
                              }
                              className="flex h-6 w-6 items-center justify-center rounded-md border border-black/[0.08]"
                            >
                              <Minus
                                size={10}
                              />
                            </button>

                            <span className="min-w-7 text-center text-[9px] font-bold">
                              {
                                item.qty
                              }
                            </span>

                            <button
                              type="button"
                              disabled={
                                item.qty >=
                                item.availableQty
                              }
                              onClick={() =>
                                increaseQty(
                                  item.productId,
                                )
                              }
                              className="flex h-6 w-6 items-center justify-center rounded-md border border-black/[0.08] disabled:opacity-30"
                            >
                              <Plus
                                size={10}
                              />
                            </button>
                          </div>

                          <p className="text-[9px] font-bold">
                            {formatCurrency(
                              item.qty *
                                item.unitSellPrice,
                            )}
                          </p>
                        </div>
                      </div>
                    </div>
                  ),
                )}
              </div>
            )}
          </div>

          <div className="border-t border-black/[0.06] bg-[#faf9f6] p-4">
            <div className="mb-3 grid grid-cols-2 gap-2">
              <label>
                <span className="mb-1 block text-[7px] font-bold uppercase tracking-[0.08em] text-bauraMuted">
                  Channel
                </span>

                <select
                  value={
                    salesChannelId
                  }
                  onChange={(
                    event,
                  ) =>
                    setSalesChannelId(
                      event
                        .target
                        .value,
                    )
                  }
                  className="h-9 w-full rounded-lg border border-black/[0.07] bg-white px-2 text-[9px] font-medium outline-none"
                >
                  <option value="">
                    Shop
                  </option>

                  {channels.map(
                    (
                      channel,
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
                    ),
                  )}
                </select>
              </label>

              <div>
                <span className="mb-1 block text-[7px] font-bold uppercase tracking-[0.08em] text-bauraMuted">
                  Payment
                </span>

                <div className="grid grid-cols-2 gap-1">
                  {paymentMethods
                    .slice(
                      0,
                      2,
                    )
                    .map(
                      (
                        method,
                      ) => (
                        <button
                          key={
                            method.value
                          }
                          type="button"
                          onClick={() =>
                            setPaymentMethod(
                              method.value,
                            )
                          }
                          className={`flex h-9 items-center justify-center gap-1 rounded-lg border text-[8px] font-semibold transition ${
                            paymentMethod ===
                            method.value
                              ? "border-bauraPrimary bg-bauraPrimary text-white"
                              : "border-black/[0.07] bg-white text-bauraMuted"
                          }`}
                        >
                          {method.value ===
                          "CASH" ? (
                            <WalletCards
                              size={11}
                            />
                          ) : (
                            <CreditCard
                              size={11}
                            />
                          )}

                          {
                            method.label
                          }
                        </button>
                      ),
                    )}
                </div>
              </div>
            </div>

            <div className="rounded-[14px] border border-black/[0.06] bg-white p-3.5">
              <div className="flex items-center justify-between text-[9px] text-bauraMuted">
                <span>
                  Subtotal
                </span>

                <span className="font-semibold text-bauraInk">
                  {formatCurrency(
                    grossTotal,
                  )}
                </span>
              </div>

              <div className="mt-3 flex items-end justify-between border-t border-black/[0.06] pt-3">
                <div>
                  <p className="text-[7px] font-bold uppercase tracking-[0.1em] text-bauraMuted">
                    Total
                  </p>

                  <p className="mt-1 text-[20px] font-bold tracking-[-0.04em] text-bauraPrimary">
                    {formatCurrency(
                      grossTotal,
                    )}
                  </p>
                </div>

                <p className="pb-1 text-[8px] text-bauraMuted">
                  {
                    totalQty
                  }{" "}
                  items
                </p>
              </div>
            </div>

            <button
              type="button"
              disabled={
                cart.length ===
                  0 ||
                isCompleting
              }
              onClick={
                completeSale
              }
              className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-bauraPrimary px-4 text-[10px] font-bold text-white shadow-bauraButton transition hover:bg-bauraPrimaryDark disabled:cursor-not-allowed disabled:opacity-40"
            >
              {isCompleting ? (
                <>
                  <RefreshCw
                    size={14}
                    className="animate-spin"
                  />

                  Processing...
                </>
              ) : (
                <>
                  <Banknote
                    size={15}
                  />

                  Pay{" "}
                  {formatCurrency(
                    grossTotal,
                  )}
                </>
              )}
            </button>
          </div>
        </aside>
      </main>

      {completedSale && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/35 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-[24px] bg-white p-6 shadow-2xl">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-green-50 text-green-600">
              <CheckCircle2
                size={25}
              />
            </div>

            <div className="mt-4 text-center">
              <p className="text-[17px] font-bold tracking-[-0.03em]">
                Payment complete
              </p>

              <p className="mt-1 text-[9px] text-bauraMuted">
                {
                  completedSale.orderNo
                }
              </p>
            </div>

            <div className="mt-5 rounded-[16px] bg-[#f8f7f3] p-4">
              <p className="text-center text-[8px] font-bold uppercase tracking-[0.1em] text-bauraMuted">
                Amount paid
              </p>

              <p className="mt-1 text-center text-[24px] font-bold tracking-[-0.04em] text-bauraPrimary">
                {formatCurrency(
                  completedSale.netTotal,
                )}
              </p>
            </div>

            <button
              type="button"
              onClick={() =>
                setCompletedSale(
                  null,
                )
              }
              className="mt-4 h-11 w-full rounded-xl bg-bauraPrimary text-[10px] font-bold text-white"
            >
              New Sale
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function PosEmptyState({
  icon,
  title,
  description,
}: {
  icon:
    React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="flex min-h-[420px] items-center justify-center rounded-[20px] border border-dashed border-black/[0.08] bg-white">
      <div className="max-w-xs text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-bauraGoldSoft text-bauraGoldDark">
          {icon}
        </div>

        <p className="mt-3 text-[11px] font-bold">
          {title}
        </p>

        <p className="mt-1 text-[9px] leading-5 text-bauraMuted">
          {description}
        </p>
      </div>
    </div>
  );
}
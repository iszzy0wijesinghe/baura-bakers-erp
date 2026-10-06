/** @format */

import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  Banknote,
  Barcode,
  Check,
  ChevronDown,
  Clock3,
  CreditCard,
  LogOut,
  Mail,
  Minus,
  PackageOpen,
  Plus,
  Printer,
  ReceiptText,
  RefreshCw,
  Search,
  ShoppingBag,
  Trash2,
  UserRound,
  WalletCards,
  X,
  Zap,
} from "lucide-react";

import type {
  PosSession,
} from "../../lib/posSessionApi";

import {
  completePosSale,
  type CompletedPosSale,
  type PosPaymentMethod,
  type PosProduct,
} from "../../lib/posSellingApi";

import {
  useToast,
} from "../../ui/ToastProvider";

type CartItem = {
  product: PosProduct;
  qty: number;
};

type Props = {
  session: PosSession;
  products: PosProduct[];
  loadingProducts: boolean;
  onRefreshProducts: () => void;
  onLogout: () => void;
  onDayEnd: () => void;
  onSaleCompleted?: (
    sale: CompletedPosSale,
  ) => void;
};

function money(
  value: number,
) {
  return new Intl.NumberFormat(
    "en-LK",
    {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    },
  ).format(
    Number.isFinite(value)
      ? value
      : 0,
  );
}

function makeIdempotencyKey() {
  if (
    typeof crypto !==
      "undefined" &&
    "randomUUID" in crypto
  ) {
    return `pos-${crypto.randomUUID()}`;
  }

  return `pos-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2)}`;
}

function getBusinessDateLabel(
  value:
    | string
    | Date
    | null
    | undefined,
) {
  if (!value) {
    return "Business day";
  }

  const date =
    value instanceof Date
      ? value
      : new Date(value);

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return String(value);
  }

  return new Intl.DateTimeFormat(
    "en-LK",
    {
      day: "2-digit",
      month: "short",
      year: "numeric",
    },
  ).format(date);
}

function getCurrentTime() {
  return new Intl.DateTimeFormat(
    "en-LK",
    {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    },
  ).format(new Date());
}

export function PosSellingWorkspace({
  session,
  products,
  loadingProducts,
  onRefreshProducts,
  onLogout,
  onDayEnd,
  onSaleCompleted,
}: Props) {
  const toast =
    useToast();

  const searchRef =
    useRef<HTMLInputElement | null>(
      null,
    );

  const [
    search,
    setSearch,
  ] = useState("");

  const [
    cart,
    setCart,
  ] =
    useState<CartItem[]>(
      [],
    );

  const [
    paymentMethod,
    setPaymentMethod,
  ] =
    useState<PosPaymentMethod>(
      "CASH",
    );

  const [
    tendered,
    setTendered,
  ] = useState("");

  const [
    paymentReference,
    setPaymentReference,
  ] = useState("");

  const [
    customerId,
    setCustomerId,
  ] =
    useState<number | null>(
      null,
    );

  const [
    customerLabel,
    setCustomerLabel,
  ] = useState("");

  const [
    receiptEmail,
    setReceiptEmail,
  ] = useState("");

  const [
    customerOpen,
    setCustomerOpen,
  ] = useState(false);

  const [
    paymentOpen,
    setPaymentOpen,
  ] = useState(false);

  const [
    processing,
    setProcessing,
  ] = useState(false);

  const [
    completedSale,
    setCompletedSale,
  ] =
    useState<CompletedPosSale | null>(
      null,
    );

  const [
    autoPrint,
    setAutoPrint,
  ] = useState(false);

  const [
    currentTime,
    setCurrentTime,
  ] = useState(
    getCurrentTime(),
  );

  useEffect(() => {
    const timer =
      window.setInterval(
        () => {
          setCurrentTime(
            getCurrentTime(),
          );
        },
        1000,
      );

    return () =>
      window.clearInterval(
        timer,
      );
  }, []);

  useEffect(() => {
    function handleKeyDown(
      event: KeyboardEvent,
    ) {
      if (
        event.key ===
          "F2"
      ) {
        event.preventDefault();

        searchRef.current?.focus();
      }

      if (
        event.key ===
          "Escape"
      ) {
        setPaymentOpen(
          false,
        );

        setCustomerOpen(
          false,
        );
      }
    }

    window.addEventListener(
      "keydown",
      handleKeyDown,
    );

    return () =>
      window.removeEventListener(
        "keydown",
        handleKeyDown,
      );
  }, []);

  const filteredProducts =
    useMemo(() => {
      const query =
        search
          .trim()
          .toLowerCase();

      if (!query) {
        return products;
      }

      return products.filter(
        (product) => {
          const searchable =
            [
              product.displayName,
              product.name,
              product.variantName,
            ]
              .filter(Boolean)
              .join(" ")
              .toLowerCase();

          return searchable.includes(
            query,
          );
        },
      );
    }, [
      products,
      search,
    ]);

  const subtotal =
    useMemo(
      () =>
        cart.reduce(
          (
            total,
            item,
          ) =>
            total +
            Number(
              item.product
                .sellPrice,
            ) *
              item.qty,
          0,
        ),
      [cart],
    );

  const itemCount =
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
      [cart],
    );

  const tenderedAmount =
    Number(
      tendered ||
        0,
    );

  const change =
    paymentMethod ===
      "CASH"
      ? Math.max(
          0,
          tenderedAmount -
            subtotal,
        )
      : 0;

  const cashShort =
    paymentMethod ===
      "CASH"
      ? Math.max(
          0,
          subtotal -
            tenderedAmount,
        )
      : 0;

  function addProduct(
    product: PosProduct,
  ) {
    if (
      !product.inStock ||
      Number(
        product.availableQty,
      ) <= 0
    ) {
      toast.warning(
        "Out of stock",
        `${product.displayName} cannot be added.`,
      );

      return;
    }

    setCart(
      (current) => {
        const existing =
          current.find(
            (item) =>
              item.product.id ===
              product.id,
          );

        if (!existing) {
          return [
            ...current,
            {
              product,
              qty: 1,
            },
          ];
        }

        if (
          existing.qty >=
          Number(
            product.availableQty,
          )
        ) {
          toast.warning(
            "Stock limit reached",
            `Only ${product.availableQty} available.`,
          );

          return current;
        }

        return current.map(
          (item) =>
            item.product.id ===
            product.id
              ? {
                  ...item,
                  qty:
                    item.qty +
                    1,
                }
              : item,
        );
      },
    );
  }

  function updateQty(
    productId: string,
    delta: number,
  ) {
    setCart(
      (current) =>
        current
          .map(
            (item) => {
              if (
                item.product
                  .id !==
                productId
              ) {
                return item;
              }

              const next =
                item.qty +
                delta;

              if (
                next <=
                0
              ) {
                return null;
              }

              return {
                ...item,

                qty:
                  Math.min(
                    next,
                    Number(
                      item.product
                        .availableQty,
                    ),
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
  }

  function removeItem(
    productId: string,
  ) {
    setCart(
      (current) =>
        current.filter(
          (item) =>
            item.product.id !==
            productId,
        ),
    );
  }

  function clearCart() {
    setCart([]);
    setTendered("");
    setPaymentReference(
      "",
    );
  }

  function clearSale() {
    setCart([]);

    setPaymentMethod(
      "CASH",
    );

    setTendered("");

    setPaymentReference(
      "",
    );

    setCustomerId(
      null,
    );

    setCustomerLabel(
      "",
    );

    setReceiptEmail(
      "",
    );

    setCompletedSale(
      null,
    );

    setPaymentOpen(
      false,
    );

    window.setTimeout(
      () =>
        searchRef.current?.focus(),
      50,
    );
  }

  function choosePayment(
    method: PosPaymentMethod,
  ) {
    setPaymentMethod(
      method,
    );

    setPaymentReference(
      "",
    );

    setTendered(
      method ===
        "CASH"
        ? String(
            Math.ceil(
              subtotal,
            ),
          )
        : "",
    );
  }

  function openPayment() {
    if (
      cart.length ===
      0
    ) {
      toast.warning(
        "Empty sale",
        "Add at least one product before payment.",
      );

      return;
    }

    if (
      paymentMethod ===
        "CASH" &&
      !tendered
    ) {
      setTendered(
        String(
          Math.ceil(
            subtotal,
          ),
        ),
      );
    }

    setPaymentOpen(
      true,
    );
  }

  async function checkout(
    printAfterSale =
      false,
  ) {
    if (
      cart.length ===
      0
    ) {
      toast.warning(
        "Empty sale",
        "Add at least one product.",
      );

      return;
    }

    if (
      paymentMethod ===
        "CASH" &&
      tenderedAmount <
        subtotal
    ) {
      toast.warning(
        "Insufficient cash",
        "Tendered cash is less than the sale total.",
      );

      return;
    }

    if (
      (
        paymentMethod ===
          "CARD" ||
        paymentMethod ===
          "BANK_TRANSFER"
      ) &&
      !paymentReference.trim()
    ) {
      toast.warning(
        "Reference required",
        paymentMethod ===
          "CARD"
          ? "Enter the card payment reference."
          : "Enter the bank transfer reference.",
      );

      return;
    }

    setProcessing(
      true,
    );

    setAutoPrint(
      printAfterSale,
    );

    try {
      const response =
        await completePosSale(
          {
            officialCustomerId:
              customerId,

            receiptEmail:
              receiptEmail.trim() ||
              null,

            discountTotal:
              0,

            idempotencyKey:
              makeIdempotencyKey(),

            payment: {
              method:
                paymentMethod,

              tenderedAmount:
                paymentMethod ===
                "CASH"
                  ? tenderedAmount
                  : null,

              reference:
                paymentMethod ===
                "CASH"
                  ? null
                  : paymentReference.trim() ||
                    null,
            },

            items:
              cart.map(
                (item) => ({
                  productId:
                    item.product
                      .id,

                  qty:
                    item.qty,
                }),
              ),
          },
        );

      setCompletedSale(
        response.sale,
      );

      setPaymentOpen(
        false,
      );

      toast.success(
        "Sale completed",
        response.sale
          .orderNo,
      );

      onSaleCompleted?.(
        response.sale,
      );

      onRefreshProducts();
    } catch (error) {
      setAutoPrint(
        false,
      );

      toast.error(
        "Sale failed",
        error instanceof
          Error
          ? error.message
          : "Unable to complete sale.",
      );
    } finally {
      setProcessing(
        false,
      );
    }
  }

  useEffect(() => {
    if (
      completedSale &&
      autoPrint
    ) {
      const timer =
        window.setTimeout(
          () => {
            window.print();

            setAutoPrint(
              false,
            );
          },
          250,
        );

      return () =>
        window.clearTimeout(
          timer,
        );
    }

    return undefined;
  }, [
    completedSale,
    autoPrint,
  ]);

  if (completedSale) {
    return (
      <SaleCompleted
        sale={
          completedSale
        }
        onPrint={() =>
          window.print()
        }
        onNewSale={
          clearSale
        }
      />
    );
  }

  return (
    <div className="h-screen min-h-[720px] overflow-hidden bg-[#f6f5f2] text-bauraInk">
      <header className="flex h-[62px] items-center border-b border-black/[0.07] bg-white px-4 shadow-[0_1px_0_rgba(0,0,0,0.02)]">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] bg-bauraPrimary text-[15px] font-black text-white shadow-sm">
            B
          </div>

          <div className="min-w-0">
            <div className="truncate text-[13px] font-extrabold tracking-[-0.02em]">
              Baura Bakers
            </div>

            <div className="mt-0.5 flex items-center gap-2 text-[9px] text-bauraMuted">
              <span>
                Point of Sale
              </span>

              <span className="h-1 w-1 rounded-full bg-black/20" />

              <span className="font-semibold">
                {session.sessionNo}
              </span>
            </div>
          </div>
        </div>

        <div className="ml-6 hidden items-center gap-2 xl:flex">
          <div className="flex h-8 items-center gap-2 rounded-lg bg-emerald-50 px-3 text-[9px] font-bold text-emerald-700">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />

            Register Open
          </div>

          <div className="flex h-8 items-center gap-2 rounded-lg bg-[#f7f6f3] px-3 text-[9px] font-semibold text-bauraMuted">
            <Clock3
              size={12}
            />

            {getBusinessDateLabel(
              session.businessDate,
            )}

            <span className="text-black/20">
              •
            </span>

            {currentTime}
          </div>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={
              onRefreshProducts
            }
            title="Refresh products"
            className="flex h-9 items-center gap-2 rounded-[10px] border border-black/[0.08] bg-white px-3 text-[9px] font-bold transition hover:bg-[#f8f7f5]">
            <RefreshCw
              size={13}
              className={
                loadingProducts
                  ? "animate-spin"
                  : ""
              }
            />

            <span className="hidden lg:inline">
              Refresh
            </span>
          </button>

          <button
            type="button"
            onClick={
              onDayEnd
            }
            className="flex h-9 items-center gap-2 rounded-[10px] bg-bauraGoldSoft px-3.5 text-[9px] font-extrabold text-bauraGoldDark transition hover:brightness-[0.98]">
            <ReceiptText
              size={13}
            />

            Day End
          </button>

          <button
            type="button"
            onClick={
              onLogout
            }
            title="Sign out"
            className="flex h-9 w-9 items-center justify-center rounded-[10px] border border-black/[0.08] bg-white text-bauraMuted transition hover:bg-red-50 hover:text-red-600">
            <LogOut
              size={14}
            />
          </button>
        </div>
      </header>

      <main className="grid h-[calc(100vh-62px)] grid-cols-[minmax(0,1fr)_420px] 2xl:grid-cols-[minmax(0,1fr)_450px]">
        <section className="flex min-w-0 flex-col overflow-hidden">
          <div className="border-b border-black/[0.06] bg-white px-4 py-3">
            <div className="flex items-center gap-2">
              <div className="relative min-w-0 flex-1">
                <Search
                  size={15}
                  className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-bauraMuted"
                />

                <input
                  ref={
                    searchRef
                  }
                  value={
                    search
                  }
                  autoFocus
                  onChange={(
                    event,
                  ) =>
                    setSearch(
                      event
                        .target
                        .value,
                    )
                  }
                  placeholder="Search product name or variant..."
                  className="h-11 w-full rounded-[11px] border border-black/[0.09] bg-[#fbfbfa] pl-10 pr-20 text-[11px] font-medium outline-none transition placeholder:text-black/30 focus:border-bauraPrimary focus:bg-white focus:ring-2 focus:ring-bauraPrimary/10"
                />

                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rounded-md border border-black/[0.08] bg-white px-2 py-1 text-[8px] font-bold text-bauraMuted">
                  F2
                </span>
              </div>

              <button
                type="button"
                onClick={() =>
                  searchRef.current?.focus()
                }
                className="flex h-11 shrink-0 items-center gap-2 rounded-[11px] border border-black/[0.08] bg-white px-4 text-[9px] font-bold transition hover:border-bauraPrimary/30 hover:bg-bauraPrimary/[0.025]">
                <Barcode
                  size={15}
                />

                Barcode
              </button>
            </div>

            <div className="mt-3 flex items-center">
              <div>
                <h1 className="text-[16px] font-extrabold tracking-[-0.03em]">
                  Products
                </h1>

                <p className="mt-0.5 text-[9px] text-bauraMuted">
                  {
                    filteredProducts.length
                  }{" "}
                  shown
                  {" · "}
                  {
                    products.length
                  }{" "}
                  loaded
                </p>
              </div>

              {search && (
                <button
                  type="button"
                  onClick={() => {
                    setSearch(
                      "",
                    );

                    searchRef.current?.focus();
                  }}
                  className="ml-auto flex h-8 items-center gap-1.5 rounded-lg bg-[#f5f4f1] px-3 text-[8px] font-bold text-bauraMuted hover:text-bauraInk">
                  <X
                    size={11}
                  />

                  Clear search
                </button>
              )}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            {loadingProducts &&
            products.length ===
              0 ? (
              <div className="flex h-full min-h-[300px] items-center justify-center">
                <div className="text-center">
                  <RefreshCw
                    size={21}
                    className="mx-auto animate-spin text-bauraPrimary"
                  />

                  <p className="mt-3 text-[10px] font-bold">
                    Loading products
                  </p>

                  <p className="mt-1 text-[9px] text-bauraMuted">
                    Reading Bakery Stock...
                  </p>
                </div>
              </div>
            ) : filteredProducts.length ===
              0 ? (
              <div className="flex h-full min-h-[300px] items-center justify-center">
                <div className="text-center">
                  <Search
                    size={26}
                    className="mx-auto text-black/20"
                  />

                  <p className="mt-3 text-[11px] font-bold">
                    No products found
                  </p>

                  <p className="mt-1 text-[9px] text-bauraMuted">
                    Try another product name.
                  </p>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-3 xl:grid-cols-4 2xl:grid-cols-5">
                {filteredProducts.map(
                  (
                    product,
                  ) => (
                    <ProductCard
                      key={
                        product.id
                      }
                      product={
                        product
                      }
                      cartQty={
                        cart.find(
                          (
                            item,
                          ) =>
                            item.product
                              .id ===
                            product.id,
                        )?.qty ||
                        0
                      }
                      onAdd={() =>
                        addProduct(
                          product,
                        )
                      }
                    />
                  ),
                )}
              </div>
            )}
          </div>
        </section>

        <aside className="flex min-h-0 flex-col border-l border-black/[0.08] bg-white shadow-[-10px_0_30px_rgba(0,0,0,0.018)]">
          <div className="flex h-[58px] shrink-0 items-center border-b border-black/[0.07] px-4">
            <div className="flex h-8 w-8 items-center justify-center rounded-[9px] bg-bauraPrimary/[0.07] text-bauraPrimary">
              <ShoppingBag
                size={15}
              />
            </div>

            <div className="ml-2.5">
              <h2 className="text-[13px] font-extrabold tracking-[-0.02em]">
                Current Sale
              </h2>

              <p className="text-[8px] text-bauraMuted">
                {itemCount}{" "}
                {itemCount ===
                1
                  ? "item"
                  : "items"}
              </p>
            </div>

            {cart.length >
              0 && (
              <button
                type="button"
                onClick={
                  clearCart
                }
                className="ml-auto h-8 rounded-lg px-2.5 text-[8px] font-bold text-red-500 transition hover:bg-red-50">
                Clear
              </button>
            )}
          </div>

          <div className="shrink-0 border-b border-black/[0.07] p-3">
            <button
              type="button"
              onClick={() =>
                setCustomerOpen(
                  true,
                )
              }
              className="flex h-11 w-full items-center rounded-[10px] border border-black/[0.08] bg-[#fcfcfb] px-3 text-left transition hover:border-bauraPrimary/25 hover:bg-white">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#f1f0ed] text-bauraMuted">
                <UserRound
                  size={13}
                />
              </div>

              <div className="ml-2.5 min-w-0 flex-1">
                <div className="text-[8px] font-medium text-bauraMuted">
                  Customer
                </div>

                <div className="truncate text-[9px] font-bold">
                  {customerLabel ||
                    "Walk-in customer"}
                </div>
              </div>

              <ChevronDown
                size={13}
                className="text-bauraMuted"
              />
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
            {cart.length ===
            0 ? (
              <div className="flex h-full min-h-[220px] flex-col items-center justify-center px-6 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#f5f4f1] text-black/20">
                  <ShoppingBag
                    size={24}
                  />
                </div>

                <p className="mt-4 text-[11px] font-extrabold">
                  Start a new sale
                </p>

                <p className="mt-1.5 max-w-[220px] text-[9px] leading-4 text-bauraMuted">
                  Select products from the catalogue. They will appear here instantly.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {cart.map(
                  (
                    item,
                  ) => (
                    <CartRow
                      key={
                        item.product
                          .id
                      }
                      item={
                        item
                      }
                      onDecrease={() =>
                        updateQty(
                          item.product
                            .id,
                          -1,
                        )
                      }
                      onIncrease={() =>
                        updateQty(
                          item.product
                            .id,
                          1,
                        )
                      }
                      onRemove={() =>
                        removeItem(
                          item.product
                            .id,
                        )
                      }
                    />
                  ),
                )}
              </div>
            )}
          </div>

          <div className="shrink-0 border-t border-black/[0.08] bg-white p-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between text-[9px]">
                <span className="text-bauraMuted">
                  Subtotal
                </span>

                <span className="font-bold">
                  Rs.{" "}
                  {money(
                    subtotal,
                  )}
                </span>
              </div>

              <div className="flex items-center justify-between text-[9px]">
                <span className="text-bauraMuted">
                  Discount
                </span>

                <span className="font-bold">
                  Rs. 0.00
                </span>
              </div>
            </div>

            <div className="my-3 border-t border-dashed border-black/[0.13]" />

            <div className="flex items-end justify-between gap-4">
              <div>
                <div className="text-[9px] font-semibold text-bauraMuted">
                  Total
                </div>

                <div className="mt-0.5 text-[8px] text-bauraMuted">
                  {itemCount} item
                  {itemCount ===
                  1
                    ? ""
                    : "s"}
                </div>
              </div>

              <div className="text-right text-[22px] font-black tracking-[-0.055em] text-bauraInk">
                <span className="mr-1 text-[11px] font-bold tracking-normal text-bauraMuted">
                  Rs.
                </span>

                {money(
                  subtotal,
                )}
              </div>
            </div>

            <button
              type="button"
              disabled={
                cart.length ===
                0
              }
              onClick={
                openPayment
              }
              className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-[12px] bg-bauraPrimary px-4 text-[10px] font-extrabold text-white shadow-[0_6px_18px_rgba(91,52,35,0.18)] transition hover:bg-bauraPrimaryDark disabled:cursor-not-allowed disabled:opacity-35">
              <Zap
                size={14}
              />

              Pay Rs.{" "}
              {money(
                subtotal,
              )}
            </button>
          </div>
        </aside>
      </main>

      {customerOpen && (
        <CustomerPanel
          currentLabel={
            customerLabel
          }
          currentEmail={
            receiptEmail
          }
          onClose={() =>
            setCustomerOpen(
              false,
            )
          }
          onApply={(
            label,
            email,
          ) => {
            /*
             * This panel deliberately
             * does not invent a canonical
             * officialCustomerId.
             *
             * Once your existing customer
             * lookup API is connected here,
             * setCustomerId() should receive
             * the returned official-site ID.
             */
            setCustomerId(
              null,
            );

            setCustomerLabel(
              label,
            );

            setReceiptEmail(
              email,
            );

            setCustomerOpen(
              false,
            );
          }}
          onWalkIn={() => {
            setCustomerId(
              null,
            );

            setCustomerLabel(
              "",
            );

            setCustomerOpen(
              false,
            );
          }}
        />
      )}

      {paymentOpen && (
        <PaymentModal
          total={
            subtotal
          }
          paymentMethod={
            paymentMethod
          }
          tendered={
            tendered
          }
          paymentReference={
            paymentReference
          }
          receiptEmail={
            receiptEmail
          }
          change={
            change
          }
          cashShort={
            cashShort
          }
          processing={
            processing
          }
          onPaymentMethod={
            choosePayment
          }
          onTendered={
            setTendered
          }
          onReference={
            setPaymentReference
          }
          onReceiptEmail={
            setReceiptEmail
          }
          onClose={() =>
            !processing &&
            setPaymentOpen(
              false,
            )
          }
          onPay={() =>
            void checkout(
              false,
            )
          }
          onPayAndPrint={() =>
            void checkout(
              true,
            )
          }
        />
      )}
    </div>
  );
}

function ProductCard({
  product,
  cartQty,
  onAdd,
}: {
  product: PosProduct;
  cartQty: number;
  onAdd: () => void;
}) {
  const available =
    Number(
      product.availableQty,
    );

  const disabled =
    !product.inStock ||
    available <= 0;

  const lowStock =
    Boolean(
      product.isLowStock,
    );

  return (
    <button
      type="button"
      disabled={
        disabled
      }
      onClick={
        onAdd
      }
      className="group relative overflow-hidden rounded-[14px] border border-black/[0.075] bg-white text-left shadow-[0_1px_2px_rgba(0,0,0,0.02)] transition duration-150 hover:-translate-y-[1px] hover:border-bauraPrimary/25 hover:shadow-[0_8px_24px_rgba(0,0,0,0.07)] disabled:cursor-not-allowed disabled:opacity-50">
      {cartQty >
        0 && (
        <div className="absolute right-2 top-2 z-10 flex h-6 min-w-6 items-center justify-center rounded-full bg-bauraPrimary px-1.5 text-[8px] font-black text-white shadow-md">
          {cartQty}
        </div>
      )}

      <div className="relative aspect-[1.45/1] overflow-hidden bg-[#f2f1ee]">
        {product.imageUrl ? (
          <img
            src={
              product.imageUrl
            }
            alt={
              product.displayName
            }
            loading="lazy"
            className="h-full w-full object-cover transition duration-200 group-hover:scale-[1.025]"
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <PackageOpen
              size={24}
              className="text-black/18"
            />
          </div>
        )}

        {disabled && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/70 backdrop-blur-[1px]">
            <span className="rounded-md bg-black/75 px-2 py-1 text-[7px] font-black uppercase tracking-[0.08em] text-white">
              Out of stock
            </span>
          </div>
        )}
      </div>

      <div className="p-2.5">
        <div className="line-clamp-2 min-h-[30px] text-[10px] font-extrabold leading-[15px] tracking-[-0.015em]">
          {
            product.displayName
          }
        </div>

        <div className="mt-2.5 flex items-end justify-between gap-2">
          <div className="text-[12px] font-black tracking-[-0.025em] text-bauraPrimary">
            <span className="mr-0.5 text-[8px] font-bold">
              Rs.
            </span>

            {money(
              Number(
                product.sellPrice,
              ),
            )}
          </div>

          <div
            className={`text-right text-[7px] font-bold ${
              disabled
                ? "text-red-500"
                : lowStock
                  ? "text-amber-600"
                  : "text-bauraMuted"
            }`}>
            {disabled
              ? "No stock"
              : `${available} left`}
          </div>
        </div>
      </div>
    </button>
  );
}

function CartRow({
  item,
  onDecrease,
  onIncrease,
  onRemove,
}: {
  item: CartItem;
  onDecrease: () => void;
  onIncrease: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="rounded-[12px] border border-black/[0.07] bg-white p-2.5 transition hover:border-black/[0.11]">
      <div className="flex gap-2.5">
        <div className="h-12 w-12 shrink-0 overflow-hidden rounded-[9px] bg-[#f2f1ee]">
          {item.product
            .imageUrl ? (
            <img
              src={
                item.product
                  .imageUrl
              }
              alt={
                item.product
                  .displayName
              }
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full items-center justify-center">
              <PackageOpen
                size={15}
                className="text-black/20"
              />
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex gap-2">
            <div className="min-w-0 flex-1">
              <div className="truncate text-[9px] font-extrabold">
                {
                  item.product
                    .displayName
                }
              </div>

              <div className="mt-0.5 text-[8px] font-semibold text-bauraMuted">
                Rs.{" "}
                {money(
                  Number(
                    item.product
                      .sellPrice,
                  ),
                )}{" "}
                each
              </div>
            </div>

            <button
              type="button"
              onClick={
                onRemove
              }
              title="Remove"
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-bauraMuted transition hover:bg-red-50 hover:text-red-500">
              <Trash2
                size={11}
              />
            </button>
          </div>

          <div className="mt-2 flex items-center justify-between gap-2">
            <div className="flex h-7 items-center rounded-[8px] border border-black/[0.08] bg-[#f8f7f5]">
              <button
                type="button"
                onClick={
                  onDecrease
                }
                className="flex h-full w-7 items-center justify-center rounded-l-[8px] transition hover:bg-black/[0.04]">
                <Minus
                  size={10}
                />
              </button>

              <span className="min-w-7 text-center text-[9px] font-black">
                {item.qty}
              </span>

              <button
                type="button"
                onClick={
                  onIncrease
                }
                disabled={
                  item.qty >=
                  Number(
                    item.product
                      .availableQty,
                  )
                }
                className="flex h-full w-7 items-center justify-center rounded-r-[8px] transition hover:bg-black/[0.04] disabled:opacity-30">
                <Plus
                  size={10}
                />
              </button>
            </div>

            <div className="text-[10px] font-black">
              Rs.{" "}
              {money(
                Number(
                  item.product
                    .sellPrice,
                ) *
                  item.qty,
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function CustomerPanel({
  currentLabel,
  currentEmail,
  onClose,
  onApply,
  onWalkIn,
}: {
  currentLabel: string;
  currentEmail: string;
  onClose: () => void;
  onApply: (
    label: string,
    email: string,
  ) => void;
  onWalkIn: () => void;
}) {
  const [
    customer,
    setCustomer,
  ] = useState(
    currentLabel,
  );

  const [
    email,
    setEmail,
  ] = useState(
    currentEmail,
  );

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/25 backdrop-blur-[2px]"
      onMouseDown={(
        event,
      ) => {
        if (
          event.target ===
          event.currentTarget
        ) {
          onClose();
        }
      }}>
      <div className="h-full w-full max-w-[390px] overflow-y-auto bg-white shadow-[-20px_0_60px_rgba(0,0,0,0.12)]">
        <div className="flex h-[62px] items-center border-b border-black/[0.07] px-5">
          <div>
            <h2 className="text-[14px] font-extrabold">
              Customer
            </h2>

            <p className="mt-0.5 text-[8px] text-bauraMuted">
              Attach customer information to this sale
            </p>
          </div>

          <button
            type="button"
            onClick={
              onClose
            }
            className="ml-auto flex h-8 w-8 items-center justify-center rounded-lg bg-[#f5f4f1]">
            <X
              size={13}
            />
          </button>
        </div>

        <div className="p-5">
          <button
            type="button"
            onClick={
              onWalkIn
            }
            className="flex w-full items-center rounded-xl border border-bauraPrimary/20 bg-bauraPrimary/[0.035] p-3 text-left">
            <div className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-bauraPrimary text-white">
              <UserRound
                size={15}
              />
            </div>

            <div className="ml-3">
              <div className="text-[10px] font-extrabold">
                Walk-in customer
              </div>

              <div className="mt-0.5 text-[8px] text-bauraMuted">
                Continue without a registered customer
              </div>
            </div>
          </button>

          <div className="my-5 flex items-center gap-3">
            <div className="h-px flex-1 bg-black/[0.07]" />

            <span className="text-[7px] font-bold uppercase tracking-[0.1em] text-bauraMuted">
              Customer details
            </span>

            <div className="h-px flex-1 bg-black/[0.07]" />
          </div>

          <label className="block">
            <span className="text-[8px] font-bold text-bauraMuted">
              Phone / customer
            </span>

            <div className="relative mt-1.5">
              <Search
                size={13}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-bauraMuted"
              />

              <input
                autoFocus
                value={
                  customer
                }
                onChange={(
                  event,
                ) =>
                  setCustomer(
                    event
                      .target
                      .value,
                  )
                }
                placeholder="Search by phone number"
                className="h-11 w-full rounded-[10px] border border-black/[0.09] pl-9 pr-3 text-[10px] outline-none focus:border-bauraPrimary focus:ring-2 focus:ring-bauraPrimary/10"
              />
            </div>
          </label>

          <label className="mt-4 block">
            <span className="text-[8px] font-bold text-bauraMuted">
              Receipt email
            </span>

            <div className="relative mt-1.5">
              <Mail
                size={13}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-bauraMuted"
              />

              <input
                type="email"
                value={
                  email
                }
                onChange={(
                  event,
                ) =>
                  setEmail(
                    event
                      .target
                      .value,
                  )
                }
                placeholder="Optional email address"
                className="h-11 w-full rounded-[10px] border border-black/[0.09] pl-9 pr-3 text-[10px] outline-none focus:border-bauraPrimary focus:ring-2 focus:ring-bauraPrimary/10"
              />
            </div>
          </label>

          <div className="mt-4 rounded-xl border border-amber-100 bg-amber-50 p-3">
            <p className="text-[8px] font-bold text-amber-800">
              Customer lookup connection
            </p>

            <p className="mt-1 text-[8px] leading-4 text-amber-700">
              This UI is ready for the existing official-site phone lookup. It intentionally does not create a fake customer ID from typed text.
            </p>
          </div>

          <button
            type="button"
            onClick={() =>
              onApply(
                customer.trim(),
                email.trim(),
              )
            }
            className="mt-5 flex h-11 w-full items-center justify-center gap-2 rounded-[11px] bg-bauraPrimary text-[9px] font-extrabold text-white">
            <Check
              size={13}
            />

            Apply to Sale
          </button>
        </div>
      </div>
    </div>
  );
}

function PaymentModal({
  total,
  paymentMethod,
  tendered,
  paymentReference,
  receiptEmail,
  change,
  cashShort,
  processing,
  onPaymentMethod,
  onTendered,
  onReference,
  onReceiptEmail,
  onClose,
  onPay,
  onPayAndPrint,
}: {
  total: number;
  paymentMethod: PosPaymentMethod;
  tendered: string;
  paymentReference: string;
  receiptEmail: string;
  change: number;
  cashShort: number;
  processing: boolean;
  onPaymentMethod: (
    method: PosPaymentMethod,
  ) => void;
  onTendered: (
    value: string,
  ) => void;
  onReference: (
    value: string,
  ) => void;
  onReceiptEmail: (
    value: string,
  ) => void;
  onClose: () => void;
  onPay: () => void;
  onPayAndPrint: () => void;
}) {
  const quickCash =
    useMemo(() => {
      const candidates =
        [
          Math.ceil(
            total,
          ),
          Math.ceil(
            total /
              100,
          ) *
            100,
          Math.ceil(
            total /
              500,
          ) *
            500,
          Math.ceil(
            total /
              1000,
          ) *
            1000,
          Math.ceil(
            total /
              5000,
          ) *
            5000,
        ];

      return [
        ...new Set(
          candidates.filter(
            (value) =>
              value >=
              total,
          ),
        ),
      ].slice(
        0,
        4,
      );
    }, [
      total,
    ]);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/35 p-5 backdrop-blur-[3px]"
      onMouseDown={(
        event,
      ) => {
        if (
          event.target ===
            event.currentTarget &&
          !processing
        ) {
          onClose();
        }
      }}>
      <div className="w-full max-w-[560px] overflow-hidden rounded-[20px] border border-white/60 bg-white shadow-[0_30px_100px_rgba(0,0,0,0.2)]">
        <div className="flex items-center border-b border-black/[0.07] px-5 py-4">
          <div>
            <div className="text-[8px] font-bold uppercase tracking-[0.12em] text-bauraMuted">
              Checkout
            </div>

            <h2 className="mt-0.5 text-[16px] font-black tracking-[-0.03em]">
              Complete Payment
            </h2>
          </div>

          <button
            type="button"
            disabled={
              processing
            }
            onClick={
              onClose
            }
            className="ml-auto flex h-9 w-9 items-center justify-center rounded-[10px] bg-[#f5f4f1] text-bauraMuted disabled:opacity-40">
            <X
              size={14}
            />
          </button>
        </div>

        <div className="p-5">
          <div className="rounded-[15px] bg-[#f6f5f2] p-4">
            <div className="flex items-end justify-between">
              <div>
                <div className="text-[9px] font-semibold text-bauraMuted">
                  Amount due
                </div>

                <div className="mt-1 text-[9px] text-bauraMuted">
                  Baura Bakers POS
                </div>
              </div>

              <div className="text-right text-[27px] font-black tracking-[-0.055em]">
                <span className="mr-1.5 text-[11px] font-bold tracking-normal text-bauraMuted">
                  Rs.
                </span>

                {money(
                  total,
                )}
              </div>
            </div>
          </div>

          <div className="mt-5">
            <div className="text-[8px] font-bold uppercase tracking-[0.09em] text-bauraMuted">
              Payment method
            </div>

            <div className="mt-2 grid grid-cols-5 gap-2">
              <PaymentButton
                active={
                  paymentMethod ===
                  "CASH"
                }
                label="Cash"
                icon={
                  <Banknote
                    size={15}
                  />
                }
                onClick={() =>
                  onPaymentMethod(
                    "CASH",
                  )
                }
              />

              <PaymentButton
                active={
                  paymentMethod ===
                  "CARD"
                }
                label="Card"
                icon={
                  <CreditCard
                    size={15}
                  />
                }
                onClick={() =>
                  onPaymentMethod(
                    "CARD",
                  )
                }
              />

              <PaymentButton
                active={
                  paymentMethod ===
                  "BANK_TRANSFER"
                }
                label="Bank"
                icon={
                  <WalletCards
                    size={15}
                  />
                }
                onClick={() =>
                  onPaymentMethod(
                    "BANK_TRANSFER",
                  )
                }
              />

              <PaymentButton
                active={
                  paymentMethod ===
                  "ONLINE"
                }
                label="Online"
                icon={
                  <WalletCards
                    size={15}
                  />
                }
                onClick={() =>
                  onPaymentMethod(
                    "ONLINE",
                  )
                }
              />

              <PaymentButton
                active={
                  paymentMethod ===
                  "OTHER"
                }
                label="Other"
                icon={
                  <ReceiptText
                    size={15}
                  />
                }
                onClick={() =>
                  onPaymentMethod(
                    "OTHER",
                  )
                }
              />
            </div>
          </div>

          {paymentMethod ===
          "CASH" ? (
            <div className="mt-5">
              <label className="text-[8px] font-bold uppercase tracking-[0.09em] text-bauraMuted">
                Cash received
              </label>

              <div className="relative mt-2">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[10px] font-bold text-bauraMuted">
                  Rs.
                </span>

                <input
                  autoFocus
                  inputMode="decimal"
                  value={
                    tendered
                  }
                  onChange={(
                    event,
                  ) =>
                    onTendered(
                      event
                        .target
                        .value,
                    )
                  }
                  className="h-14 w-full rounded-[12px] border border-black/[0.1] pl-11 pr-4 text-[18px] font-black outline-none focus:border-bauraPrimary focus:ring-2 focus:ring-bauraPrimary/10"
                />
              </div>

              <div className="mt-2 grid grid-cols-4 gap-2">
                {quickCash.map(
                  (
                    value,
                  ) => (
                    <button
                      key={
                        value
                      }
                      type="button"
                      onClick={() =>
                        onTendered(
                          String(
                            value,
                          ),
                        )
                      }
                      className="h-9 rounded-[9px] border border-black/[0.08] bg-[#faf9f7] text-[8px] font-extrabold transition hover:border-bauraPrimary/30 hover:bg-bauraPrimary/[0.03]">
                      Rs.{" "}
                      {money(
                        value,
                      )}
                    </button>
                  ),
                )}
              </div>

              <div
                className={`mt-3 flex items-center justify-between rounded-[11px] px-4 py-3 ${
                  cashShort >
                  0
                    ? "bg-red-50 text-red-700"
                    : "bg-emerald-50 text-emerald-700"
                }`}>
                <span className="text-[9px] font-bold">
                  {cashShort >
                  0
                    ? "Still required"
                    : "Change"}
                </span>

                <span className="text-[14px] font-black">
                  Rs.{" "}
                  {money(
                    cashShort >
                    0
                      ? cashShort
                      : change,
                  )}
                </span>
              </div>
            </div>
          ) : (
            <div className="mt-5">
              <label className="text-[8px] font-bold uppercase tracking-[0.09em] text-bauraMuted">
                {paymentMethod ===
                "CARD"
                  ? "Card reference"
                  : paymentMethod ===
                      "BANK_TRANSFER"
                    ? "Bank transfer reference"
                    : "Payment reference"}
              </label>

              <input
                autoFocus
                value={
                  paymentReference
                }
                onChange={(
                  event,
                ) =>
                  onReference(
                    event
                      .target
                      .value,
                  )
                }
                placeholder="Enter reference"
                className="mt-2 h-12 w-full rounded-[11px] border border-black/[0.1] px-4 text-[10px] font-semibold outline-none focus:border-bauraPrimary focus:ring-2 focus:ring-bauraPrimary/10"
              />
            </div>
          )}

          <div className="mt-4">
            <label className="text-[8px] font-bold uppercase tracking-[0.09em] text-bauraMuted">
              Receipt email
            </label>

            <div className="relative mt-2">
              <Mail
                size={13}
                className="absolute left-3.5 top-1/2 -translate-y-1/2 text-bauraMuted"
              />

              <input
                type="email"
                value={
                  receiptEmail
                }
                onChange={(
                  event,
                ) =>
                  onReceiptEmail(
                    event
                      .target
                      .value,
                  )
                }
                placeholder="Optional"
                className="h-11 w-full rounded-[10px] border border-black/[0.09] pl-10 pr-3 text-[9px] outline-none focus:border-bauraPrimary"
              />
            </div>
          </div>

          <div className="mt-5 grid grid-cols-[1fr_1.25fr] gap-2">
            <button
              type="button"
              disabled={
                processing ||
                cashShort >
                  0
              }
              onClick={
                onPay
              }
              className="flex h-12 items-center justify-center gap-2 rounded-[11px] border border-bauraPrimary/20 bg-bauraPrimary/[0.045] text-[9px] font-extrabold text-bauraPrimary disabled:cursor-not-allowed disabled:opacity-40">
              <Check
                size={13}
              />

              {processing
                ? "Processing..."
                : "Pay without Print"}
            </button>

            <button
              type="button"
              disabled={
                processing ||
                cashShort >
                  0
              }
              onClick={
                onPayAndPrint
              }
              className="flex h-12 items-center justify-center gap-2 rounded-[11px] bg-bauraPrimary text-[10px] font-extrabold text-white shadow-[0_7px_20px_rgba(91,52,35,0.18)] disabled:cursor-not-allowed disabled:opacity-40">
              {processing ? (
                <RefreshCw
                  size={13}
                  className="animate-spin"
                />
              ) : (
                <Printer
                  size={13}
                />
              )}

              {processing
                ? "Completing Sale..."
                : `Pay & Print · Rs. ${money(
                    total,
                  )}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function PaymentButton({
  active,
  label,
  icon,
  onClick,
}: {
  active: boolean;
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={
        onClick
      }
      className={`flex h-[58px] flex-col items-center justify-center gap-1.5 rounded-[10px] border text-[8px] font-extrabold transition ${
        active
          ? "border-bauraPrimary bg-bauraPrimary/[0.055] text-bauraPrimary shadow-[inset_0_0_0_1px_rgba(91,52,35,0.03)]"
          : "border-black/[0.08] bg-white text-bauraMuted hover:bg-[#faf9f7] hover:text-bauraInk"
      }`}>
      {icon}

      {label}
    </button>
  );
}

function SaleCompleted({
  sale,
  onPrint,
  onNewSale,
}: {
  sale: CompletedPosSale;
  onPrint: () => void;
  onNewSale: () => void;
}) {
  const payment =
    sale.payments?.[0];

  return (
    <div className="min-h-screen bg-[#f4f3f0] px-5 py-8 print:bg-white print:p-0">
      <div className="mx-auto w-full max-w-[430px]">
        <div className="print:hidden">
          <div className="mb-4 flex items-center justify-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
              <Check
                size={21}
                strokeWidth={
                  3
                }
              />
            </div>
          </div>

          <h1 className="text-center text-[20px] font-black tracking-[-0.04em]">
            Payment Successful
          </h1>

          <p className="mt-1 text-center text-[9px] text-bauraMuted">
            The sale has been completed and stock has been updated.
          </p>
        </div>

        <div
          id="pos-receipt"
          className="mt-5 bg-white px-6 py-7 shadow-[0_20px_60px_rgba(0,0,0,0.08)] print:mt-0 print:shadow-none">
          <div className="text-center">
            <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-[10px] bg-bauraPrimary text-[15px] font-black text-white print:border print:border-black print:bg-white print:text-black">
              B
            </div>

            <div className="mt-3 text-[13px] font-black">
              Baura Bakers
            </div>

            <div className="mt-1 text-[8px] text-bauraMuted print:text-black">
              Point of Sale Receipt
            </div>

            <div className="mt-3 text-[9px] font-bold">
              {sale.orderNo}
            </div>

            {sale.soldAt && (
              <div className="mt-1 text-[8px] text-bauraMuted print:text-black">
                {new Intl.DateTimeFormat(
                  "en-LK",
                  {
                    dateStyle:
                      "medium",
                    timeStyle:
                      "short",
                  },
                ).format(
                  new Date(
                    sale.soldAt,
                  ),
                )}
              </div>
            )}
          </div>

          <div className="my-5 border-t border-dashed border-black/20" />

          <div className="space-y-3">
            {sale.items.map(
              (
                item,
                index,
              ) => (
                <div
                  key={
                    item.id ||
                    `${item.productId}-${index}`
                  }
                  className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="text-[9px] font-bold leading-4">
                      {item.productDisplayName ||
                        item.product
                          ?.name ||
                        "Product"}
                    </div>

                    <div className="mt-0.5 text-[8px] text-bauraMuted print:text-black">
                      {Number(
                        item.qty,
                      )}{" "}
                      × Rs.{" "}
                      {money(
                        Number(
                          item.unitSellPrice,
                        ),
                      )}
                    </div>
                  </div>

                  <div className="shrink-0 text-[9px] font-bold">
                    Rs.{" "}
                    {money(
                      Number(
                        item.netTotal,
                      ),
                    )}
                  </div>
                </div>
              ),
            )}
          </div>

          <div className="my-5 border-t border-dashed border-black/20" />

          <div className="space-y-2">
            <ReceiptRow
              label="Subtotal"
              value={`Rs. ${money(
                Number(
                  sale.grossTotal ??
                    sale.netTotal,
                ),
              )}`}
            />

            {Number(
              sale.discountTotal ||
                0,
            ) >
              0 && (
              <ReceiptRow
                label="Discount"
                value={`- Rs. ${money(
                  Number(
                    sale.discountTotal,
                  ),
                )}`}
              />
            )}

            <div className="flex items-center justify-between pt-1">
              <span className="text-[10px] font-black">
                Total
              </span>

              <span className="text-[16px] font-black">
                Rs.{" "}
                {money(
                  Number(
                    sale.netTotal,
                  ),
                )}
              </span>
            </div>
          </div>

          <div className="my-5 border-t border-dashed border-black/20" />

          <div className="space-y-2">
            <ReceiptRow
              label="Payment"
              value={
                payment?.method ||
                sale.paymentMethod ||
                "-"
              }
            />

            {payment
              ?.tenderedAmount !==
              null &&
              payment
                ?.tenderedAmount !==
                undefined && (
                <ReceiptRow
                  label="Cash received"
                  value={`Rs. ${money(
                    Number(
                      payment.tenderedAmount,
                    ),
                  )}`}
                />
              )}

            {payment
              ?.changeAmount !==
              null &&
              payment
                ?.changeAmount !==
                undefined && (
                <ReceiptRow
                  label="Change"
                  value={`Rs. ${money(
                    Number(
                      payment.changeAmount,
                    ),
                  )}`}
                />
              )}

            {payment
              ?.reference && (
              <ReceiptRow
                label="Reference"
                value={
                  payment.reference
                }
              />
            )}
          </div>

          <div className="my-5 border-t border-dashed border-black/20" />

          <div className="text-center text-[8px] leading-4 text-bauraMuted print:text-black">
            Thank you for shopping with Baura Bakers.
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 print:hidden">
          <button
            type="button"
            onClick={
              onPrint
            }
            className="flex h-11 items-center justify-center gap-2 rounded-[11px] border border-black/[0.09] bg-white text-[9px] font-extrabold transition hover:bg-[#faf9f7]">
            <Printer
              size={13}
            />

            Print Receipt
          </button>

          <button
            type="button"
            onClick={
              onNewSale
            }
            autoFocus
            className="flex h-11 items-center justify-center gap-2 rounded-[11px] bg-bauraPrimary text-[9px] font-extrabold text-white">
            <Plus
              size={13}
            />

            New Sale
          </button>
        </div>
      </div>

      <style>
        {`
          @media print {
            @page {
              margin: 4mm;
              size: 80mm auto;
            }

            html,
            body {
              width: 80mm;
              background: white !important;
            }

            body * {
              visibility: hidden;
            }

            #pos-receipt,
            #pos-receipt * {
              visibility: visible;
            }

            #pos-receipt {
              position: absolute;
              left: 0;
              top: 0;
              width: 72mm;
              margin: 0;
              padding: 4mm;
              box-shadow: none !important;
            }
          }
        `}
      </style>
    </div>
  );
}

function ReceiptRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 text-[8px]">
      <span className="text-bauraMuted print:text-black">
        {label}
      </span>

      <span className="max-w-[65%] text-right font-bold">
        {value}
      </span>
    </div>
  );
}
/** @format */

import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Banknote,
  Check,
  ChevronRight,
  CircleDollarSign,
  CreditCard,
  Loader2,
  LogOut,
  Mail,
  Minus,
  PackageOpen,
  Plus,
  Printer,
  ReceiptText,
  RefreshCw,
  Search,
  ShieldCheck,
  ShoppingBag,
  Trash2,
  UserPlus,
  UserRound,
  WalletCards,
  X,
} from "lucide-react";

import type {
  PosSession,
} from "../../lib/posSessionApi";

import {
  completePosSale,
  lookupPosCustomer,
  registerPosCustomer,
  type CompletedPosSale,
  type PosCustomer,
  type PosPaymentMethod,
  type PosProduct,
} from "../../lib/posSellingApi";

import {
  createPosCashMovement,
  getCurrentPosCashMovements,
  getPosApprovalStatus,
  requestPosApproval,
  type PosApproval,
  type PosDrawerSummary,
} from "../../lib/posOperationsApi";

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

type CustomerModalMode =
  | "SEARCH"
  | "REGISTER";

type CashMovementMode =
  | "CASH_IN"
  | "CASH_OUT";

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

function numberValue(
  value: unknown,
) {
  const parsed =
    Number(value);

  return Number.isFinite(
    parsed,
  )
    ? parsed
    : 0;
}

function makeIdempotencyKey() {
  if (
    typeof crypto !==
      "undefined" &&
    "randomUUID" in
      crypto
  ) {
    return `pos-${crypto.randomUUID()}`;
  }

  return `pos-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2)}`;
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
    selectedCustomer,
    setSelectedCustomer,
  ] =
    useState<PosCustomer | null>(
      null,
    );

  const [
    receiptEmail,
    setReceiptEmail,
  ] = useState("");

  const [
    discountInput,
    setDiscountInput,
  ] = useState("");

  const [
    discountApproval,
    setDiscountApproval,
  ] =
    useState<PosApproval | null>(
      null,
    );

  const [
    approvalLoading,
    setApprovalLoading,
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
    customerModal,
    setCustomerModal,
  ] = useState(false);

  const [
    cashMovementModal,
    setCashMovementModal,
  ] = useState(false);

  const [
    drawer,
    setDrawer,
  ] =
    useState<PosDrawerSummary | null>(
      null,
    );

  /*
  |--------------------------------------------------------------------------
  | KEYBOARD SHORTCUT
  |--------------------------------------------------------------------------
  */

  useEffect(() => {
    function handleKeyDown(
      event: KeyboardEvent,
    ) {
      if (
        (event.ctrlKey ||
          event.metaKey) &&
        event.key.toLowerCase() ===
          "k"
      ) {
        event.preventDefault();

        searchRef.current?.focus();
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

  /*
  |--------------------------------------------------------------------------
  | DRAWER
  |--------------------------------------------------------------------------
  */

  async function loadDrawer() {
    try {
      const response =
        await getCurrentPosCashMovements();

      setDrawer(
        response.drawer,
      );
    } catch {
      /*
       * Drawer information is useful,
       * but must never prevent billing.
       */
    }
  }

  useEffect(() => {
    void loadDrawer();
  }, [session.id]);

  /*
  |--------------------------------------------------------------------------
  | PRODUCTS
  |--------------------------------------------------------------------------
  */

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
        (product) =>
          product.displayName
            .toLowerCase()
            .includes(query),
      );
    }, [
      products,
      search,
    ]);

  /*
  |--------------------------------------------------------------------------
  | TOTALS
  |--------------------------------------------------------------------------
  */

  const grossTotal =
    useMemo(
      () =>
        cart.reduce(
          (
            total,
            item,
          ) =>
            total +
            item.product
              .sellPrice *
              item.qty,
          0,
        ),
      [cart],
    );

  const requestedDiscount =
    Math.max(
      0,
      numberValue(
        discountInput,
      ),
    );

  const discountTotal =
    Math.min(
      requestedDiscount,
      grossTotal,
    );

  const netTotal =
    Math.max(
      0,
      grossTotal -
        discountTotal,
    );

  const tenderedAmount =
    numberValue(
      tendered,
    );

  const change =
    paymentMethod ===
      "CASH"
      ? Math.max(
          0,
          tenderedAmount -
            netTotal,
        )
      : 0;

  const cartQty =
    cart.reduce(
      (
        total,
        item,
      ) =>
        total +
        item.qty,
      0,
    );

  /*
  |--------------------------------------------------------------------------
  | CART
  |--------------------------------------------------------------------------
  */

  function addProduct(
    product: PosProduct,
  ) {
    if (
      !product.inStock ||
      product.availableQty <=
        0
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
          product.availableQty
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
                item.product.id !==
                productId
              ) {
                return item;
              }

              const next =
                item.qty +
                delta;

              if (
                next <= 0
              ) {
                return null;
              }

              return {
                ...item,

                qty:
                  Math.min(
                    next,
                    item.product
                      .availableQty,
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

  /*
  |--------------------------------------------------------------------------
  | RESET
  |--------------------------------------------------------------------------
  */

  function clearSale() {
    setCart([]);

    setPaymentMethod(
      "CASH",
    );

    setTendered("");

    setPaymentReference(
      "",
    );

    setSelectedCustomer(
      null,
    );

    setReceiptEmail("");

    setDiscountInput("");

    setDiscountApproval(
      null,
    );

    setCompletedSale(
      null,
    );

    setSearch("");

    setTimeout(() => {
      searchRef.current?.focus();
    }, 50);
  }

  /*
  |--------------------------------------------------------------------------
  | CUSTOMER
  |--------------------------------------------------------------------------
  */

  function selectCustomer(
    customer: PosCustomer,
  ) {
    setSelectedCustomer(
      customer,
    );

    setReceiptEmail(
      customer.email || "",
    );

    setCustomerModal(
      false,
    );

    toast.success(
      "Customer selected",
      customer.name,
    );
  }

  /*
  |--------------------------------------------------------------------------
  | DISCOUNT APPROVAL
  |--------------------------------------------------------------------------
  */

  async function requestDiscountApproval() {
    if (
      requestedDiscount <=
        0
    ) {
      toast.warning(
        "Enter discount",
        "Enter a discount amount first.",
      );

      return;
    }

    if (
      requestedDiscount >
      grossTotal
    ) {
      toast.warning(
        "Invalid discount",
        "Discount cannot exceed the sale total.",
      );

      return;
    }

    setApprovalLoading(
      true,
    );

    try {
      const response =
        await requestPosApproval(
          {
            type:
              "MANUAL_DISCOUNT",

            amount:
              requestedDiscount,

            reason:
              "Manual discount requested from POS",

            context: {
              posSessionId:
                session.id,

              sessionNo:
                session.sessionNo,

              grossTotal,

              itemCount:
                cartQty,
            },
          },
        );

      setDiscountApproval(
        response.approval,
      );

      toast.info(
        "Approval requested",
        "Waiting for manager approval.",
      );
    } catch (error) {
      toast.error(
        "Approval request failed",
        error instanceof Error
          ? error.message
          : "Unable to request manager approval.",
      );
    } finally {
      setApprovalLoading(
        false,
      );
    }
  }

  async function refreshApproval() {
    if (
      !discountApproval
    ) {
      return;
    }

    setApprovalLoading(
      true,
    );

    try {
      const response =
        await getPosApprovalStatus(
          discountApproval.id,
        );

      setDiscountApproval(
        response.approval,
      );

      if (
        response.approval
          .status ===
        "APPROVED"
      ) {
        toast.success(
          "Discount approved",
          `Rs. ${money(
            requestedDiscount,
          )} approved.`,
        );
      } else if (
        response.approval
          .status ===
        "REJECTED"
      ) {
        toast.error(
          "Discount rejected",
          response.approval
            .reason ||
            "The manager rejected this discount.",
        );
      }
    } catch (error) {
      toast.error(
        "Unable to check approval",
        error instanceof Error
          ? error.message
          : "Could not check approval status.",
      );
    } finally {
      setApprovalLoading(
        false,
      );
    }
  }

  function changeDiscount(
    value: string,
  ) {
    setDiscountInput(
      value,
    );

    /*
     * Approval is tied to the exact
     * amount. Editing the amount must
     * invalidate the old approval.
     */
    setDiscountApproval(
      null,
    );
  }

  /*
  |--------------------------------------------------------------------------
  | CHECKOUT
  |--------------------------------------------------------------------------
  */

  async function checkout() {
    if (
      cart.length ===
      0
    ) {
      toast.warning(
        "Empty order",
        "Add at least one product.",
      );

      return;
    }

    if (
      requestedDiscount >
      grossTotal
    ) {
      toast.warning(
        "Invalid discount",
        "Discount cannot exceed the sale total.",
      );

      return;
    }

    if (
      requestedDiscount >
        0 &&
      discountApproval
        ?.status !==
        "APPROVED"
    ) {
      toast.warning(
        "Approval required",
        "The manual discount must be approved before payment.",
      );

      return;
    }

    if (
      paymentMethod ===
        "CASH" &&
      tenderedAmount <
        netTotal
    ) {
      toast.warning(
        "Insufficient cash",
        "Cash received is less than the total.",
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

    try {
      const response =
        await completePosSale(
          {
            officialCustomerId:
              selectedCustomer?.id ??
              null,

            receiptEmail:
              receiptEmail.trim() ||
              null,

            discountTotal:
              discountTotal,

            approvalId:
              discountTotal >
                0
                ? discountApproval?.id ??
                  null
                : null,

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
                    item.product.id,

                  qty:
                    item.qty,
                }),
              ),
          },
        );

      setCompletedSale(
        response.sale,
      );

      toast.success(
        "Payment completed",
        response.sale
          .orderNo,
      );

      onSaleCompleted?.(
        response.sale,
      );

      onRefreshProducts();

      void loadDrawer();
    } catch (error) {
      toast.error(
        "Sale failed",
        error instanceof Error
          ? error.message
          : "Unable to complete sale.",
      );
    } finally {
      setProcessing(
        false,
      );
    }
  }

  /*
  |--------------------------------------------------------------------------
  | COMPLETED SALE
  |--------------------------------------------------------------------------
  */

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
    <div className="h-screen overflow-hidden bg-[#f4f4f1] text-bauraInk">
      {/* HEADER */}

      <header className="flex h-[64px] items-center border-b border-black/[0.07] bg-white px-5">
        <div className="flex min-w-[220px] items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-bauraPrimary text-[15px] font-black text-white shadow-sm">
            B
          </div>

          <div>
            <div className="flex items-center gap-2">
              <span className="text-[14px] font-extrabold tracking-[-0.03em]">
                Baura Bakers
              </span>

              <span className="rounded-md bg-bauraGoldSoft px-2 py-0.5 text-[7px] font-black uppercase tracking-[0.13em] text-bauraGoldDark">
                POS
              </span>
            </div>

            <div className="mt-0.5 flex items-center gap-2 text-[8px] font-medium text-bauraMuted">
              <span>
                {session.sessionNo}
              </span>

              <span>
                •
              </span>

              <span className="font-bold text-emerald-600">
                Register Open
              </span>
            </div>
          </div>
        </div>

        <div className="mx-auto hidden items-center gap-5 xl:flex">
          <HeaderStat
            label="Business date"
            value={String(
              session.businessDate,
            ).slice(
              0,
              10,
            )}
          />

          <HeaderStat
            label="Opening float"
            value={`Rs. ${money(
              numberValue(
                session.openingFloat,
              ),
            )}`}
          />

          <HeaderStat
            label="Drawer"
            value={
              drawer
                ? `Rs. ${money(
                    drawer.expectedCash,
                  )}`
                : "—"
            }
          />
        </div>

        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() =>
              setCashMovementModal(
                true,
              )
            }
            className="hidden h-9 items-center gap-2 rounded-xl border border-black/[0.08] bg-white px-3 text-[9px] font-bold transition hover:bg-[#f8f8f6] lg:flex">
            <CircleDollarSign
              size={14}
            />

            Cash Drawer
          </button>

          <button
            type="button"
            onClick={
              onRefreshProducts
            }
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-black/[0.08] bg-white transition hover:bg-[#f8f8f6]"
            title="Refresh catalogue">
            <RefreshCw
              size={14}
            />
          </button>

          <button
            type="button"
            onClick={
              onDayEnd
            }
            className="h-9 rounded-xl bg-bauraGoldSoft px-4 text-[9px] font-extrabold text-bauraGoldDark transition hover:brightness-95">
            Day End
          </button>

          <button
            type="button"
            onClick={
              onLogout
            }
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-black/[0.08] bg-white transition hover:bg-red-50 hover:text-red-600"
            title="Sign out">
            <LogOut
              size={14}
            />
          </button>
        </div>
      </header>

      {/* WORKSPACE */}

      <main className="grid h-[calc(100vh-64px)] grid-cols-[minmax(0,1fr)_410px] 2xl:grid-cols-[minmax(0,1fr)_440px]">
        {/* PRODUCTS */}

        <section className="flex min-w-0 flex-col overflow-hidden">
          <div className="border-b border-black/[0.06] bg-[#f8f8f6] px-5 py-4">
            <div className="flex items-center gap-3">
              <div className="relative min-w-0 flex-1">
                <Search
                  size={17}
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-bauraMuted"
                />

                <input
                  ref={
                    searchRef
                  }
                  value={
                    search
                  }
                  onChange={(
                    event,
                  ) =>
                    setSearch(
                      event.target
                        .value,
                    )
                  }
                  placeholder="Search products..."
                  className="h-12 w-full rounded-2xl border border-black/[0.08] bg-white pl-11 pr-20 text-[11px] font-medium shadow-sm outline-none transition focus:border-bauraPrimary/40 focus:ring-4 focus:ring-bauraPrimary/[0.05]"
                />

                <span className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg border border-black/[0.08] bg-[#f7f7f5] px-2 py-1 text-[7px] font-bold text-bauraMuted">
                  ⌘ K
                </span>
              </div>
            </div>

            <div className="mt-4 flex items-end justify-between">
              <div>
                <h1 className="text-[19px] font-extrabold tracking-[-0.04em]">
                  Products
                </h1>

                <p className="mt-1 text-[9px] text-bauraMuted">
                  {
                    filteredProducts.length
                  }{" "}
                  products • tap an item to add
                </p>
              </div>

              {search && (
                <button
                  type="button"
                  onClick={() =>
                    setSearch(
                      "",
                    )
                  }
                  className="text-[8px] font-bold text-bauraPrimary">
                  Clear search
                </button>
              )}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-5">
            {loadingProducts ? (
              <div className="flex h-full items-center justify-center">
                <div className="text-center">
                  <Loader2
                    size={24}
                    className="mx-auto animate-spin text-bauraPrimary"
                  />

                  <p className="mt-3 text-[9px] font-bold text-bauraMuted">
                    Loading catalogue...
                  </p>
                </div>
              </div>
            ) : filteredProducts.length ===
              0 ? (
              <div className="flex h-full items-center justify-center">
                <div className="text-center">
                  <PackageOpen
                    size={30}
                    className="mx-auto text-black/20"
                  />

                  <p className="mt-3 text-[11px] font-bold">
                    No products found
                  </p>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
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
                            item
                              .product
                              .id ===
                            product.id,
                        )?.qty || 0
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

        {/* ORDER */}

        <aside className="flex min-h-0 flex-col border-l border-black/[0.07] bg-white shadow-[-12px_0_40px_rgba(0,0,0,0.025)]">
          <div className="flex h-[68px] items-center border-b border-black/[0.07] px-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-bauraPrimary/[0.07] text-bauraPrimary">
              <ShoppingBag
                size={16}
              />
            </div>

            <div className="ml-3">
              <h2 className="text-[13px] font-extrabold">
                Current Order
              </h2>

              <p className="text-[8px] text-bauraMuted">
                {
                  cartQty
                }{" "}
                item
                {cartQty ===
                1
                  ? ""
                  : "s"}
              </p>
            </div>

            {cart.length >
              0 && (
              <button
                type="button"
                onClick={() =>
                  setCart(
                    [],
                  )
                }
                className="ml-auto rounded-lg px-2 py-1 text-[8px] font-bold text-red-500 transition hover:bg-red-50">
                Clear
              </button>
            )}
          </div>

          {/* CUSTOMER */}

          <div className="border-b border-black/[0.07] p-3">
            <button
              type="button"
              onClick={() =>
                setCustomerModal(
                  true,
                )
              }
              className="flex w-full items-center rounded-xl border border-black/[0.07] bg-[#fafaf8] p-3 text-left transition hover:border-bauraPrimary/20 hover:bg-white">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white text-bauraMuted shadow-sm">
                <UserRound
                  size={14}
                />
              </div>

              <div className="ml-3 min-w-0 flex-1">
                <p className="text-[7px] font-bold uppercase tracking-[0.1em] text-bauraMuted">
                  Customer
                </p>

                <p className="mt-0.5 truncate text-[9px] font-bold">
                  {selectedCustomer
                    ? selectedCustomer.name
                    : "Walk-in customer"}
                </p>

                {selectedCustomer && (
                  <p className="mt-0.5 truncate text-[7px] text-bauraMuted">
                    {selectedCustomer.phone_normalized ||
                      selectedCustomer.phone}
                  </p>
                )}
              </div>

              <ChevronRight
                size={14}
                className="text-bauraMuted"
              />
            </button>
          </div>

          {/* CART */}

          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            {cart.length ===
            0 ? (
              <div className="flex h-full min-h-52 flex-col items-center justify-center px-8 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#f4f4f1] text-black/20">
                  <ShoppingBag
                    size={24}
                  />
                </div>

                <p className="mt-4 text-[11px] font-extrabold">
                  Start an order
                </p>

                <p className="mt-1 max-w-[210px] text-[8px] leading-4 text-bauraMuted">
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
                        item.product.id
                      }
                      item={
                        item
                      }
                      onMinus={() =>
                        updateQty(
                          item.product.id,
                          -1,
                        )
                      }
                      onPlus={() =>
                        updateQty(
                          item.product.id,
                          1,
                        )
                      }
                      onRemove={() =>
                        removeItem(
                          item.product.id,
                        )
                      }
                    />
                  ),
                )}
              </div>
            )}
          </div>

          {/* TOTALS + PAYMENT */}

          <div className="border-t border-black/[0.07] bg-white p-4">
            <div className="space-y-2">
              <SummaryRow
                label="Subtotal"
                value={grossTotal}
              />

              <div className="flex items-center gap-2">
                <div className="flex-1 text-[9px] text-bauraMuted">
                  Discount
                </div>

                <div className="relative w-[130px]">
                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[8px] font-bold text-bauraMuted">
                    Rs.
                  </span>

                  <input
                    inputMode="decimal"
                    value={
                      discountInput
                    }
                    onChange={(
                      event,
                    ) =>
                      changeDiscount(
                        event.target
                          .value,
                      )
                    }
                    placeholder="0.00"
                    className="h-8 w-full rounded-lg border border-black/[0.08] pl-8 pr-2 text-right text-[9px] font-bold outline-none focus:border-bauraPrimary/40"
                  />
                </div>
              </div>

              {requestedDiscount >
                0 && (
                <DiscountApprovalStatus
                  approval={
                    discountApproval
                  }
                  loading={
                    approvalLoading
                  }
                  onRequest={() =>
                    void requestDiscountApproval()
                  }
                  onRefresh={() =>
                    void refreshApproval()
                  }
                />
              )}
            </div>

            <div className="my-3 border-t border-dashed border-black/10" />

            <div className="flex items-end justify-between">
              <div>
                <p className="text-[8px] font-bold uppercase tracking-[0.08em] text-bauraMuted">
                  Total
                </p>

                <p className="mt-1 text-[8px] text-bauraMuted">
                  {
                    cartQty
                  }{" "}
                  item
                  {cartQty ===
                  1
                    ? ""
                    : "s"}
                </p>
              </div>

              <div className="text-right">
                <span className="text-[10px] font-bold text-bauraMuted">
                  Rs.
                </span>{" "}

                <span className="text-[24px] font-black tracking-[-0.055em]">
                  {money(
                    netTotal,
                  )}
                </span>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-2">
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
                  setPaymentMethod(
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
                  setPaymentMethod(
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
                  setPaymentMethod(
                    "BANK_TRANSFER",
                  )
                }
              />
            </div>

            {paymentMethod ===
            "CASH" ? (
              <div className="mt-3">
                <div className="grid grid-cols-[1fr_auto] gap-2">
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[8px] font-bold text-bauraMuted">
                      Rs.
                    </span>

                    <input
                      inputMode="decimal"
                      value={
                        tendered
                      }
                      onChange={(
                        event,
                      ) =>
                        setTendered(
                          event.target
                            .value,
                        )
                      }
                      placeholder="Cash received"
                      className="h-11 w-full rounded-xl border border-black/[0.08] pl-9 pr-3 text-[10px] font-bold outline-none focus:border-bauraPrimary/40"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      setTendered(
                        netTotal.toFixed(
                          2,
                        ),
                      )
                    }
                    className="rounded-xl border border-black/[0.08] px-3 text-[8px] font-bold">
                    Exact
                  </button>
                </div>

                <div className="mt-2 flex items-center justify-between rounded-lg bg-[#f6f6f3] px-3 py-2">
                  <span className="text-[8px] font-medium text-bauraMuted">
                    Change
                  </span>

                  <span className="text-[10px] font-extrabold">
                    Rs.{" "}
                    {money(
                      change,
                    )}
                  </span>
                </div>
              </div>
            ) : (
              <input
                value={
                  paymentReference
                }
                onChange={(
                  event,
                ) =>
                  setPaymentReference(
                    event.target
                      .value,
                  )
                }
                placeholder={
                  paymentMethod ===
                  "CARD"
                    ? "Card payment reference"
                    : "Bank transfer reference"
                }
                className="mt-3 h-11 w-full rounded-xl border border-black/[0.08] px-3 text-[9px] font-medium outline-none focus:border-bauraPrimary/40"
              />
            )}

            <div className="relative mt-2">
              <Mail
                size={13}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-bauraMuted"
              />

              <input
                type="email"
                value={
                  receiptEmail
                }
                onChange={(
                  event,
                ) =>
                  setReceiptEmail(
                    event.target
                      .value,
                  )
                }
                placeholder="Receipt email (optional)"
                className="h-10 w-full rounded-xl border border-black/[0.08] pl-9 pr-3 text-[8px] outline-none focus:border-bauraPrimary/40"
              />
            </div>

            <button
              type="button"
              disabled={
                processing ||
                cart.length ===
                  0
              }
              onClick={() =>
                void checkout()
              }
              className="mt-3 flex h-[52px] w-full items-center justify-center gap-2 rounded-2xl bg-bauraPrimary px-4 text-[11px] font-extrabold text-white shadow-[0_10px_25px_rgba(91,55,38,0.18)] transition hover:bg-bauraPrimaryDark disabled:cursor-not-allowed disabled:opacity-40">
              {processing ? (
                <>
                  <Loader2
                    size={15}
                    className="animate-spin"
                  />

                  Processing payment...
                </>
              ) : (
                <>
                  <CreditCard
                    size={15}
                  />

                  Pay Rs.{" "}
                  {money(
                    netTotal,
                  )}
                </>
              )}
            </button>
          </div>
        </aside>
      </main>

      {customerModal && (
        <CustomerModal
          selectedCustomer={
            selectedCustomer
          }
          onClose={() =>
            setCustomerModal(
              false,
            )
          }
          onSelect={
            selectCustomer
          }
          onWalkIn={() => {
            setSelectedCustomer(
              null,
            );

            setReceiptEmail(
              "",
            );

            setCustomerModal(
              false,
            );
          }}
        />
      )}

      {cashMovementModal && (
        <CashMovementModal
          session={
            session
          }
          drawer={
            drawer
          }
          onClose={() =>
            setCashMovementModal(
              false,
            )
          }
          onSaved={() => {
            void loadDrawer();
          }}
        />
      )}
    </div>
  );
}

/*
|--------------------------------------------------------------------------
| HEADER STAT
|--------------------------------------------------------------------------
*/

function HeaderStat({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div>
      <p className="text-[7px] font-bold uppercase tracking-[0.08em] text-bauraMuted">
        {label}
      </p>

      <p className="mt-0.5 text-[9px] font-extrabold">
        {value}
      </p>
    </div>
  );
}

/*
|--------------------------------------------------------------------------
| PRODUCT CARD
|--------------------------------------------------------------------------
*/

function ProductCard({
  product,
  cartQty,
  onAdd,
}: {
  product: PosProduct;
  cartQty: number;
  onAdd: () => void;
}) {
  return (
    <button
      type="button"
      disabled={
        !product.inStock
      }
      onClick={
        onAdd
      }
      className="group relative overflow-hidden rounded-[18px] border border-black/[0.07] bg-white text-left shadow-[0_2px_10px_rgba(0,0,0,0.025)] transition duration-150 hover:-translate-y-0.5 hover:border-bauraPrimary/20 hover:shadow-[0_12px_28px_rgba(0,0,0,0.08)] disabled:cursor-not-allowed disabled:opacity-45">
      <div className="relative aspect-[4/3] overflow-hidden bg-[#efefeb]">
        {product.imageUrl ? (
          <img
            src={
              product.imageUrl
            }
            alt={
              product.displayName
            }
            loading="lazy"
            className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-black/20">
            <PackageOpen
              size={27}
            />
          </div>
        )}

        {product.isLowStock &&
          product.inStock && (
            <span className="absolute left-2 top-2 rounded-lg bg-amber-500 px-2 py-1 text-[7px] font-black text-white shadow-sm">
              LOW STOCK
            </span>
          )}

        {!product.inStock && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/70 backdrop-blur-[1px]">
            <span className="rounded-lg bg-black px-2.5 py-1.5 text-[7px] font-black uppercase tracking-[0.08em] text-white">
              Sold out
            </span>
          </div>
        )}

        {cartQty >
          0 && (
          <span className="absolute right-2 top-2 flex h-6 min-w-6 items-center justify-center rounded-full bg-bauraPrimary px-1.5 text-[8px] font-black text-white shadow-md">
            {cartQty}
          </span>
        )}
      </div>

      <div className="p-3">
        <p className="line-clamp-2 min-h-[32px] text-[10px] font-extrabold leading-4">
          {
            product.displayName
          }
        </p>

        <div className="mt-3 flex items-end justify-between gap-2">
          <div>
            <p className="text-[7px] font-medium text-bauraMuted">
              Price
            </p>

            <p className="mt-0.5 text-[12px] font-black text-bauraPrimary">
              Rs.{" "}
              {money(
                product.sellPrice,
              )}
            </p>
          </div>

          <div className="text-right">
            <p className="text-[7px] text-bauraMuted">
              Stock
            </p>

            <p
              className={`mt-0.5 text-[8px] font-bold ${
                product.isLowStock
                  ? "text-amber-600"
                  : "text-bauraInk"
              }`}>
              {
                product.availableQty
              }
            </p>
          </div>
        </div>
      </div>
    </button>
  );
}

/*
|--------------------------------------------------------------------------
| CART ROW
|--------------------------------------------------------------------------
*/

function CartRow({
  item,
  onMinus,
  onPlus,
  onRemove,
}: {
  item: CartItem;
  onMinus: () => void;
  onPlus: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="rounded-xl border border-black/[0.07] bg-white p-2.5 transition hover:border-black/[0.11]">
      <div className="flex gap-2.5">
        <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-[#f1f1ed]">
          {item.product
            .imageUrl ? (
            <img
              src={
                item.product
                  .imageUrl
              }
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-black/20">
              <PackageOpen
                size={16}
              />
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex gap-2">
            <p className="line-clamp-2 flex-1 text-[9px] font-extrabold leading-4">
              {
                item.product
                  .displayName
              }
            </p>

            <button
              type="button"
              onClick={
                onRemove
              }
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-bauraMuted transition hover:bg-red-50 hover:text-red-500">
              <Trash2
                size={11}
              />
            </button>
          </div>

          <p className="mt-0.5 text-[8px] text-bauraMuted">
            Rs.{" "}
            {money(
              item.product
                .sellPrice,
            )}{" "}
            each
          </p>
        </div>
      </div>

      <div className="mt-2.5 flex items-center justify-between">
        <div className="flex items-center rounded-lg border border-black/[0.07] bg-[#f7f7f4] p-0.5">
          <button
            type="button"
            onClick={
              onMinus
            }
            className="flex h-7 w-7 items-center justify-center rounded-md transition hover:bg-white">
            <Minus
              size={11}
            />
          </button>

          <span className="w-8 text-center text-[9px] font-black">
            {item.qty}
          </span>

          <button
            type="button"
            onClick={
              onPlus
            }
            className="flex h-7 w-7 items-center justify-center rounded-md transition hover:bg-white">
            <Plus
              size={11}
            />
          </button>
        </div>

        <p className="text-[10px] font-black">
          Rs.{" "}
          {money(
            item.qty *
              item.product
                .sellPrice,
          )}
        </p>
      </div>
    </div>
  );
}

function SummaryRow({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div className="flex items-center justify-between text-[9px]">
      <span className="text-bauraMuted">
        {label}
      </span>

      <span className="font-bold">
        Rs.{" "}
        {money(
          value,
        )}
      </span>
    </div>
  );
}

/*
|--------------------------------------------------------------------------
| PAYMENT BUTTON
|--------------------------------------------------------------------------
*/

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
      className={`flex h-11 items-center justify-center gap-2 rounded-xl border text-[8px] font-extrabold transition ${
        active
          ? "border-bauraPrimary bg-bauraPrimary/[0.06] text-bauraPrimary shadow-sm"
          : "border-black/[0.08] bg-white text-bauraMuted hover:bg-[#fafaf8]"
      }`}>
      {icon}

      {label}
    </button>
  );
}

/*
|--------------------------------------------------------------------------
| DISCOUNT APPROVAL
|--------------------------------------------------------------------------
*/

function DiscountApprovalStatus({
  approval,
  loading,
  onRequest,
  onRefresh,
}: {
  approval: PosApproval | null;
  loading: boolean;
  onRequest: () => void;
  onRefresh: () => void;
}) {
  if (!approval) {
    return (
      <button
        type="button"
        disabled={
          loading
        }
        onClick={
          onRequest
        }
        className="flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-amber-200 bg-amber-50 text-[8px] font-extrabold text-amber-700">
        <ShieldCheck
          size={12}
        />

        Request manager approval
      </button>
    );
  }

  const approved =
    approval.status ===
    "APPROVED";

  const pending =
    approval.status ===
    "PENDING";

  return (
    <div
      className={`flex items-center rounded-lg border px-3 py-2 ${
        approved
          ? "border-emerald-200 bg-emerald-50"
          : pending
            ? "border-amber-200 bg-amber-50"
            : "border-red-200 bg-red-50"
      }`}>
      {approved ? (
        <Check
          size={13}
          className="text-emerald-600"
        />
      ) : (
        <ShieldCheck
          size={13}
          className={
            pending
              ? "text-amber-600"
              : "text-red-500"
          }
        />
      )}

      <div className="ml-2">
        <p
          className={`text-[8px] font-extrabold ${
            approved
              ? "text-emerald-700"
              : pending
                ? "text-amber-700"
                : "text-red-600"
          }`}>
          {approved
            ? "Discount approved"
            : pending
              ? "Waiting for manager"
              : `Approval ${approval.status.toLowerCase()}`}
        </p>
      </div>

      {pending && (
        <button
          type="button"
          disabled={
            loading
          }
          onClick={
            onRefresh
          }
          className="ml-auto flex h-7 items-center gap-1 rounded-md bg-white px-2 text-[7px] font-bold shadow-sm">
          <RefreshCw
            size={9}
            className={
              loading
                ? "animate-spin"
                : ""
            }
          />

          Check
        </button>
      )}
    </div>
  );
}

/*
|--------------------------------------------------------------------------
| CUSTOMER MODAL
|--------------------------------------------------------------------------
*/

function CustomerModal({
  selectedCustomer,
  onClose,
  onSelect,
  onWalkIn,
}: {
  selectedCustomer: PosCustomer | null;
  onClose: () => void;
  onSelect: (
    customer: PosCustomer,
  ) => void;
  onWalkIn: () => void;
}) {
  const toast =
    useToast();

  const [
    mode,
    setMode,
  ] =
    useState<CustomerModalMode>(
      "SEARCH",
    );

  const [
    phone,
    setPhone,
  ] = useState("");

  const [
    foundCustomer,
    setFoundCustomer,
  ] =
    useState<PosCustomer | null>(
      selectedCustomer,
    );

  const [
    searching,
    setSearching,
  ] = useState(false);

  const [
    saving,
    setSaving,
  ] = useState(false);

  const [
    name,
    setName,
  ] = useState("");

  const [
    email,
    setEmail,
  ] = useState("");

  const [
    address,
    setAddress,
  ] = useState("");

  async function searchCustomer() {
    if (
      !phone.trim()
    ) {
      toast.warning(
        "Phone required",
        "Enter the customer's phone number.",
      );

      return;
    }

    setSearching(
      true,
    );

    try {
      const response =
        await lookupPosCustomer(
          phone,
        );

      setFoundCustomer(
        response.customer,
      );

      if (
        !response.found
      ) {
        toast.info(
          "Customer not found",
          "You can register this customer now.",
        );
      }
    } catch (error) {
      toast.error(
        "Lookup failed",
        error instanceof Error
          ? error.message
          : "Unable to find customer.",
      );
    } finally {
      setSearching(
        false,
      );
    }
  }

  async function registerCustomer() {
    if (
      !name.trim() ||
      !phone.trim()
    ) {
      toast.warning(
        "Details required",
        "Customer name and phone are required.",
      );

      return;
    }

    setSaving(
      true,
    );

    try {
      const response =
        await registerPosCustomer(
          {
            name:
              name.trim(),

            phone:
              phone.trim(),

            email:
              email.trim() ||
              null,

            defaultDeliveryAddress:
              address.trim() ||
              null,
          },
        );

      onSelect(
        response.customer,
      );
    } catch (error) {
      toast.error(
        "Registration failed",
        error instanceof Error
          ? error.message
          : "Unable to register customer.",
      );
    } finally {
      setSaving(
        false,
      );
    }
  }

  return (
    <ModalShell
      title="Customer"
      description="Find an existing official-site customer or create a new customer."
      onClose={
        onClose
      }>
      <div className="grid grid-cols-2 gap-2 rounded-xl bg-[#f4f4f1] p-1">
        <button
          type="button"
          onClick={() =>
            setMode(
              "SEARCH",
            )
          }
          className={`h-9 rounded-lg text-[8px] font-extrabold transition ${
            mode ===
            "SEARCH"
              ? "bg-white shadow-sm"
              : "text-bauraMuted"
          }`}>
          Find Customer
        </button>

        <button
          type="button"
          onClick={() =>
            setMode(
              "REGISTER",
            )
          }
          className={`h-9 rounded-lg text-[8px] font-extrabold transition ${
            mode ===
            "REGISTER"
              ? "bg-white shadow-sm"
              : "text-bauraMuted"
          }`}>
          Register New
        </button>
      </div>

      {mode ===
      "SEARCH" ? (
        <>
          <label className="mt-5 block text-[8px] font-bold text-bauraMuted">
            PHONE NUMBER
          </label>

          <div className="mt-1.5 flex gap-2">
            <input
              autoFocus
              value={
                phone
              }
              onChange={(
                event,
              ) =>
                setPhone(
                  event.target
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
                  void searchCustomer();
                }
              }}
              placeholder="077 123 4567"
              className="h-11 flex-1 rounded-xl border border-black/[0.08] px-3 text-[10px] outline-none focus:border-bauraPrimary/40"
            />

            <button
              type="button"
              disabled={
                searching
              }
              onClick={() =>
                void searchCustomer()
              }
              className="flex h-11 items-center justify-center rounded-xl bg-bauraPrimary px-4 text-[8px] font-bold text-white">
              {searching
                ? "Searching..."
                : "Search"}
            </button>
          </div>

          {foundCustomer && (
            <div className="mt-4 rounded-2xl border border-black/[0.08] p-4">
              <div className="flex items-center">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-bauraPrimary/[0.07] text-bauraPrimary">
                  <UserRound
                    size={16}
                  />
                </div>

                <div className="ml-3 min-w-0">
                  <p className="text-[10px] font-extrabold">
                    {
                      foundCustomer.name
                    }
                  </p>

                  <p className="mt-0.5 text-[8px] text-bauraMuted">
                    {foundCustomer.phone_normalized ||
                      foundCustomer.phone}
                  </p>

                  {foundCustomer.email && (
                    <p className="mt-0.5 text-[8px] text-bauraMuted">
                      {
                        foundCustomer.email
                      }
                    </p>
                  )}
                </div>
              </div>

              <button
                type="button"
                onClick={() =>
                  onSelect(
                    foundCustomer,
                  )
                }
                className="mt-4 h-10 w-full rounded-xl bg-bauraPrimary text-[9px] font-bold text-white">
                Use this customer
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={
              onWalkIn
            }
            className="mt-4 h-10 w-full rounded-xl border border-black/[0.08] text-[8px] font-bold">
            Continue as walk-in customer
          </button>
        </>
      ) : (
        <div className="mt-5 space-y-3">
          <Field
            label="Customer name"
            value={
              name
            }
            onChange={
              setName
            }
            placeholder="Full name"
          />

          <Field
            label="Phone"
            value={
              phone
            }
            onChange={
              setPhone
            }
            placeholder="077 123 4567"
          />

          <Field
            label="Email"
            value={
              email
            }
            onChange={
              setEmail
            }
            placeholder="Optional"
          />

          <div>
            <label className="text-[8px] font-bold text-bauraMuted">
              DELIVERY ADDRESS
            </label>

            <textarea
              value={
                address
              }
              onChange={(
                event,
              ) =>
                setAddress(
                  event.target
                    .value,
                )
              }
              rows={3}
              placeholder="Optional"
              className="mt-1.5 w-full resize-none rounded-xl border border-black/[0.08] p-3 text-[9px] outline-none focus:border-bauraPrimary/40"
            />
          </div>

          <button
            type="button"
            disabled={
              saving
            }
            onClick={() =>
              void registerCustomer()
            }
            className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-bauraPrimary text-[9px] font-bold text-white">
            <UserPlus
              size={13}
            />

            {saving
              ? "Registering..."
              : "Register Customer"}
          </button>
        </div>
      )}
    </ModalShell>
  );
}

/*
|--------------------------------------------------------------------------
| CASH MOVEMENT
|--------------------------------------------------------------------------
*/

function CashMovementModal({
  session,
  drawer,
  onClose,
  onSaved,
}: {
  session: PosSession;
  drawer: PosDrawerSummary | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast =
    useToast();

  const [
    mode,
    setMode,
  ] =
    useState<CashMovementMode>(
      "CASH_IN",
    );

  const [
    amount,
    setAmount,
  ] = useState("");

  const [
    reason,
    setReason,
  ] = useState("");

  const [
    reference,
    setReference,
  ] = useState("");

  const [
    saving,
    setSaving,
  ] = useState(false);

  async function save() {
    const numericAmount =
      numberValue(
        amount,
      );

    if (
      numericAmount <=
        0
    ) {
      toast.warning(
        "Invalid amount",
        "Enter an amount greater than zero.",
      );

      return;
    }

    if (
      !reason.trim()
    ) {
      toast.warning(
        "Reason required",
        "Enter a reason for this drawer movement.",
      );

      return;
    }

    setSaving(
      true,
    );

    try {
      await createPosCashMovement(
        {
          posSessionId:
            session.id,

          type:
            mode,

          amount:
            numericAmount,

          reason:
            reason.trim(),

          reference:
            reference.trim() ||
            null,
        },
      );

      toast.success(
        mode ===
          "CASH_IN"
          ? "Cash added"
          : "Cash removed",
        `Rs. ${money(
          numericAmount,
        )}`,
      );

      onSaved();

      onClose();
    } catch (error) {
      toast.error(
        "Cash movement failed",
        error instanceof Error
          ? error.message
          : "Unable to update the cash drawer.",
      );
    } finally {
      setSaving(
        false,
      );
    }
  }

  return (
    <ModalShell
      title="Cash Drawer"
      description="Record non-sale cash entering or leaving the register."
      onClose={
        onClose
      }>
      {drawer && (
        <div className="mb-5 rounded-2xl bg-[#f5f5f2] p-4">
          <p className="text-[8px] font-bold uppercase tracking-[0.08em] text-bauraMuted">
            Expected drawer cash
          </p>

          <p className="mt-1 text-[22px] font-black tracking-[-0.04em]">
            Rs.{" "}
            {money(
              drawer.expectedCash,
            )}
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() =>
            setMode(
              "CASH_IN",
            )
          }
          className={`flex h-11 items-center justify-center gap-2 rounded-xl border text-[8px] font-bold ${
            mode ===
            "CASH_IN"
              ? "border-emerald-300 bg-emerald-50 text-emerald-700"
              : "border-black/[0.08]"
          }`}>
          <ArrowDownToLine
            size={13}
          />

          Cash In
        </button>

        <button
          type="button"
          onClick={() =>
            setMode(
              "CASH_OUT",
            )
          }
          className={`flex h-11 items-center justify-center gap-2 rounded-xl border text-[8px] font-bold ${
            mode ===
            "CASH_OUT"
              ? "border-amber-300 bg-amber-50 text-amber-700"
              : "border-black/[0.08]"
          }`}>
          <ArrowUpFromLine
            size={13}
          />

          Cash Out
        </button>
      </div>

      <div className="mt-4 space-y-3">
        <Field
          label="Amount"
          value={
            amount
          }
          onChange={
            setAmount
          }
          placeholder="0.00"
        />

        <Field
          label="Reason"
          value={
            reason
          }
          onChange={
            setReason
          }
          placeholder={
            mode ===
            "CASH_IN"
              ? "Why is cash being added?"
              : "Why is cash being removed?"
          }
        />

        <Field
          label="Reference"
          value={
            reference
          }
          onChange={
            setReference
          }
          placeholder="Optional"
        />
      </div>

      <button
        type="button"
        disabled={
          saving
        }
        onClick={() =>
          void save()
        }
        className="mt-5 h-11 w-full rounded-xl bg-bauraPrimary text-[9px] font-bold text-white">
        {saving
          ? "Saving..."
          : mode ===
              "CASH_IN"
            ? "Record Cash In"
            : "Record Cash Out"}
      </button>
    </ModalShell>
  );
}

/*
|--------------------------------------------------------------------------
| MODAL HELPERS
|--------------------------------------------------------------------------
*/

function ModalShell({
  title,
  description,
  onClose,
  children,
}: {
  title: string;
  description: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/35 p-5 backdrop-blur-[2px]">
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-[22px] border border-white/30 bg-white shadow-[0_30px_100px_rgba(0,0,0,0.22)]">
        <div className="sticky top-0 z-10 flex items-start border-b border-black/[0.07] bg-white p-5">
          <div>
            <h2 className="text-[16px] font-extrabold tracking-[-0.03em]">
              {title}
            </h2>

            <p className="mt-1 text-[8px] leading-4 text-bauraMuted">
              {
                description
              }
            </p>
          </div>

          <button
            type="button"
            onClick={
              onClose
            }
            className="ml-auto flex h-8 w-8 items-center justify-center rounded-lg bg-[#f5f5f2]">
            <X
              size={13}
            />
          </button>
        </div>

        <div className="p-5">
          {children}
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (
    value: string,
  ) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="text-[8px] font-bold uppercase tracking-[0.05em] text-bauraMuted">
        {label}
      </label>

      <input
        value={
          value
        }
        onChange={(
          event,
        ) =>
          onChange(
            event.target
              .value,
          )
        }
        placeholder={
          placeholder
        }
        className="mt-1.5 h-11 w-full rounded-xl border border-black/[0.08] px-3 text-[9px] outline-none focus:border-bauraPrimary/40"
      />
    </div>
  );
}

/*
|--------------------------------------------------------------------------
| SALE COMPLETED / RECEIPT
|--------------------------------------------------------------------------
*/

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
    <div className="min-h-screen bg-[#f2f2ef] px-5 py-8 text-bauraInk print:bg-white print:p-0">
      <div className="mx-auto max-w-[420px]">
        <div className="mb-4 flex items-center justify-between print:hidden">
          <div>
            <p className="text-[8px] font-bold uppercase tracking-[0.1em] text-emerald-600">
              Payment successful
            </p>

            <h1 className="mt-1 text-[20px] font-extrabold tracking-[-0.04em]">
              Receipt ready
            </h1>
          </div>

          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
            <Check
              size={20}
            />
          </div>
        </div>

        <div
          id="pos-receipt"
          className="rounded-[20px] bg-white p-6 shadow-[0_18px_60px_rgba(0,0,0,0.08)] print:rounded-none print:p-0 print:shadow-none">
          <div className="text-center">
            <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-bauraPrimary text-[16px] font-black text-white print:hidden">
              B
            </div>

            <h2 className="mt-3 text-[15px] font-black">
              BAURA BAKERS
            </h2>

            <p className="mt-1 text-[8px] text-bauraMuted">
              Sales Receipt
            </p>
          </div>

          <div className="my-5 border-t border-dashed border-black/20" />

          <ReceiptInfo
            label="Invoice"
            value={
              sale.orderNo
            }
          />

          <ReceiptInfo
            label="Date"
            value={
              sale.soldAt
                ? new Date(
                    sale.soldAt,
                  ).toLocaleString(
                    "en-LK",
                  )
                : "—"
            }
          />

          {sale.posSession
            ?.sessionNo && (
            <ReceiptInfo
              label="Register"
              value={
                sale.posSession
                  .sessionNo
              }
            />
          )}

          {(sale.customer
            ?.name ||
            sale.customerNameSnapshot) && (
            <ReceiptInfo
              label="Customer"
              value={
                sale.customer
                  ?.name ||
                sale.customerNameSnapshot ||
                ""
              }
            />
          )}

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
                  className="flex justify-between gap-4 text-[9px]">
                  <div className="min-w-0 flex-1">
                    <p className="font-extrabold">
                      {item.productDisplayName ||
                        item.product
                          ?.name ||
                        "Product"}
                    </p>

                    <p className="mt-0.5 text-[8px] text-bauraMuted">
                      {numberValue(
                        item.qty,
                      )}{" "}
                      × Rs.{" "}
                      {money(
                        numberValue(
                          item.unitSellPrice,
                        ),
                      )}
                    </p>
                  </div>

                  <p className="font-extrabold">
                    Rs.{" "}
                    {money(
                      numberValue(
                        item.netTotal,
                      ),
                    )}
                  </p>
                </div>
              ),
            )}
          </div>

          <div className="my-5 border-t border-dashed border-black/20" />

          <ReceiptInfo
            label="Subtotal"
            value={`Rs. ${money(
              numberValue(
                sale.grossTotal,
              ),
            )}`}
          />

          {numberValue(
            sale.discountTotal,
          ) >
            0 && (
            <ReceiptInfo
              label="Discount"
              value={`- Rs. ${money(
                numberValue(
                  sale.discountTotal,
                ),
              )}`}
            />
          )}

          <div className="mt-3 flex items-end justify-between">
            <span className="text-[10px] font-black">
              TOTAL
            </span>

            <span className="text-[20px] font-black tracking-[-0.04em]">
              Rs.{" "}
              {money(
                numberValue(
                  sale.netTotal,
                ),
              )}
            </span>
          </div>

          <div className="my-5 border-t border-dashed border-black/20" />

          <ReceiptInfo
            label="Payment"
            value={
              sale.paymentMethod.replace(
                "_",
                " ",
              )
            }
          />

          {payment?.tenderedAmount !==
            null &&
            payment?.tenderedAmount !==
              undefined && (
              <ReceiptInfo
                label="Tendered"
                value={`Rs. ${money(
                  numberValue(
                    payment.tenderedAmount,
                  ),
                )}`}
              />
            )}

          {payment?.changeAmount !==
            null &&
            payment?.changeAmount !==
              undefined && (
              <ReceiptInfo
                label="Change"
                value={`Rs. ${money(
                  numberValue(
                    payment.changeAmount,
                  ),
                )}`}
              />
            )}

          {payment?.reference && (
            <ReceiptInfo
              label="Reference"
              value={
                payment.reference
              }
            />
          )}

          {sale.receiptEmail && (
            <div className="mt-4 rounded-xl bg-[#f6f6f3] p-3 text-center print:bg-transparent">
              <p className="text-[7px] font-bold uppercase tracking-[0.08em] text-bauraMuted">
                Email receipt
              </p>

              <p className="mt-1 text-[8px] font-bold">
                {
                  sale.receiptEmail
                }
              </p>

              {sale.receiptEmailStatus && (
                <p className="mt-0.5 text-[7px] text-bauraMuted">
                  Status:{" "}
                  {
                    sale.receiptEmailStatus
                  }
                </p>
              )}
            </div>
          )}

          <div className="mt-6 text-center">
            <p className="text-[9px] font-bold">
              Thank you!
            </p>

            <p className="mt-1 text-[7px] text-bauraMuted">
              Baura Bakers
            </p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 print:hidden">
          <button
            type="button"
            onClick={
              onPrint
            }
            className="flex h-12 items-center justify-center gap-2 rounded-xl border border-black/[0.08] bg-white text-[9px] font-extrabold">
            <Printer
              size={14}
            />

            Print Receipt
          </button>

          <button
            type="button"
            onClick={
              onNewSale
            }
            className="flex h-12 items-center justify-center gap-2 rounded-xl bg-bauraPrimary text-[9px] font-extrabold text-white">
            <ReceiptText
              size={14}
            />

            New Sale
          </button>
        </div>
      </div>

      <style>{`
        @media print {
          body * {
            visibility: hidden !important;
          }

          #pos-receipt,
          #pos-receipt * {
            visibility: visible !important;
          }

          #pos-receipt {
            position: absolute;
            left: 0;
            top: 0;
            width: 80mm;
            padding: 4mm;
            font-family: Arial, sans-serif;
          }

          @page {
            size: 80mm auto;
            margin: 0;
          }
        }
      `}</style>
    </div>
  );
}

function ReceiptInfo({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="mb-1.5 flex justify-between gap-4 text-[8px]">
      <span className="text-bauraMuted">
        {label}
      </span>

      <span className="text-right font-bold">
        {value}
      </span>
    </div>
  );
}
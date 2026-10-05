/** @format */

import {
  useMemo,
  useState,
} from "react";

import {
  Banknote,
  ChevronRight,
  CreditCard,
  LogOut,
  Minus,
  PackageOpen,
  Plus,
  RefreshCw,
  Search,
  ShoppingBag,
  Trash2,
  UserRound,
  WalletCards,
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
  ).format(value);
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
            .includes(
              query,
            ),
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
            item.product
              .sellPrice *
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
  }

  async function checkout() {
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
    <div className="min-h-screen bg-[#f5f5f3] text-bauraInk">
      <header className="flex h-[66px] items-center justify-between border-b border-black/[0.07] bg-white px-5">
        <div className="flex items-center gap-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-bauraPrimary font-bold text-white">
            B
          </div>

          <div>
            <div className="text-[13px] font-bold">
              Baura Bakers
            </div>

            <div className="text-[9px] text-bauraMuted">
              {session.sessionNo}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={
              onRefreshProducts
            }
            className="flex h-9 items-center gap-2 rounded-xl border border-black/[0.08] px-3 text-[9px] font-bold">
            <RefreshCw
              size={13}
            />

            Refresh
          </button>

          <button
            type="button"
            onClick={
              onDayEnd
            }
            className="h-9 rounded-xl bg-bauraGoldSoft px-4 text-[9px] font-bold text-bauraGoldDark">
            Day End
          </button>

          <button
            type="button"
            onClick={
              onLogout
            }
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-black/[0.08]">
            <LogOut
              size={14}
            />
          </button>
        </div>
      </header>

      <main className="grid min-h-[calc(100vh-66px)] grid-cols-[minmax(0,1fr)_390px]">
        <section className="p-5">
          <div className="relative">
            <Search
              size={16}
              className="absolute left-4 top-1/2 -translate-y-1/2 text-bauraMuted"
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
              className="h-12 w-full rounded-2xl border border-black/[0.08] bg-white pl-11 pr-4 text-[11px] outline-none focus:border-bauraPrimary"
            />
          </div>

          <div className="mt-5 flex items-center justify-between">
            <div>
              <h1 className="text-[18px] font-bold tracking-[-0.03em]">
                Products
              </h1>

              <p className="mt-1 text-[9px] text-bauraMuted">
                {
                  filteredProducts.length
                }{" "}
                products available
              </p>
            </div>
          </div>

          {loadingProducts ? (
            <div className="flex h-64 items-center justify-center">
              <RefreshCw
                className="animate-spin text-bauraPrimary"
                size={20}
              />
            </div>
          ) : (
            <div className="mt-4 grid grid-cols-2 gap-3 xl:grid-cols-3 2xl:grid-cols-4">
              {filteredProducts.map(
                (
                  product,
                ) => (
                  <button
                    key={
                      product.id
                    }
                    type="button"
                    disabled={
                      !product.inStock
                    }
                    onClick={() =>
                      addProduct(
                        product,
                      )
                    }
                    className="overflow-hidden rounded-[18px] border border-black/[0.07] bg-white text-left transition hover:-translate-y-0.5 hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-50">
                    <div className="aspect-[4/3] bg-[#f0f0ed]">
                      {product.imageUrl ? (
                        <img
                          src={
                            product.imageUrl
                          }
                          alt={
                            product.displayName
                          }
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center text-bauraMuted">
                          <PackageOpen
                            size={
                              25
                            }
                          />
                        </div>
                      )}
                    </div>

                    <div className="p-3">
                      <div className="min-h-[32px] text-[11px] font-bold leading-4">
                        {
                          product.displayName
                        }
                      </div>

                      <div className="mt-3 flex items-end justify-between">
                        <div className="text-[13px] font-bold text-bauraPrimary">
                          Rs.{" "}
                          {money(
                            product.sellPrice,
                          )}
                        </div>

                        <div className="text-[8px] text-bauraMuted">
                          {
                            product.availableQty
                          }{" "}
                          left
                        </div>
                      </div>
                    </div>
                  </button>
                ),
              )}
            </div>
          )}
        </section>

        <aside className="border-l border-black/[0.07] bg-white">
          <div className="flex h-full flex-col">
            <div className="border-b border-black/[0.07] p-4">
              <div className="flex items-center gap-2">
                <ShoppingBag
                  size={16}
                />

                <h2 className="text-[14px] font-bold">
                  Current Sale
                </h2>

                <span className="ml-auto rounded-full bg-[#f3f3f1] px-2 py-1 text-[8px] font-bold">
                  {
                    cart.length
                  }
                </span>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {cart.length ===
              0 ? (
                <div className="flex h-full min-h-48 flex-col items-center justify-center text-center">
                  <ShoppingBag
                    size={28}
                    className="text-black/20"
                  />

                  <div className="mt-3 text-[11px] font-bold">
                    Cart is empty
                  </div>

                  <div className="mt-1 text-[9px] text-bauraMuted">
                    Select a product to start billing.
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
                          item.product
                            .id
                        }
                        className="rounded-2xl border border-black/[0.07] p-3">
                        <div className="flex gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-[10px] font-bold">
                              {
                                item.product
                                  .displayName
                              }
                            </div>

                            <div className="mt-1 text-[9px] text-bauraMuted">
                              Rs.{" "}
                              {money(
                                item.product
                                  .sellPrice,
                              )}
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() =>
                              removeItem(
                                item.product
                                  .id,
                              )
                            }
                            className="text-bauraMuted hover:text-red-500">
                            <Trash2
                              size={
                                13
                              }
                            />
                          </button>
                        </div>

                        <div className="mt-3 flex items-center justify-between">
                          <div className="flex items-center rounded-xl bg-[#f5f5f3] p-1">
                            <button
                              type="button"
                              onClick={() =>
                                updateQty(
                                  item.product
                                    .id,
                                  -1,
                                )
                              }
                              className="flex h-7 w-7 items-center justify-center">
                              <Minus
                                size={
                                  11
                                }
                              />
                            </button>

                            <span className="w-8 text-center text-[10px] font-bold">
                              {
                                item.qty
                              }
                            </span>

                            <button
                              type="button"
                              onClick={() =>
                                updateQty(
                                  item.product
                                    .id,
                                  1,
                                )
                              }
                              className="flex h-7 w-7 items-center justify-center">
                              <Plus
                                size={
                                  11
                                }
                              />
                            </button>
                          </div>

                          <div className="text-[11px] font-bold">
                            Rs.{" "}
                            {money(
                              item.qty *
                                item.product
                                  .sellPrice,
                            )}
                          </div>
                        </div>
                      </div>
                    ),
                  )}
                </div>
              )}
            </div>

            <div className="border-t border-black/[0.07] p-4">
              <button
                type="button"
                onClick={() => {
                  const phone =
                    window.prompt(
                      "Customer phone number",
                    );

                  if (phone) {
                    setCustomerLabel(
                      phone,
                    );

                    /*
                     * Customer lookup UI gets
                     * attached next without
                     * blocking checkout.
                     */
                  }
                }}
                className="flex h-10 w-full items-center rounded-xl border border-black/[0.08] px-3 text-left">
                <UserRound
                  size={13}
                />

                <span className="ml-2 flex-1 truncate text-[9px] font-bold">
                  {customerLabel ||
                    "Add customer"}
                </span>

                <ChevronRight
                  size={13}
                />
              </button>

              <input
                type="email"
                value={
                  receiptEmail
                }
                onChange={(
                  event,
                ) =>
                  setReceiptEmail(
                    event
                      .target
                      .value,
                  )
                }
                placeholder="Receipt email (optional)"
                className="mt-2 h-10 w-full rounded-xl border border-black/[0.08] px-3 text-[9px] outline-none"
              />

              <div className="my-4 border-t border-dashed border-black/10" />

              <div className="flex items-center justify-between">
                <span className="text-[10px] text-bauraMuted">
                  Total
                </span>

                <span className="text-[20px] font-bold tracking-[-0.04em]">
                  Rs.{" "}
                  {money(
                    subtotal,
                  )}
                </span>
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
                      size={
                        14
                      }
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
                      size={
                        14
                      }
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
                      size={
                        14
                      }
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
                <>
                  <input
                    inputMode="decimal"
                    value={
                      tendered
                    }
                    onChange={(
                      event,
                    ) =>
                      setTendered(
                        event
                          .target
                          .value,
                      )
                    }
                    placeholder="Cash received"
                    className="mt-3 h-11 w-full rounded-xl border border-black/[0.08] px-3 text-[10px] outline-none"
                  />

                  <div className="mt-2 flex justify-between text-[9px]">
                    <span className="text-bauraMuted">
                      Change
                    </span>

                    <span className="font-bold">
                      Rs.{" "}
                      {money(
                        change,
                      )}
                    </span>
                  </div>
                </>
              ) : (
                <input
                  value={
                    paymentReference
                  }
                  onChange={(
                    event,
                  ) =>
                    setPaymentReference(
                      event
                        .target
                        .value,
                    )
                  }
                  placeholder={
                    paymentMethod ===
                    "CARD"
                      ? "Card payment reference"
                      : "Bank transfer reference"
                  }
                  className="mt-3 h-11 w-full rounded-xl border border-black/[0.08] px-3 text-[10px] outline-none"
                />
              )}

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
                className="mt-4 flex h-12 w-full items-center justify-center rounded-2xl bg-bauraPrimary text-[11px] font-bold text-white transition hover:bg-bauraPrimaryDark disabled:cursor-not-allowed disabled:opacity-40">
                {processing
                  ? "Processing..."
                  : `Charge Rs. ${money(
                      subtotal,
                    )}`}
              </button>
            </div>
          </div>
        </aside>
      </main>
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
      onClick={onClick}
      className={`flex h-11 flex-col items-center justify-center gap-1 rounded-xl border text-[8px] font-bold transition ${
        active
          ? "border-bauraPrimary bg-bauraPrimary/5 text-bauraPrimary"
          : "border-black/[0.08] text-bauraMuted"
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
  return (
    <div className="min-h-screen bg-[#f5f5f3] p-6">
      <div className="mx-auto max-w-md rounded-[24px] bg-white p-6 shadow-xl">
        <div className="text-center">
          <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-bauraMuted">
            Baura Bakers
          </div>

          <h1 className="mt-3 text-[21px] font-bold">
            Payment Successful
          </h1>

          <p className="mt-1 text-[10px] text-bauraMuted">
            {sale.orderNo}
          </p>
        </div>

        <div className="my-5 border-t border-dashed border-black/15" />

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
                className="flex justify-between gap-4 text-[10px]">
                <div>
                  <div className="font-bold">
                    {item.productDisplayName ||
                      item.product?.name ||
                      "Product"}
                  </div>

                  <div className="text-bauraMuted">
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

                <div className="font-bold">
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

        <div className="my-5 border-t border-dashed border-black/15" />

        <div className="flex items-center justify-between">
          <span className="text-[11px] font-bold">
            Total
          </span>

          <span className="text-[20px] font-bold">
            Rs.{" "}
            {money(
              Number(
                sale.netTotal,
              ),
            )}
          </span>
        </div>

        {sale.payments?.[0]
          ?.changeAmount !==
          null &&
          sale.payments?.[0]
            ?.changeAmount !==
            undefined && (
            <div className="mt-2 flex justify-between text-[10px]">
              <span className="text-bauraMuted">
                Change
              </span>

              <span className="font-bold">
                Rs.{" "}
                {money(
                  Number(
                    sale
                      .payments[0]
                      .changeAmount,
                  ),
                )}
              </span>
            </div>
          )}

        <div className="mt-6 grid grid-cols-2 gap-2 print:hidden">
          <button
            type="button"
            onClick={
              onPrint
            }
            className="h-11 rounded-xl border border-black/[0.08] text-[10px] font-bold">
            Print Receipt
          </button>

          <button
            type="button"
            onClick={
              onNewSale
            }
            className="h-11 rounded-xl bg-bauraPrimary text-[10px] font-bold text-white">
            New Sale
          </button>
        </div>
      </div>
    </div>
  );
}
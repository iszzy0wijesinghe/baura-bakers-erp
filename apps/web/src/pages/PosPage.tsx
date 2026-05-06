import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Banknote,
  CheckCircle2,
  Minus,
  PackageCheck,
  Plus,
  RefreshCw,
  ReceiptText,
  Search,
  ShoppingCart,
  Trash2,
  X
} from "lucide-react";
import { AppLayout } from "../layouts/AppLayout";
import { apiRequest } from "../lib/api";
import { Modal } from "../ui/Modal";
import { useToast } from "../ui/ToastProvider";

type PaymentMethod = "CASH" | "CARD" | "BANK_TRANSFER" | "ONLINE" | "OTHER";

type PosProduct = {
  id: string;
  name: string;
  variantName: string | null;
  displayName: string;
  sellPrice: string;
  recipeItemCount: number;
  isReadyForSale: boolean;
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
  isReadyForSale: boolean;
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

const paymentMethods: PaymentMethod[] = [
  "CASH",
  "CARD",
  "BANK_TRANSFER",
  "ONLINE",
  "OTHER"
];

function formatCurrency(value: number | string | undefined) {
  const amount = Number(value || 0);

  return `Rs. ${amount.toLocaleString("en-LK", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
}

function formatPaymentMethod(value: PaymentMethod) {
  return value
    .split("_")
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(" ");
}

export function PosPage() {
  const toast = useToast();

  const [products, setProducts] = useState<PosProduct[]>([]);
  const [channels, setChannels] = useState<SalesChannel[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);

  const [search, setSearch] = useState("");
  const [salesChannelId, setSalesChannelId] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("CASH");
  const [discountTotal, setDiscountTotal] = useState("");

  const [completedSale, setCompletedSale] = useState<CompletedSale | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [isCompletingSale, setIsCompletingSale] = useState(false);
  const [error, setError] = useState("");

  const filteredProducts = useMemo(() => {
    const keyword = search.trim().toLowerCase();

    if (!keyword) return products;

    return products.filter((product) =>
      product.displayName.toLowerCase().includes(keyword)
    );
  }, [products, search]);

  const grossTotal = useMemo(() => {
    return cart.reduce((sum, item) => sum + item.qty * item.unitSellPrice, 0);
  }, [cart]);

  const safeDiscountTotal = useMemo(() => {
    const discount = Number(discountTotal || 0);
    if (Number.isNaN(discount)) return 0;
    return Math.min(Math.max(discount, 0), grossTotal);
  }, [discountTotal, grossTotal]);

  const netTotal = grossTotal - safeDiscountTotal;

  const cartHasNotReadyProduct = cart.some((item) => !item.isReadyForSale);

  async function loadPosData(showToast = false) {
    setIsLoading(true);
    setError("");

    try {
      const [productsData, channelsData] = await Promise.all([
        apiRequest<{ products: PosProduct[] }>("/sales/products"),
        apiRequest<{ channels: SalesChannel[] }>("/sales/channels")
      ]);

      setProducts(productsData.products);
      setChannels(channelsData.channels);

      if (showToast) {
        toast.success("POS refreshed");
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to load POS data";
      setError(message);
      toast.error("Failed to load POS", message);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadPosData();
  }, []);

  function addToCart(product: PosProduct) {
    if (!product.isReadyForSale) {
      toast.info(
        "Recipe required",
        "Add recipe ingredients before selling this product."
      );
      return;
    }

    setCart((prev) => {
      const existing = prev.find((item) => item.productId === product.id);

      if (existing) {
        return prev.map((item) =>
          item.productId === product.id
            ? {
                ...item,
                qty: item.qty + 1
              }
            : item
        );
      }

      return [
        ...prev,
        {
          productId: product.id,
          displayName: product.displayName,
          qty: 1,
          unitSellPrice: Number(product.sellPrice),
          isReadyForSale: product.isReadyForSale
        }
      ];
    });
  }

  function increaseQty(productId: string) {
    setCart((prev) =>
      prev.map((item) =>
        item.productId === productId
          ? {
              ...item,
              qty: item.qty + 1
            }
          : item
      )
    );
  }

  function decreaseQty(productId: string) {
    setCart((prev) =>
      prev
        .map((item) =>
          item.productId === productId
            ? {
                ...item,
                qty: Math.max(item.qty - 1, 0)
              }
            : item
        )
        .filter((item) => item.qty > 0)
    );
  }

  function updateQty(productId: string, value: string) {
    const qty = Number(value);

    setCart((prev) =>
      prev.map((item) =>
        item.productId === productId
          ? {
              ...item,
              qty: Number.isNaN(qty) || qty < 0 ? 0 : qty
            }
          : item
      )
    );
  }

  function removeFromCart(productId: string) {
    setCart((prev) => prev.filter((item) => item.productId !== productId));
  }

  function clearSale() {
    setCart([]);
    setDiscountTotal("");
    setPaymentMethod("CASH");
    setSalesChannelId("");
  }

  async function completeSale() {
    if (cart.length === 0) {
      toast.info("Cart is empty", "Add products before completing the sale.");
      return;
    }

    if (cartHasNotReadyProduct) {
      toast.error(
        "Cannot complete sale",
        "One or more products do not have recipe ingredients."
      );
      return;
    }

    setIsCompletingSale(true);
    setError("");

    try {
      const data = await apiRequest<{
        message: string;
        sale: CompletedSale;
      }>("/sales", {
        method: "POST",
        body: JSON.stringify({
          salesChannelId: salesChannelId || null,
          paymentMethod,
          discountTotal: safeDiscountTotal,
          items: cart.map((item) => ({
            productId: item.productId,
            qty: item.qty,
            unitSellPrice: item.unitSellPrice
          }))
        })
      });

      toast.success("Sale completed", "FIFO stock was reduced successfully.");

      setCompletedSale(data.sale);
      clearSale();
      await loadPosData();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to complete sale";
      setError(message);
      toast.error("Sale failed", message);
    } finally {
      setIsCompletingSale(false);
    }
  }

  return (
    <AppLayout
      activeItem="POS Sales"
      title="POS Sales"
      subtitle="Sell bakery products and automatically reduce ingredient stock using FIFO."
      actions={
        <>
          <button
            onClick={() => loadPosData(true)}
            className="flex items-center gap-2 rounded-2xl border border-bauraBrown/10 bg-bauraSoft px-4 py-3 text-sm font-semibold shadow-sm"
          >
            <RefreshCw size={16} />
            Refresh
          </button>

          <button
            onClick={clearSale}
            disabled={cart.length === 0}
            className="flex items-center gap-2 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-bold text-red-700 shadow-sm disabled:opacity-50"
          >
            <X size={16} />
            Clear Sale
          </button>
        </>
      }
    >
      <div className="grid gap-5 xl:grid-cols-[1.25fr_0.75fr]">
        <section className="rounded-[2rem] border border-bauraBrown/10 bg-bauraSoft p-5 shadow-sm">
          <div className="mb-5 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h3 className="font-bold">Products</h3>
              <p className="text-sm text-bauraBrown/60">
                {filteredProducts.length} shown · {products.length} active
                products
              </p>
            </div>

            <div className="flex items-center gap-3 rounded-2xl border border-bauraBrown/10 bg-white px-4 py-3 md:w-80">
              <Search size={17} className="text-bauraBrown/45" />
              <input
                className="w-full bg-transparent text-sm outline-none"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search products..."
              />
            </div>
          </div>

          {error && (
            <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="baura-scrollbar max-h-[calc(100vh-250px)] overflow-auto pr-1">
            {isLoading ? (
              <EmptyState text="Loading products..." />
            ) : filteredProducts.length === 0 ? (
              <EmptyState text="No products available for POS." />
            ) : (
              <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
                {filteredProducts.map((product) => {
                  const cartItem = cart.find(
                    (item) => item.productId === product.id
                  );

                  return (
                    <button
                      key={product.id}
                      onClick={() => addToCart(product)}
                      className={`rounded-3xl border p-4 text-left transition ${
                        product.isReadyForSale
                          ? "border-bauraBrown/10 bg-white/70 hover:border-bauraGold hover:bg-white"
                          : "border-amber-200 bg-amber-50"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-bauraBrown text-bauraGold">
                          <PackageCheck size={22} />
                        </div>

                        {cartItem && (
                          <span className="rounded-full bg-bauraGold px-3 py-1 text-xs font-bold text-bauraBrown">
                            x{cartItem.qty}
                          </span>
                        )}
                      </div>

                      <h4 className="mt-4 font-bold text-bauraBrown">
                        {product.displayName}
                      </h4>

                      <p className="mt-1 text-sm text-bauraBrown/60">
                        {formatCurrency(product.sellPrice)}
                      </p>

                      <div className="mt-4 flex items-center justify-between gap-2">
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-bold ${
                            product.isReadyForSale
                              ? "bg-green-100 text-green-700"
                              : "bg-amber-100 text-amber-700"
                          }`}
                        >
                          {product.isReadyForSale
                            ? "Ready"
                            : "Recipe Missing"}
                        </span>

                        <span className="text-xs font-semibold text-bauraBrown/50">
                          {product.recipeItemCount} recipe item
                          {product.recipeItemCount === 1 ? "" : "s"}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        <section className="rounded-[2rem] border border-bauraBrown/10 bg-bauraSoft p-5 shadow-sm">
          <div className="mb-5 flex items-start justify-between gap-3">
            <div>
              <h3 className="font-bold">Current Sale</h3>
              <p className="text-sm text-bauraBrown/60">
                {cart.length} product{cart.length === 1 ? "" : "s"} in cart
              </p>
            </div>

            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-bauraBrown text-bauraGold">
              <ShoppingCart size={22} />
            </div>
          </div>

          <div className="grid gap-3">
            <label className="block">
              <span className="mb-2 block text-sm font-semibold">
                Sales Channel
              </span>
              <select
                value={salesChannelId}
                onChange={(event) => setSalesChannelId(event.target.value)}
                className="w-full rounded-2xl border border-bauraBrown/10 bg-white px-4 py-3 text-sm outline-none transition focus:border-bauraGold"
              >
                <option value="">Direct / Shop Sale</option>
                {channels.map((channel) => (
                  <option key={channel.id} value={channel.id}>
                    {channel.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-semibold">
                Payment Method
              </span>
              <select
                value={paymentMethod}
                onChange={(event) =>
                  setPaymentMethod(event.target.value as PaymentMethod)
                }
                className="w-full rounded-2xl border border-bauraBrown/10 bg-white px-4 py-3 text-sm outline-none transition focus:border-bauraGold"
              >
                {paymentMethods.map((method) => (
                  <option key={method} value={method}>
                    {formatPaymentMethod(method)}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="baura-scrollbar mt-5 max-h-[calc(100vh-560px)] min-h-[180px] overflow-auto pr-1">
            {cart.length === 0 ? (
              <EmptyState text="Cart is empty. Select products to start sale." />
            ) : (
              <div className="grid gap-3">
                {cart.map((item) => (
                  <div
                    key={item.productId}
                    className="rounded-3xl border border-bauraBrown/10 bg-white/70 p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h4 className="font-bold">{item.displayName}</h4>
                        <p className="mt-1 text-sm text-bauraBrown/60">
                          {formatCurrency(item.unitSellPrice)} each
                        </p>
                      </div>

                      <button
                        onClick={() => removeFromCart(item.productId)}
                        className="rounded-2xl bg-red-50 p-2 text-red-700"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>

                    <div className="mt-4 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => decreaseQty(item.productId)}
                          className="flex h-9 w-9 items-center justify-center rounded-2xl border border-bauraBrown/10 bg-white"
                        >
                          <Minus size={15} />
                        </button>

                        <input
                          value={item.qty}
                          onChange={(event) =>
                            updateQty(item.productId, event.target.value)
                          }
                          type="number"
                          min="0"
                          step="1"
                          className="h-9 w-20 rounded-2xl border border-bauraBrown/10 bg-white text-center text-sm font-bold outline-none focus:border-bauraGold"
                        />

                        <button
                          onClick={() => increaseQty(item.productId)}
                          className="flex h-9 w-9 items-center justify-center rounded-2xl border border-bauraBrown/10 bg-white"
                        >
                          <Plus size={15} />
                        </button>
                      </div>

                      <p className="font-bold">
                        {formatCurrency(item.qty * item.unitSellPrice)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {cartHasNotReadyProduct && (
            <div className="mt-4 rounded-3xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
              <div className="flex items-start gap-3">
                <AlertTriangle size={18} className="mt-0.5 shrink-0" />
                <div>
                  <p className="font-bold">Some products are not ready.</p>
                  <p className="mt-1 opacity-80">
                    Products must have recipe ingredients before sale.
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="mt-5 rounded-3xl border border-bauraBrown/10 bg-white/70 p-4">
            <div className="grid gap-3">
              <SummaryRow label="Gross Total" value={formatCurrency(grossTotal)} />

              <div className="flex items-center justify-between gap-4">
                <span className="text-sm text-bauraBrown/60">Discount</span>
                <input
                  value={discountTotal}
                  onChange={(event) => setDiscountTotal(event.target.value)}
                  type="number"
                  min="0"
                  className="w-36 rounded-2xl border border-bauraBrown/10 bg-white px-3 py-2 text-right text-sm font-bold outline-none focus:border-bauraGold"
                  placeholder="0"
                />
              </div>

              <div className="border-t border-bauraBrown/10 pt-3">
                <SummaryRow
                  label="Net Total"
                  value={formatCurrency(netTotal)}
                  large
                />
              </div>
            </div>
          </div>

          <button
            onClick={completeSale}
            disabled={
              isCompletingSale ||
              cart.length === 0 ||
              cartHasNotReadyProduct ||
              netTotal <= 0
            }
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-bauraBrown px-5 py-4 text-sm font-bold text-bauraCream shadow-sm transition hover:bg-bauraBrown/90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isCompletingSale ? (
              <>
                <RefreshCw size={17} className="animate-spin" />
                Completing Sale...
              </>
            ) : (
              <>
                <Banknote size={17} />
                Complete Sale
              </>
            )}
          </button>
        </section>
      </div>

      <Modal
        open={Boolean(completedSale)}
        onClose={() => setCompletedSale(null)}
        title="Sale Completed"
        subtitle="Ingredient stock was reduced using FIFO and profit was saved."
      >
        {completedSale && (
          <div className="grid gap-4">
            <div className="rounded-3xl border border-green-200 bg-green-50 p-4 text-green-800">
              <div className="flex items-start gap-3">
                <CheckCircle2 size={20} className="mt-0.5 shrink-0" />
                <div>
                  <p className="font-bold">{completedSale.orderNo}</p>
                  <p className="mt-1 text-sm opacity-80">
                    Sale completed successfully.
                  </p>
                </div>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <PreviewStat
                label="Gross Total"
                value={formatCurrency(completedSale.grossTotal)}
              />
              <PreviewStat
                label="Discount"
                value={formatCurrency(completedSale.discountTotal)}
              />
              <PreviewStat
                label="Net Total"
                value={formatCurrency(completedSale.netTotal)}
              />
              <PreviewStat
                label="COGS"
                value={formatCurrency(completedSale.cogsTotal)}
              />
              <PreviewStat
                label="Profit / Loss"
                value={formatCurrency(completedSale.profitTotal)}
              />
              <PreviewStat
                label="Payment"
                value={formatPaymentMethod(completedSale.paymentMethod)}
              />
            </div>

            <button
              onClick={() => setCompletedSale(null)}
              className="rounded-2xl bg-bauraBrown px-5 py-3 text-sm font-bold text-bauraCream"
            >
              Done
            </button>
          </div>
        )}
      </Modal>
    </AppLayout>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-3xl bg-white/50 p-6 text-center text-sm text-bauraBrown/60">
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
            ? "text-sm font-bold text-bauraBrown"
            : "text-sm text-bauraBrown/60"
        }
      >
        {label}
      </span>
      <span
        className={
          large
            ? "text-xl font-bold text-bauraBrown"
            : "text-sm font-bold text-bauraBrown"
        }
      >
        {value}
      </span>
    </div>
  );
}

function PreviewStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-3xl bg-white/70 p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-bauraBrown/45">
        {label}
      </p>
      <p className="mt-2 truncate text-sm font-bold">{value}</p>
    </div>
  );
}
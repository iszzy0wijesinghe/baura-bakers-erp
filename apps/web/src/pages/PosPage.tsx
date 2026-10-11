import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Banknote,
  CheckCircle2,
  ChevronRight,
  Minus,
  PackageCheck,
  Plus,
  RefreshCw,
  Search,
  ShoppingCart,
  Trash2,
  X
} from "lucide-react";
import { AppLayout } from "../layouts/AppLayout";
import { apiRequest } from "../lib/api";
import { Modal } from "../ui/Modal";
import { useToast } from "../ui/ToastProvider";

type PaymentMethod =
  | "CASH"
  | "CARD"
  | "BANK_TRANSFER"
  | "ONLINE"
  | "OTHER";

type ProductSize = {
  id: string;
  productSizeId?: string;
  label: string;
  serves?: string | number | null;
  price: string | number;
  sellPrice?: string | number;
  availableQty: number;
  inStock?: boolean;
  isInStock?: boolean;
  isLowStock?: boolean;
};

type PosProduct = {
  id: string;
  name: string;
  variantName: string | null;
  displayName: string;
  imageUrl?: string | null;
  sellPrice: string | number;
  availableQty: number;
  inStock?: boolean;
  isInStock?: boolean;
  isLowStock?: boolean;
  requiresSize?: boolean;
  hasSizes?: boolean;
  sizes?: ProductSize[];
  finishedStockAlertQty: string | number | null;
};

type SalesChannel = {
  id: string;
  name: string;
  isActive: boolean;
};

type CartItem = {
  key: string;
  productId: string;
  productSizeId: string | null;
  productName: string;
  productSizeLabel: string | null;
  displayName: string;
  qty: number;
  unitSellPrice: number;
  availableQty: number;
};

type SalePayment = {
  method: PaymentMethod;
  amount: string | number;
  tenderedAmount?: string | number | null;
  changeAmount?: string | number | null;
  reference?: string | null;
};

type CompletedSaleItem = {
  id: string;
  productId: string;
  productSizeId?: string | null;
  productSizeLabel?: string | null;
  productDisplayName?: string;
  qty: string | number;
  unitSellPrice: string | number;
  lineTotal: string | number;
  discountTotal: string | number;
  netTotal: string | number;
  product?: {
    name: string;
    variantName: string | null;
  };
  productSize?: {
    label: string;
  } | null;
};

type CompletedSale = {
  id: string;
  orderNo: string;
  grossTotal: string | number;
  discountTotal: string | number;
  netTotal: string | number;
  cogsTotal?: string | number;
  profitTotal?: string | number;
  paymentMethod: PaymentMethod;
  soldAt: string;
  items?: CompletedSaleItem[];
  payments?: SalePayment[];
};

const paymentMethods: PaymentMethod[] = [
  "CASH",
  "CARD",
  "BANK_TRANSFER",
  "ONLINE",
  "OTHER"
];

function round2(value: number) {
  return Number(value.toFixed(2));
}

function round3(value: number) {
  return Number(value.toFixed(3));
}

function formatCurrency(value: number | string | null | undefined) {
  const amount = Number(value ?? 0);

  return `Rs. ${amount.toLocaleString("en-LK", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
}

function formatQty(value: number | string | null | undefined) {
  return Number(value ?? 0).toLocaleString("en-LK", {
    maximumFractionDigits: 3
  });
}

function formatPaymentMethod(value: PaymentMethod) {
  return value
    .split("_")
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(" ");
}

function getCartKey(productId: string, productSizeId: string | null) {
  return `${productId}:${productSizeId ?? "standard"}`;
}

function getProductName(product: PosProduct) {
  return product.displayName ||
    (product.variantName
      ? `${product.name} - ${product.variantName}`
      : product.name);
}

function productRequiresSize(product: PosProduct) {
  return Boolean(
    product.requiresSize ||
    product.hasSizes ||
    (product.sizes && product.sizes.length > 0)
  );
}

function getSizePrice(size: ProductSize) {
  return Number(size.price ?? size.sellPrice ?? 0);
}

function getCompletedItemName(item: CompletedSaleItem) {
  if (item.productDisplayName) {
    return item.productDisplayName;
  }

  const productName = item.product
    ? item.product.variantName
      ? `${item.product.name} - ${item.product.variantName}`
      : item.product.name
    : "Product";

  const sizeLabel = item.productSizeLabel || item.productSize?.label;

  return sizeLabel ? `${productName} - ${sizeLabel}` : productName;
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
  const [tenderedAmount, setTenderedAmount] = useState("");
  const [paymentReference, setPaymentReference] = useState("");
  const [selectedProduct, setSelectedProduct] = useState<PosProduct | null>(null);
  const [completedSale, setCompletedSale] = useState<CompletedSale | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCompletingSale, setIsCompletingSale] = useState(false);

  const checkoutKeyRef = useRef<string | null>(null);

  const filteredProducts = useMemo(() => {
    const keyword = search.trim().toLowerCase();

    if (!keyword) return products;

    return products.filter((product) => {
      const nameMatches = getProductName(product)
        .toLowerCase()
        .includes(keyword);

      const sizeMatches = product.sizes?.some((size) =>
        size.label.toLowerCase().includes(keyword)
      );

      return nameMatches || sizeMatches;
    });
  }, [products, search]);

  const grossTotal = useMemo(
    () => round2(
      cart.reduce(
        (total, item) => total + item.qty * item.unitSellPrice,
        0
      )
    ),
    [cart]
  );

  const enteredDiscount = Number(discountTotal || 0);

  const safeDiscountTotal = useMemo(() => {
    if (!Number.isFinite(enteredDiscount)) return 0;
    return round2(Math.max(0, Math.min(enteredDiscount, grossTotal)));
  }, [enteredDiscount, grossTotal]);

  const netTotal = round2(grossTotal - safeDiscountTotal);

  const totalCartQty = useMemo(
    () => round3(cart.reduce((total, item) => total + item.qty, 0)),
    [cart]
  );

  const availableProductCount = useMemo(
    () => products.filter((product) => Number(product.availableQty) > 0).length,
    [products]
  );

  const tenderedValue = Number(tenderedAmount || 0);

  const changeAmount = paymentMethod === "CASH" && tenderedAmount.trim()
    ? round2(Math.max(0, tenderedValue - netTotal))
    : 0;

  const requiresReference =
    paymentMethod === "CARD" ||
    paymentMethod === "BANK_TRANSFER";

  async function loadPosData(showToast = false) {
    setIsLoading(true);

    try {
      const [productsData, channelsData] = await Promise.all([
        apiRequest<{ products: PosProduct[] }>("/sales/products"),
        apiRequest<{ channels: SalesChannel[] }>("/sales/channels")
      ]);

      const latestProducts = productsData.products;

      setProducts(latestProducts);
      setChannels(channelsData.channels.filter((channel) => channel.isActive));

      setCart((current) =>
        current
          .map((item): CartItem | null => {
            const product = latestProducts.find(
              (entry) => entry.id === item.productId
            );

            if (!product) return null;

            if (productRequiresSize(product)) {
              if (!item.productSizeId) return null;

              const size = product.sizes?.find(
                (entry) => entry.id === item.productSizeId
              );

              if (!size) return null;

              const availableQty = Number(size.availableQty || 0);

              if (availableQty <= 0) return null;

              return {
                ...item,
                productName: getProductName(product),
                productSizeLabel: size.label,
                displayName: `${getProductName(product)} - ${size.label}`,
                unitSellPrice: getSizePrice(size),
                availableQty,
                qty: Math.min(item.qty, availableQty)
              };
            }

            if (item.productSizeId) return null;

            const availableQty = Number(product.availableQty || 0);

            if (availableQty <= 0) return null;

            return {
              ...item,
              productName: getProductName(product),
              productSizeLabel: null,
              displayName: getProductName(product),
              unitSellPrice: Number(product.sellPrice),
              availableQty,
              qty: Math.min(item.qty, availableQty)
            };
          })
          .filter((item): item is CartItem => item !== null)
      );

      setSelectedProduct((current) => {
        if (!current) return null;
        return latestProducts.find((product) => product.id === current.id) ?? null;
      });

      if (showToast) {
        toast.success(
          "POS refreshed",
          "Latest size-specific Bakery Stock is now available."
        );
      }
    } catch (error) {
      toast.error(
        "Failed to load POS",
        error instanceof Error ? error.message : "Unable to load POS data."
      );
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadPosData();
  }, []);

  function addToCart(product: PosProduct, size: ProductSize | null = null) {
    const requiresSize = productRequiresSize(product);

    if (requiresSize && !size) {
      setSelectedProduct(product);
      return;
    }

    const productSizeId = size?.id ?? null;
    const availableQty = Number(
      size ? size.availableQty : product.availableQty
    );

    const unitSellPrice = size
      ? getSizePrice(size)
      : Number(product.sellPrice);

    const productName = getProductName(product);
    const displayName = size
      ? `${productName} - ${size.label}`
      : productName;

    if (!Number.isFinite(availableQty) || availableQty < 1) {
      toast.warning(
        "Out of stock",
        `${displayName} is not available in Bakery Stock.`
      );
      return;
    }

    if (!Number.isFinite(unitSellPrice) || unitSellPrice < 0) {
      toast.error("Invalid price", `${displayName} has an invalid selling price.`);
      return;
    }

    const key = getCartKey(product.id, productSizeId);
    const existing = cart.find((item) => item.key === key);

    if (existing && existing.qty + 1 > availableQty) {
      toast.warning(
        "Stock limit reached",
        `Only ${formatQty(availableQty)} ${displayName} available.`
      );
      return;
    }

    setCart((current) => {
      const currentItem = current.find((item) => item.key === key);

      if (currentItem) {
        return current.map((item) =>
          item.key === key
            ? {
                ...item,
                qty: Math.min(item.qty + 1, availableQty),
                availableQty,
                unitSellPrice
              }
            : item
        );
      }

      return [
        ...current,
        {
          key,
          productId: product.id,
          productSizeId,
          productName,
          productSizeLabel: size?.label ?? null,
          displayName,
          qty: 1,
          unitSellPrice,
          availableQty
        }
      ];
    });

    setSelectedProduct(null);
  }

  function increaseQty(key: string) {
    const item = cart.find((entry) => entry.key === key);

    if (!item) return;

    if (item.qty + 1 > item.availableQty) {
      toast.warning(
        "Stock limit reached",
        `Only ${formatQty(item.availableQty)} ${item.displayName} available.`
      );
      return;
    }

    setCart((current) =>
      current.map((entry) =>
        entry.key === key
          ? { ...entry, qty: round3(entry.qty + 1) }
          : entry
      )
    );
  }

  function decreaseQty(key: string) {
    setCart((current) =>
      current
        .map((item) =>
          item.key === key
            ? { ...item, qty: round3(Math.max(item.qty - 1, 0)) }
            : item
        )
        .filter((item) => item.qty > 0)
    );
  }

  function updateQty(key: string, value: string) {
    const parsed = Number(value);

    if (!Number.isFinite(parsed) || parsed < 0) return;

    const normalized = round3(parsed);

    setCart((current) =>
      current
        .map((item) =>
          item.key === key
            ? {
                ...item,
                qty: Math.min(normalized, item.availableQty)
              }
            : item
        )
        .filter((item) => item.qty > 0)
    );
  }

  function removeFromCart(key: string) {
    setCart((current) => current.filter((item) => item.key !== key));
  }

  function clearSale() {
    setCart([]);
    setDiscountTotal("");
    setPaymentMethod("CASH");
    setSalesChannelId("");
    setTenderedAmount("");
    setPaymentReference("");
    checkoutKeyRef.current = null;
  }

  async function completeSale() {
    if (cart.length === 0) {
      toast.info("Cart is empty", "Add products before completing the sale.");
      return;
    }

    if (netTotal <= 0) {
      toast.warning(
        "Invalid sale total",
        "Net total must be greater than zero."
      );
      return;
    }

    if (
      !Number.isFinite(enteredDiscount) ||
      enteredDiscount < 0 ||
      enteredDiscount > grossTotal
    ) {
      toast.warning(
        "Invalid discount",
        "Enter a discount between zero and the gross total."
      );
      return;
    }

    const invalidStockItem = cart.find(
      (item) =>
        item.qty <= 0 ||
        item.qty > item.availableQty ||
        !Number.isFinite(item.qty)
    );

    if (invalidStockItem) {
      toast.warning(
        "Stock changed",
        `${invalidStockItem.displayName} has insufficient available stock.`
      );
      return;
    }

    if (paymentMethod === "CASH" && tenderedAmount.trim()) {
      if (!Number.isFinite(tenderedValue) || tenderedValue < netTotal) {
        toast.warning(
          "Insufficient cash",
          "Tendered cash must cover the net sale total."
        );
        return;
      }
    }

    if (requiresReference && !paymentReference.trim()) {
      toast.warning(
        "Payment reference required",
        `Enter the ${formatPaymentMethod(paymentMethod).toLowerCase()} reference.`
      );
      return;
    }

    if (isCompletingSale) return;

    const idempotencyKey =
      checkoutKeyRef.current ?? crypto.randomUUID();

    checkoutKeyRef.current = idempotencyKey;

    setIsCompletingSale(true);

    try {
      const data = await apiRequest<{
        message: string;
        sale: CompletedSale;
      }>("/sales", {
        method: "POST",
        body: JSON.stringify({
          salesChannelId: salesChannelId || null,
          discountTotal: safeDiscountTotal,
          idempotencyKey,
          payment: {
            method: paymentMethod,
            tenderedAmount:
              paymentMethod === "CASH" && tenderedAmount.trim()
                ? round2(tenderedValue)
                : null,
            reference:
              paymentMethod === "CASH"
                ? null
                : paymentReference.trim() || null
          },
          items: cart.map((item) => ({
            productId: item.productId,
            productSizeId: item.productSizeId,
            qty: item.qty
          }))
        })
      });

      toast.success(
        "Sale completed",
        "Bakery Stock was reduced successfully."
      );

      setCompletedSale(data.sale);
      clearSale();
      await loadPosData();
    } catch (error) {
      toast.error(
        "Sale failed",
        error instanceof Error ? error.message : "Failed to complete sale."
      );

      /*
       * Keep the idempotency key for retrying the same checkout.
       * A network failure may happen after the server commits.
       */
      await loadPosData();
    } finally {
      setIsCompletingSale(false);
    }
  }

  return (
    <AppLayout
      activeItem="POS Sales"
      title="POS Sales"
      subtitle="Sell finished bakery products directly from size-specific Bakery Stock."
      actions={
        <>
          <button
            type="button"
            onClick={() => void loadPosData(true)}
            disabled={isLoading || isCompletingSale}
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
            onClick={clearSale}
            disabled={cart.length === 0 || isCompletingSale}
            className="erp-button-danger"
          >
            <X size={14} />
            Clear Sale
          </button>
        </>
      }
    >
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <PosMetric
          label="Active Products"
          value={String(products.length)}
          note="Configured for POS"
        />
        <PosMetric
          label="Available Products"
          value={String(availableProductCount)}
          note="Have sellable Bakery Stock"
        />
        <PosMetric
          label="Cart Quantity"
          value={formatQty(totalCartQty)}
          note={`${cart.length} selected item${cart.length === 1 ? "" : "s"}`}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.25fr_0.75fr]">
        <section className="erp-panel overflow-hidden">
          <div className="flex flex-col gap-4 border-b border-bauraBorder px-5 py-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="erp-section-title">Products</h2>
              <p className="erp-section-subtitle">
                {filteredProducts.length} shown · {products.length} active products
              </p>
            </div>

            <div className="erp-search md:w-80">
              <Search size={15} className="text-bauraMuted" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search products or sizes..."
                className="w-full bg-transparent text-[11px] text-bauraInk outline-none placeholder:text-bauraMuted2"
              />
            </div>
          </div>

          <div className="baura-scrollbar max-h-[calc(100vh-310px)] min-h-[420px] overflow-auto p-4">
            {isLoading ? (
              <EmptyState text="Loading Bakery Stock..." />
            ) : filteredProducts.length === 0 ? (
              <EmptyState text="No products available for POS." />
            ) : (
              <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
                {filteredProducts.map((product) => {
                  const availableQty = Number(product.availableQty || 0);
                  const isAvailable = availableQty > 0;
                  const requiresSize = productRequiresSize(product);

                  const threshold = product.finishedStockAlertQty === null
                    ? null
                    : Number(product.finishedStockAlertQty);

                  const lowStock = isAvailable &&
                    threshold !== null &&
                    availableQty <= threshold;

                  const cartQty = cart
                    .filter((item) => item.productId === product.id)
                    .reduce((sum, item) => sum + item.qty, 0);

                  const activeSizes = product.sizes ?? [];
                  const prices = activeSizes.map(getSizePrice);
                  const minimumPrice = prices.length
                    ? Math.min(...prices)
                    : Number(product.sellPrice);

                  return (
                    <button
                      key={product.id}
                      type="button"
                      disabled={!isAvailable || isCompletingSale}
                      onClick={() => addToCart(product)}
                      className={`relative overflow-hidden rounded-[16px] border p-4 text-left transition duration-200 ${
                        isAvailable
                          ? "border-bauraBorder bg-white hover:border-bauraGold/60 hover:shadow-bauraCardHover"
                          : "cursor-not-allowed border-bauraBorder bg-bauraCanvas2 opacity-65"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-bauraGoldSoft text-bauraGoldDark">
                          <PackageCheck size={20} />
                        </div>

                        {cartQty > 0 && (
                          <span className="rounded-lg bg-bauraPrimary px-2.5 py-1 text-[9px] font-semibold text-white">
                            x{formatQty(cartQty)}
                          </span>
                        )}
                      </div>

                      <h3 className="mt-4 line-clamp-2 text-[12px] font-semibold leading-5 text-bauraInk">
                        {getProductName(product)}
                      </h3>

                      <p className="mt-1 text-[14px] font-semibold text-bauraPrimary">
                        {requiresSize && prices.length > 1 && "From "}
                        {formatCurrency(minimumPrice)}
                      </p>

                      {requiresSize && (
                        <p className="mt-1 text-[9px] text-bauraMuted">
                          {activeSizes.length} size{activeSizes.length === 1 ? "" : "s"} · Select size
                        </p>
                      )}

                      <div className="mt-4 flex items-center justify-between gap-2">
                        {!isAvailable ? (
                          <span className="erp-badge bg-bauraDangerSoft text-bauraDanger">
                            Out of Stock
                          </span>
                        ) : lowStock ? (
                          <span className="erp-badge bg-bauraWarningSoft text-bauraWarning">
                            <AlertTriangle size={10} className="mr-1" />
                            Low Stock
                          </span>
                        ) : (
                          <span className="erp-badge bg-bauraSuccessSoft text-bauraSuccess">
                            In Stock
                          </span>
                        )}

                        <span className="text-[9px] font-semibold text-bauraMuted">
                          {formatQty(availableQty)} available
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        <section className="erp-panel flex min-h-[600px] flex-col overflow-hidden">
          <div className="flex items-start justify-between gap-3 border-b border-bauraBorder px-5 py-4">
            <div>
              <h2 className="erp-section-title">Current Sale</h2>
              <p className="erp-section-subtitle">
                {cart.length} item{cart.length === 1 ? "" : "s"} ·{" "}
                {formatQty(totalCartQty)} units
              </p>
            </div>

            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-bauraGoldSoft text-bauraGoldDark">
              <ShoppingCart size={18} />
            </div>
          </div>

          <div className="grid gap-3 border-b border-bauraBorder p-4 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
            <label>
              <span className="erp-label">Sales Channel</span>
              <select
                value={salesChannelId}
                onChange={(event) => setSalesChannelId(event.target.value)}
                disabled={isCompletingSale}
                className="erp-input"
              >
                <option value="">Direct / Shop Sale</option>
                {channels.map((channel) => (
                  <option key={channel.id} value={channel.id}>
                    {channel.name}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span className="erp-label">Payment Method</span>
              <select
                value={paymentMethod}
                onChange={(event) => {
                  setPaymentMethod(event.target.value as PaymentMethod);
                  setTenderedAmount("");
                  setPaymentReference("");
                  checkoutKeyRef.current = null;
                }}
                disabled={isCompletingSale}
                className="erp-input"
              >
                {paymentMethods.map((method) => (
                  <option key={method} value={method}>
                    {formatPaymentMethod(method)}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="baura-scrollbar min-h-[200px] flex-1 overflow-auto p-4">
            {cart.length === 0 ? (
              <div className="flex h-full min-h-[220px] items-center justify-center">
                <div className="max-w-xs text-center">
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-bauraGoldSoft text-bauraGoldDark">
                    <ShoppingCart size={21} />
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
                {cart.map((item) => (
                  <div
                    key={item.key}
                    className="rounded-[14px] border border-bauraBorder bg-white p-3.5"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="text-[11px] font-semibold text-bauraInk">
                          {item.displayName}
                        </h3>
                        <p className="mt-1 text-[9px] text-bauraMuted">
                          {formatCurrency(item.unitSellPrice)} each ·{" "}
                          {formatQty(item.availableQty)} available
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => removeFromCart(item.key)}
                        disabled={isCompletingSale}
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-bauraDangerSoft text-bauraDanger transition hover:bg-red-100 disabled:opacity-50"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>

                    <div className="mt-3 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => decreaseQty(item.key)}
                          disabled={isCompletingSale}
                          className="flex h-8 w-8 items-center justify-center rounded-lg border border-bauraBorder bg-white text-bauraInk transition hover:bg-bauraCanvas2 disabled:opacity-50"
                        >
                          <Minus size={13} />
                        </button>

                        <input
                          type="number"
                          min="0"
                          max={item.availableQty}
                          step="1"
                          value={item.qty}
                          disabled={isCompletingSale}
                          onChange={(event) =>
                            updateQty(item.key, event.target.value)
                          }
                          className="h-8 w-16 rounded-lg border border-bauraBorder bg-white text-center text-[10px] font-semibold text-bauraInk outline-none focus:border-bauraGold disabled:opacity-50"
                        />

                        <button
                          type="button"
                          disabled={
                            isCompletingSale ||
                            item.qty + 1 > item.availableQty
                          }
                          onClick={() => increaseQty(item.key)}
                          className="flex h-8 w-8 items-center justify-center rounded-lg border border-bauraBorder bg-white text-bauraInk transition hover:bg-bauraCanvas2 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          <Plus size={13} />
                        </button>
                      </div>

                      <p className="text-[11px] font-semibold text-bauraInk">
                        {formatCurrency(item.qty * item.unitSellPrice)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="border-t border-bauraBorder bg-bauraCanvas2 p-4">
            <div className="rounded-[14px] border border-bauraBorder bg-white p-4">
              <div className="grid gap-3">
                <SummaryRow
                  label="Gross Total"
                  value={formatCurrency(grossTotal)}
                />

                <div className="flex items-center justify-between gap-4">
                  <span className="text-[10px] text-bauraMuted">
                    Discount
                  </span>
                  <input
                    type="number"
                    min="0"
                    max={grossTotal}
                    step="0.01"
                    value={discountTotal}
                    disabled={isCompletingSale}
                    onChange={(event) => {
                      setDiscountTotal(event.target.value);
                      checkoutKeyRef.current = null;
                    }}
                    placeholder="0.00"
                    className="h-9 w-32 rounded-lg border border-bauraBorder bg-white px-3 text-right text-[10px] font-semibold text-bauraInk outline-none focus:border-bauraGold"
                  />
                </div>

                <div className="border-t border-bauraBorder pt-3">
                  <SummaryRow
                    label="Net Total"
                    value={formatCurrency(netTotal)}
                    large
                  />
                </div>

                {paymentMethod === "CASH" && (
                  <div className="grid gap-2 border-t border-bauraBorder pt-3">
                    <label>
                      <span className="erp-label">Cash Received</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={tenderedAmount}
                        disabled={isCompletingSale}
                        onChange={(event) => {
                          setTenderedAmount(event.target.value);
                          checkoutKeyRef.current = null;
                        }}
                        placeholder={formatCurrency(netTotal)}
                        className="erp-input"
                      />
                    </label>
                    <SummaryRow
                      label="Change"
                      value={formatCurrency(changeAmount)}
                    />
                  </div>
                )}

                {paymentMethod !== "CASH" && (
                  <label className="border-t border-bauraBorder pt-3">
                    <span className="erp-label">
                      Payment Reference {requiresReference ? "*" : "(optional)"}
                    </span>
                    <input
                      value={paymentReference}
                      disabled={isCompletingSale}
                      onChange={(event) => {
                        setPaymentReference(event.target.value);
                        checkoutKeyRef.current = null;
                      }}
                      placeholder="Enter transaction reference"
                      className="erp-input"
                    />
                  </label>
                )}
              </div>
            </div>

            <button
              type="button"
              onClick={() => void completeSale()}
              disabled={
                isCompletingSale ||
                isLoading ||
                cart.length === 0 ||
                netTotal <= 0
              }
              className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-bauraPrimary px-5 text-[11px] font-semibold text-white shadow-bauraButton transition hover:bg-bauraPrimaryDark disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isCompletingSale ? (
                <>
                  <RefreshCw size={15} className="animate-spin" />
                  Completing Sale...
                </>
              ) : (
                <>
                  <Banknote size={15} />
                  Complete Sale · {formatCurrency(netTotal)}
                </>
              )}
            </button>
          </div>
        </section>
      </div>

      <Modal
        open={Boolean(selectedProduct)}
        onClose={() => setSelectedProduct(null)}
        title="Select Product Size"
        subtitle={selectedProduct
          ? `Choose the size for ${getProductName(selectedProduct)}.`
          : ""}
        widthClassName="max-w-lg"
      >
        {selectedProduct && (
          <div className="grid gap-3">
            {(selectedProduct.sizes ?? []).length === 0 ? (
              <EmptyState text="No active sizes are available for this product." />
            ) : (
              selectedProduct.sizes!.map((size) => {
                const availableQty = Number(size.availableQty || 0);
                const isAvailable = availableQty >= 1;
                const key = getCartKey(selectedProduct.id, size.id);
                const existingQty = cart.find(
                  (item) => item.key === key
                )?.qty ?? 0;

                return (
                  <button
                    key={size.id}
                    type="button"
                    disabled={!isAvailable || isCompletingSale}
                    onClick={() => addToCart(selectedProduct, size)}
                    className={`flex items-center justify-between gap-4 rounded-[14px] border p-4 text-left transition ${
                      isAvailable
                        ? "border-bauraBorder bg-white hover:border-bauraGold/60 hover:bg-bauraCanvas2"
                        : "cursor-not-allowed border-bauraBorder bg-bauraCanvas2 opacity-60"
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="text-[12px] font-semibold text-bauraInk">
                        {size.label}
                      </p>
                      <p className="mt-1 text-[10px] font-semibold text-bauraPrimary">
                        {formatCurrency(getSizePrice(size))}
                      </p>
                      <p className="mt-1 text-[9px] text-bauraMuted">
                        {formatQty(availableQty)} available
                        {existingQty > 0 && ` · ${formatQty(existingQty)} in cart`}
                      </p>
                    </div>

                    {isAvailable ? (
                      <ChevronRight size={17} className="shrink-0 text-bauraGoldDark" />
                    ) : (
                      <span className="erp-badge bg-bauraDangerSoft text-bauraDanger">
                        Out of Stock
                      </span>
                    )}
                  </button>
                );
              })
            )}
          </div>
        )}
      </Modal>

      <Modal
        open={Boolean(completedSale)}
        onClose={() => setCompletedSale(null)}
        title="Sale Completed"
        subtitle="Finished Bakery Stock was reduced and the sale was recorded."
        widthClassName="max-w-xl"
      >
        {completedSale && (
          <div className="grid gap-4">
            <div className="rounded-[14px] border border-green-100 bg-bauraSuccessSoft p-4">
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-bauraSuccess">
                  <CheckCircle2 size={17} />
                </div>
                <div>
                  <p className="text-[11px] font-semibold text-bauraSuccess">
                    {completedSale.orderNo}
                  </p>
                  <p className="mt-1 text-[9px] leading-5 text-bauraMuted">
                    Sale completed successfully. The corresponding product-size
                    stock was deducted.
                  </p>
                </div>
              </div>
            </div>

            {completedSale.items && completedSale.items.length > 0 && (
              <div className="rounded-[14px] border border-bauraBorder bg-white p-4">
                <h3 className="mb-3 text-[11px] font-semibold text-bauraInk">
                  Purchased Items
                </h3>

                <div className="grid gap-3">
                  {completedSale.items.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-start justify-between gap-3 border-b border-bauraBorder pb-3 last:border-0 last:pb-0"
                    >
                      <div className="min-w-0">
                        <p className="text-[10px] font-semibold text-bauraInk">
                          {getCompletedItemName(item)}
                        </p>
                        <p className="mt-1 text-[9px] text-bauraMuted">
                          {formatQty(item.qty)} ×{" "}
                          {formatCurrency(item.unitSellPrice)}
                        </p>
                      </div>
                      <p className="text-[10px] font-semibold text-bauraInk">
                        {formatCurrency(item.netTotal)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
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
                label="Payment"
                value={formatPaymentMethod(completedSale.paymentMethod)}
              />

              {completedSale.cogsTotal !== undefined && (
                <PreviewStat
                  label="COGS"
                  value={formatCurrency(completedSale.cogsTotal)}
                />
              )}

              {completedSale.profitTotal !== undefined && (
                <PreviewStat
                  label="Gross Profit"
                  value={formatCurrency(completedSale.profitTotal)}
                />
              )}
            </div>

            <button
              type="button"
              onClick={() => setCompletedSale(null)}
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

function EmptyState({ text }: { text: string }) {
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
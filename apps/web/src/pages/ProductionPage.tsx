/** @format */

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChefHat,
  Eye,
  PackageCheck,
  PackagePlus,
  ReceiptText,
  RefreshCw,
  Search,
  Trash2
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { AppLayout } from "../layouts/AppLayout";
import { apiRequest } from "../lib/api";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { Modal } from "../ui/Modal";
import { useToast } from "../ui/ToastProvider";

type ProductionStatus = "DRAFT" | "POSTED" | "VOID";

type ProductSizeOption = {
  id: string;
  officialSiteSizeId: number;
  label: string;
  price: string | number;
  recipeItemCount: number;
  hasSpecificRecipe: boolean;
  canProduce: boolean;
};

type ProductOption = {
  id: string;
  name: string;
  variantName: string | null;
  displayName: string;
  imageUrl?: string | null;
  sellPrice: string | number;
  recipeItemCount: number;
  canProduce: boolean;
  sizes: ProductSizeOption[];
};

type ProductionBatch = {
  id: string;
  batchNo: string;
  productId: string;
  productSizeId: string | null;
  productSizeLabel: string | null;
  productDisplayName: string;
  productImageUrl?: string | null;
  plannedQty: string;
  producedQty: string;
  rejectedQty: string;
  status: ProductionStatus;
  productionDate: string;
  expiryDate: string | null;
  ingredientCostTotal: string;
  expenseCostTotal: string;
  totalProductionCost: string;
  unitCost: string;
  notes: string | null;
  createdByName: string;
  postedByName: string | null;
  postedAt: string | null;
  bakeryStockRemaining: string | null;
  createdAt: string;
};

type PreviewRequirement = {
  ingredientId: string;
  ingredientDisplayName: string;
  baseUnit: string;
  requiredBaseQty: number;
  availableBaseQty: number;
  shortageBaseQty: number;
  estimatedCost: number;
  isAvailable: boolean;
};

type ProductionExpense = {
  id?: string;
  recipeExpenseId?: string | null;
  name: string;
  category: string;
  calculationMethod: string;
  quantity: number | string;
  rate: number | string;
  totalAmount: number | string;
  description?: string | null;
};

type ProductionPreview = {
  productId: string;
  productSizeId: string | null;
  productSizeLabel: string | null;
  displayName: string;
  attemptedQty: number;
  producedQty: number;
  rejectedQty: number;
  canPost: boolean;
  ingredientCostTotal: number;
  expenseCostTotal: number;
  totalProductionCost: number;
  unitCost: number;
  totalEstimatedCost: number;
  estimatedUnitCost: number | null;
  requirements: PreviewRequirement[];
  expenses: ProductionExpense[];
};

type ProductionDetail = {
  id: string;
  batchNo: string;
  productId: string;
  productSizeId: string | null;
  productSizeLabel: string | null;
  productDisplayName: string;
  plannedQty: string;
  producedQty: string;
  rejectedQty: string;
  status: ProductionStatus;
  productionDate: string;
  expiryDate: string | null;
  ingredientCostTotal: string;
  expenseCostTotal: string;
  totalProductionCost: string;
  unitCost: string;
  notes: string | null;
  createdByName: string;
  postedByName: string | null;
  postedAt: string | null;
  finishedGoodsLot: {
    id: string;
    productSizeId?: string | null;
    producedQty: string;
    remainingQty: string;
    unitCost: string;
    producedAt: string;
    expiryDate: string | null;
  } | null;
  consumptions: Array<{
    id: string;
    ingredientId: string;
    ingredientDisplayName: string;
    stockLotId: string;
    lotNumber: string | null;
    consumedBaseQty: string;
    unitCostBase: string;
    costAmount: string;
  }>;
  expenses: ProductionExpense[];
};

type ProductionForm = {
  productId: string;
  productSizeId: string;
  plannedQty: string;
  producedQty: string;
  rejectedQty: string;
  productionDate: string;
  expiryDate: string;
  notes: string;
};

function toLocalDateTimeInput(date: Date) {
  const pad = (value: number) => String(value).padStart(2, "0");

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function createInitialForm(): ProductionForm {
  return {
    productId: "",
    productSizeId: "",
    plannedQty: "1",
    producedQty: "1",
    rejectedQty: "0",
    productionDate: toLocalDateTimeInput(new Date()),
    expiryDate: "",
    notes: ""
  };
}

function formatCurrency(value: number | string | null | undefined) {
  return `Rs. ${Number(value || 0).toLocaleString("en-LK", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
}

function formatQty(value: number | string | null | undefined) {
  return Number(value || 0).toLocaleString("en-LK", {
    maximumFractionDigits: 3
  });
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "—";

  return new Date(value).toLocaleString("en-LK", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function formatExpenseCategory(value: string) {
  return value
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function getBatchProductName(batch: {
  productDisplayName: string;
  productSizeLabel: string | null;
}) {
  return batch.productSizeLabel
    ? `${batch.productDisplayName} · ${batch.productSizeLabel}`
    : batch.productDisplayName;
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export function ProductionPage() {
  const navigate = useNavigate();
  const toast = useToast();

  const [batches, setBatches] = useState<ProductionBatch[]>([]);
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | ProductionStatus>("ALL");
  const [isLoading, setIsLoading] = useState(true);

  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<ProductionForm>(createInitialForm);
  const [preview, setPreview] = useState<ProductionPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [postingBatch, setPostingBatch] = useState<ProductionBatch | null>(null);
  const [deletingBatch, setDeletingBatch] = useState<ProductionBatch | null>(null);
  const [posting, setPosting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [detail, setDetail] = useState<ProductionDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const previewRequestId = useRef(0);

  const selectedProduct = useMemo(
    () => products.find((product) => product.id === form.productId) ?? null,
    [products, form.productId]
  );

  const selectedSize = useMemo(
    () => selectedProduct?.sizes.find((size) => size.id === form.productSizeId) ?? null,
    [selectedProduct, form.productSizeId]
  );

  const requiresSize = Boolean(selectedProduct?.sizes.length);

  const filtered = useMemo(() => {
    const keyword = search.trim().toLowerCase();

    return batches.filter((batch) => {
      const matchesSearch =
        !keyword ||
        batch.batchNo.toLowerCase().includes(keyword) ||
        batch.productDisplayName.toLowerCase().includes(keyword) ||
        (batch.productSizeLabel ?? "").toLowerCase().includes(keyword);

      return matchesSearch && (statusFilter === "ALL" || batch.status === statusFilter);
    });
  }, [batches, search, statusFilter]);

  const stats = useMemo(() => {
    const drafts = batches.filter((batch) => batch.status === "DRAFT").length;
    const posted = batches.filter((batch) => batch.status === "POSTED");

    return {
      drafts,
      posted: posted.length,
      goodProduced: posted.reduce((total, batch) => total + Number(batch.producedQty), 0),
      remaining: posted.reduce(
        (total, batch) => total + Number(batch.bakeryStockRemaining || 0),
        0
      )
    };
  }, [batches]);

  async function loadData(showSuccess = false) {
    setIsLoading(true);

    const [batchResult, productResult] = await Promise.allSettled([
      apiRequest<{ batches: ProductionBatch[] }>("/production"),
      apiRequest<{ products: ProductOption[] }>("/production/products")
    ]);

    if (batchResult.status === "fulfilled") {
      setBatches(batchResult.value.batches);
    } else {
      toast.error(
        "Unable to load production",
        getErrorMessage(batchResult.reason, "Production API is unavailable.")
      );
    }

    if (productResult.status === "fulfilled") {
      setProducts(productResult.value.products);
    } else {
      toast.error(
        "Unable to load products",
        getErrorMessage(productResult.reason, "Product data is unavailable.")
      );
    }

    if (
      showSuccess &&
      batchResult.status === "fulfilled" &&
      productResult.status === "fulfilled"
    ) {
      toast.success("Production refreshed");
    }

    setIsLoading(false);
  }

  useEffect(() => {
    void loadData();
  }, []);

  useEffect(() => {
    const requestId = ++previewRequestId.current;

    if (!formOpen) {
      setPreview(null);
      setPreviewError(null);
      setPreviewLoading(false);
      return;
    }

    const producedQty = Number(form.producedQty);
    const rejectedQty = Number(form.rejectedQty || 0);

    const canPreview =
      Boolean(form.productId) &&
      (!requiresSize || Boolean(form.productSizeId)) &&
      producedQty > 0 &&
      Number.isFinite(producedQty) &&
      rejectedQty >= 0 &&
      Number.isFinite(rejectedQty);

    if (!canPreview) {
      setPreview(null);
      setPreviewError(null);
      setPreviewLoading(false);
      return;
    }

    setPreview(null);
    setPreviewError(null);
    setPreviewLoading(true);

    const timer = window.setTimeout(async () => {
      try {
        const response = await apiRequest<{ preview: ProductionPreview }>(
          "/production/preview",
          {
            method: "POST",
            body: JSON.stringify({
              productId: form.productId,
              productSizeId: form.productSizeId || null,
              producedQty,
              rejectedQty
            })
          }
        );

        if (requestId !== previewRequestId.current) return;

        setPreview(response.preview);
      } catch (error) {
        if (requestId !== previewRequestId.current) return;

        setPreview(null);
        setPreviewError(
          getErrorMessage(error, "Unable to calculate production requirements.")
        );
      } finally {
        if (requestId === previewRequestId.current) {
          setPreviewLoading(false);
        }
      }
    }, 350);

    return () => window.clearTimeout(timer);
  }, [
    formOpen,
    form.productId,
    form.productSizeId,
    form.producedQty,
    form.rejectedQty,
    requiresSize
  ]);

  function openCreate() {
    setForm(createInitialForm());
    setPreview(null);
    setPreviewError(null);
    setFormOpen(true);
  }

  function closeCreate() {
    if (saving) return;

    previewRequestId.current += 1;
    setFormOpen(false);
    setPreview(null);
    setPreviewError(null);
  }

  function changeProduct(productId: string) {
    setForm((current) => ({
      ...current,
      productId,
      productSizeId: ""
    }));
    setPreview(null);
    setPreviewError(null);
  }

  async function createBatch(postImmediately: boolean) {
    if (!selectedProduct) {
      toast.warning("Select a product", "Choose the product being manufactured.");
      return;
    }

    if (requiresSize && !selectedSize) {
      toast.warning("Select a product size", "Choose the exact size being manufactured.");
      return;
    }

    if (selectedSize && !selectedSize.canProduce) {
      toast.warning(
        "Recipe missing",
        "Configure the recipe for this product size before production."
      );
      return;
    }

    const plannedQty = Number(form.plannedQty);
    const producedQty = Number(form.producedQty);
    const rejectedQty = Number(form.rejectedQty || 0);

    if (
      !Number.isFinite(plannedQty) ||
      !Number.isFinite(producedQty) ||
      !Number.isFinite(rejectedQty) ||
      plannedQty <= 0 ||
      producedQty <= 0 ||
      rejectedQty < 0
    ) {
      toast.warning("Check quantities", "Enter valid production quantities.");
      return;
    }

    if (postImmediately && (!preview || previewLoading || !preview.canPost)) {
      toast.warning(
        "Production not ready",
        previewError || "Wait for a valid preview and ensure ingredient stock is sufficient."
      );
      return;
    }

    setSaving(true);

    try {
      const response = await apiRequest<{ batch: ProductionBatch }>("/production", {
        method: "POST",
        body: JSON.stringify({
          productId: form.productId,
          productSizeId: form.productSizeId || null,
          plannedQty,
          producedQty,
          rejectedQty,
          productionDate: form.productionDate || null,
          expiryDate: form.expiryDate || null,
          notes: form.notes.trim() || null
        })
      });

      if (postImmediately) {
        try {
          await apiRequest(`/production/${response.batch.id}/post`, {
            method: "POST"
          });

          toast.success(
            "Production posted",
            `${response.batch.batchNo} was added to Bakery Stock.`
          );
        } catch (error) {
          toast.warning(
            "Draft saved, posting failed",
            `${response.batch.batchNo} was created as a draft. ${getErrorMessage(
              error,
              "Please review the batch and post it again."
            )}`
          );
        }
      } else {
        toast.success(
          "Draft saved",
          `${response.batch.batchNo} was saved without changing stock.`
        );
      }

      closeCreateAfterSave();
      await loadData();
    } catch (error) {
      toast.error(
        "Production could not be saved",
        getErrorMessage(error, "Please try again.")
      );
    } finally {
      setSaving(false);
    }
  }

  function closeCreateAfterSave() {
    previewRequestId.current += 1;
    setFormOpen(false);
    setPreview(null);
    setPreviewError(null);
  }

  async function postDraft() {
    if (!postingBatch) return;

    setPosting(true);

    try {
      await apiRequest(`/production/${postingBatch.id}/post`, {
        method: "POST"
      });

      toast.success(
        "Production posted",
        `${postingBatch.batchNo} is now available in Bakery Stock.`
      );

      setPostingBatch(null);
      await loadData();
    } catch (error) {
      toast.error(
        "Unable to post production",
        getErrorMessage(error, "Please try again.")
      );
    } finally {
      setPosting(false);
    }
  }

  async function deleteDraft() {
    if (!deletingBatch) return;

    setDeleting(true);

    try {
      await apiRequest(`/production/${deletingBatch.id}`, {
        method: "DELETE"
      });

      toast.success("Draft deleted", deletingBatch.batchNo);
      setDeletingBatch(null);
      await loadData();
    } catch (error) {
      toast.error(
        "Unable to delete draft",
        getErrorMessage(error, "Please try again.")
      );
    } finally {
      setDeleting(false);
    }
  }

  async function openDetail(batchId: string) {
    setDetail(null);
    setDetailLoading(true);

    try {
      const response = await apiRequest<{ batch: ProductionDetail }>(
        `/production/${batchId}`
      );

      setDetail(response.batch);
    } catch (error) {
      toast.error(
        "Unable to load batch",
        getErrorMessage(error, "Please try again.")
      );
    } finally {
      setDetailLoading(false);
    }
  }

  return (
    <AppLayout
      activeItem="Production"
      title="Production"
      subtitle="Convert raw ingredients into sellable finished bakery stock."
      actions={
        <>
          <button
            type="button"
            onClick={() => void loadData(true)}
            className="erp-button-secondary"
          >
            <RefreshCw size={14} className={isLoading ? "animate-spin" : ""} />
            Refresh
          </button>
          <button
            type="button"
            onClick={openCreate}
            className="erp-button-primary"
          >
            <PackagePlus size={14} />
            New Production
          </button>
        </>
      }
    >
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Metric
          label="Draft Batches"
          value={String(stats.drafts)}
          note="Not posted yet"
          icon={<ChefHat size={18} />}
        />
        <Metric
          label="Posted Batches"
          value={String(stats.posted)}
          note="Completed production"
          icon={<CheckCircle2 size={18} />}
        />
        <Metric
          label="Good Output"
          value={formatQty(stats.goodProduced)}
          note="Produced sellable units"
          icon={<PackageCheck size={18} />}
        />
        <Metric
          label="Remaining Stock"
          value={formatQty(stats.remaining)}
          note="Still available from batches"
          icon={<PackageCheck size={18} />}
        />
      </div>

      {!isLoading && batches.length === 0 && (
        <section className="erp-panel mt-4 overflow-hidden">
          <div className="grid lg:grid-cols-[1.25fr_0.75fr]">
            <div className="p-6 sm:p-8">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-bauraGoldSoft text-bauraGoldDark">
                <ChefHat size={20} />
              </div>
              <p className="mt-5 text-[9px] font-semibold uppercase tracking-[0.12em] text-bauraGoldDark">
                Start Production
              </p>
              <h2 className="mt-2 text-[21px] font-semibold tracking-[-0.03em] text-bauraInk">
                No production batches yet
              </h2>
              <p className="mt-2 max-w-xl text-[10px] leading-6 text-bauraMuted">
                Production converts recipe ingredients into finished stock.
                Select the product size, record good and rejected output,
                review production costs, and post the batch.
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={openCreate}
                  className="erp-button-primary"
                >
                  <PackagePlus size={14} />
                  Create First Production
                </button>
                <button
                  type="button"
                  onClick={() => navigate("/dashboard/products")}
                  className="erp-button-secondary"
                >
                  Check Products & Recipes
                </button>
              </div>
            </div>
            <div className="border-t border-bauraBorder bg-bauraCanvas2 p-6 lg:border-l lg:border-t-0">
              <p className="text-[9px] font-semibold uppercase tracking-[0.1em] text-bauraMuted">
                Production Flow
              </p>
              <FlowStep
                number="01"
                title="Select Product & Size"
                text="Choose the exact product variant being manufactured."
              />
              <FlowStep
                number="02"
                title="Review Requirements"
                text="Check ingredient availability and production expenses."
              />
              <FlowStep
                number="03"
                title="Post Batch"
                text="Consume ingredients and add finished goods to Bakery Stock."
              />
            </div>
          </div>
        </section>
      )}

      {(isLoading || batches.length > 0) && (
        <section className="erp-panel mt-4 overflow-hidden">
          <div className="flex flex-col gap-4 border-b border-bauraBorder px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="erp-section-title">Production Batches</h2>
              <p className="erp-section-subtitle">
                {filtered.length} shown · {batches.length} total
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="erp-search sm:w-72">
                <Search size={15} className="text-bauraMuted" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search batch, product or size..."
                  className="w-full bg-transparent text-[11px] outline-none"
                />
              </div>
              <select
                value={statusFilter}
                onChange={(event) =>
                  setStatusFilter(event.target.value as "ALL" | ProductionStatus)
                }
                className="erp-input sm:w-40"
              >
                <option value="ALL">All Status</option>
                <option value="DRAFT">Draft</option>
                <option value="POSTED">Posted</option>
                <option value="VOID">Void</option>
              </select>
            </div>
          </div>

          <div className="baura-scrollbar overflow-x-auto">
            <table className="min-w-full text-left">
              <thead className="erp-table-header">
                <tr>
                  <th className="px-5 py-3">Batch</th>
                  <th className="px-5 py-3">Product / Size</th>
                  <th className="px-5 py-3 text-right">Good</th>
                  <th className="px-5 py-3 text-right">Rejected</th>
                  <th className="px-5 py-3">Production Date</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3 text-right">Total Cost</th>
                  <th className="px-5 py-3 text-right">Unit Cost</th>
                  <th className="px-5 py-3 text-right">Remaining</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-bauraBorder">
                {isLoading ? (
                  <tr>
                    <td colSpan={10} className="px-5 py-12 text-center text-[11px] text-bauraMuted">
                      Loading production batches...
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="px-5 py-12 text-center text-[11px] text-bauraMuted">
                      No production batches match the current filters.
                    </td>
                  </tr>
                ) : (
                  filtered.map((batch) => (
                    <tr
                      key={batch.id}
                      className="bg-white text-[11px] transition hover:bg-bauraCanvas2"
                    >
                      <td className="px-5 py-3.5 font-semibold text-bauraInk">
                        {batch.batchNo}
                      </td>
                      <td className="px-5 py-3.5">
                        <p className="font-semibold text-bauraInk">
                          {batch.productDisplayName}
                        </p>
                        {batch.productSizeLabel && (
                          <p className="mt-0.5 text-[9px] font-medium text-bauraGoldDark">
                            {batch.productSizeLabel}
                          </p>
                        )}
                        <p className="mt-0.5 text-[9px] text-bauraMuted">
                          Planned {formatQty(batch.plannedQty)}
                        </p>
                      </td>
                      <td className="px-5 py-3.5 text-right font-semibold">
                        {formatQty(batch.producedQty)}
                      </td>
                      <td className="px-5 py-3.5 text-right text-bauraMuted">
                        {formatQty(batch.rejectedQty)}
                      </td>
                      <td className="px-5 py-3.5 text-bauraMuted">
                        {formatDateTime(batch.productionDate)}
                      </td>
                      <td className="px-5 py-3.5">
                        <ProductionStatusBadge status={batch.status} />
                      </td>
                      <td className="px-5 py-3.5 text-right font-semibold">
                        {batch.status === "POSTED"
                          ? formatCurrency(batch.totalProductionCost)
                          : "—"}
                      </td>
                      <td className="px-5 py-3.5 text-right font-semibold">
                        {batch.status === "POSTED"
                          ? formatCurrency(batch.unitCost)
                          : "—"}
                      </td>
                      <td className="px-5 py-3.5 text-right font-semibold">
                        {batch.bakeryStockRemaining === null
                          ? "—"
                          : formatQty(batch.bakeryStockRemaining)}
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => void openDetail(batch.id)}
                            className="flex h-8 w-8 items-center justify-center rounded-lg border border-bauraBorder bg-white text-bauraMuted transition hover:bg-bauraGoldSoft/50 hover:text-bauraPrimary"
                            title="View batch"
                          >
                            <Eye size={13} />
                          </button>
                          {batch.status === "DRAFT" && (
                            <>
                              <button
                                type="button"
                                onClick={() => setPostingBatch(batch)}
                                className="flex h-8 items-center gap-1.5 rounded-lg bg-bauraPrimary px-3 text-[9px] font-semibold text-white"
                              >
                                <CheckCircle2 size={12} />
                                Post
                              </button>
                              <button
                                type="button"
                                onClick={() => setDeletingBatch(batch)}
                                className="flex h-8 w-8 items-center justify-center rounded-lg border border-red-100 bg-bauraDangerSoft text-bauraDanger"
                                title="Delete draft"
                              >
                                <Trash2 size={12} />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <Modal
        open={formOpen}
        onClose={closeCreate}
        title="New Production"
        subtitle="Select a product size, review materials and expenses, then save or post."
        widthClassName="max-w-5xl"
      >
        <div className="grid gap-5 lg:grid-cols-[0.85fr_1.15fr]">
          <div className="grid content-start gap-4">
            <label>
              <span className="erp-label">Product</span>
              <select
                value={form.productId}
                onChange={(event) => changeProduct(event.target.value)}
                className="erp-input"
              >
                <option value="">Select product</option>
                {products.map((product) => (
                  <option
                    key={product.id}
                    value={product.id}
                    disabled={!product.canProduce}
                  >
                    {product.displayName}
                    {!product.canProduce ? " — Recipe missing" : ""}
                  </option>
                ))}
              </select>
              {products.length === 0 && (
                <button
                  type="button"
                  onClick={() => {
                    closeCreate();
                    navigate("/dashboard/products");
                  }}
                  className="mt-2 text-[9px] font-semibold text-bauraGoldDark"
                >
                  No products found. Open Products & Recipes →
                </button>
              )}
            </label>

            {requiresSize && (
              <label>
                <span className="erp-label">Product Size</span>
                <select
                  value={form.productSizeId}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      productSizeId: event.target.value
                    }))
                  }
                  className="erp-input"
                >
                  <option value="">Select product size</option>
                  {selectedProduct?.sizes.map((size) => (
                    <option
                      key={size.id}
                      value={size.id}
                      disabled={!size.canProduce}
                    >
                      {size.label}
                      {!size.canProduce ? " — Recipe missing" : ""}
                    </option>
                  ))}
                </select>
                {selectedSize && (
                  <p className="mt-1.5 text-[9px] text-bauraMuted">
                    {selectedSize.hasSpecificRecipe
                      ? "Uses the recipe configured for this size."
                      : "Uses the product's shared recipe."}
                  </p>
                )}
              </label>
            )}

            <div className="grid gap-3 sm:grid-cols-3">
              <QtyInput
                label="Planned Qty"
                value={form.plannedQty}
                onChange={(value) =>
                  setForm((current) => ({ ...current, plannedQty: value }))
                }
              />
              <QtyInput
                label="Good Qty"
                value={form.producedQty}
                onChange={(value) =>
                  setForm((current) => ({ ...current, producedQty: value }))
                }
              />
              <QtyInput
                label="Rejected Qty"
                value={form.rejectedQty}
                onChange={(value) =>
                  setForm((current) => ({ ...current, rejectedQty: value }))
                }
              />
            </div>

            <label>
              <span className="erp-label">Production Date & Time</span>
              <input
                type="datetime-local"
                value={form.productionDate}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    productionDate: event.target.value
                  }))
                }
                className="erp-input"
              />
            </label>

            <label>
              <span className="erp-label">Expiry / Best Before</span>
              <input
                type="datetime-local"
                value={form.expiryDate}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    expiryDate: event.target.value
                  }))
                }
                className="erp-input"
              />
            </label>

            <label>
              <span className="erp-label">Notes</span>
              <textarea
                value={form.notes}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    notes: event.target.value
                  }))
                }
                rows={4}
                className="w-full rounded-xl border border-bauraBorder bg-white px-3.5 py-3 text-[11px] text-bauraInk outline-none transition focus:border-bauraGold focus:ring-4 focus:ring-bauraGold/10"
                placeholder="Optional production note..."
              />
            </label>
          </div>

          <div className="overflow-hidden rounded-[16px] border border-bauraBorder bg-bauraCanvas2">
            <div className="flex items-center justify-between border-b border-bauraBorder px-4 py-3.5">
              <div>
                <p className="text-[11px] font-semibold text-bauraInk">
                  Production Cost Preview
                </p>
                <p className="mt-1 text-[9px] text-bauraMuted">
                  Ingredient requirements and additional production expenses
                </p>
              </div>
              {previewLoading && (
                <RefreshCw size={14} className="animate-spin text-bauraMuted" />
              )}
            </div>

            {previewError ? (
              <div className="flex gap-3 px-4 py-6 text-bauraDanger">
                <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                <p className="text-[10px] leading-5">{previewError}</p>
              </div>
            ) : !preview ? (
              <div className="px-5 py-14 text-center">
                <ChefHat size={24} className="mx-auto text-bauraMuted2" />
                <p className="mt-3 text-[10px] font-medium text-bauraMuted">
                  {previewLoading
                    ? "Calculating production requirements..."
                    : "Select a product, its size and quantities to preview production costs."}
                </p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 border-b border-bauraBorder bg-white sm:grid-cols-4">
                  <PreviewMetric
                    label="Ingredients"
                    value={formatCurrency(preview.ingredientCostTotal)}
                  />
                  <PreviewMetric
                    label="Expenses"
                    value={formatCurrency(preview.expenseCostTotal)}
                  />
                  <PreviewMetric
                    label="Total Cost"
                    value={formatCurrency(preview.totalProductionCost)}
                  />
                  <PreviewMetric
                    label="Cost / Good Unit"
                    value={formatCurrency(preview.unitCost)}
                  />
                </div>

                <div className="baura-scrollbar max-h-[420px] overflow-y-auto bg-white">
                  <div className="flex items-center justify-between border-b border-bauraBorder bg-bauraCanvas2 px-4 py-2.5">
                    <p className="text-[10px] font-semibold text-bauraInk">
                      Ingredient Requirements
                    </p>
                    <span className="text-[9px] text-bauraMuted">
                      {preview.requirements.length} ingredients
                    </span>
                  </div>

                  {preview.requirements.map((item) => (
                    <div
                      key={item.ingredientId}
                      className="border-b border-bauraBorder px-4 py-3"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="text-[10px] font-semibold text-bauraInk">
                            {item.ingredientDisplayName}
                          </p>
                          <p className="mt-1 text-[9px] text-bauraMuted">
                            Need {formatQty(item.requiredBaseQty)} {item.baseUnit}
                            {" · "}
                            Available {formatQty(item.availableBaseQty)} {item.baseUnit}
                          </p>
                          <p className="mt-1 text-[9px] font-medium text-bauraInk">
                            {formatCurrency(item.estimatedCost)}
                          </p>
                        </div>
                        {item.isAvailable ? (
                          <span className="erp-badge bg-bauraSuccessSoft text-bauraSuccess">
                            Ready
                          </span>
                        ) : (
                          <span className="erp-badge bg-bauraDangerSoft text-bauraDanger">
                            Short {formatQty(item.shortageBaseQty)}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}

                  <div className="flex items-center justify-between border-b border-bauraBorder bg-bauraCanvas2 px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <ReceiptText size={13} className="text-bauraGoldDark" />
                      <p className="text-[10px] font-semibold text-bauraInk">
                        Production Expenses
                      </p>
                    </div>
                    <span className="text-[9px] text-bauraMuted">
                      {preview.expenses.length} expenses
                    </span>
                  </div>

                  {preview.expenses.length === 0 ? (
                    <p className="px-4 py-5 text-[10px] text-bauraMuted">
                      No additional production expenses configured for this recipe.
                    </p>
                  ) : (
                    preview.expenses.map((expense, index) => (
                      <div
                        key={expense.recipeExpenseId ?? `${expense.name}-${index}`}
                        className="flex items-start justify-between gap-4 border-b border-bauraBorder px-4 py-3"
                      >
                        <div>
                          <p className="text-[10px] font-semibold text-bauraInk">
                            {expense.name}
                          </p>
                          <p className="mt-1 text-[9px] text-bauraMuted">
                            {formatExpenseCategory(expense.category)}
                            {" · "}
                            {formatQty(expense.quantity)} × {formatCurrency(expense.rate)}
                          </p>
                        </div>
                        <p className="text-[10px] font-semibold text-bauraInk">
                          {formatCurrency(expense.totalAmount)}
                        </p>
                      </div>
                    ))
                  )}
                </div>

                <div className="flex items-center justify-between border-t border-bauraBorder bg-white px-4 py-3">
                  <div>
                    <p className="text-[10px] font-semibold text-bauraInk">
                      {formatQty(preview.attemptedQty)} attempted ·{" "}
                      {formatQty(preview.producedQty)} good
                    </p>
                    <p className="mt-0.5 text-[9px] text-bauraMuted">
                      Rejected units are included in production costs.
                    </p>
                  </div>
                  <span
                    className={
                      preview.canPost
                        ? "erp-badge bg-bauraSuccessSoft text-bauraSuccess"
                        : "erp-badge bg-bauraDangerSoft text-bauraDanger"
                    }
                  >
                    {preview.canPost ? "Ready to Post" : "Stock Shortage"}
                  </span>
                </div>

                {!preview.canPost && (
                  <div className="flex gap-3 border-t border-amber-200 bg-bauraWarningSoft px-4 py-3 text-bauraWarning">
                    <AlertTriangle size={15} className="mt-0.5 shrink-0" />
                    <p className="text-[9px] leading-5">
                      You can save this batch as a draft, but posting requires
                      sufficient ingredient stock.
                    </p>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        <div className="mt-6 flex flex-col-reverse gap-2 border-t border-bauraBorder pt-5 sm:flex-row sm:justify-end">
          <button
            type="button"
            disabled={saving}
            onClick={closeCreate}
            className="erp-button-secondary"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => void createBatch(false)}
            className="erp-button-secondary"
          >
            Save Draft
          </button>
          <button
            type="button"
            disabled={
              saving ||
              previewLoading ||
              !preview ||
              !preview.canPost ||
              Boolean(previewError)
            }
            onClick={() => void createBatch(true)}
            className="erp-button-primary"
          >
            {saving ? (
              <RefreshCw size={14} className="animate-spin" />
            ) : (
              <CheckCircle2 size={14} />
            )}
            Save & Post
          </button>
        </div>
      </Modal>

      <Modal
        open={Boolean(detail) || detailLoading}
        onClose={() => {
          if (!detailLoading) setDetail(null);
        }}
        title={detail?.batchNo || "Production Batch"}
        subtitle={detail ? getBatchProductName(detail) : undefined}
        widthClassName="max-w-4xl"
      >
        {detailLoading || !detail ? (
          <div className="py-12 text-center text-[10px] text-bauraMuted">
            Loading production details...
          </div>
        ) : (
          <div className="grid gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <ProductionStatusBadge status={detail.status} />
              <p className="text-[10px] text-bauraMuted">
                {formatDateTime(detail.productionDate)}
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <DetailMetric label="Good Qty" value={formatQty(detail.producedQty)} />
              <DetailMetric label="Rejected" value={formatQty(detail.rejectedQty)} />
              <DetailMetric
                label="Ingredient Cost"
                value={formatCurrency(detail.ingredientCostTotal)}
              />
              <DetailMetric
                label="Expense Cost"
                value={formatCurrency(detail.expenseCostTotal)}
              />
              <DetailMetric
                label="Total Cost"
                value={formatCurrency(detail.totalProductionCost)}
              />
              <DetailMetric label="Unit Cost" value={formatCurrency(detail.unitCost)} />
              <DetailMetric
                label="Stock Remaining"
                value={
                  detail.finishedGoodsLot
                    ? formatQty(detail.finishedGoodsLot.remainingQty)
                    : "—"
                }
              />
              <DetailMetric
                label="Expiry"
                value={formatDateTime(detail.expiryDate)}
              />
            </div>

            <div className="erp-panel overflow-hidden shadow-none">
              <div className="border-b border-bauraBorder px-4 py-3">
                <p className="text-[11px] font-semibold text-bauraInk">
                  Ingredient Consumption
                </p>
              </div>
              {detail.consumptions.length === 0 ? (
                <p className="px-4 py-8 text-center text-[10px] text-bauraMuted">
                  This batch has not consumed ingredients yet.
                </p>
              ) : (
                <div className="divide-y divide-bauraBorder">
                  {detail.consumptions.map((item) => (
                    <div
                      key={item.id}
                      className="grid gap-2 px-4 py-3 text-[10px] sm:grid-cols-[1fr_auto_auto] sm:items-center"
                    >
                      <div>
                        <p className="font-semibold text-bauraInk">
                          {item.ingredientDisplayName}
                        </p>
                        <p className="mt-0.5 text-[9px] text-bauraMuted">
                          Lot {item.lotNumber || "—"}
                        </p>
                      </div>
                      <p>{formatQty(item.consumedBaseQty)}</p>
                      <p className="font-semibold">
                        {formatCurrency(item.costAmount)}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="erp-panel overflow-hidden shadow-none">
              <div className="flex items-center gap-2 border-b border-bauraBorder px-4 py-3">
                <ReceiptText size={14} className="text-bauraGoldDark" />
                <p className="text-[11px] font-semibold text-bauraInk">
                  Production Expenses
                </p>
              </div>
              {detail.expenses.length === 0 ? (
                <p className="px-4 py-8 text-center text-[10px] text-bauraMuted">
                  No production expenses recorded for this batch.
                </p>
              ) : (
                <div className="divide-y divide-bauraBorder">
                  {detail.expenses.map((expense, index) => (
                    <div
                      key={expense.id ?? `${expense.name}-${index}`}
                      className="flex items-center justify-between gap-4 px-4 py-3"
                    >
                      <div>
                        <p className="text-[10px] font-semibold text-bauraInk">
                          {expense.name}
                        </p>
                        <p className="mt-1 text-[9px] text-bauraMuted">
                          {formatExpenseCategory(expense.category)}
                          {" · "}
                          {formatQty(expense.quantity)} × {formatCurrency(expense.rate)}
                        </p>
                      </div>
                      <p className="text-[10px] font-semibold text-bauraInk">
                        {formatCurrency(expense.totalAmount)}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {detail.notes && (
              <div className="rounded-xl border border-bauraBorder bg-bauraCanvas2 p-4">
                <p className="text-[9px] font-semibold uppercase tracking-[0.09em] text-bauraMuted">
                  Production Notes
                </p>
                <p className="mt-2 whitespace-pre-wrap text-[10px] leading-5 text-bauraInk">
                  {detail.notes}
                </p>
              </div>
            )}

            <div className="flex flex-wrap justify-between gap-2 border-t border-bauraBorder pt-3 text-[9px] text-bauraMuted">
              <span>Created by {detail.createdByName}</span>
              {detail.postedByName && (
                <span>
                  Posted by {detail.postedByName}
                  {detail.postedAt ? ` · ${formatDateTime(detail.postedAt)}` : ""}
                </span>
              )}
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={Boolean(postingBatch)}
        title="Post production batch?"
        message={
          postingBatch
            ? `${postingBatch.batchNo} will consume raw ingredients, record production expenses and add ${formatQty(postingBatch.producedQty)} units of ${getBatchProductName(postingBatch)} to Bakery Stock.`
            : ""
        }
        confirmText="Post Production"
        isLoading={posting}
        onCancel={() => !posting && setPostingBatch(null)}
        onConfirm={postDraft}
      />

      <ConfirmDialog
        open={Boolean(deletingBatch)}
        title="Delete production draft?"
        message={
          deletingBatch
            ? `${deletingBatch.batchNo} has not changed stock yet and will be permanently deleted.`
            : ""
        }
        confirmText="Delete Draft"
        isDanger
        isLoading={deleting}
        onCancel={() => !deleting && setDeletingBatch(null)}
        onConfirm={deleteDraft}
      />
    </AppLayout>
  );
}

function Metric({
  label,
  value,
  note,
  icon
}: {
  label: string;
  value: string;
  note: string;
  icon: ReactNode;
}) {
  return (
    <div className="erp-kpi">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[9px] font-semibold uppercase tracking-[0.09em] text-bauraMuted">
            {label}
          </p>
          <p className="mt-2 text-[22px] font-semibold tracking-[-0.04em] text-bauraInk">
            {value}
          </p>
          <p className="mt-1 text-[9px] text-bauraMuted">{note}</p>
        </div>
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-bauraGoldSoft text-bauraGoldDark">
          {icon}
        </div>
      </div>
    </div>
  );
}

function FlowStep({
  number,
  title,
  text
}: {
  number: string;
  title: string;
  text: string;
}) {
  return (
    <div className="mt-4 flex gap-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-bauraGoldSoft text-[9px] font-bold text-bauraGoldDark">
        {number}
      </div>
      <div>
        <p className="text-[10px] font-semibold text-bauraInk">{title}</p>
        <p className="mt-0.5 text-[9px] leading-5 text-bauraMuted">{text}</p>
      </div>
    </div>
  );
}

function QtyInput({
  label,
  value,
  onChange
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label>
      <span className="erp-label">{label}</span>
      <input
        type="number"
        min="0"
        step="0.001"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="erp-input"
      />
    </label>
  );
}

function PreviewMetric({
  label,
  value,
  good
}: {
  label: string;
  value: string;
  good?: boolean;
}) {
  return (
    <div className="border-r border-bauraBorder px-3 py-3 last:border-r-0">
      <p className="text-[8px] font-semibold uppercase tracking-[0.09em] text-bauraMuted">
        {label}
      </p>
      <p
        className={`mt-1 text-[10px] font-semibold ${
          good === false
            ? "text-bauraDanger"
            : good === true
              ? "text-bauraSuccess"
              : "text-bauraInk"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function DetailMetric({
  label,
  value
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-bauraBorder bg-bauraCanvas2 p-4">
      <p className="text-[8px] font-semibold uppercase tracking-[0.09em] text-bauraMuted">
        {label}
      </p>
      <p className="mt-2 text-[12px] font-semibold text-bauraInk">{value}</p>
    </div>
  );
}

function ProductionStatusBadge({
  status
}: {
  status: ProductionStatus;
}) {
  if (status === "POSTED") {
    return (
      <span className="erp-badge bg-bauraSuccessSoft text-bauraSuccess">
        Posted
      </span>
    );
  }

  if (status === "VOID") {
    return (
      <span className="erp-badge bg-bauraDangerSoft text-bauraDanger">
        Void
      </span>
    );
  }

  return (
    <span className="erp-badge bg-bauraWarningSoft text-bauraWarning">
      Draft
    </span>
  );
}
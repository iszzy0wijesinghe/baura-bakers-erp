import {
  useEffect,
  useMemo,
  useState
} from "react";

import {
  AlertTriangle,
  CheckCircle2,
  ChefHat,
  Eye,
  PackageCheck,
  PackagePlus,
  RefreshCw,
  Search,
  Trash2
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
  ConfirmDialog
} from "../ui/ConfirmDialog";

import {
  Modal
} from "../ui/Modal";

import {
  useToast
} from "../ui/ToastProvider";

type ProductionStatus =
  | "DRAFT"
  | "POSTED"
  | "VOID";

type ProductOption = {
  id: string;
  name: string;

  variantName:
    | string
    | null;

  displayName:
    string;

  sellPrice:
    string;

  recipeItemCount:
    number;

  canProduce:
    boolean;
};

type ProductionBatch = {
  id: string;
  batchNo: string;
  productId: string;
  productDisplayName: string;
  plannedQty: string;
  producedQty: string;
  rejectedQty: string;
  status: ProductionStatus;
  productionDate: string;

  expiryDate:
    | string
    | null;

  ingredientCostTotal:
    string;

  unitCost:
    string;

  notes:
    | string
    | null;

  createdByName:
    string;

  postedByName:
    | string
    | null;

  postedAt:
    | string
    | null;

  bakeryStockRemaining:
    | string
    | null;

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

type ProductionPreview = {
  productId: string;
  displayName: string;
  attemptedQty: number;
  producedQty: number;
  rejectedQty: number;
  canPost: boolean;
  totalEstimatedCost: number;

  estimatedUnitCost:
    | number
    | null;

  requirements:
    PreviewRequirement[];
};

type ProductionDetail = {
  id: string;
  batchNo: string;
  productId: string;
  productDisplayName: string;
  plannedQty: string;
  producedQty: string;
  rejectedQty: string;
  status: ProductionStatus;
  productionDate: string;

  expiryDate:
    | string
    | null;

  ingredientCostTotal:
    string;

  unitCost:
    string;

  notes:
    | string
    | null;

  createdByName:
    string;

  postedByName:
    | string
    | null;

  postedAt:
    | string
    | null;

  finishedGoodsLot: {
    id: string;
    producedQty: string;
    remainingQty: string;
    unitCost: string;
    producedAt: string;

    expiryDate:
      | string
      | null;
  } | null;

  consumptions: Array<{
    id: string;
    ingredientId: string;
    ingredientDisplayName:
      string;
    stockLotId: string;

    lotNumber:
      | string
      | null;

    consumedBaseQty:
      string;

    unitCostBase:
      string;

    costAmount:
      string;
  }>;
};

type ProductionForm = {
  productId: string;
  plannedQty: string;
  producedQty: string;
  rejectedQty: string;
  productionDate: string;
  expiryDate: string;
  notes: string;
};

function toLocalDateTimeInput(
  date: Date
) {
  const pad = (
    value: number
  ) =>
    String(value).padStart(
      2,
      "0"
    );

  return `${date.getFullYear()}-${pad(
    date.getMonth() + 1
  )}-${pad(
    date.getDate()
  )}T${pad(
    date.getHours()
  )}:${pad(
    date.getMinutes()
  )}`;
}

function createInitialForm():
  ProductionForm {
  return {
    productId: "",
    plannedQty: "1",
    producedQty: "1",
    rejectedQty: "0",

    productionDate:
      toLocalDateTimeInput(
        new Date()
      ),

    expiryDate: "",
    notes: ""
  };
}

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

export function ProductionPage() {
  const navigate =
    useNavigate();

  const toast =
    useToast();

  const [
    batches,
    setBatches
  ] =
    useState<
      ProductionBatch[]
    >([]);

  const [
    products,
    setProducts
  ] =
    useState<
      ProductOption[]
    >([]);

  const [
    search,
    setSearch
  ] =
    useState("");

  const [
    statusFilter,
    setStatusFilter
  ] =
    useState<
      | "ALL"
      | ProductionStatus
    >("ALL");

  const [
    isLoading,
    setIsLoading
  ] =
    useState(true);

  const [
    formOpen,
    setFormOpen
  ] =
    useState(false);

  const [
    form,
    setForm
  ] =
    useState<ProductionForm>(
      createInitialForm
    );

  const [
    preview,
    setPreview
  ] =
    useState<
      ProductionPreview | null
    >(null);

  const [
    previewLoading,
    setPreviewLoading
  ] =
    useState(false);

  const [
    saving,
    setSaving
  ] =
    useState(false);

  const [
    postingBatch,
    setPostingBatch
  ] =
    useState<
      ProductionBatch | null
    >(null);

  const [
    deletingBatch,
    setDeletingBatch
  ] =
    useState<
      ProductionBatch | null
    >(null);

  const [
    posting,
    setPosting
  ] =
    useState(false);

  const [
    deleting,
    setDeleting
  ] =
    useState(false);

  const [
    detail,
    setDetail
  ] =
    useState<
      ProductionDetail | null
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

      return batches.filter(
        (batch) => {
          const matchesSearch =
            !keyword ||
            batch.batchNo
              .toLowerCase()
              .includes(
                keyword
              ) ||
            batch.productDisplayName
              .toLowerCase()
              .includes(
                keyword
              );

          const matchesStatus =
            statusFilter ===
              "ALL" ||
            batch.status ===
              statusFilter;

          return (
            matchesSearch &&
            matchesStatus
          );
        }
      );
    }, [
      batches,
      search,
      statusFilter
    ]);

  const stats =
    useMemo(() => {
      const drafts =
        batches.filter(
          (batch) =>
            batch.status ===
            "DRAFT"
        ).length;

      const posted =
        batches.filter(
          (batch) =>
            batch.status ===
            "POSTED"
        );

      const goodProduced =
        posted.reduce(
          (total, batch) =>
            total +
            Number(
              batch.producedQty
            ),
          0
        );

      const remaining =
        posted.reduce(
          (total, batch) =>
            total +
            Number(
              batch.bakeryStockRemaining ||
                0
            ),
          0
        );

      return {
        drafts,
        posted:
          posted.length,
        goodProduced,
        remaining
      };
    }, [
      batches
    ]);

  async function loadData(
    showSuccess = false
  ) {
    setIsLoading(
      true
    );

    const [
      batchResult,
      productResult
    ] =
      await Promise.allSettled([
        apiRequest<{
          batches:
            ProductionBatch[];
        }>(
          "/production"
        ),

        apiRequest<{
          products:
            ProductOption[];
        }>(
          "/production/products"
        )
      ]);

    if (
      batchResult.status ===
      "fulfilled"
    ) {
      setBatches(
        batchResult.value
          .batches
      );
    } else {
      toast.error(
        "Unable to load production",

        batchResult.reason instanceof
          Error
          ? batchResult.reason
              .message
          : "Production API is unavailable."
      );
    }

    if (
      productResult.status ===
      "fulfilled"
    ) {
      setProducts(
        productResult.value
          .products
      );
    } else {
      toast.error(
        "Unable to load products",

        productResult.reason instanceof
          Error
          ? productResult.reason
              .message
          : "Product data is unavailable."
      );
    }

    if (
      showSuccess &&
      batchResult.status ===
        "fulfilled" &&
      productResult.status ===
        "fulfilled"
    ) {
      toast.success(
        "Production refreshed"
      );
    }

    setIsLoading(
      false
    );
  }

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (!formOpen) {
      return;
    }

    const producedQty =
      Number(
        form.producedQty
      );

    const rejectedQty =
      Number(
        form.rejectedQty ||
          0
      );

    if (
      !form.productId ||
      producedQty <= 0 ||
      rejectedQty < 0
    ) {
      setPreview(null);
      return;
    }

    const timer =
      window.setTimeout(
        async () => {
          setPreviewLoading(
            true
          );

          try {
            const response =
              await apiRequest<{
                preview:
                  ProductionPreview;
              }>(
                "/production/preview",
                {
                  method:
                    "POST",

                  body:
                    JSON.stringify(
                      {
                        productId:
                          form.productId,

                        producedQty,

                        rejectedQty
                      }
                    )
                }
              );

            setPreview(
              response.preview
            );
          } catch {
            setPreview(
              null
            );
          } finally {
            setPreviewLoading(
              false
            );
          }
        },
        300
      );

    return () =>
      window.clearTimeout(
        timer
      );
  }, [
    formOpen,
    form.productId,
    form.producedQty,
    form.rejectedQty
  ]);

  function openCreate() {
    setForm(
      createInitialForm()
    );

    setPreview(null);
    setFormOpen(true);
  }

  async function createBatch(
    postImmediately: boolean
  ) {
    if (
      !form.productId
    ) {
      toast.warning(
        "Select a product",
        "Choose the baked or prepared product."
      );

      return;
    }

    const plannedQty =
      Number(
        form.plannedQty
      );

    const producedQty =
      Number(
        form.producedQty
      );

    const rejectedQty =
      Number(
        form.rejectedQty ||
          0
      );

    if (
      plannedQty <= 0 ||
      producedQty <= 0 ||
      rejectedQty < 0
    ) {
      toast.warning(
        "Check quantities",
        "Enter valid production quantities."
      );

      return;
    }

    if (
      postImmediately &&
      preview &&
      !preview.canPost
    ) {
      toast.warning(
        "Raw material shortage",
        "This batch cannot be posted until sufficient ingredients are available."
      );

      return;
    }

    setSaving(
      true
    );

    try {
      const response =
        await apiRequest<{
          batch:
            ProductionBatch;
        }>(
          "/production",
          {
            method: "POST",

            body:
              JSON.stringify(
                {
                  productId:
                    form.productId,

                  plannedQty,

                  producedQty,

                  rejectedQty,

                  productionDate:
                    form.productionDate ||
                    null,

                  expiryDate:
                    form.expiryDate ||
                    null,

                  notes:
                    form.notes.trim() ||
                    null
                }
              )
          }
        );

      if (
        postImmediately
      ) {
        await apiRequest(
          `/production/${response.batch.id}/post`,
          {
            method:
              "POST"
          }
        );

        toast.success(
          "Production posted",
          `${response.batch.batchNo} was added to Bakery Stock.`
        );
      } else {
        toast.success(
          "Draft saved",
          `${response.batch.batchNo} was saved without changing stock.`
        );
      }

      setFormOpen(
        false
      );

      await loadData();
    } catch (error) {
      toast.error(
        "Production could not be saved",

        error instanceof Error
          ? error.message
          : "Please try again."
      );
    } finally {
      setSaving(
        false
      );
    }
  }

  async function postDraft() {
    if (
      !postingBatch
    ) {
      return;
    }

    setPosting(
      true
    );

    try {
      await apiRequest(
        `/production/${postingBatch.id}/post`,
        {
          method:
            "POST"
        }
      );

      toast.success(
        "Production posted",
        `${postingBatch.batchNo} is now available in Bakery Stock.`
      );

      setPostingBatch(
        null
      );

      await loadData();
    } catch (error) {
      toast.error(
        "Unable to post production",

        error instanceof Error
          ? error.message
          : "Please try again."
      );
    } finally {
      setPosting(
        false
      );
    }
  }

  async function deleteDraft() {
    if (
      !deletingBatch
    ) {
      return;
    }

    setDeleting(
      true
    );

    try {
      await apiRequest(
        `/production/${deletingBatch.id}`,
        {
          method:
            "DELETE"
        }
      );

      toast.success(
        "Draft deleted",
        deletingBatch.batchNo
      );

      setDeletingBatch(
        null
      );

      await loadData();
    } catch (error) {
      toast.error(
        "Unable to delete draft",

        error instanceof Error
          ? error.message
          : "Please try again."
      );
    } finally {
      setDeleting(
        false
      );
    }
  }

  async function openDetail(
    batchId: string
  ) {
    setDetailLoading(
      true
    );

    try {
      const response =
        await apiRequest<{
          batch:
            ProductionDetail;
        }>(
          `/production/${batchId}`
        );

      setDetail(
        response.batch
      );
    } catch (error) {
      toast.error(
        "Unable to load batch",

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

  return (
    <AppLayout
      activeItem="Production"
      title="Production"
      subtitle="Convert raw ingredients into sellable finished bakery stock."
      actions={
        <>
          <button
            type="button"
            onClick={() =>
              loadData(true)
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
              openCreate
            }
            className="erp-button-primary"
          >
            <PackagePlus
              size={14}
            />

            New Production
          </button>
        </>
      }
    >
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Metric
          label="Draft Batches"
          value={String(
            stats.drafts
          )}
          note="Not posted yet"
          icon={
            <ChefHat
              size={18}
            />
          }
        />

        <Metric
          label="Posted Batches"
          value={String(
            stats.posted
          )}
          note="Completed production"
          icon={
            <CheckCircle2
              size={18}
            />
          }
        />

        <Metric
          label="Good Output"
          value={formatQty(
            stats.goodProduced
          )}
          note="Produced sellable units"
          icon={
            <PackageCheck
              size={18}
            />
          }
        />

        <Metric
          label="Remaining Stock"
          value={formatQty(
            stats.remaining
          )}
          note="Still available from batches"
          icon={
            <PackageCheck
              size={18}
            />
          }
        />
      </div>

      {!isLoading &&
        batches.length ===
          0 && (
          <section className="erp-panel mt-4 overflow-hidden">
            <div className="grid lg:grid-cols-[1.25fr_0.75fr]">
              <div className="p-6 sm:p-8">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-bauraGoldSoft text-bauraGoldDark">
                  <ChefHat
                    size={20}
                  />
                </div>

                <p className="mt-5 text-[9px] font-semibold uppercase tracking-[0.12em] text-bauraGoldDark">
                  Start Production
                </p>

                <h2 className="mt-2 text-[21px] font-semibold tracking-[-0.03em] text-bauraInk">
                  No production batches yet
                </h2>

                <p className="mt-2 max-w-xl text-[10px] leading-6 text-bauraMuted">
                  Production is where baked or prepared items enter the ERP.
                  When a batch is posted, recipe ingredients are deducted
                  and only the good quantity enters Bakery Stock.
                </p>

                <div className="mt-5 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={
                      openCreate
                    }
                    className="erp-button-primary"
                  >
                    <PackagePlus
                      size={14}
                    />

                    Create First Production
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      navigate(
                        "/dashboard/products"
                      )
                    }
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
                  title="Select Product"
                  text="Choose a product with a valid recipe."
                />

                <FlowStep
                  number="02"
                  title="Enter Output"
                  text="Record good and rejected quantities."
                />

                <FlowStep
                  number="03"
                  title="Post Batch"
                  text="Ingredients decrease and Bakery Stock increases."
                />
              </div>
            </div>
          </section>
        )}

      {(isLoading ||
        batches.length >
          0) && (
        <section className="erp-panel mt-4 overflow-hidden">
          <div className="flex flex-col gap-4 border-b border-bauraBorder px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="erp-section-title">
                Production Batches
              </h2>

              <p className="erp-section-subtitle">
                {filtered.length} shown ·{" "}
                {batches.length} total
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
                  placeholder="Search batch or product..."
                  className="w-full bg-transparent text-[11px] outline-none"
                />
              </div>

              <select
                value={
                  statusFilter
                }
                onChange={(
                  event
                ) =>
                  setStatusFilter(
                    event.target
                      .value as
                      | "ALL"
                      | ProductionStatus
                  )
                }
                className="erp-input sm:w-40"
              >
                <option value="ALL">
                  All Status
                </option>

                <option value="DRAFT">
                  Draft
                </option>

                <option value="POSTED">
                  Posted
                </option>

                <option value="VOID">
                  Void
                </option>
              </select>
            </div>
          </div>

          <div className="baura-scrollbar overflow-x-auto">
            <table className="min-w-full text-left">
              <thead className="erp-table-header">
                <tr>
                  <th className="px-5 py-3">
                    Batch
                  </th>

                  <th className="px-5 py-3">
                    Product
                  </th>

                  <th className="px-5 py-3 text-right">
                    Good
                  </th>

                  <th className="px-5 py-3 text-right">
                    Rejected
                  </th>

                  <th className="px-5 py-3">
                    Production Date
                  </th>

                  <th className="px-5 py-3">
                    Status
                  </th>

                  <th className="px-5 py-3 text-right">
                    Unit Cost
                  </th>

                  <th className="px-5 py-3 text-right">
                    Remaining
                  </th>

                  <th className="px-5 py-3 text-right">
                    Actions
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-bauraBorder">
                {isLoading ? (
                  <tr>
                    <td
                      colSpan={9}
                      className="px-5 py-12 text-center text-[11px] text-bauraMuted"
                    >
                      Loading production batches...
                    </td>
                  </tr>
                ) : filtered.length ===
                  0 ? (
                  <tr>
                    <td
                      colSpan={9}
                      className="px-5 py-12 text-center text-[11px] text-bauraMuted"
                    >
                      No production batches match the current filters.
                    </td>
                  </tr>
                ) : (
                  filtered.map(
                    (batch) => (
                      <tr
                        key={
                          batch.id
                        }
                        className="bg-white text-[11px] transition hover:bg-bauraCanvas2"
                      >
                        <td className="px-5 py-3.5 font-semibold text-bauraInk">
                          {
                            batch.batchNo
                          }
                        </td>

                        <td className="px-5 py-3.5">
                          <p className="font-semibold text-bauraInk">
                            {
                              batch.productDisplayName
                            }
                          </p>

                          <p className="mt-0.5 text-[9px] text-bauraMuted">
                            Planned{" "}
                            {formatQty(
                              batch.plannedQty
                            )}
                          </p>
                        </td>

                        <td className="px-5 py-3.5 text-right font-semibold">
                          {formatQty(
                            batch.producedQty
                          )}
                        </td>

                        <td className="px-5 py-3.5 text-right text-bauraMuted">
                          {formatQty(
                            batch.rejectedQty
                          )}
                        </td>

                        <td className="px-5 py-3.5 text-bauraMuted">
                          {formatDateTime(
                            batch.productionDate
                          )}
                        </td>

                        <td className="px-5 py-3.5">
                          <ProductionStatusBadge
                            status={
                              batch.status
                            }
                          />
                        </td>

                        <td className="px-5 py-3.5 text-right font-semibold">
                          {batch.status ===
                          "POSTED"
                            ? formatCurrency(
                                batch.unitCost
                              )
                            : "—"}
                        </td>

                        <td className="px-5 py-3.5 text-right font-semibold">
                          {batch.bakeryStockRemaining ===
                          null
                            ? "—"
                            : formatQty(
                                batch.bakeryStockRemaining
                              )}
                        </td>

                        <td className="px-5 py-3.5">
                          <div className="flex justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() =>
                                openDetail(
                                  batch.id
                                )
                              }
                              className="flex h-8 w-8 items-center justify-center rounded-lg border border-bauraBorder bg-white text-bauraMuted transition hover:bg-bauraGoldSoft/50 hover:text-bauraPrimary"
                              title="View batch"
                            >
                              <Eye
                                size={13}
                              />
                            </button>

                            {batch.status ===
                              "DRAFT" && (
                              <>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setPostingBatch(
                                      batch
                                    )
                                  }
                                  className="flex h-8 items-center gap-1.5 rounded-lg bg-bauraPrimary px-3 text-[9px] font-semibold text-white"
                                >
                                  <CheckCircle2
                                    size={12}
                                  />

                                  Post
                                </button>

                                <button
                                  type="button"
                                  onClick={() =>
                                    setDeletingBatch(
                                      batch
                                    )
                                  }
                                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-red-100 bg-bauraDangerSoft text-bauraDanger"
                                >
                                  <Trash2
                                    size={12}
                                  />
                                </button>
                              </>
                            )}
                          </div>
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
          formOpen
        }
        onClose={() => {
          if (
            !saving
          ) {
            setFormOpen(
              false
            );
          }
        }}
        title="New Production"
        subtitle="Record actual output and check material availability before posting."
        widthClassName="max-w-4xl"
      >
        <div className="grid gap-5 lg:grid-cols-[0.85fr_1.15fr]">
          <div className="grid content-start gap-4">
            <label>
              <span className="erp-label">
                Product
              </span>

              <select
                value={
                  form.productId
                }
                onChange={(
                  event
                ) =>
                  setForm(
                    (current) => ({
                      ...current,
                      productId:
                        event.target
                          .value
                    })
                  )
                }
                className="erp-input"
              >
                <option value="">
                  Select product
                </option>

                {products.map(
                  (product) => (
                    <option
                      key={
                        product.id
                      }
                      value={
                        product.id
                      }
                      disabled={
                        !product.canProduce
                      }
                    >
                      {
                        product.displayName
                      }
                      {!product.canProduce
                        ? " — Recipe missing"
                        : ""}
                    </option>
                  )
                )}
              </select>

              {products.length ===
                0 && (
                <button
                  type="button"
                  onClick={() => {
                    setFormOpen(
                      false
                    );

                    navigate(
                      "/dashboard/products"
                    );
                  }}
                  className="mt-2 text-[9px] font-semibold text-bauraGoldDark"
                >
                  No products found. Open Products & Recipes →
                </button>
              )}
            </label>

            <div className="grid gap-3 sm:grid-cols-3">
              <QtyInput
                label="Planned Qty"
                value={
                  form.plannedQty
                }
                onChange={(
                  value
                ) =>
                  setForm(
                    (current) => ({
                      ...current,
                      plannedQty:
                        value
                    })
                  )
                }
              />

              <QtyInput
                label="Good Qty"
                value={
                  form.producedQty
                }
                onChange={(
                  value
                ) =>
                  setForm(
                    (current) => ({
                      ...current,
                      producedQty:
                        value
                    })
                  )
                }
              />

              <QtyInput
                label="Rejected Qty"
                value={
                  form.rejectedQty
                }
                onChange={(
                  value
                ) =>
                  setForm(
                    (current) => ({
                      ...current,
                      rejectedQty:
                        value
                    })
                  )
                }
              />
            </div>

            <label>
              <span className="erp-label">
                Production Date & Time
              </span>

              <input
                type="datetime-local"
                value={
                  form.productionDate
                }
                onChange={(
                  event
                ) =>
                  setForm(
                    (current) => ({
                      ...current,

                      productionDate:
                        event.target
                          .value
                    })
                  )
                }
                className="erp-input"
              />
            </label>

            <label>
              <span className="erp-label">
                Expiry / Best Before
              </span>

              <input
                type="datetime-local"
                value={
                  form.expiryDate
                }
                onChange={(
                  event
                ) =>
                  setForm(
                    (current) => ({
                      ...current,

                      expiryDate:
                        event.target
                          .value
                    })
                  )
                }
                className="erp-input"
              />
            </label>

            <label>
              <span className="erp-label">
                Notes
              </span>

              <textarea
                value={
                  form.notes
                }
                onChange={(
                  event
                ) =>
                  setForm(
                    (current) => ({
                      ...current,
                      notes:
                        event.target
                          .value
                    })
                  )
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
                  Material Requirement
                </p>

                <p className="mt-1 text-[9px] text-bauraMuted">
                  Ingredients required for good + rejected output
                </p>
              </div>

              {previewLoading && (
                <RefreshCw
                  size={14}
                  className="animate-spin text-bauraMuted"
                />
              )}
            </div>

            {!preview ? (
              <div className="px-5 py-14 text-center">
                <ChefHat
                  size={24}
                  className="mx-auto text-bauraMuted2"
                />

                <p className="mt-3 text-[10px] font-medium text-bauraMuted">
                  Select a product and enter quantities to calculate material requirements.
                </p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-3 border-b border-bauraBorder bg-white">
                  <PreviewMetric
                    label="Material Cost"
                    value={formatCurrency(
                      preview.totalEstimatedCost
                    )}
                  />

                  <PreviewMetric
                    label="Cost / Good Unit"
                    value={
                      preview.estimatedUnitCost ===
                      null
                        ? "—"
                        : formatCurrency(
                            preview.estimatedUnitCost
                          )
                    }
                  />

                  <PreviewMetric
                    label="Status"
                    value={
                      preview.canPost
                        ? "Ready"
                        : "Shortage"
                    }
                    good={
                      preview.canPost
                    }
                  />
                </div>

                <div className="baura-scrollbar max-h-[330px] overflow-auto bg-white">
                  {preview.requirements.map(
                    (item) => (
                      <div
                        key={
                          item.ingredientId
                        }
                        className="border-b border-bauraBorder px-4 py-3 last:border-b-0"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <p className="text-[10px] font-semibold text-bauraInk">
                              {
                                item.ingredientDisplayName
                              }
                            </p>

                            <p className="mt-1 text-[9px] text-bauraMuted">
                              Need{" "}
                              {formatQty(
                                item.requiredBaseQty
                              )}{" "}
                              {
                                item.baseUnit
                              }{" "}
                              · Available{" "}
                              {formatQty(
                                item.availableBaseQty
                              )}{" "}
                              {
                                item.baseUnit
                              }
                            </p>
                          </div>

                          {item.isAvailable ? (
                            <span className="erp-badge bg-bauraSuccessSoft text-bauraSuccess">
                              Ready
                            </span>
                          ) : (
                            <span className="erp-badge bg-bauraDangerSoft text-bauraDanger">
                              Short{" "}
                              {formatQty(
                                item.shortageBaseQty
                              )}
                            </span>
                          )}
                        </div>
                      </div>
                    )
                  )}
                </div>

                {!preview.canPost && (
                  <div className="flex gap-3 border-t border-amber-200 bg-bauraWarningSoft px-4 py-3 text-bauraWarning">
                    <AlertTriangle
                      size={15}
                      className="mt-0.5 shrink-0"
                    />

                    <p className="text-[9px] leading-5">
                      You can save this as a draft, but it cannot be posted until ingredient stock is sufficient.
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
            disabled={
              saving
            }
            onClick={() =>
              setFormOpen(
                false
              )
            }
            className="erp-button-secondary"
          >
            Cancel
          </button>

          <button
            type="button"
            disabled={
              saving
            }
            onClick={() =>
              createBatch(
                false
              )
            }
            className="erp-button-secondary"
          >
            Save Draft
          </button>

          <button
            type="button"
            disabled={
              saving ||
              Boolean(
                preview &&
                  !preview.canPost
              )
            }
            onClick={() =>
              createBatch(
                true
              )
            }
            className="erp-button-primary"
          >
            {saving ? (
              <RefreshCw
                size={14}
                className="animate-spin"
              />
            ) : (
              <CheckCircle2
                size={14}
              />
            )}

            Save & Post
          </button>
        </div>
      </Modal>

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
          detail?.batchNo ||
          "Production Batch"
        }
        subtitle={
          detail?.productDisplayName
        }
        widthClassName="max-w-3xl"
      >
        {detailLoading ||
        !detail ? (
          <div className="py-12 text-center text-[10px] text-bauraMuted">
            Loading production details...
          </div>
        ) : (
          <div className="grid gap-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <DetailMetric
                label="Good Qty"
                value={formatQty(
                  detail.producedQty
                )}
              />

              <DetailMetric
                label="Rejected"
                value={formatQty(
                  detail.rejectedQty
                )}
              />

              <DetailMetric
                label="Ingredient Cost"
                value={formatCurrency(
                  detail.ingredientCostTotal
                )}
              />

              <DetailMetric
                label="Unit Cost"
                value={formatCurrency(
                  detail.unitCost
                )}
              />
            </div>

            <div className="erp-panel overflow-hidden shadow-none">
              <div className="border-b border-bauraBorder px-4 py-3">
                <p className="text-[11px] font-semibold">
                  Ingredient Consumption
                </p>
              </div>

              {detail.consumptions.length ===
              0 ? (
                <p className="px-4 py-8 text-center text-[10px] text-bauraMuted">
                  This batch has not consumed ingredients yet.
                </p>
              ) : (
                <div className="divide-y divide-bauraBorder">
                  {detail.consumptions.map(
                    (item) => (
                      <div
                        key={
                          item.id
                        }
                        className="grid gap-2 px-4 py-3 text-[10px] sm:grid-cols-[1fr_auto_auto] sm:items-center"
                      >
                        <div>
                          <p className="font-semibold">
                            {
                              item.ingredientDisplayName
                            }
                          </p>

                          <p className="mt-0.5 text-[9px] text-bauraMuted">
                            Lot{" "}
                            {item.lotNumber ||
                              "—"}
                          </p>
                        </div>

                        <p>
                          {formatQty(
                            item.consumedBaseQty
                          )}
                        </p>

                        <p className="font-semibold">
                          {formatCurrency(
                            item.costAmount
                          )}
                        </p>
                      </div>
                    )
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={
          Boolean(
            postingBatch
          )
        }
        title="Post production batch?"
        message={
          postingBatch
            ? `${postingBatch.batchNo} will consume raw ingredients and add ${formatQty(
                postingBatch.producedQty
              )} ${postingBatch.productDisplayName} to Bakery Stock.`
            : ""
        }
        confirmText="Post Production"
        isLoading={
          posting
        }
        onCancel={() =>
          !posting &&
          setPostingBatch(
            null
          )
        }
        onConfirm={
          postDraft
        }
      />

      <ConfirmDialog
        open={
          Boolean(
            deletingBatch
          )
        }
        title="Delete production draft?"
        message={
          deletingBatch
            ? `${deletingBatch.batchNo} has not changed stock yet and will be permanently deleted.`
            : ""
        }
        confirmText="Delete Draft"
        isDanger
        isLoading={
          deleting
        }
        onCancel={() =>
          !deleting &&
          setDeletingBatch(
            null
          )
        }
        onConfirm={
          deleteDraft
        }
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
  icon:
    React.ReactNode;
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

          <p className="mt-1 text-[9px] text-bauraMuted">
            {note}
          </p>
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
        <p className="text-[10px] font-semibold">
          {title}
        </p>

        <p className="mt-0.5 text-[9px] leading-5 text-bauraMuted">
          {text}
        </p>
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

  onChange:
    (
      value: string
    ) => void;
}) {
  return (
    <label>
      <span className="erp-label">
        {label}
      </span>

      <input
        type="number"
        min="0"
        step="0.001"
        value={value}
        onChange={(
          event
        ) =>
          onChange(
            event.target
              .value
          )
        }
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

      <p className="mt-2 text-[12px] font-semibold text-bauraInk">
        {value}
      </p>
    </div>
  );
}

function ProductionStatusBadge({
  status
}: {
  status:
    ProductionStatus;
}) {
  if (
    status ===
    "POSTED"
  ) {
    return (
      <span className="erp-badge bg-bauraSuccessSoft text-bauraSuccess">
        Posted
      </span>
    );
  }

  if (
    status ===
    "VOID"
  ) {
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
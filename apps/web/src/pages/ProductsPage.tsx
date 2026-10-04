import {
  useEffect,
  useMemo,
  useState
} from "react";
import type {
  FormEvent
} from "react";
import {
  AlertTriangle,
  CakeSlice,
  CheckCircle2,
  ClipboardList,
  Edit3,
  Globe2,
  ImageIcon,
  PackagePlus,
  RefreshCw,
  Search,
  Trash2
} from "lucide-react";

import {
  ImageUploadField
} from "../components/ImageUploadField";
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

type BaseUnit =
  | "G"
  | "ML"
  | "UNIT";

type Ingredient = {
  id: string;
  displayName: string;
  imageUrl:
    | string
    | null;
  baseQty: string;
  baseUnit:
    BaseUnit;
  isActive: boolean;
};

type RecipeItem = {
  id: string;
  productId: string;
  ingredientId: string;
  ingredientDisplayName:
    string;
  imageUrl:
    | string
    | null;
  ingredientImageUrl:
    | string
    | null;
  displayImageUrl:
    | string
    | null;
  requiredBaseQty:
    string;
  baseUnit:
    BaseUnit;
};

type Product = {
  id: string;

  officialSiteProductId:
    | number
    | null;

  name: string;

  variantName:
    | string
    | null;

  imageUrl:
    | string
    | null;

  displayName: string;

  sellPrice: string;

  isActive: boolean;

  isOfficialSiteProduct?:
    boolean;

  officialSiteSyncedAt?:
    | string
    | null;

  recipeItemCount?:
    number;

  recipeItems?:
    RecipeItem[];

  createdAt: string;
  updatedAt: string;
};

type CostPreviewLine = {
  recipeItemId: string;
  ingredientId: string;

  ingredientDisplayName:
    string;

  requiredBaseQty:
    number;

  baseUnit:
    BaseUnit;

  estimatedCost:
    number;

  availableBaseQty:
    number;

  shortageBaseQty:
    number;

  isAvailable:
    boolean;
};

type CostPreview = {
  productId: string;

  sellPrice:
    number;

  currentCost:
    number;

  estimatedProfit:
    number;

  profitMarginPercent:
    number;

  canProduce:
    boolean;

  lines:
    CostPreviewLine[];
};

type RecipeForm = {
  ingredientId: string;
  imageUrl: string;
  requiredBaseQty:
    string;
};

const initialRecipeForm:
  RecipeForm = {
    ingredientId: "",
    imageUrl: "",
    requiredBaseQty: ""
  };

function formatCurrency(
  value:
    | number
    | string
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
    | undefined,
  unit?: string
) {
  const amount =
    Number(
      value || 0
    ).toLocaleString(
      "en-LK",
      {
        maximumFractionDigits:
          3
      }
    );

  return unit
    ? `${amount} ${unit}`
    : amount;
}

function formatSyncTime(
  value:
    | string
    | null
    | undefined
) {
  if (!value) {
    return "Not synced";
  }

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return "Synced";
  }

  return date.toLocaleString(
    "en-LK",
    {
      dateStyle:
        "medium",
      timeStyle:
        "short"
    }
  );
}

export function ProductsPage() {
  const toast =
    useToast();

  const [
    products,
    setProducts
  ] =
    useState<
      Product[]
    >([]);

  const [
    selectedProduct,
    setSelectedProduct
  ] =
    useState<
      Product | null
    >(null);

  const [
    ingredients,
    setIngredients
  ] =
    useState<
      Ingredient[]
    >([]);

  const [
    costPreview,
    setCostPreview
  ] =
    useState<
      CostPreview | null
    >(null);

  const [
    recipeForm,
    setRecipeForm
  ] =
    useState<RecipeForm>(
      initialRecipeForm
    );

  const [
    editingRecipeItem,
    setEditingRecipeItem
  ] =
    useState<
      RecipeItem | null
    >(null);

  const [
    deletingRecipeItem,
    setDeletingRecipeItem
  ] =
    useState<
      RecipeItem | null
    >(null);

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
      | "ACTIVE"
      | "ALL"
      | "INACTIVE"
    >("ACTIVE");

  const [
    isRecipeModalOpen,
    setIsRecipeModalOpen
  ] =
    useState(false);

  const [
    isLoading,
    setIsLoading
  ] =
    useState(true);

  const [
    isDetailLoading,
    setIsDetailLoading
  ] =
    useState(false);

  const [
    isCostLoading,
    setIsCostLoading
  ] =
    useState(false);

  const [
    isSavingRecipe,
    setIsSavingRecipe
  ] =
    useState(false);

  const [
    isDeletingRecipe,
    setIsDeletingRecipe
  ] =
    useState(false);

  const [
    isSyncing,
    setIsSyncing
  ] =
    useState(false);

  const selectedIngredient =
    ingredients.find(
      (
        ingredient
      ) =>
        ingredient.id ===
        recipeForm.ingredientId
    );

  const officialProducts =
    useMemo(
      () =>
        products.filter(
          (
            product
          ) =>
            product.officialSiteProductId !==
              null ||
            product.isOfficialSiteProduct ===
              true
        ),
      [
        products
      ]
    );

  const filteredProducts =
    useMemo(() => {
      const keyword =
        search
          .trim()
          .toLowerCase();

      return officialProducts.filter(
        (
          product
        ) => {
          const matchesSearch =
            !keyword ||
            product.displayName
              .toLowerCase()
              .includes(
                keyword
              ) ||
            product.name
              .toLowerCase()
              .includes(
                keyword
              ) ||
            Boolean(
              product.variantName
                ?.toLowerCase()
                .includes(
                  keyword
                )
            );

          const matchesStatus =
            statusFilter ===
              "ALL" ||
            (
              statusFilter ===
                "ACTIVE" &&
              product.isActive
            ) ||
            (
              statusFilter ===
                "INACTIVE" &&
              !product.isActive
            );

          return (
            matchesSearch &&
            matchesStatus
          );
        }
      );
    }, [
      officialProducts,
      search,
      statusFilter
    ]);

  async function loadProducts(
    showToast = false,
    preferredProductId?:
      string
  ) {
    setIsLoading(
      true
    );

    try {
      const data =
        await apiRequest<{
          products:
            Product[];
        }>(
          "/products"
        );

      setProducts(
        data.products
      );

      const syncedProducts =
        data.products.filter(
          (
            product
          ) =>
            product.officialSiteProductId !==
              null ||
            product.isOfficialSiteProduct ===
              true
        );

      const targetProduct =
        (
          preferredProductId
            ? syncedProducts.find(
                (
                  product
                ) =>
                  product.id ===
                  preferredProductId
              )
            : null
        ) ??
        (
          selectedProduct
            ? syncedProducts.find(
                (
                  product
                ) =>
                  product.id ===
                  selectedProduct.id
              )
            : null
        ) ??
        syncedProducts[0] ??
        null;

      if (
        targetProduct
      ) {
        await loadProductDetail(
          targetProduct.id
        );
      } else {
        setSelectedProduct(
          null
        );

        setCostPreview(
          null
        );
      }

      if (
        showToast
      ) {
        toast.success(
          "Products refreshed",
          "The ERP catalogue has been reloaded."
        );
      }
    } catch (error) {
      toast.error(
        "Failed to load products",
        error instanceof Error
          ? error.message
          : "Failed to load products."
      );
    } finally {
      setIsLoading(
        false
      );
    }
  }

  async function loadIngredients() {
    try {
      const data =
        await apiRequest<{
          ingredients:
            Ingredient[];
        }>(
          "/ingredients"
        );

      setIngredients(
        data.ingredients.filter(
          (
            ingredient
          ) =>
            ingredient.isActive
        )
      );
    } catch (error) {
      toast.error(
        "Failed to load ingredients",
        error instanceof Error
          ? error.message
          : "Failed to load ingredients."
      );
    }
  }

  async function loadProductDetail(
    productId:
      string
  ) {
    setIsDetailLoading(
      true
    );

    try {
      const data =
        await apiRequest<{
          product:
            Product;
        }>(
          `/products/${productId}`
        );

      if (
        data.product
          .officialSiteProductId ===
          null &&
        data.product
          .isOfficialSiteProduct !==
          true
      ) {
        setSelectedProduct(
          null
        );

        setCostPreview(
          null
        );

        return;
      }

      setSelectedProduct(
        data.product
      );

      await loadCostPreview(
        productId
      );
    } catch (error) {
      toast.error(
        "Failed to load product",
        error instanceof Error
          ? error.message
          : "Failed to load product details."
      );
    } finally {
      setIsDetailLoading(
        false
      );
    }
  }

  async function loadCostPreview(
    productId:
      string
  ) {
    setIsCostLoading(
      true
    );

    try {
      const data =
        await apiRequest<{
          costPreview:
            CostPreview;
        }>(
          `/products/${productId}/cost-preview`
        );

      setCostPreview(
        data.costPreview
      );
    } catch {
      setCostPreview(
        null
      );
    } finally {
      setIsCostLoading(
        false
      );
    }
  }

  async function handleSyncOfficialProducts() {
    setIsSyncing(
      true
    );

    try {
      const data =
        await apiRequest<{
          message: string;

          sync: {
            received:
              number;

            created:
              number;

            updated:
              number;

            syncedAt:
              string;
          };
        }>(
          "/products/sync-official-site",
          {
            method:
              "POST"
          }
        );

      toast.success(
        "Catalogue synchronized",
        `${data.sync.received} official product${
          data.sync.received ===
          1
            ? ""
            : "s"
        } received. ${data.sync.created} created and ${data.sync.updated} updated.`
      );

      await loadProducts(
        false,
        selectedProduct?.id
      );
    } catch (error) {
      toast.error(
        "Synchronization failed",
        error instanceof Error
          ? error.message
          : "Failed to synchronize the official product catalogue."
      );
    } finally {
      setIsSyncing(
        false
      );
    }
  }

  useEffect(() => {
    void loadProducts();
    void loadIngredients();
  }, []);

  function openCreateRecipeModal() {
    if (
      !selectedProduct
    ) {
      toast.info(
        "Select a product first"
      );

      return;
    }

    if (
      !selectedProduct.isActive
    ) {
      toast.warning(
        "Product unavailable",
        "This product is inactive on the official website, so its recipe cannot be changed."
      );

      return;
    }

    setEditingRecipeItem(
      null
    );

    setRecipeForm({
      ...initialRecipeForm
    });

    setIsRecipeModalOpen(
      true
    );
  }

  function openEditRecipeModal(
    item:
      RecipeItem
  ) {
    if (
      !selectedProduct?.isActive
    ) {
      return;
    }

    setEditingRecipeItem(
      item
    );

    setRecipeForm({
      ingredientId:
        item.ingredientId,

      imageUrl:
        item.imageUrl ||
        "",

      requiredBaseQty:
        String(
          item.requiredBaseQty
        )
    });

    setIsRecipeModalOpen(
      true
    );
  }

  function closeRecipeModal() {
    if (
      isSavingRecipe
    ) {
      return;
    }

    setIsRecipeModalOpen(
      false
    );

    setEditingRecipeItem(
      null
    );

    setRecipeForm({
      ...initialRecipeForm
    });
  }

  async function handleSaveRecipeItem(
    event:
      FormEvent
  ) {
    event.preventDefault();

    if (
      !selectedProduct ||
      !selectedIngredient
    ) {
      toast.warning(
        "Select an ingredient"
      );

      return;
    }

    if (
      !selectedProduct.isActive
    ) {
      toast.warning(
        "Product unavailable",
        "Recipes cannot be changed for an inactive official product."
      );

      return;
    }

    setIsSavingRecipe(
      true
    );

    try {
      const payload = {
        ingredientId:
          selectedIngredient.id,

        imageUrl:
          recipeForm.imageUrl.trim() ||
          null,

        requiredBaseQty:
          Number(
            recipeForm.requiredBaseQty
          ),

        baseUnit:
          selectedIngredient.baseUnit
      };

      if (
        editingRecipeItem
      ) {
        await apiRequest(
          `/products/${selectedProduct.id}/recipe-items/${editingRecipeItem.id}`,
          {
            method:
              "PUT",

            body:
              JSON.stringify(
                payload
              )
          }
        );

        toast.success(
          "Recipe item updated",
          selectedIngredient.displayName
        );
      } else {
        await apiRequest(
          `/products/${selectedProduct.id}/recipe-items`,
          {
            method:
              "POST",

            body:
              JSON.stringify(
                payload
              )
          }
        );

        toast.success(
          "Recipe item added",
          selectedIngredient.displayName
        );
      }

      const productId =
        selectedProduct.id;

      closeRecipeModal();

      await loadProducts(
        false,
        productId
      );
    } catch (error) {
      toast.error(
        "Recipe save failed",
        error instanceof Error
          ? error.message
          : "Failed to save recipe item."
      );
    } finally {
      setIsSavingRecipe(
        false
      );
    }
  }

  async function handleDeleteRecipeItem() {
    if (
      !selectedProduct ||
      !deletingRecipeItem
    ) {
      return;
    }

    setIsDeletingRecipe(
      true
    );

    try {
      const productId =
        selectedProduct.id;

      await apiRequest(
        `/products/${productId}/recipe-items/${deletingRecipeItem.id}`,
        {
          method:
            "DELETE"
        }
      );

      toast.success(
        "Recipe item removed",
        deletingRecipeItem.ingredientDisplayName
      );

      setDeletingRecipeItem(
        null
      );

      await loadProducts(
        false,
        productId
      );
    } catch (error) {
      toast.error(
        "Remove failed",
        error instanceof Error
          ? error.message
          : "Failed to remove recipe item."
      );
    } finally {
      setIsDeletingRecipe(
        false
      );
    }
  }

  return (
    <AppLayout
      activeItem="Products & Recipes"
      title="Products & Recipes"
      subtitle="Official Baura products are synchronized automatically into ERP. Manage production recipes, ingredient requirements, costing and raw-material availability here."
      actions={
        <>
          <button
            type="button"
            onClick={() =>
              void loadProducts(
                true
              )
            }
            disabled={
              isLoading ||
              isSyncing
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
            onClick={() =>
              void handleSyncOfficialProducts()
            }
            disabled={
              isSyncing ||
              isLoading
            }
            className="erp-button-primary"
          >
            <RefreshCw
              size={14}
              className={
                isSyncing
                  ? "animate-spin"
                  : ""
              }
            />

            {isSyncing
              ? "Syncing..."
              : "Sync Website"}
          </button>
        </>
      }
    >
      <div className="mb-4 rounded-[16px] border border-bauraBorder bg-white px-4 py-3">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-bauraGoldSoft text-bauraGoldDark">
            <Globe2
              size={17}
            />
          </div>

          <div className="min-w-0">
            <p className="text-[10px] font-semibold text-bauraInk">
              Official website catalogue
            </p>

            <p className="mt-1 text-[9px] leading-5 text-bauraMuted">
              Product names, sizes, images, prices and availability are controlled by the official Baura website. ERP only manages operational data such as recipes, production, stock and sales.
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[0.72fr_1.28fr]">
        <section className="erp-panel overflow-hidden">
          <div className="border-b border-bauraBorder p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="erp-section-title">
                  Official Products
                </h2>

                <p className="erp-section-subtitle">
                  {
                    filteredProducts.length
                  }{" "}
                  shown ·{" "}
                  {
                    officialProducts.length
                  }{" "}
                  synchronized
                </p>
              </div>

              <span className="erp-badge bg-bauraGoldSoft text-bauraGoldDark">
                Website
              </span>
            </div>

            <div className="erp-search mt-4">
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
                    event.target.value
                  )
                }
                placeholder="Search official products..."
                className="w-full bg-transparent text-[11px] outline-none"
              />
            </div>

            <div className="mt-3 grid grid-cols-3 gap-2">
              {(
                [
                  "ACTIVE",
                  "ALL",
                  "INACTIVE"
                ] as const
              ).map(
                (
                  value
                ) => (
                  <button
                    key={
                      value
                    }
                    type="button"
                    onClick={() =>
                      setStatusFilter(
                        value
                      )
                    }
                    className={`h-9 rounded-lg text-[9px] font-semibold ${
                      statusFilter ===
                      value
                        ? "bg-bauraPrimary text-white"
                        : "border border-bauraBorder bg-white text-bauraMuted hover:bg-bauraGoldSoft/40"
                    }`}
                  >
                    {value}
                  </button>
                )
              )}
            </div>
          </div>

          <div className="baura-scrollbar max-h-[calc(100vh-380px)] overflow-y-auto p-3">
            {isLoading ? (
              <EmptyState
                text="Loading official products..."
              />
            ) : filteredProducts.length ===
              0 ? (
              <EmptyState
                text="No synchronized products found."
              />
            ) : (
              <div className="grid gap-2.5">
                {filteredProducts.map(
                  (
                    product
                  ) => {
                    const selected =
                      selectedProduct?.id ===
                      product.id;

                    return (
                      <button
                        key={
                          product.id
                        }
                        type="button"
                        onClick={() =>
                          void loadProductDetail(
                            product.id
                          )
                        }
                        className={`rounded-[15px] border p-3 text-left transition ${
                          selected
                            ? "border-bauraGold bg-bauraGoldSoft/45"
                            : "border-bauraBorder bg-white hover:border-bauraGold/40"
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <ProductThumbnail
                            product={
                              product
                            }
                          />

                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className="truncate text-[11px] font-semibold text-bauraInk">
                                  {
                                    product.displayName
                                  }
                                </p>

                                <p className="mt-1 text-[9px] text-bauraMuted">
                                  {formatCurrency(
                                    product.sellPrice
                                  )}
                                </p>
                              </div>

                              <span
                                className={`erp-badge shrink-0 ${
                                  product.isActive
                                    ? "bg-bauraSuccessSoft text-bauraSuccess"
                                    : "bg-bauraDangerSoft text-bauraDanger"
                                }`}
                              >
                                {product.isActive
                                  ? "Active"
                                  : "Inactive"}
                              </span>
                            </div>

                            <div className="mt-2 flex flex-wrap items-center gap-2">
                              <span className="text-[9px] text-bauraMuted">
                                {
                                  product.recipeItemCount ||
                                  0
                                }{" "}
                                recipe ingredient
                                {(product.recipeItemCount ||
                                  0) ===
                                1
                                  ? ""
                                  : "s"}
                              </span>

                              <span className="erp-badge bg-bauraGoldSoft text-bauraGoldDark">
                                Official
                              </span>
                            </div>
                          </div>
                        </div>
                      </button>
                    );
                  }
                )}
              </div>
            )}
          </div>
        </section>

        <section className="erp-panel overflow-hidden p-5">
          {!selectedProduct ? (
            <div className="flex min-h-[500px] items-center justify-center text-center">
              <div>
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-bauraGoldSoft text-bauraGoldDark">
                  <CakeSlice
                    size={25}
                  />
                </div>

                <h3 className="mt-4 text-[13px] font-semibold">
                  No official product selected
                </h3>

                <p className="mt-2 max-w-sm text-[10px] leading-5 text-bauraMuted">
                  Select a synchronized website product to view costing and manage its ERP recipe.
                </p>
              </div>
            </div>
          ) : (
            <>
              <div className="flex flex-col gap-4 border-b border-bauraBorder pb-5 lg:flex-row lg:items-start lg:justify-between">
                <div className="flex min-w-0 gap-4">
                  <ProductHeroImage
                    product={
                      selectedProduct
                    }
                  />

                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-[8px] font-semibold uppercase tracking-[0.12em] text-bauraGoldDark">
                        Official Product
                      </p>

                      <span className="erp-badge bg-bauraGoldSoft text-bauraGoldDark">
                        Website #
                        {
                          selectedProduct.officialSiteProductId
                        }
                      </span>
                    </div>

                    <h2 className="mt-1 truncate text-[19px] font-semibold tracking-[-0.03em] text-bauraInk">
                      {
                        selectedProduct.displayName
                      }
                    </h2>

                    <p className="mt-1 text-[9px] text-bauraMuted">
                      Sell{" "}
                      {formatCurrency(
                        selectedProduct.sellPrice
                      )}{" "}
                      ·{" "}
                      {
                        selectedProduct.recipeItems?.length ||
                        0
                      }{" "}
                      recipe ingredients
                    </p>

                    <p className="mt-1 text-[8px] text-bauraMuted2">
                      Last website sync:{" "}
                      {formatSyncTime(
                        selectedProduct.officialSiteSyncedAt
                      )}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`erp-badge ${
                      selectedProduct.isActive
                        ? "bg-bauraSuccessSoft text-bauraSuccess"
                        : "bg-bauraDangerSoft text-bauraDanger"
                    }`}
                  >
                    {selectedProduct.isActive
                      ? "Website Active"
                      : "Website Inactive"}
                  </span>

                  {selectedProduct.isActive && (
                    <button
                      type="button"
                      onClick={
                        openCreateRecipeModal
                      }
                      className="erp-button-primary"
                    >
                      <PackagePlus
                        size={13}
                      />

                      Add Recipe Item
                    </button>
                  )}
                </div>
              </div>

              {!selectedProduct.isActive && (
                <div className="mt-5 rounded-[14px] border border-amber-200 bg-bauraWarningSoft p-4">
                  <div className="flex items-start gap-3">
                    <AlertTriangle
                      size={16}
                      className="mt-0.5 shrink-0 text-bauraWarning"
                    />

                    <div>
                      <p className="text-[10px] font-semibold text-bauraInk">
                        This product is inactive on the official website.
                      </p>

                      <p className="mt-1 text-[9px] leading-5 text-bauraMuted">
                        Its existing ERP recipe remains available for historical records, but recipe changes are disabled while the official product is inactive.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <div className="my-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <MiniStat
                  label="Website Price"
                  value={formatCurrency(
                    selectedProduct.sellPrice
                  )}
                />

                <MiniStat
                  label="Current Cost"
                  value={
                    isCostLoading
                      ? "Calculating..."
                      : formatCurrency(
                          costPreview?.currentCost
                        )
                  }
                />

                <MiniStat
                  label="Gross Profit"
                  value={
                    isCostLoading
                      ? "—"
                      : formatCurrency(
                          costPreview?.estimatedProfit
                        )
                  }
                />

                <MiniStat
                  label="Margin"
                  value={
                    isCostLoading
                      ? "—"
                      : `${costPreview?.profitMarginPercent || 0}%`
                  }
                />
              </div>

              {costPreview &&
                selectedProduct.recipeItems &&
                selectedProduct.recipeItems.length >
                  0 && (
                  <div
                    className={`mb-5 rounded-[14px] border p-4 ${
                      costPreview.canProduce
                        ? "border-green-100 bg-bauraSuccessSoft"
                        : "border-amber-200 bg-bauraWarningSoft"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      {costPreview.canProduce ? (
                        <CheckCircle2
                          size={16}
                          className="mt-0.5 shrink-0 text-bauraSuccess"
                        />
                      ) : (
                        <AlertTriangle
                          size={16}
                          className="mt-0.5 shrink-0 text-bauraWarning"
                        />
                      )}

                      <div>
                        <p className="text-[10px] font-semibold text-bauraInk">
                          {costPreview.canProduce
                            ? "Current raw material stock can produce this recipe."
                            : "Some recipe ingredients have insufficient raw stock."}
                        </p>

                        <p className="mt-1 text-[9px] text-bauraMuted">
                          Cost preview uses available non-expired raw-material lots.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

              <div className="flex items-center justify-between gap-4">
                <div>
                  <h3 className="erp-section-title">
                    Production Recipe
                  </h3>

                  <p className="erp-section-subtitle">
                    ERP-managed ingredients required to produce one finished product.
                  </p>
                </div>

                {selectedProduct.isActive &&
                  Boolean(
                    selectedProduct.recipeItems?.length
                  ) && (
                    <button
                      type="button"
                      onClick={
                        openCreateRecipeModal
                      }
                      className="erp-button-secondary"
                    >
                      <PackagePlus
                        size={12}
                      />

                      Add Ingredient
                    </button>
                  )}
              </div>

              <div className="baura-scrollbar mt-4 max-h-[calc(100vh-570px)] min-h-[240px] overflow-y-auto pr-1">
                {isDetailLoading ? (
                  <EmptyState
                    text="Loading recipe..."
                  />
                ) : !selectedProduct.recipeItems ||
                  selectedProduct.recipeItems.length ===
                    0 ? (
                  <div className="flex min-h-[240px] flex-col items-center justify-center rounded-[15px] border border-dashed border-bauraBorder bg-bauraCanvas2 px-6 text-center">
                    <ClipboardList
                      size={23}
                      className="text-bauraMuted2"
                    />

                    <p className="mt-3 text-[10px] font-semibold text-bauraInk">
                      No production recipe yet
                    </p>

                    <p className="mt-1 max-w-sm text-[9px] leading-5 text-bauraMuted">
                      This product already exists on the official website. Add its ingredient requirements here so ERP can calculate production cost and raw-material usage.
                    </p>

                    {selectedProduct.isActive && (
                      <button
                        type="button"
                        onClick={
                          openCreateRecipeModal
                        }
                        className="erp-button-primary mt-4"
                      >
                        <PackagePlus
                          size={13}
                        />

                        Add First Ingredient
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="grid gap-3">
                    {selectedProduct.recipeItems.map(
                      (
                        item
                      ) => {
                        const previewLine =
                          costPreview?.lines.find(
                            (
                              line
                            ) =>
                              line.recipeItemId ===
                              item.id
                          );

                        return (
                          <article
                            key={
                              item.id
                            }
                            className="rounded-[15px] border border-bauraBorder bg-white p-4"
                          >
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                              <div className="flex min-w-0 items-start gap-3">
                                <RecipeImage
                                  item={
                                    item
                                  }
                                />

                                <div className="min-w-0">
                                  <h4 className="truncate text-[11px] font-semibold text-bauraInk">
                                    {
                                      item.ingredientDisplayName
                                    }
                                  </h4>

                                  <p className="mt-1 text-[9px] text-bauraMuted">
                                    Required{" "}
                                    {formatQty(
                                      item.requiredBaseQty,
                                      item.baseUnit
                                    )}

                                    {previewLine &&
                                      ` · Cost ${formatCurrency(
                                        previewLine.estimatedCost
                                      )}`}
                                  </p>

                                  {previewLine &&
                                    !previewLine.isAvailable && (
                                      <p className="mt-1 text-[9px] font-semibold text-bauraDanger">
                                        Shortage{" "}
                                        {formatQty(
                                          previewLine.shortageBaseQty,
                                          item.baseUnit
                                        )}
                                      </p>
                                    )}
                                </div>
                              </div>

                              <div className="flex flex-wrap items-center gap-2">
                                {previewLine && (
                                  <span
                                    className={`erp-badge ${
                                      previewLine.isAvailable
                                        ? "bg-bauraSuccessSoft text-bauraSuccess"
                                        : "bg-bauraWarningSoft text-bauraWarning"
                                    }`}
                                  >
                                    {previewLine.isAvailable
                                      ? "Stock OK"
                                      : "Low Stock"}
                                  </span>
                                )}

                                {selectedProduct.isActive && (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        openEditRecipeModal(
                                          item
                                        )
                                      }
                                      className="erp-button-secondary h-8 px-3"
                                    >
                                      <Edit3
                                        size={12}
                                      />

                                      Edit
                                    </button>

                                    <button
                                      type="button"
                                      onClick={() =>
                                        setDeletingRecipeItem(
                                          item
                                        )
                                      }
                                      className="erp-button-danger h-8 px-3"
                                    >
                                      <Trash2
                                        size={12}
                                      />
                                    </button>
                                  </>
                                )}
                              </div>
                            </div>
                          </article>
                        );
                      }
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </section>
      </div>

      <Modal
        open={
          isRecipeModalOpen
        }
        onClose={
          closeRecipeModal
        }
        title={
          editingRecipeItem
            ? "Edit Recipe Item"
            : "Add Recipe Item"
        }
        subtitle={
          selectedProduct
            ? `Define the ERP production requirement for ${selectedProduct.displayName}.`
            : ""
        }
        widthClassName="max-w-3xl"
      >
        <form
          onSubmit={
            handleSaveRecipeItem
          }
          className="grid gap-5"
        >
          <div className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
            <ImageUploadField
              label="Recipe Item Image"
              value={
                recipeForm.imageUrl
              }
              onChange={(
                imageUrl
              ) =>
                setRecipeForm(
                  (
                    current
                  ) => ({
                    ...current,
                    imageUrl
                  })
                )
              }
              folder="baura/recipes"
            />

            <div className="grid content-start gap-4">
              <label>
                <span className="erp-label">
                  Ingredient
                </span>

                <select
                  value={
                    recipeForm.ingredientId
                  }
                  onChange={(
                    event
                  ) =>
                    setRecipeForm(
                      (
                        current
                      ) => ({
                        ...current,

                        ingredientId:
                          event.target.value
                      })
                    )
                  }
                  className="erp-input"
                  required
                >
                  <option value="">
                    Select ingredient
                  </option>

                  {ingredients.map(
                    (
                      ingredient
                    ) => (
                      <option
                        key={
                          ingredient.id
                        }
                        value={
                          ingredient.id
                        }
                      >
                        {
                          ingredient.displayName
                        }{" "}
                        ·{" "}
                        {
                          ingredient.baseUnit
                        }
                      </option>
                    )
                  )}
                </select>
              </label>

              <Input
                label={
                  selectedIngredient
                    ? `Required Qty (${selectedIngredient.baseUnit})`
                    : "Required Qty"
                }
                type="number"
                value={
                  recipeForm.requiredBaseQty
                }
                onChange={(
                  value
                ) =>
                  setRecipeForm(
                    (
                      current
                    ) => ({
                      ...current,

                      requiredBaseQty:
                        value
                    })
                  )
                }
                placeholder="250"
              />

              {selectedIngredient?.imageUrl &&
                !recipeForm.imageUrl && (
                  <div className="rounded-xl border border-bauraBorder bg-bauraCanvas2 p-3">
                    <p className="text-[9px] leading-5 text-bauraMuted">
                      No recipe-specific image selected. The ingredient image will be used as the fallback.
                    </p>
                  </div>
                )}
            </div>
          </div>

          <ModalActions
            isLoading={
              isSavingRecipe
            }
            onCancel={
              closeRecipeModal
            }
            submitText={
              editingRecipeItem
                ? "Save Recipe Item"
                : "Add Recipe Item"
            }
          />
        </form>
      </Modal>

      <ConfirmDialog
        open={
          Boolean(
            deletingRecipeItem
          )
        }
        title="Remove recipe ingredient?"
        message={
          deletingRecipeItem
            ? `${deletingRecipeItem.ingredientDisplayName} will be removed from this product recipe. This does not change the product on the official website.`
            : ""
        }
        confirmText="Remove"
        isDanger
        isLoading={
          isDeletingRecipe
        }
        onCancel={() =>
          setDeletingRecipeItem(
            null
          )
        }
        onConfirm={
          handleDeleteRecipeItem
        }
      />
    </AppLayout>
  );
}

function ProductThumbnail({
  product
}: {
  product:
    Product;
}) {
  if (
    product.imageUrl
  ) {
    return (
      <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl border border-bauraBorder bg-bauraCanvas2">
        <img
          src={
            product.imageUrl
          }
          alt={
            product.displayName
          }
          className="h-full w-full object-cover"
          loading="lazy"
        />
      </div>
    );
  }

  return (
    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-bauraGoldSoft text-bauraGoldDark">
      <CakeSlice
        size={20}
      />
    </div>
  );
}

function ProductHeroImage({
  product
}: {
  product:
    Product;
}) {
  if (
    product.imageUrl
  ) {
    return (
      <div className="h-20 w-20 shrink-0 overflow-hidden rounded-[16px] border border-bauraBorder bg-bauraCanvas2">
        <img
          src={
            product.imageUrl
          }
          alt={
            product.displayName
          }
          className="h-full w-full object-cover"
        />
      </div>
    );
  }

  return (
    <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-[16px] bg-bauraGoldSoft text-bauraGoldDark">
      <CakeSlice
        size={27}
      />
    </div>
  );
}

function RecipeImage({
  item
}: {
  item:
    RecipeItem;
}) {
  const image =
    item.displayImageUrl ||
    item.imageUrl ||
    item.ingredientImageUrl;

  if (image) {
    return (
      <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl border border-bauraBorder bg-bauraCanvas2">
        <img
          src={
            image
          }
          alt={
            item.ingredientDisplayName
          }
          className="h-full w-full object-cover"
          loading="lazy"
        />
      </div>
    );
  }

  return (
    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-bauraGoldSoft text-bauraGoldDark">
      <ClipboardList
        size={19}
      />
    </div>
  );
}

function MiniStat({
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

function EmptyState({
  text
}: {
  text: string;
}) {
  return (
    <div className="flex min-h-[160px] flex-col items-center justify-center rounded-[15px] border border-dashed border-bauraBorder bg-bauraCanvas2 px-6 text-center">
      <ImageIcon
        size={21}
        className="text-bauraMuted2"
      />

      <p className="mt-3 text-[10px] text-bauraMuted">
        {text}
      </p>
    </div>
  );
}

function Input({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  required = true
}: {
  label: string;
  value: string;
  onChange: (
    value: string
  ) => void;
  placeholder?: string;
  type?: string;
  required?: boolean;
}) {
  return (
    <label>
      <span className="erp-label">
        {label}
      </span>

      <input
        className="erp-input"
        value={
          value
        }
        onChange={(
          event
        ) =>
          onChange(
            event.target.value
          )
        }
        placeholder={
          placeholder
        }
        type={
          type
        }
        required={
          required
        }
        min={
          type ===
          "number"
            ? "0"
            : undefined
        }
        step={
          type ===
          "number"
            ? "0.01"
            : undefined
        }
      />
    </label>
  );
}

function ModalActions({
  isLoading,
  onCancel,
  submitText
}: {
  isLoading:
    boolean;
  onCancel:
    () => void;
  submitText:
    string;
}) {
  return (
    <div className="flex flex-col-reverse gap-2 border-t border-bauraBorder pt-5 sm:flex-row sm:justify-end">
      <button
        type="button"
        onClick={
          onCancel
        }
        disabled={
          isLoading
        }
        className="erp-button-secondary"
      >
        Cancel
      </button>

      <button
        type="submit"
        disabled={
          isLoading
        }
        className="erp-button-primary"
      >
        {isLoading
          ? "Saving..."
          : submitText}
      </button>
    </div>
  );
}
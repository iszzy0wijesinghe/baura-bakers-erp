import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";

import {
  AlertTriangle,
  CakeSlice,
  CheckCircle2,
  ClipboardList,
  Edit3,
  Globe2,
  ImageIcon,
  PackagePlus,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Wallet
} from "lucide-react";

import { ImageUploadField } from "../components/ImageUploadField";
import { AppLayout } from "../layouts/AppLayout";
import { apiRequest } from "../lib/api";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { Modal } from "../ui/Modal";
import { useToast } from "../ui/ToastProvider";

type BaseUnit = "G" | "ML" | "UNIT";

type ExpenseCategory =
  | "ELECTRICITY"
  | "GAS"
  | "LABOUR"
  | "PACKAGING"
  | "DECORATION"
  | "TRANSPORT"
  | "OTHER";

type CalculationMethod =
  | "PER_BATCH"
  | "PER_UNIT"
  | "QUANTITY_BASED";

type Ingredient = {
  id: string;
  displayName: string;
  imageUrl: string | null;
  baseQty: string;
  baseUnit: BaseUnit;
  isActive: boolean;
};

type ProductSize = {
  id: string;
  productId: string;
  name: string;
  label: string;
  price: number;
  isActive: boolean;
  sortOrder: number;
};

type RecipeItem = {
  id: string;
  productId: string;
  productSizeId: string | null;
  ingredientId: string;
  ingredientDisplayName: string;
  imageUrl: string | null;
  ingredientImageUrl: string | null;
  displayImageUrl: string | null;
  requiredBaseQty: number;
  baseUnit: BaseUnit;
};

type Product = {
  id: string;
  officialSiteProductId: number | null;
  name: string;
  variantName: string | null;
  imageUrl: string | null;
  displayName: string;
  sellPrice: number;
  isActive: boolean;
  isOfficialSiteProduct?: boolean;
  officialSiteSyncedAt?: string | null;
  recipeItemCount?: number;
  recipeItems?: RecipeItem[];
  sizes?: ProductSize[];
  activeSizes?: ProductSize[];
  createdAt: string;
  updatedAt: string;
};

type CostPreviewLine = {
  recipeItemId: string;
  ingredientId: string;
  ingredientDisplayName: string;
  requiredBaseQty: number;
  totalRequiredBaseQty: number;
  baseUnit: BaseUnit;
  estimatedCost: number;
  availableBaseQty: number;
  shortageBaseQty: number;
  isAvailable: boolean;
};

type ExpenseLine = {
  id: string;
  name: string;
  category: ExpenseCategory;
  calculationMethod: CalculationMethod;
  productSizeId: string | null;
  quantity: number;
  rate: number;
  totalAmount: number;
  unitAmount: number;
};

type CostPreview = {
  productId: string;
  productSizeId: string | null;
  sizeLabel: string | null;
  productionQty: number;
  sellPrice: number;
  ingredientCostTotal: number;
  expenseCostTotal: number;
  totalProductionCost: number;
  unitCost: number;
  currentCost: number;
  estimatedProfit: number;
  profitMarginPercent: number;
  canProduce: boolean;
  lines: CostPreviewLine[];
  expenseLines: ExpenseLine[];
};

type RecipeExpense = {
  id: string;
  productId: string;
  productSizeId: string | null;
  name: string;
  category: ExpenseCategory;
  calculationMethod: CalculationMethod;
  quantity: number;
  rate: number;
  description: string | null;
  isActive: boolean;
  estimatedAmount: number;
  estimatedUnitAmount: number;
};

type RecipeForm = {
  ingredientId: string;
  imageUrl: string;
  requiredBaseQty: string;
};

type ExpenseForm = {
  name: string;
  category: ExpenseCategory;
  calculationMethod: CalculationMethod;
  quantity: string;
  rate: string;
  description: string;
  scope: "SHARED" | "SIZE";
};

const initialRecipeForm: RecipeForm = {
  ingredientId: "",
  imageUrl: "",
  requiredBaseQty: ""
};

const initialExpenseForm: ExpenseForm = {
  name: "",
  category: "ELECTRICITY",
  calculationMethod: "PER_BATCH",
  quantity: "1",
  rate: "",
  description: "",
  scope: "SIZE"
};

const expenseCategories: ExpenseCategory[] = [
  "ELECTRICITY",
  "GAS",
  "LABOUR",
  "PACKAGING",
  "DECORATION",
  "TRANSPORT",
  "OTHER"
];

const calculationMethods: {
  value: CalculationMethod;
  label: string;
}[] = [
  { value: "PER_BATCH", label: "Per Batch" },
  { value: "PER_UNIT", label: "Per Unit" },
  { value: "QUANTITY_BASED", label: "Quantity × Rate" }
];

function formatCurrency(value: number | string | undefined) {
  return `Rs. ${Number(value ?? 0).toLocaleString("en-LK", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
}

function formatQty(value: number | string | undefined, unit?: string) {
  const amount = Number(value ?? 0).toLocaleString("en-LK", {
    maximumFractionDigits: 3
  });

  return unit ? `${amount} ${unit}` : amount;
}

function formatSyncTime(value: string | null | undefined) {
  if (!value) return "Not synced";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "Synced";

  return date.toLocaleString("en-LK", {
    dateStyle: "medium",
    timeStyle: "short"
  });
}

function formatCategory(value: string) {
  return value
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function getErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "An unexpected error occurred.";
}

export function ProductsPage() {
  const toast = useToast();

  const [products, setProducts] = useState<Product[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [selectedSizeId, setSelectedSizeId] = useState("");
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [costPreview, setCostPreview] = useState<CostPreview | null>(null);
  const [expenses, setExpenses] = useState<RecipeExpense[]>([]);

  const [recipeForm, setRecipeForm] = useState<RecipeForm>(initialRecipeForm);
  const [expenseForm, setExpenseForm] = useState<ExpenseForm>(initialExpenseForm);

  const [editingRecipeItem, setEditingRecipeItem] = useState<RecipeItem | null>(null);
  const [deletingRecipeItem, setDeletingRecipeItem] = useState<RecipeItem | null>(null);

  const [editingExpense, setEditingExpense] = useState<RecipeExpense | null>(null);
  const [deletingExpense, setDeletingExpense] = useState<RecipeExpense | null>(null);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "ACTIVE" | "ALL" | "INACTIVE"
  >("ACTIVE");

  const [productionQty, setProductionQty] = useState(1);

  const [isRecipeModalOpen, setIsRecipeModalOpen] = useState(false);
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);

  const [isLoading, setIsLoading] = useState(true);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [isCostLoading, setIsCostLoading] = useState(false);
  const [isSavingRecipe, setIsSavingRecipe] = useState(false);
  const [isDeletingRecipe, setIsDeletingRecipe] = useState(false);
  const [isSavingExpense, setIsSavingExpense] = useState(false);
  const [isDeletingExpense, setIsDeletingExpense] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [costError, setCostError] = useState<string | null>(null);

  const selectedIngredient = ingredients.find(
    (ingredient) => ingredient.id === recipeForm.ingredientId
  );

  const activeSizes = useMemo(
    () => (selectedProduct?.sizes ?? []).filter((size) => size.isActive),
    [selectedProduct]
  );

  const selectedSize = activeSizes.find(
    (size) => size.id === selectedSizeId
  );

  const visibleRecipeItems = useMemo(
    () =>
      (selectedProduct?.recipeItems ?? []).filter(
        (item) => (item.productSizeId ?? "") === selectedSizeId
      ),
    [selectedProduct, selectedSizeId]
  );

  const officialProducts = useMemo(
    () =>
      products.filter(
        (product) =>
          product.officialSiteProductId !== null ||
          product.isOfficialSiteProduct === true
      ),
    [products]
  );

  const filteredProducts = useMemo(() => {
    const keyword = search.trim().toLowerCase();

    return officialProducts.filter((product) => {
      const matchesSearch =
        !keyword ||
        product.displayName.toLowerCase().includes(keyword) ||
        product.name.toLowerCase().includes(keyword) ||
        Boolean(product.variantName?.toLowerCase().includes(keyword));

      const matchesStatus =
        statusFilter === "ALL" ||
        (statusFilter === "ACTIVE" && product.isActive) ||
        (statusFilter === "INACTIVE" && !product.isActive);

      return matchesSearch && matchesStatus;
    });
  }, [officialProducts, search, statusFilter]);

  async function loadIngredients() {
    try {
      const data = await apiRequest<{ ingredients: Ingredient[] }>(
        "/ingredients"
      );

      setIngredients(data.ingredients.filter((ingredient) => ingredient.isActive));
    } catch (error) {
      toast.error("Failed to load ingredients", getErrorMessage(error));
    }
  }

  async function loadProducts(
    showToast = false,
    preferredProductId?: string
  ) {
    setIsLoading(true);

    try {
      const data = await apiRequest<{ products: Product[] }>("/products");

      setProducts(data.products);

      const official = data.products.filter(
        (product) =>
          product.officialSiteProductId !== null ||
          product.isOfficialSiteProduct === true
      );

      const target =
        official.find(
          (product) =>
            product.id === (preferredProductId ?? selectedProduct?.id)
        ) ??
        official[0] ??
        null;

      if (target) {
        await loadProductDetail(target.id);
      } else {
        setSelectedProduct(null);
        setCostPreview(null);
        setExpenses([]);
      }

      if (showToast) {
        toast.success(
          "Products refreshed",
          "The official product catalogue has been reloaded."
        );
      }
    } catch (error) {
      toast.error("Failed to load products", getErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  }

  async function loadProductDetail(productId: string) {
    setIsDetailLoading(true);

    try {
      const data = await apiRequest<{ product: Product }>(
        `/products/${productId}`
      );

      const product = data.product;

      if (
        product.officialSiteProductId === null &&
        product.isOfficialSiteProduct !== true
      ) {
        setSelectedProduct(null);
        setCostPreview(null);
        setExpenses([]);
        return;
      }

      const sizes = (product.sizes ?? []).filter((size) => size.isActive);

      const nextSizeId =
        selectedProduct?.id === product.id &&
        sizes.some((size) => size.id === selectedSizeId)
          ? selectedSizeId
          : sizes[0]?.id ?? "";

      setSelectedProduct(product);
      setSelectedSizeId(nextSizeId);
    } catch (error) {
      toast.error("Failed to load product", getErrorMessage(error));
    } finally {
      setIsDetailLoading(false);
    }
  }

  async function loadCostPreview(
    productId: string,
    productSizeId: string,
    quantity: number
  ) {
    setIsCostLoading(true);
    setCostError(null);

    try {
      const query = new URLSearchParams({
        productionQty: String(quantity)
      });

      if (productSizeId) {
        query.set("productSizeId", productSizeId);
      }

      const data = await apiRequest<{ costPreview: CostPreview }>(
        `/products/${productId}/cost-preview?${query.toString()}`
      );

      setCostPreview(data.costPreview);
    } catch (error) {
      setCostPreview(null);
      setCostError(getErrorMessage(error));
    } finally {
      setIsCostLoading(false);
    }
  }

  async function loadExpenses(
    productId: string,
    productSizeId: string,
    quantity: number
  ) {
    try {
      const query = new URLSearchParams({
        productionQty: String(quantity)
      });

      if (productSizeId) {
        query.set("productSizeId", productSizeId);
      }

      const data = await apiRequest<{ expenses: RecipeExpense[] }>(
        `/recipe-expenses/${productId}?${query.toString()}`
      );

      setExpenses(data.expenses);
    } catch (error) {
      setExpenses([]);
      toast.error("Failed to load recipe expenses", getErrorMessage(error));
    }
  }

  async function refreshSelectedProduct() {
    if (!selectedProduct) return;

    await loadProductDetail(selectedProduct.id);
  }

  useEffect(() => {
    void loadProducts();
    void loadIngredients();
  }, []);

  useEffect(() => {
    if (!selectedProduct) return;

    void loadCostPreview(
      selectedProduct.id,
      selectedSizeId,
      productionQty
    );

    void loadExpenses(
      selectedProduct.id,
      selectedSizeId,
      productionQty
    );
  }, [selectedProduct?.id, selectedSizeId, productionQty]);

  async function handleSyncOfficialProducts() {
    setIsSyncing(true);

    try {
      const data = await apiRequest<{
        sync: {
          received: number;
          created: number;
          updated: number;
        };
      }>("/products/sync-official-site", {
        method: "POST"
      });

      toast.success(
        "Catalogue synchronized",
        `${data.sync.received} products received. ${data.sync.created} created and ${data.sync.updated} updated.`
      );

      await loadProducts(false, selectedProduct?.id);
    } catch (error) {
      toast.error("Synchronization failed", getErrorMessage(error));
    } finally {
      setIsSyncing(false);
    }
  }

  function openCreateRecipeModal() {
    if (!selectedProduct?.isActive) {
      toast.warning("Select an active product first");
      return;
    }

    setEditingRecipeItem(null);
    setRecipeForm(initialRecipeForm);
    setIsRecipeModalOpen(true);
  }

  function openEditRecipeModal(item: RecipeItem) {
    if (!selectedProduct?.isActive) return;

    setEditingRecipeItem(item);

    setRecipeForm({
      ingredientId: item.ingredientId,
      imageUrl: item.imageUrl ?? "",
      requiredBaseQty: String(item.requiredBaseQty)
    });

    setIsRecipeModalOpen(true);
  }

  function closeRecipeModal() {
    if (isSavingRecipe) return;

    setIsRecipeModalOpen(false);
    setEditingRecipeItem(null);
    setRecipeForm(initialRecipeForm);
  }

  async function handleSaveRecipeItem(event: FormEvent) {
    event.preventDefault();

    if (!selectedProduct || !selectedIngredient) {
      toast.warning("Select an ingredient");
      return;
    }

    if (!selectedProduct.isActive) {
      toast.warning("This product is inactive");
      return;
    }

    const quantity = Number(recipeForm.requiredBaseQty);

    if (!Number.isFinite(quantity) || quantity <= 0) {
      toast.warning("Enter a valid ingredient quantity");
      return;
    }

    setIsSavingRecipe(true);

    try {
      const payload = {
        ingredientId: selectedIngredient.id,
        productSizeId: selectedSizeId || null,
        imageUrl: recipeForm.imageUrl.trim() || null,
        requiredBaseQty: quantity,
        baseUnit: selectedIngredient.baseUnit
      };

      if (editingRecipeItem) {
        await apiRequest(
          `/products/${selectedProduct.id}/recipe-items/${editingRecipeItem.id}`,
          {
            method: "PUT",
            body: JSON.stringify(payload)
          }
        );

        toast.success("Recipe ingredient updated");
      } else {
        await apiRequest(
          `/products/${selectedProduct.id}/recipe-items`,
          {
            method: "POST",
            body: JSON.stringify(payload)
          }
        );

        toast.success("Recipe ingredient added");
      }

      setIsRecipeModalOpen(false);
      setEditingRecipeItem(null);
      setRecipeForm(initialRecipeForm);

      await refreshSelectedProduct();
    } catch (error) {
      toast.error("Recipe save failed", getErrorMessage(error));
    } finally {
      setIsSavingRecipe(false);
    }
  }

  async function handleDeleteRecipeItem() {
    if (!selectedProduct || !deletingRecipeItem) return;

    setIsDeletingRecipe(true);

    try {
      await apiRequest(
        `/products/${selectedProduct.id}/recipe-items/${deletingRecipeItem.id}`,
        {
          method: "DELETE"
        }
      );

      toast.success("Recipe ingredient removed");
      setDeletingRecipeItem(null);

      await refreshSelectedProduct();
    } catch (error) {
      toast.error("Remove failed", getErrorMessage(error));
    } finally {
      setIsDeletingRecipe(false);
    }
  }

  function openCreateExpenseModal() {
    if (!selectedProduct?.isActive) {
      toast.warning("Select an active product first");
      return;
    }

    setEditingExpense(null);

    setExpenseForm({
      ...initialExpenseForm,
      scope: selectedSizeId ? "SIZE" : "SHARED"
    });

    setIsExpenseModalOpen(true);
  }

  function openEditExpenseModal(expense: RecipeExpense) {
    if (!selectedProduct?.isActive) return;

    setEditingExpense(expense);

    setExpenseForm({
      name: expense.name,
      category: expense.category,
      calculationMethod: expense.calculationMethod,
      quantity: String(expense.quantity),
      rate: String(expense.rate),
      description: expense.description ?? "",
      scope: expense.productSizeId ? "SIZE" : "SHARED"
    });

    setIsExpenseModalOpen(true);
  }

  function closeExpenseModal() {
    if (isSavingExpense) return;

    setIsExpenseModalOpen(false);
    setEditingExpense(null);
    setExpenseForm(initialExpenseForm);
  }

  async function handleSaveExpense(event: FormEvent) {
    event.preventDefault();

    if (!selectedProduct?.isActive) return;

    const quantity = Number(expenseForm.quantity);
    const rate = Number(expenseForm.rate);

    if (!Number.isFinite(quantity) || quantity <= 0) {
      toast.warning("Enter a valid expense quantity");
      return;
    }

    if (!Number.isFinite(rate) || rate < 0) {
      toast.warning("Enter a valid expense rate");
      return;
    }

    setIsSavingExpense(true);

    try {
      const payload = {
        productId: selectedProduct.id,
        productSizeId:
          expenseForm.scope === "SHARED"
            ? null
            : selectedSizeId || null,
        name: expenseForm.name.trim(),
        category: expenseForm.category,
        calculationMethod: expenseForm.calculationMethod,
        quantity,
        rate,
        description: expenseForm.description.trim() || null
      };

      if (editingExpense) {
        await apiRequest(`/recipe-expenses/${editingExpense.id}`, {
          method: "PUT",
          body: JSON.stringify(payload)
        });

        toast.success("Recipe expense updated");
      } else {
        await apiRequest("/recipe-expenses", {
          method: "POST",
          body: JSON.stringify(payload)
        });

        toast.success("Recipe expense added");
      }

      setIsExpenseModalOpen(false);
      setEditingExpense(null);
      setExpenseForm(initialExpenseForm);

      await Promise.all([
        loadExpenses(selectedProduct.id, selectedSizeId, productionQty),
        loadCostPreview(selectedProduct.id, selectedSizeId, productionQty)
      ]);
    } catch (error) {
      toast.error("Expense save failed", getErrorMessage(error));
    } finally {
      setIsSavingExpense(false);
    }
  }

  async function handleDeleteExpense() {
    if (!selectedProduct || !deletingExpense) return;

    setIsDeletingExpense(true);

    try {
      await apiRequest(`/recipe-expenses/${deletingExpense.id}`, {
        method: "DELETE"
      });

      toast.success("Recipe expense deactivated");
      setDeletingExpense(null);

      await Promise.all([
        loadExpenses(selectedProduct.id, selectedSizeId, productionQty),
        loadCostPreview(selectedProduct.id, selectedSizeId, productionQty)
      ]);
    } catch (error) {
      toast.error("Expense removal failed", getErrorMessage(error));
    } finally {
      setIsDeletingExpense(false);
    }
  }

  const hasShortage = costPreview?.lines.some(
    (line) => !line.isAvailable
  );

  return (
    <AppLayout
      activeItem="Products & Recipes"
      title="Products & Recipes"
      subtitle="Manage official Baura products, size-specific recipes, production expenses and estimated costing."
      actions={
        <>
          <button
            type="button"
            onClick={() => void loadProducts(true)}
            disabled={isLoading || isSyncing}
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
            onClick={() => void handleSyncOfficialProducts()}
            disabled={isSyncing || isLoading}
            className="erp-button-primary"
          >
            <RefreshCw
              size={14}
              className={isSyncing ? "animate-spin" : ""}
            />
            {isSyncing ? "Syncing..." : "Sync Website"}
          </button>
        </>
      }
    >
      <div className="mb-4 rounded-[16px] border border-bauraBorder bg-white px-4 py-3">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-bauraGoldSoft text-bauraGoldDark">
            <Globe2 size={17} />
          </div>

          <div className="min-w-0">
            <p className="text-[10px] font-semibold text-bauraInk">
              Official website catalogue
            </p>

            <p className="mt-1 text-[9px] leading-5 text-bauraMuted">
              Product names, sizes, images, prices and availability are
              controlled by the official Baura website. ERP manages recipes,
              production requirements, expenses and costing.
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[0.72fr_1.28fr]">
        <section className="erp-panel overflow-hidden">
          <div className="border-b border-bauraBorder p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="erp-section-title">Official Products</h2>
                <p className="erp-section-subtitle">
                  {filteredProducts.length} shown · {officialProducts.length} synchronized
                </p>
              </div>

              <span className="erp-badge bg-bauraGoldSoft text-bauraGoldDark">
                Website
              </span>
            </div>

            <div className="erp-search mt-4">
              <Search size={15} className="text-bauraMuted" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search official products..."
                className="w-full bg-transparent text-[11px] outline-none"
              />
            </div>

            <div className="mt-3 grid grid-cols-3 gap-2">
              {(["ACTIVE", "ALL", "INACTIVE"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setStatusFilter(value)}
                  className={`h-9 rounded-lg text-[9px] font-semibold ${
                    statusFilter === value
                      ? "bg-bauraPrimary text-white"
                      : "border border-bauraBorder bg-white text-bauraMuted hover:bg-bauraGoldSoft/40"
                  }`}
                >
                  {value}
                </button>
              ))}
            </div>
          </div>

          <div className="baura-scrollbar max-h-[calc(100vh-380px)] overflow-y-auto p-3">
            {isLoading ? (
              <EmptyState text="Loading official products..." />
            ) : filteredProducts.length === 0 ? (
              <EmptyState text="No synchronized products found." />
            ) : (
              <div className="grid gap-2.5">
                {filteredProducts.map((product) => {
                  const selected = selectedProduct?.id === product.id;

                  return (
                    <button
                      key={product.id}
                      type="button"
                      onClick={() => void loadProductDetail(product.id)}
                      className={`rounded-[15px] border p-3 text-left transition ${
                        selected
                          ? "border-bauraGold bg-bauraGoldSoft/45"
                          : "border-bauraBorder bg-white hover:border-bauraGold/40"
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <ProductThumbnail product={product} />

                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="truncate text-[11px] font-semibold text-bauraInk">
                                {product.displayName}
                              </p>

                              <p className="mt-1 text-[9px] text-bauraMuted">
                                {formatCurrency(product.sellPrice)}
                              </p>
                            </div>

                            <span
                              className={`erp-badge shrink-0 ${
                                product.isActive
                                  ? "bg-bauraSuccessSoft text-bauraSuccess"
                                  : "bg-bauraDangerSoft text-bauraDanger"
                              }`}
                            >
                              {product.isActive ? "Active" : "Inactive"}
                            </span>
                          </div>

                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <span className="text-[9px] text-bauraMuted">
                              {product.recipeItemCount ?? 0} recipe ingredients
                            </span>

                            <span className="erp-badge bg-bauraGoldSoft text-bauraGoldDark">
                              Official
                            </span>
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        <section className="erp-panel overflow-hidden p-5">
          {!selectedProduct ? (
            <div className="flex min-h-[500px] items-center justify-center text-center">
              <div>
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-bauraGoldSoft text-bauraGoldDark">
                  <CakeSlice size={25} />
                </div>

                <h3 className="mt-4 text-[13px] font-semibold">
                  No official product selected
                </h3>

                <p className="mt-2 max-w-sm text-[10px] leading-5 text-bauraMuted">
                  Select a synchronized product to manage its recipes and costs.
                </p>
              </div>
            </div>
          ) : (
            <>
              <div className="flex flex-col gap-4 border-b border-bauraBorder pb-5 lg:flex-row lg:items-start lg:justify-between">
                <div className="flex min-w-0 gap-4">
                  <ProductHeroImage product={selectedProduct} />

                  <div className="min-w-0">
                    <p className="text-[8px] font-semibold uppercase tracking-[0.12em] text-bauraGoldDark">
                      Official Product
                    </p>

                    <h2 className="mt-1 text-[19px] font-semibold tracking-[-0.03em] text-bauraInk">
                      {selectedProduct.displayName}
                    </h2>

                    <p className="mt-1 text-[9px] text-bauraMuted">
                      Website price {formatCurrency(selectedProduct.sellPrice)}
                    </p>

                    <p className="mt-1 text-[8px] text-bauraMuted2">
                      Last sync: {formatSyncTime(selectedProduct.officialSiteSyncedAt)}
                    </p>
                  </div>
                </div>

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
              </div>

              {!selectedProduct.isActive && (
                <div className="mt-4 rounded-[14px] border border-amber-200 bg-bauraWarningSoft p-4">
                  <p className="text-[10px] font-semibold text-bauraInk">
                    This product is inactive on the official website.
                  </p>
                  <p className="mt-1 text-[9px] text-bauraMuted">
                    Existing recipes remain visible, but changes are disabled.
                  </p>
                </div>
              )}

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <label>
                  <span className="erp-label">Recipe / Product Size</span>
                  <select
                    value={selectedSizeId}
                    onChange={(event) => setSelectedSizeId(event.target.value)}
                    className="erp-input"
                  >
                    <option value="">Default Recipe</option>
                    {activeSizes.map((size) => (
                      <option key={size.id} value={size.id}>
                        {size.label} · {formatCurrency(size.price)}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  <span className="erp-label">Planned Production Quantity</span>
                  <input
                    type="number"
                    min="1"
                    max="100000"
                    step="1"
                    value={productionQty}
                    onChange={(event) => {
                      const value = Number(event.target.value);

                      if (Number.isInteger(value) && value > 0) {
                        setProductionQty(Math.min(value, 100000));
                      }
                    }}
                    className="erp-input"
                  />
                </label>
              </div>

              <p className="mt-2 text-[9px] text-bauraMuted">
                {selectedSize
                  ? `Managing the ${selectedSize.label} recipe. Ingredients are separate from other sizes.`
                  : "Managing the default recipe. Size-specific recipes are maintained separately."}
              </p>

              <div className="my-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <MiniStat
                  label="Selling Price"
                  value={formatCurrency(
                    costPreview?.sellPrice ??
                      selectedSize?.price ??
                      selectedProduct.sellPrice
                  )}
                />

                <MiniStat
                  label="Estimated Unit Cost"
                  value={
                    isCostLoading
                      ? "Calculating..."
                      : costPreview && !costPreview.canProduce
                        ? "Incomplete"
                        : formatCurrency(costPreview?.unitCost)
                  }
                />

                <MiniStat
                  label="Estimated Unit Profit"
                  value={
                    isCostLoading
                      ? "Calculating..."
                      : costPreview && !costPreview.canProduce
                        ? "Unavailable"
                        : formatCurrency(costPreview?.estimatedProfit)
                  }
                />

                <MiniStat
                  label="Estimated Margin"
                  value={
                    isCostLoading
                      ? "Calculating..."
                      : costPreview && !costPreview.canProduce
                        ? "Unavailable"
                        : `${costPreview?.profitMarginPercent ?? 0}%`
                  }
                />
              </div>

              {costError && (
                <div className="mb-5 rounded-xl border border-bauraDanger/30 bg-bauraDangerSoft p-4">
                  <div className="flex items-start gap-2">
                    <AlertTriangle size={15} className="text-bauraDanger" />
                    <p className="text-[10px] text-bauraInk">
                      Cost preview unavailable: {costError}
                    </p>
                  </div>
                </div>
              )}

              {costPreview && (
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
                          ? `Raw material stock is sufficient for ${productionQty} unit(s).`
                          : hasShortage
                            ? "Insufficient raw material stock for the planned production quantity."
                            : "This size does not have a complete production recipe."}
                      </p>

                      <p className="mt-1 text-[9px] leading-5 text-bauraMuted">
                        Estimates use available non-expired stock lots.
                        Costs and profit are incomplete when ingredients are unavailable.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="erp-section-title">Production Recipe</h3>
                  <p className="erp-section-subtitle">
                    Ingredients required for one finished unit.
                  </p>
                </div>

                {selectedProduct.isActive && (
                  <button
                    type="button"
                    onClick={openCreateRecipeModal}
                    className="erp-button-primary"
                  >
                    <PackagePlus size={13} />
                    Add Ingredient
                  </button>
                )}
              </div>

              <div className="baura-scrollbar mt-4 max-h-[320px] min-h-[160px] overflow-y-auto pr-1">
                {isDetailLoading ? (
                  <EmptyState text="Loading recipe..." />
                ) : visibleRecipeItems.length === 0 ? (
                  <div className="rounded-[15px] border border-dashed border-bauraBorder bg-bauraCanvas2 p-8 text-center">
                    <ClipboardList
                      size={23}
                      className="mx-auto text-bauraMuted2"
                    />

                    <p className="mt-3 text-[10px] font-semibold text-bauraInk">
                      No ingredients for this recipe
                    </p>

                    <p className="mt-1 text-[9px] text-bauraMuted">
                      Add the ingredient quantities needed for one finished unit.
                    </p>
                  </div>
                ) : (
                  <div className="grid gap-3">
                    {visibleRecipeItems.map((item) => {
                      const previewLine = costPreview?.lines.find(
                        (line) => line.recipeItemId === item.id
                      );

                      return (
                        <article
                          key={item.id}
                          className="rounded-[15px] border border-bauraBorder bg-white p-4"
                        >
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <div className="flex min-w-0 items-start gap-3">
                              <RecipeImage item={item} />

                              <div className="min-w-0">
                                <h4 className="text-[11px] font-semibold text-bauraInk">
                                  {item.ingredientDisplayName}
                                </h4>

                                <p className="mt-1 text-[9px] text-bauraMuted">
                                  Per unit:{" "}
                                  {formatQty(
                                    item.requiredBaseQty,
                                    item.baseUnit
                                  )}
                                </p>

                                {previewLine && (
                                  <>
                                    <p className="mt-1 text-[9px] text-bauraMuted">
                                      Batch:{" "}
                                      {formatQty(
                                        previewLine.totalRequiredBaseQty,
                                        item.baseUnit
                                      )}{" "}
                                      · {formatCurrency(previewLine.estimatedCost)}
                                    </p>

                                    {!previewLine.isAvailable && (
                                      <p className="mt-1 text-[9px] font-semibold text-bauraDanger">
                                        Shortage:{" "}
                                        {formatQty(
                                          previewLine.shortageBaseQty,
                                          item.baseUnit
                                        )}
                                      </p>
                                    )}
                                  </>
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
                                    onClick={() => openEditRecipeModal(item)}
                                    className="erp-button-secondary h-8 px-3"
                                  >
                                    <Edit3 size={12} />
                                    Edit
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => setDeletingRecipeItem(item)}
                                    className="erp-button-danger h-8 px-3"
                                  >
                                    <Trash2 size={12} />
                                  </button>
                                </>
                              )}
                            </div>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="mt-6 border-t border-bauraBorder pt-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="erp-section-title">Recipe Expenses</h3>
                    <p className="erp-section-subtitle">
                      Electricity, gas, labour, packaging and other costs.
                    </p>
                  </div>

                  {selectedProduct.isActive && (
                    <button
                      type="button"
                      onClick={openCreateExpenseModal}
                      className="erp-button-secondary"
                    >
                      <Plus size={13} />
                      Add Expense
                    </button>
                  )}
                </div>

                <div className="mt-4 grid gap-2">
                  {expenses.length === 0 ? (
                    <EmptyState text="No recipe expenses configured." />
                  ) : (
                    expenses.map((expense) => (
                      <article
                        key={expense.id}
                        className="rounded-[14px] border border-bauraBorder bg-white p-3"
                      >
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <div className="flex items-start gap-3">
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-bauraGoldSoft text-bauraGoldDark">
                              <Wallet size={16} />
                            </div>

                            <div>
                              <p className="text-[10px] font-semibold text-bauraInk">
                                {expense.name}
                              </p>

                              <p className="mt-1 text-[9px] text-bauraMuted">
                                {formatCategory(expense.category)} ·{" "}
                                {formatCategory(expense.calculationMethod)}
                              </p>

                              <p className="mt-1 text-[9px] text-bauraMuted">
                                {expense.productSizeId
                                  ? "Selected size"
                                  : "Shared across sizes"}
                              </p>
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-2">
                            <div className="mr-2 text-right">
                              <p className="text-[11px] font-semibold text-bauraInk">
                                {formatCurrency(expense.estimatedAmount)}
                              </p>
                              <p className="text-[8px] text-bauraMuted">
                                Planned batch
                              </p>
                            </div>

                            {selectedProduct.isActive && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => openEditExpenseModal(expense)}
                                  className="erp-button-secondary h-8 px-3"
                                >
                                  <Edit3 size={12} />
                                </button>

                                <button
                                  type="button"
                                  onClick={() => setDeletingExpense(expense)}
                                  className="erp-button-danger h-8 px-3"
                                >
                                  <Trash2 size={12} />
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      </article>
                    ))
                  )}
                </div>
              </div>

              {costPreview && (
                <div className="mt-6 rounded-[16px] border border-bauraBorder bg-bauraCanvas2 p-5">
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <div>
                      <h3 className="erp-section-title">
                        Estimated Production Cost
                      </h3>
                      <p className="erp-section-subtitle">
                        For {productionQty} finished unit(s)
                      </p>
                    </div>

                    <span className="erp-badge bg-bauraGoldSoft text-bauraGoldDark">
                      Estimate
                    </span>
                  </div>

                  <div className="grid gap-3">
                    <CostRow
                      label="Ingredient Cost"
                      value={costPreview.ingredientCostTotal}
                    />

                    <CostRow
                      label="Recipe Expenses"
                      value={costPreview.expenseCostTotal}
                    />

                    <div className="border-t border-bauraBorder pt-3">
                      <CostRow
                        label="Total Production Cost"
                        value={costPreview.totalProductionCost}
                        strong
                      />
                    </div>

                    <CostRow
                      label="Estimated Cost / Unit"
                      value={costPreview.unitCost}
                    />

                    <CostRow
                      label="Selling Price / Unit"
                      value={costPreview.sellPrice}
                    />

                    <div className="border-t border-bauraBorder pt-3">
                      <CostRow
                        label="Estimated Profit / Unit"
                        value={costPreview.estimatedProfit}
                        strong
                      />
                    </div>
                  </div>

                  {!costPreview.canProduce && (
                    <p className="mt-4 text-[9px] font-semibold text-bauraDanger">
                      Warning: This estimate is incomplete because the recipe
                      or available ingredient stock is insufficient.
                    </p>
                  )}

                  <p className="mt-3 text-[9px] leading-5 text-bauraMuted">
                    These are planning estimates. Actual production expense
                    snapshots and finished-goods valuation will be handled
                    when the production module is updated.
                  </p>
                </div>
              )}
            </>
          )}
        </section>
      </div>

      <Modal
        open={isRecipeModalOpen}
        onClose={closeRecipeModal}
        title={editingRecipeItem ? "Edit Recipe Ingredient" : "Add Recipe Ingredient"}
        subtitle={
          selectedProduct
            ? `${selectedProduct.displayName} · ${
                selectedSize?.label ?? "Default Recipe"
              }`
            : ""
        }
        widthClassName="max-w-3xl"
      >
        <form onSubmit={handleSaveRecipeItem} className="grid gap-5">
          <div className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
            <ImageUploadField
              label="Recipe Item Image"
              value={recipeForm.imageUrl}
              onChange={(imageUrl) =>
                setRecipeForm((current) => ({
                  ...current,
                  imageUrl
                }))
              }
              folder="baura/recipes"
            />

            <div className="grid content-start gap-4">
              <label>
                <span className="erp-label">Ingredient</span>

                <select
                  value={recipeForm.ingredientId}
                  onChange={(event) =>
                    setRecipeForm((current) => ({
                      ...current,
                      ingredientId: event.target.value
                    }))
                  }
                  className="erp-input"
                  required
                >
                  <option value="">Select ingredient</option>

                  {ingredients.map((ingredient) => (
                    <option key={ingredient.id} value={ingredient.id}>
                      {ingredient.displayName} · {ingredient.baseUnit}
                    </option>
                  ))}
                </select>
              </label>

              <Input
                label={
                  selectedIngredient
                    ? `Required Qty per Unit (${selectedIngredient.baseUnit})`
                    : "Required Qty per Unit"
                }
                type="number"
                value={recipeForm.requiredBaseQty}
                onChange={(value) =>
                  setRecipeForm((current) => ({
                    ...current,
                    requiredBaseQty: value
                  }))
                }
                placeholder="250"
              />

              {selectedIngredient?.imageUrl && !recipeForm.imageUrl && (
                <div className="rounded-xl border border-bauraBorder bg-bauraCanvas2 p-3">
                  <p className="text-[9px] leading-5 text-bauraMuted">
                    The ingredient image will be used when no recipe-specific
                    image is selected.
                  </p>
                </div>
              )}
            </div>
          </div>

          <ModalActions
            isLoading={isSavingRecipe}
            onCancel={closeRecipeModal}
            submitText={
              editingRecipeItem
                ? "Save Recipe Ingredient"
                : "Add Recipe Ingredient"
            }
          />
        </form>
      </Modal>

      <Modal
        open={isExpenseModalOpen}
        onClose={closeExpenseModal}
        title={editingExpense ? "Edit Recipe Expense" : "Add Recipe Expense"}
        subtitle="Configure an expense included in estimated production costing."
        widthClassName="max-w-2xl"
      >
        <form onSubmit={handleSaveExpense} className="grid gap-4">
          <Input
            label="Expense Name"
            value={expenseForm.name}
            onChange={(value) =>
              setExpenseForm((current) => ({
                ...current,
                name: value
              }))
            }
            placeholder="Electricity"
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <label>
              <span className="erp-label">Category</span>

              <select
                value={expenseForm.category}
                onChange={(event) =>
                  setExpenseForm((current) => ({
                    ...current,
                    category: event.target.value as ExpenseCategory
                  }))
                }
                className="erp-input"
              >
                {expenseCategories.map((category) => (
                  <option key={category} value={category}>
                    {formatCategory(category)}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span className="erp-label">Calculation Method</span>

              <select
                value={expenseForm.calculationMethod}
                onChange={(event) =>
                  setExpenseForm((current) => ({
                    ...current,
                    calculationMethod: event.target.value as CalculationMethod
                  }))
                }
                className="erp-input"
              >
                {calculationMethods.map((method) => (
                  <option key={method.value} value={method.value}>
                    {method.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label>
            <span className="erp-label">Expense Applies To</span>

            <select
              value={expenseForm.scope}
              onChange={(event) =>
                setExpenseForm((current) => ({
                  ...current,
                  scope: event.target.value as "SHARED" | "SIZE"
                }))
              }
              className="erp-input"
            >
              <option value="SHARED">All Product Sizes</option>

              {selectedSizeId && (
                <option value="SIZE">
                  Selected Size ({selectedSize?.label})
                </option>
              )}
            </select>
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Quantity"
              type="number"
              value={expenseForm.quantity}
              onChange={(value) =>
                setExpenseForm((current) => ({
                  ...current,
                  quantity: value
                }))
              }
              placeholder="1"
            />

            <Input
              label="Rate (Rs.)"
              type="number"
              value={expenseForm.rate}
              onChange={(value) =>
                setExpenseForm((current) => ({
                  ...current,
                  rate: value
                }))
              }
              placeholder="250"
            />
          </div>

          <p className="rounded-xl border border-bauraBorder bg-bauraCanvas2 p-3 text-[9px] leading-5 text-bauraMuted">
            Per Batch: rate charged once per batch. Per Unit: rate multiplied
            by the number of finished products. Quantity × Rate: entered
            quantity multiplied by rate once per batch.
          </p>

          <label>
            <span className="erp-label">Description (Optional)</span>

            <textarea
              value={expenseForm.description}
              onChange={(event) =>
                setExpenseForm((current) => ({
                  ...current,
                  description: event.target.value
                }))
              }
              className="erp-input min-h-[90px] resize-y"
              placeholder="Additional details..."
              maxLength={500}
            />
          </label>

          <ModalActions
            isLoading={isSavingExpense}
            onCancel={closeExpenseModal}
            submitText={
              editingExpense ? "Save Expense" : "Add Expense"
            }
          />
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(deletingRecipeItem)}
        title="Remove recipe ingredient?"
        message={
          deletingRecipeItem
            ? `${deletingRecipeItem.ingredientDisplayName} will be removed from this recipe.`
            : ""
        }
        confirmText="Remove"
        isDanger
        isLoading={isDeletingRecipe}
        onCancel={() => setDeletingRecipeItem(null)}
        onConfirm={handleDeleteRecipeItem}
      />

      <ConfirmDialog
        open={Boolean(deletingExpense)}
        title="Deactivate recipe expense?"
        message={
          deletingExpense
            ? `${deletingExpense.name} will be deactivated. Existing production records will not be deleted.`
            : ""
        }
        confirmText="Deactivate"
        isDanger
        isLoading={isDeletingExpense}
        onCancel={() => setDeletingExpense(null)}
        onConfirm={handleDeleteExpense}
      />
    </AppLayout>
  );
}

function ProductThumbnail({ product }: { product: Product }) {
  if (product.imageUrl) {
    return (
      <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl border border-bauraBorder bg-bauraCanvas2">
        <img
          src={product.imageUrl}
          alt={product.displayName}
          className="h-full w-full object-cover"
          loading="lazy"
        />
      </div>
    );
  }

  return (
    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-bauraGoldSoft text-bauraGoldDark">
      <CakeSlice size={20} />
    </div>
  );
}

function ProductHeroImage({ product }: { product: Product }) {
  if (product.imageUrl) {
    return (
      <div className="h-20 w-20 shrink-0 overflow-hidden rounded-[16px] border border-bauraBorder bg-bauraCanvas2">
        <img
          src={product.imageUrl}
          alt={product.displayName}
          className="h-full w-full object-cover"
        />
      </div>
    );
  }

  return (
    <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-[16px] bg-bauraGoldSoft text-bauraGoldDark">
      <CakeSlice size={27} />
    </div>
  );
}

function RecipeImage({ item }: { item: RecipeItem }) {
  const image =
    item.displayImageUrl ||
    item.imageUrl ||
    item.ingredientImageUrl;

  if (image) {
    return (
      <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl border border-bauraBorder bg-bauraCanvas2">
        <img
          src={image}
          alt={item.ingredientDisplayName}
          className="h-full w-full object-cover"
          loading="lazy"
        />
      </div>
    );
  }

  return (
    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-bauraGoldSoft text-bauraGoldDark">
      <ClipboardList size={19} />
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

function CostRow({
  label,
  value,
  strong = false
}: {
  label: string;
  value: number;
  strong?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span
        className={
          strong
            ? "text-[11px] font-semibold text-bauraInk"
            : "text-[10px] text-bauraMuted"
        }
      >
        {label}
      </span>

      <span
        className={
          strong
            ? "text-[12px] font-semibold text-bauraInk"
            : "text-[10px] font-medium text-bauraInk"
        }
      >
        {formatCurrency(value)}
      </span>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="flex min-h-[160px] flex-col items-center justify-center rounded-[15px] border border-dashed border-bauraBorder bg-bauraCanvas2 px-6 text-center">
      <ImageIcon size={21} className="text-bauraMuted2" />

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
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  required?: boolean;
}) {
  return (
    <label>
      <span className="erp-label">{label}</span>

      <input
        className="erp-input"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        type={type}
        required={required}
        min={type === "number" ? "0" : undefined}
        step={type === "number" ? "any" : undefined}
      />
    </label>
  );
}

function ModalActions({
  isLoading,
  onCancel,
  submitText
}: {
  isLoading: boolean;
  onCancel: () => void;
  submitText: string;
}) {
  return (
    <div className="flex flex-col-reverse gap-2 border-t border-bauraBorder pt-5 sm:flex-row sm:justify-end">
      <button
        type="button"
        onClick={onCancel}
        disabled={isLoading}
        className="erp-button-secondary"
      >
        Cancel
      </button>

      <button
        type="submit"
        disabled={isLoading}
        className="erp-button-primary"
      >
        {isLoading ? "Saving..." : submitText}
      </button>
    </div>
  );
}
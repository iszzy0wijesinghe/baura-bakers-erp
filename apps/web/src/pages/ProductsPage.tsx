import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import {
  AlertTriangle,
  CakeSlice,
  CheckCircle2,
  ClipboardList,
  Edit3,
  PackagePlus,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  XCircle
} from "lucide-react";
import { AppLayout } from "../layouts/AppLayout";
import { apiRequest } from "../lib/api";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { Modal } from "../ui/Modal";
import { useToast } from "../ui/ToastProvider";

type BaseUnit = "G" | "ML" | "UNIT";

type Ingredient = {
  id: string;
  displayName: string;
  baseQty: string;
  baseUnit: BaseUnit;
  isActive: boolean;
};

type RecipeItem = {
  id: string;
  productId: string;
  ingredientId: string;
  ingredientDisplayName: string;
  requiredBaseQty: string;
  baseUnit: BaseUnit;
};

type Product = {
  id: string;
  name: string;
  variantName: string | null;
  displayName: string;
  sellPrice: string;
  isActive: boolean;
  recipeItemCount?: number;
  recipeItems?: RecipeItem[];
  createdAt: string;
  updatedAt: string;
};

type CostPreviewLine = {
  recipeItemId: string;
  ingredientId: string;
  ingredientDisplayName: string;
  requiredBaseQty: number;
  baseUnit: BaseUnit;
  estimatedCost: number;
  availableBaseQty: number;
  shortageBaseQty: number;
  isAvailable: boolean;
};

type CostPreview = {
  productId: string;
  sellPrice: number;
  currentCost: number;
  estimatedProfit: number;
  profitMarginPercent: number;
  canProduce: boolean;
  lines: CostPreviewLine[];
};

const initialProductForm = {
  name: "",
  variantName: "",
  sellPrice: ""
};

const initialRecipeForm = {
  ingredientId: "",
  requiredBaseQty: ""
};

function formatCurrency(value: number | string | undefined) {
  const amount = Number(value || 0);

  return `Rs. ${amount.toLocaleString("en-LK", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
}

function formatQty(value: number | string | undefined, unit?: string) {
  const amount = Number(value || 0);

  const cleanAmount = amount.toLocaleString("en-LK", {
    maximumFractionDigits: 3
  });

  return unit ? `${cleanAmount} ${unit}` : cleanAmount;
}

export function ProductsPage() {
  const toast = useToast();

  const [products, setProducts] = useState<Product[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [costPreview, setCostPreview] = useState<CostPreview | null>(null);

  const [productForm, setProductForm] = useState(initialProductForm);
  const [recipeForm, setRecipeForm] = useState(initialRecipeForm);

  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [editingRecipeItem, setEditingRecipeItem] = useState<RecipeItem | null>(
    null
  );
  const [statusProduct, setStatusProduct] = useState<Product | null>(null);
  const [deletingRecipeItem, setDeletingRecipeItem] =
    useState<RecipeItem | null>(null);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "ACTIVE" | "ALL" | "INACTIVE"
  >("ACTIVE");

  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [isRecipeModalOpen, setIsRecipeModalOpen] = useState(false);

  const [isLoading, setIsLoading] = useState(true);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [isCostLoading, setIsCostLoading] = useState(false);
  const [isSavingProduct, setIsSavingProduct] = useState(false);
  const [isSavingRecipe, setIsSavingRecipe] = useState(false);
  const [isChangingStatus, setIsChangingStatus] = useState(false);
  const [isDeletingRecipe, setIsDeletingRecipe] = useState(false);
  const [error, setError] = useState("");

  const selectedIngredient = ingredients.find(
    (ingredient) => ingredient.id === recipeForm.ingredientId
  );

  const filteredProducts = useMemo(() => {
    const keyword = search.trim().toLowerCase();

    return products.filter((product) => {
      const matchesSearch =
        !keyword ||
        product.displayName.toLowerCase().includes(keyword) ||
        product.name.toLowerCase().includes(keyword) ||
        product.variantName?.toLowerCase().includes(keyword);

      const matchesStatus =
        statusFilter === "ALL" ||
        (statusFilter === "ACTIVE" && product.isActive) ||
        (statusFilter === "INACTIVE" && !product.isActive);

      return matchesSearch && matchesStatus;
    });
  }, [products, search, statusFilter]);

  const recipePreview = useMemo(() => {
    if (!selectedIngredient || !recipeForm.requiredBaseQty) return null;

    return {
      ingredientName: selectedIngredient.displayName,
      requiredBaseQty: Number(recipeForm.requiredBaseQty),
      baseUnit: selectedIngredient.baseUnit
    };
  }, [selectedIngredient, recipeForm.requiredBaseQty]);

  async function loadProducts(showToast = false) {
    setIsLoading(true);
    setError("");

    try {
      const data = await apiRequest<{ products: Product[] }>("/products");
      setProducts(data.products);

      if (!selectedProduct && data.products.length > 0) {
        await loadProductDetail(data.products[0].id);
      }

      if (showToast) {
        toast.success("Products refreshed");
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to load products";
      setError(message);
      toast.error("Failed to load products", message);
    } finally {
      setIsLoading(false);
    }
  }

  async function loadIngredients() {
    try {
      const data = await apiRequest<{ ingredients: Ingredient[] }>(
        "/ingredients"
      );

      setIngredients(
        data.ingredients.filter((ingredient) => ingredient.isActive)
      );
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to load ingredients";
      toast.error("Failed to load ingredients", message);
    }
  }

  async function loadProductDetail(productId: string) {
    setIsDetailLoading(true);
    setError("");

    try {
      const data = await apiRequest<{ product: Product }>(
        `/products/${productId}`
      );

      setSelectedProduct(data.product);
      await loadCostPreview(productId);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to load product details";
      setError(message);
      toast.error("Failed to load product", message);
    } finally {
      setIsDetailLoading(false);
    }
  }

  async function loadCostPreview(productId: string) {
    setIsCostLoading(true);

    try {
      const data = await apiRequest<{ costPreview: CostPreview }>(
        `/products/${productId}/cost-preview`
      );

      setCostPreview(data.costPreview);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to calculate cost preview";
      setCostPreview(null);
      toast.error("Cost preview failed", message);
    } finally {
      setIsCostLoading(false);
    }
  }

  useEffect(() => {
    loadProducts();
    loadIngredients();
  }, []);

  function openCreateProductModal() {
    setEditingProduct(null);
    setProductForm(initialProductForm);
    setError("");
    setIsProductModalOpen(true);
  }

  function openEditProductModal(product: Product) {
    setEditingProduct(product);
    setProductForm({
      name: product.name,
      variantName: product.variantName || "",
      sellPrice: String(product.sellPrice)
    });
    setError("");
    setIsProductModalOpen(true);
  }

  function closeProductModal() {
    if (isSavingProduct) return;

    setIsProductModalOpen(false);
    setEditingProduct(null);
    setProductForm(initialProductForm);
    setError("");
  }

  function openCreateRecipeModal() {
    if (!selectedProduct) {
      toast.info("Select a product first");
      return;
    }

    if (!selectedProduct.isActive) {
      toast.info("Inactive product", "Activate product before editing recipe.");
      return;
    }

    setEditingRecipeItem(null);
    setRecipeForm(initialRecipeForm);
    setError("");
    setIsRecipeModalOpen(true);
  }

  function openEditRecipeModal(recipeItem: RecipeItem) {
    if (!selectedProduct?.isActive) {
      toast.info("Inactive product", "Activate product before editing recipe.");
      return;
    }

    setEditingRecipeItem(recipeItem);
    setRecipeForm({
      ingredientId: recipeItem.ingredientId,
      requiredBaseQty: String(recipeItem.requiredBaseQty)
    });
    setError("");
    setIsRecipeModalOpen(true);
  }

  function closeRecipeModal() {
    if (isSavingRecipe) return;

    setIsRecipeModalOpen(false);
    setEditingRecipeItem(null);
    setRecipeForm(initialRecipeForm);
    setError("");
  }

  async function handleSaveProduct(event: FormEvent) {
    event.preventDefault();

    setError("");
    setIsSavingProduct(true);

    const payload = {
      name: productForm.name.trim(),
      variantName: productForm.variantName.trim() || null,
      sellPrice: Number(productForm.sellPrice)
    };

    try {
      if (editingProduct) {
        await apiRequest(`/products/${editingProduct.id}`, {
          method: "PUT",
          body: JSON.stringify(payload)
        });

        toast.success("Product updated", payload.name);
        closeProductModal();

        await loadProducts();
        await loadProductDetail(editingProduct.id);
      } else {
        const data = await apiRequest<{ product: Product }>("/products", {
          method: "POST",
          body: JSON.stringify(payload)
        });

        toast.success("Product created", data.product.displayName);
        closeProductModal();

        await loadProducts();
        await loadProductDetail(data.product.id);
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to save product";
      setError(message);
      toast.error("Save failed", message);
    } finally {
      setIsSavingProduct(false);
    }
  }

  async function handleSaveRecipeItem(event: FormEvent) {
    event.preventDefault();

    if (!selectedProduct || !selectedIngredient) return;

    setError("");
    setIsSavingRecipe(true);

    const payload = {
      ingredientId: selectedIngredient.id,
      requiredBaseQty: Number(recipeForm.requiredBaseQty),
      baseUnit: selectedIngredient.baseUnit
    };

    try {
      if (editingRecipeItem) {
        await apiRequest(
          `/products/${selectedProduct.id}/recipe-items/${editingRecipeItem.id}`,
          {
            method: "PUT",
            body: JSON.stringify(payload)
          }
        );

        toast.success("Recipe item updated", selectedIngredient.displayName);
      } else {
        await apiRequest(`/products/${selectedProduct.id}/recipe-items`, {
          method: "POST",
          body: JSON.stringify(payload)
        });

        toast.success("Recipe item added", selectedIngredient.displayName);
      }

      closeRecipeModal();

      await loadProducts();
      await loadProductDetail(selectedProduct.id);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to save recipe item";
      setError(message);
      toast.error("Recipe save failed", message);
    } finally {
      setIsSavingRecipe(false);
    }
  }

  async function handleChangeProductStatus() {
    if (!statusProduct) return;

    setIsChangingStatus(true);

    try {
      const endpoint = statusProduct.isActive
        ? `/products/${statusProduct.id}/deactivate`
        : `/products/${statusProduct.id}/activate`;

      await apiRequest(endpoint, {
        method: "PATCH"
      });

      toast.success(
        statusProduct.isActive ? "Product deactivated" : "Product activated",
        statusProduct.displayName
      );

      const productId = statusProduct.id;
      setStatusProduct(null);

      await loadProducts();
      await loadProductDetail(productId);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to update product status";
      toast.error("Status update failed", message);
    } finally {
      setIsChangingStatus(false);
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

      toast.success(
        "Recipe item removed",
        deletingRecipeItem.ingredientDisplayName
      );

      setDeletingRecipeItem(null);

      await loadProducts();
      await loadProductDetail(selectedProduct.id);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to remove recipe item";
      toast.error("Remove failed", message);
    } finally {
      setIsDeletingRecipe(false);
    }
  }

  return (
    <AppLayout
      activeItem="Products & Recipes"
      title="Products & Recipes"
      subtitle="Create sellable bakery products and define recipe ingredients for cost, profit and FIFO stock usage."
      actions={
        <>
          <button
            onClick={() => loadProducts(true)}
            className="flex items-center gap-2 rounded-2xl border border-bauraBrown/10 bg-bauraSoft px-4 py-3 text-sm font-semibold shadow-sm"
          >
            <RefreshCw size={16} />
            Refresh
          </button>

          <button
            onClick={openCreateProductModal}
            className="flex items-center gap-2 rounded-2xl bg-bauraBrown px-5 py-3 text-sm font-bold text-bauraCream shadow-sm"
          >
            <Plus size={16} />
            New Product
          </button>
        </>
      }
    >
      <div className="grid gap-5 xl:grid-cols-[0.75fr_1.25fr]">
        <section className="rounded-[2rem] border border-bauraBrown/10 bg-bauraSoft p-5 shadow-sm">
          <div className="mb-5 flex flex-col gap-4">
            <div>
              <h3 className="font-bold">Sellable Products</h3>
              <p className="text-sm text-bauraBrown/60">
                {filteredProducts.length} shown · {products.length} total
              </p>
            </div>

            <div className="flex items-center gap-3 rounded-2xl border border-bauraBrown/10 bg-white px-4 py-3">
              <Search size={17} className="text-bauraBrown/45" />
              <input
                className="w-full bg-transparent text-sm outline-none"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search product..."
              />
            </div>

            <div className="grid grid-cols-3 gap-2">
              {(["ACTIVE", "ALL", "INACTIVE"] as const).map((status) => (
                <button
                  key={status}
                  onClick={() => setStatusFilter(status)}
                  className={`rounded-2xl px-3 py-2 text-xs font-bold transition ${
                    statusFilter === status
                      ? "bg-bauraBrown text-bauraCream"
                      : "bg-white text-bauraBrown/65 hover:bg-white/70"
                  }`}
                >
                  {status}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="baura-scrollbar max-h-[calc(100vh-335px)] overflow-auto pr-1">
            {isLoading ? (
              <EmptyState text="Loading products..." />
            ) : filteredProducts.length === 0 ? (
              <EmptyState text="No products found." />
            ) : (
              <div className="grid gap-3">
                {filteredProducts.map((product) => {
                  const isSelected = selectedProduct?.id === product.id;

                  return (
                    <button
                      key={product.id}
                      onClick={() => loadProductDetail(product.id)}
                      className={`rounded-3xl border p-4 text-left transition ${
                        isSelected
                          ? "border-bauraGold bg-bauraGold/15"
                          : "border-bauraBrown/10 bg-white/60 hover:bg-white/80"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h4 className="truncate font-bold">
                            {product.displayName}
                          </h4>
                          <p className="mt-1 text-sm text-bauraBrown/60">
                            Sell price {formatCurrency(product.sellPrice)}
                          </p>
                        </div>

                        <span
                          className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ${
                            product.isActive
                              ? "bg-green-100 text-green-700"
                              : "bg-red-100 text-red-700"
                          }`}
                        >
                          {product.isActive ? "Active" : "Inactive"}
                        </span>
                      </div>

                      <div className="mt-3 flex items-center justify-between gap-3 text-sm">
                        <span className="text-bauraBrown/60">
                          {product.recipeItemCount || 0} recipe ingredient
                          {(product.recipeItemCount || 0) === 1 ? "" : "s"}
                        </span>

                        <span className="truncate font-bold">
                          {product.variantName || "Standard"}
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
          {!selectedProduct ? (
            <div className="flex min-h-[420px] items-center justify-center rounded-3xl bg-white/50 p-6 text-center">
              <div>
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-3xl bg-bauraBrown text-bauraGold">
                  <CakeSlice size={26} />
                </div>
                <h3 className="mt-4 font-bold">No product selected</h3>
                <p className="mt-2 text-sm text-bauraBrown/60">
                  Create or select a product to manage recipe, cost and profit.
                </p>
              </div>
            </div>
          ) : (
            <>
              <div className="mb-5 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-bauraGold">
                    Selected Product
                  </p>
                  <h3 className="mt-1 text-2xl font-bold">
                    {selectedProduct.displayName}
                  </h3>
                  <p className="mt-1 text-sm text-bauraBrown/60">
                    Sell Price {formatCurrency(selectedProduct.sellPrice)} ·{" "}
                    {selectedProduct.recipeItems?.length || 0} recipe ingredient
                    {(selectedProduct.recipeItems?.length || 0) === 1
                      ? ""
                      : "s"}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  {selectedProduct.isActive && (
                    <>
                      <button
                        onClick={() => openEditProductModal(selectedProduct)}
                        className="flex items-center gap-2 rounded-2xl border border-bauraBrown/10 bg-white px-4 py-3 text-sm font-bold text-bauraBrown shadow-sm"
                      >
                        <Edit3 size={16} />
                        Edit
                      </button>

                      <button
                        onClick={openCreateRecipeModal}
                        className="flex items-center gap-2 rounded-2xl bg-bauraBrown px-5 py-3 text-sm font-bold text-bauraCream shadow-sm"
                      >
                        <PackagePlus size={16} />
                        Add Recipe Item
                      </button>
                    </>
                  )}

                  <button
                    onClick={() => setStatusProduct(selectedProduct)}
                    className={`flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-bold shadow-sm ${
                      selectedProduct.isActive
                        ? "border border-red-100 bg-red-50 text-red-700"
                        : "border border-green-100 bg-green-50 text-green-700"
                    }`}
                  >
                    {selectedProduct.isActive ? (
                      <XCircle size={16} />
                    ) : (
                      <CheckCircle2 size={16} />
                    )}
                    {selectedProduct.isActive ? "Deactivate" : "Activate"}
                  </button>
                </div>
              </div>

              <div className="mb-5 grid gap-3 md:grid-cols-4">
                <MiniStat
                  label="Sell Price"
                  value={formatCurrency(selectedProduct.sellPrice)}
                />
                <MiniStat
                  label="Current Cost"
                  value={
                    isCostLoading
                      ? "Calculating..."
                      : formatCurrency(costPreview?.currentCost)
                  }
                />
                <MiniStat
                  label="Profit / Loss"
                  value={
                    isCostLoading
                      ? "—"
                      : formatCurrency(costPreview?.estimatedProfit)
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
                selectedProduct.recipeItems.length > 0 && (
                  <div
                    className={`mb-5 rounded-3xl border p-4 text-sm ${
                      costPreview.canProduce
                        ? "border-green-200 bg-green-50 text-green-800"
                        : "border-amber-200 bg-amber-50 text-amber-800"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      {costPreview.canProduce ? (
                        <CheckCircle2 size={18} className="mt-0.5 shrink-0" />
                      ) : (
                        <AlertTriangle size={18} className="mt-0.5 shrink-0" />
                      )}

                      <div>
                        <p className="font-bold">
                          {costPreview.canProduce
                            ? "Enough stock available for this product."
                            : "Not enough stock for this recipe."}
                        </p>
                        <p className="mt-1 opacity-80">
                          Cost preview uses current Carter stock lots in FIFO
                          order.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

              <div className="baura-scrollbar max-h-[calc(100vh-430px)] overflow-auto pr-1">
                {isDetailLoading ? (
                  <EmptyState text="Loading product details..." />
                ) : !selectedProduct.recipeItems ||
                  selectedProduct.recipeItems.length === 0 ? (
                  <EmptyState text="No recipe ingredients added yet." />
                ) : (
                  <div className="grid gap-3">
                    {selectedProduct.recipeItems.map((item) => {
                      const previewLine = costPreview?.lines.find(
                        (line) => line.recipeItemId === item.id
                      );

                      return (
                        <div
                          key={item.id}
                          className="rounded-3xl border border-bauraBrown/10 bg-white/60 p-4"
                        >
                          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                            <div className="flex items-start gap-3">
                              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-bauraBrown text-bauraGold">
                                <ClipboardList size={20} />
                              </div>

                              <div>
                                <h4 className="font-bold">
                                  {item.ingredientDisplayName}
                                </h4>

                                <p className="mt-1 text-sm text-bauraBrown/60">
                                  Required:{" "}
                                  {formatQty(
                                    item.requiredBaseQty,
                                    item.baseUnit
                                  )}
                                  {previewLine &&
                                    ` · Cost: ${formatCurrency(
                                      previewLine.estimatedCost
                                    )}`}
                                </p>

                                {previewLine && !previewLine.isAvailable && (
                                  <p className="mt-1 text-xs font-semibold text-red-700">
                                    Shortage:{" "}
                                    {formatQty(
                                      previewLine.shortageBaseQty,
                                      item.baseUnit
                                    )}
                                  </p>
                                )}
                              </div>
                            </div>

                            <div className="flex flex-wrap gap-2">
                              <span
                                className={`rounded-full px-3 py-1 text-xs font-bold ${
                                  previewLine?.isAvailable
                                    ? "bg-green-100 text-green-700"
                                    : "bg-amber-100 text-amber-700"
                                }`}
                              >
                                {previewLine?.isAvailable
                                  ? "Stock OK"
                                  : "Low Stock"}
                              </span>

                              {selectedProduct.isActive && (
                                <>
                                  <button
                                    onClick={() => openEditRecipeModal(item)}
                                    className="flex items-center gap-2 rounded-2xl border border-bauraBrown/10 bg-white px-3 py-2 text-xs font-bold text-bauraBrown"
                                  >
                                    <Edit3 size={14} />
                                    Edit
                                  </button>

                                  <button
                                    onClick={() =>
                                      setDeletingRecipeItem(item)
                                    }
                                    className="flex items-center gap-2 rounded-2xl border border-red-100 bg-red-50 px-3 py-2 text-xs font-bold text-red-700"
                                  >
                                    <Trash2 size={14} />
                                    Remove
                                  </button>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}
        </section>
      </div>

      <Modal
        open={isProductModalOpen}
        onClose={closeProductModal}
        title={editingProduct ? "Edit Product" : "Create Product"}
        subtitle="Create sellable bakery products. Recipe cost is calculated after ingredients are added."
      >
        <form onSubmit={handleSaveProduct} className="grid gap-4">
          <Input
            label="Product Name"
            value={productForm.name}
            onChange={(value) =>
              setProductForm((prev) => ({ ...prev, name: value }))
            }
            placeholder="Butter Cake"
          />

          <Input
            label="Variant / Size"
            value={productForm.variantName}
            onChange={(value) =>
              setProductForm((prev) => ({ ...prev, variantName: value }))
            }
            placeholder="1kg / Slice / Small"
            required={false}
          />

          <Input
            label="Sell Price"
            type="number"
            value={productForm.sellPrice}
            onChange={(value) =>
              setProductForm((prev) => ({ ...prev, sellPrice: value }))
            }
            placeholder="2500"
          />

          <ModalActions
            isLoading={isSavingProduct}
            onCancel={closeProductModal}
            submitText={editingProduct ? "Save Changes" : "Create Product"}
          />
        </form>
      </Modal>

      <Modal
        open={isRecipeModalOpen}
        onClose={closeRecipeModal}
        title={editingRecipeItem ? "Edit Recipe Item" : "Add Recipe Item"}
        subtitle={
          selectedProduct
            ? `Define ingredient quantity for ${selectedProduct.displayName}.`
            : ""
        }
      >
        <form onSubmit={handleSaveRecipeItem} className="grid gap-4">
          <label className="block">
            <span className="mb-2 block text-sm font-semibold">
              Ingredient
            </span>

            <select
              className="w-full rounded-2xl border border-bauraBrown/10 bg-white px-4 py-3 text-sm outline-none transition focus:border-bauraGold"
              value={recipeForm.ingredientId}
              onChange={(event) =>
                setRecipeForm((prev) => ({
                  ...prev,
                  ingredientId: event.target.value
                }))
              }
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
                ? `Required Qty (${selectedIngredient.baseUnit})`
                : "Required Qty"
            }
            type="number"
            value={recipeForm.requiredBaseQty}
            onChange={(value) =>
              setRecipeForm((prev) => ({
                ...prev,
                requiredBaseQty: value
              }))
            }
            placeholder="250"
          />

          {recipePreview && (
            <div className="rounded-3xl border border-bauraBrown/10 bg-white/60 p-4">
              <p className="text-sm font-bold">Recipe Preview</p>

              <div className="mt-3 grid gap-3 text-sm md:grid-cols-2">
                <PreviewStat
                  label="Ingredient"
                  value={recipePreview.ingredientName}
                />
                <PreviewStat
                  label="Required"
                  value={formatQty(
                    recipePreview.requiredBaseQty,
                    recipePreview.baseUnit
                  )}
                />
              </div>
            </div>
          )}

          <ModalActions
            isLoading={isSavingRecipe}
            onCancel={closeRecipeModal}
            submitText={
              editingRecipeItem ? "Save Recipe Item" : "Add Recipe Item"
            }
          />
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(statusProduct)}
        title={
          statusProduct?.isActive ? "Deactivate product?" : "Activate product?"
        }
        message={
          statusProduct?.isActive
            ? "Inactive products will not be available for recipe editing or POS selection."
            : "This product will become available again."
        }
        confirmText={statusProduct?.isActive ? "Deactivate" : "Activate"}
        isDanger={Boolean(statusProduct?.isActive)}
        isLoading={isChangingStatus}
        onCancel={() => setStatusProduct(null)}
        onConfirm={handleChangeProductStatus}
      />

      <ConfirmDialog
        open={Boolean(deletingRecipeItem)}
        title="Remove recipe ingredient?"
        message={
          deletingRecipeItem
            ? `${deletingRecipeItem.ingredientDisplayName} will be removed from this product recipe.`
            : ""
        }
        confirmText="Remove"
        isDanger
        isLoading={isDeletingRecipe}
        onCancel={() => setDeletingRecipeItem(null)}
        onConfirm={handleDeleteRecipeItem}
      />
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

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-3xl bg-white/60 p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-bauraBrown/45">
        {label}
      </p>
      <p className="mt-2 truncate text-sm font-bold">{value}</p>
    </div>
  );
}

function PreviewStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-bauraBrown/50">{label}</p>
      <p className="mt-1 font-bold text-bauraBrown">{value}</p>
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
    <label className="block">
      <span className="mb-2 block text-sm font-semibold">{label}</span>
      <input
        className="w-full rounded-2xl border border-bauraBrown/10 bg-white px-4 py-3 text-sm outline-none transition focus:border-bauraGold"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        type={type}
        required={required}
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
    <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
      <button
        type="button"
        onClick={onCancel}
        disabled={isLoading}
        className="rounded-2xl border border-bauraBrown/10 bg-white px-5 py-3 text-sm font-bold text-bauraBrown disabled:opacity-60"
      >
        Cancel
      </button>

      <button
        disabled={isLoading}
        className="rounded-2xl bg-bauraBrown px-5 py-3 text-sm font-bold text-bauraCream disabled:opacity-60"
      >
        {isLoading ? "Saving..." : submitText}
      </button>
    </div>
  );
}
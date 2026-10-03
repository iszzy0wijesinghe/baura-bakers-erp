import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import {
  AlertTriangle,
  Boxes,
  CalendarDays,
  ClipboardList,
  PackagePlus,
  Plus,
  RefreshCw,
  Search,
  ShoppingBasket,
} from "lucide-react";
import { AppLayout } from "../layouts/AppLayout";
import { apiRequest } from "../lib/api";
import { Modal } from "../ui/Modal";
import { useToast } from "../ui/ToastProvider";

type BaseUnit = "G" | "ML" | "UNIT";

type Ingredient = {
  id: string;
  displayName: string;
  baseQty: string;
  baseUnit: BaseUnit;
  isActive: boolean;
  imageUrl?: string | null;
};

type InventoryItem = {
  ingredientId: string;
  displayName: string;
  baseUnit: BaseUnit;
  qtyOnHand: number;
  stockValue: number;
  lowStockAlertQty: number | null;
  isOutOfStock?: boolean;
  isLowStock: boolean;
  stockPriority?: number;
  stockLotCount: number;
  oldestLotDate: string | null;
  latestLotDate: string | null;
  imageUrl?: string | null;
};

type InventoryStats = {
  totalActiveIngredients: number;
  outOfStockItems: number;
  lowStockItems: number;
  healthyStockItems: number;
  totalStockValue: number;
};

type CarterItem = {
  id: string;
  ingredientId?: string;
  ingredientDisplayName?: string;
  imageUrl?: string | null;
  loadedQty: string;
  pricePerPackage: string;
  totalBaseQty: string;
  totalPrice: string;
  unitCostBase: string;
  ingredient?: {
    id?: string;
    brand: string | null;
    name: string;
    packageQty: string;
    packageUnit: string;
    imageUrl?: string | null;
  };
};

type Carter = {
  id: string;
  carterNo: string;
  purchasedAt: string;
  supplierName: string | null;
  notes: string | null;
  itemCount?: number;
  totalCost?: number;
  items?: CarterItem[];
};

const initialCarterForm = {
  purchasedAt: new Date().toISOString().slice(0, 10),
  supplierName: "",
  notes: "",
};

const initialItemForm = {
  ingredientId: "",
  loadedQty: "",
  pricePerPackage: "",
};

const initialInventoryStats: InventoryStats = {
  totalActiveIngredients: 0,
  outOfStockItems: 0,
  lowStockItems: 0,
  healthyStockItems: 0,
  totalStockValue: 0,
};

function formatCurrency(value: number | string | undefined) {
  const amount = Number(value || 0);

  return `Rs. ${amount.toLocaleString("en-LK", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("en-LK", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
}

function formatQty(value: number | string | undefined, unit?: string) {
  const amount = Number(value || 0);

  const cleanAmount = amount.toLocaleString("en-LK", {
    maximumFractionDigits: 3,
  });

  return unit ? `${cleanAmount} ${unit}` : cleanAmount;
}

function getIngredientName(item: CarterItem) {
  if (item.ingredientDisplayName) return item.ingredientDisplayName;

  if (!item.ingredient) return "Ingredient";

  const brand = item.ingredient.brand ? `${item.ingredient.brand} ` : "";

  return `${brand}${item.ingredient.name} ${item.ingredient.packageQty}${item.ingredient.packageUnit.toLowerCase()}`;
}

function getCarterItemIngredientId(item: CarterItem) {
  return item.ingredientId || item.ingredient?.id || null;
}

export function CartersPage() {
  const toast = useToast();

  const [carters, setCarters] = useState<Carter[]>([]);
  const [selectedCarter, setSelectedCarter] = useState<Carter | null>(null);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [inventoryStats, setInventoryStats] = useState<InventoryStats>(
    initialInventoryStats,
  );

  const [carterForm, setCarterForm] = useState(initialCarterForm);
  const [itemForm, setItemForm] = useState(initialItemForm);

  const [search, setSearch] = useState("");
  const [stockSearch, setStockSearch] = useState("");

  const [isCarterModalOpen, setIsCarterModalOpen] = useState(false);
  const [isItemModalOpen, setIsItemModalOpen] = useState(false);

  const [isLoading, setIsLoading] = useState(true);
  const [isInventoryLoading, setIsInventoryLoading] = useState(true);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [isSavingCarter, setIsSavingCarter] = useState(false);
  const [isSavingItem, setIsSavingItem] = useState(false);
  const [, setError] = useState("");

  async function loadInventory() {
    setIsInventoryLoading(true);

    try {
      const data = await apiRequest<{
        inventory: InventoryItem[];
        stats?: InventoryStats;
      }>("/inventory");

      const apiInventory = Array.isArray(data.inventory)
        ? data.inventory
        : [];

      setInventory(apiInventory);

      setInventoryStats(
        data.stats || {
          totalActiveIngredients: apiInventory.length,
          outOfStockItems: apiInventory.filter(
            (item) => item.isOutOfStock || Number(item.qtyOnHand) <= 0,
          ).length,
          lowStockItems: apiInventory.filter(
            (item) => !item.isOutOfStock && item.isLowStock,
          ).length,
          healthyStockItems: apiInventory.filter(
            (item) =>
              !item.isOutOfStock &&
              !item.isLowStock &&
              Number(item.qtyOnHand) > 0,
          ).length,
          totalStockValue: apiInventory.reduce(
            (sum, item) => sum + Number(item.stockValue || 0),
            0,
          ),
        },
      );
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to load inventory";

      toast.error("Failed to load live stock", message);
    } finally {
      setIsInventoryLoading(false);
    }
  }

  async function loadCarters() {
    setIsLoading(true);
    setError("");

    try {
      const data = await apiRequest<{ carters: Carter[] }>("/carters");

      setCarters(data.carters);

      const selectedId = selectedCarter?.id;

      if (
        selectedId &&
        data.carters.some((carter) => carter.id === selectedId)
      ) {
        await loadCarterDetail(selectedId);
      } else if (data.carters.length > 0) {
        await loadCarterDetail(data.carters[0].id);
      } else {
        setSelectedCarter(null);
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to load Carters";

      setError(message);
      toast.error("Failed to load Carters", message);
    } finally {
      setIsLoading(false);
    }
  }

  async function loadIngredients() {
    try {
      const data = await apiRequest<{ ingredients: Ingredient[] }>(
        "/ingredients",
      );

      setIngredients(
        data.ingredients.filter((ingredient) => ingredient.isActive),
      );
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to load ingredients";

      toast.error("Failed to load ingredients", message);
    }
  }

  async function loadCarterDetail(carterId: string) {
    setIsDetailLoading(true);
    setError("");

    try {
      const data = await apiRequest<{ carter: Carter }>(
        `/carters/${carterId}`,
      );

      setSelectedCarter(data.carter);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to load Carter details";

      setError(message);
      toast.error("Failed to load Carter", message);
    } finally {
      setIsDetailLoading(false);
    }
  }

  async function refreshPage(showToast = false) {
    await Promise.all([
      loadCarters(),
      loadIngredients(),
      loadInventory(),
    ]);

    if (showToast) {
      toast.success("Carter inventory refreshed");
    }
  }

  useEffect(() => {
    refreshPage();
  }, []);

  const ingredientImageMap = useMemo(() => {
    return new Map(
      ingredients.map((ingredient) => [
        ingredient.id,
        ingredient.imageUrl || null,
      ]),
    );
  }, [ingredients]);

  const filteredCarters = useMemo(() => {
    const keyword = search.trim().toLowerCase();

    if (!keyword) return carters;

    return carters.filter((carter) => {
      return (
        carter.carterNo.toLowerCase().includes(keyword) ||
        carter.supplierName?.toLowerCase().includes(keyword) ||
        carter.notes?.toLowerCase().includes(keyword)
      );
    });
  }, [carters, search]);

  const activeIngredientIds = useMemo(() => {
    return new Set(
      ingredients
        .filter((ingredient) => ingredient.isActive)
        .map((ingredient) => ingredient.id),
    );
  }, [ingredients]);

  const visibleInventory = useMemo(() => {
    return inventory
      .filter((item) => activeIngredientIds.has(item.ingredientId))
      .sort((a, b) => {
        const aOut = a.isOutOfStock || Number(a.qtyOnHand) <= 0;
        const bOut = b.isOutOfStock || Number(b.qtyOnHand) <= 0;

        if (aOut && !bOut) return -1;
        if (!aOut && bOut) return 1;

        if (a.isLowStock && !b.isLowStock) return -1;
        if (!a.isLowStock && b.isLowStock) return 1;

        return a.displayName.localeCompare(b.displayName);
      });
  }, [inventory, activeIngredientIds]);

  const filteredInventory = useMemo(() => {
    const keyword = stockSearch.trim().toLowerCase();

    if (!keyword) return visibleInventory;

    return visibleInventory.filter((item) =>
      item.displayName.toLowerCase().includes(keyword),
    );
  }, [visibleInventory, stockSearch]);

  function openCarterModal() {
    setCarterForm(initialCarterForm);
    setError("");
    setIsCarterModalOpen(true);
  }

  function closeCarterModal() {
    if (isSavingCarter) return;

    setIsCarterModalOpen(false);
    setCarterForm(initialCarterForm);
    setError("");
  }

  function openItemModal() {
    if (!selectedCarter) {
      toast.info("Select a Carter first");
      return;
    }

    setItemForm(initialItemForm);
    setError("");
    setIsItemModalOpen(true);
  }

  function closeItemModal() {
    if (isSavingItem) return;

    setIsItemModalOpen(false);
    setItemForm(initialItemForm);
    setError("");
  }

  async function handleCreateCarter(event: FormEvent) {
    event.preventDefault();

    setIsSavingCarter(true);
    setError("");

    try {
      const data = await apiRequest<{ carter: Carter }>("/carters", {
        method: "POST",
        body: JSON.stringify({
          purchasedAt: carterForm.purchasedAt,
          supplierName: carterForm.supplierName || null,
          notes: carterForm.notes || null,
        }),
      });

      toast.success(
        "Carter created",
        `${data.carter.carterNo} was created.`,
      );

      setIsCarterModalOpen(false);
      setCarterForm(initialCarterForm);

      await loadCarters();
      await loadCarterDetail(data.carter.id);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to create Carter";

      setError(message);
      toast.error("Create failed", message);
    } finally {
      setIsSavingCarter(false);
    }
  }

  async function handleAddItem(event: FormEvent) {
    event.preventDefault();

    if (!selectedCarter) return;

    setIsSavingItem(true);
    setError("");

    try {
      await apiRequest(`/carters/${selectedCarter.id}/items`, {
        method: "POST",
        body: JSON.stringify({
          ingredientId: itemForm.ingredientId,
          loadedQty: Number(itemForm.loadedQty),
          pricePerPackage: Number(itemForm.pricePerPackage),
        }),
      });

      toast.success(
        "Stock added",
        "Ingredient stock lot was created.",
      );

      setIsItemModalOpen(false);
      setItemForm(initialItemForm);

      await loadCarterDetail(selectedCarter.id);
      await loadCarters();
      await loadInventory();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to add item";

      setError(message);
      toast.error("Add stock failed", message);
    } finally {
      setIsSavingItem(false);
    }
  }

  const selectedIngredient = ingredients.find(
    (ingredient) => ingredient.id === itemForm.ingredientId,
  );

  const itemPreview = useMemo(() => {
    if (
      !selectedIngredient ||
      !itemForm.loadedQty ||
      !itemForm.pricePerPackage
    ) {
      return null;
    }

    const loadedQty = Number(itemForm.loadedQty);
    const pricePerPackage = Number(itemForm.pricePerPackage);

    const totalBaseQty =
      Number(selectedIngredient.baseQty) * loadedQty;

    const totalPrice =
      loadedQty * pricePerPackage;

    const unitCost =
      totalBaseQty > 0
        ? totalPrice / totalBaseQty
        : 0;

    return {
      totalBaseQty,
      totalPrice,
      unitCost,
    };
  }, [
    selectedIngredient,
    itemForm.loadedQty,
    itemForm.pricePerPackage,
  ]);

  return (
    <AppLayout
      activeItem="Carter Inventory"
      title="Carter Inventory"
      subtitle="Create purchase Carters, add FIFO stock batches and monitor live item-wise stock."
      actions={
        <>
          <button
            onClick={() => refreshPage(true)}
            className="erp-button-secondary"
          >
            <RefreshCw size={16} />
            Refresh
          </button>

          <button
            onClick={openCarterModal}
            className="erp-button-primary"
          >
            <Plus size={16} />
            New Carter
          </button>
        </>
      }
    >
      <section className="mb-5 rounded-xl border border-bauraBorder bg-white p-5 shadow-[0_1px_2px_rgba(45,33,27,0.03)]">
        <div className="mb-4 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-bauraGold">
              Live Stock On Hand
            </p>

            <h3 className="mt-1 font-bold">
              Ingredient-wise Inventory
            </h3>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="grid grid-cols-4 gap-2 text-center">
              <LiveStockMiniStat
                label="Active"
                value={String(inventoryStats.totalActiveIngredients)}
              />

              <LiveStockMiniStat
                label="Out"
                value={String(inventoryStats.outOfStockItems)}
              />

              <LiveStockMiniStat
                label="Low"
                value={String(inventoryStats.lowStockItems)}
              />

              <LiveStockMiniStat
                label="Value"
                value={formatCurrency(inventoryStats.totalStockValue)}
              />
            </div>

            <div className="flex items-center gap-3 rounded-lg border border-bauraBorder bg-white px-4 py-3 sm:w-72">
              <Search
                size={17}
                className="text-bauraMuted"
              />

              <input
                className="w-full bg-transparent text-sm outline-none"
                value={stockSearch}
                onChange={(event) =>
                  setStockSearch(event.target.value)
                }
                placeholder="Search live stock..."
              />
            </div>
          </div>
        </div>

        <div className="baura-scrollbar overflow-x-auto pb-2">
          {isInventoryLoading ? (
            <div className="flex min-h-36 items-center justify-center rounded-xl bg-white p-6 text-sm text-bauraMuted">
              Loading live stock...
            </div>
          ) : filteredInventory.length === 0 ? (
            <div className="flex min-h-36 items-center justify-center rounded-xl bg-white p-6 text-sm text-bauraMuted">
              No live stock found.
            </div>
          ) : (
            <div className="flex min-w-max gap-3">
              {filteredInventory.map((item) => (
                <LiveStockCard
                  key={item.ingredientId}
                  item={item}
                  imageUrl={
                    item.imageUrl ||
                    ingredientImageMap.get(item.ingredientId) ||
                    null
                  }
                />
              ))}
            </div>
          )}
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[0.75fr_1.25fr]">
        <section className="rounded-xl border border-bauraBorder bg-white p-5 shadow-[0_1px_2px_rgba(45,33,27,0.03)]">
          <div className="mb-5 flex flex-col gap-4">
            <div>
              <h3 className="font-bold">
                Purchase Carters
              </h3>

              <p className="text-sm text-bauraMuted">
                {filteredCarters.length} shown · {carters.length} total
              </p>
            </div>

            <div className="flex items-center gap-3 rounded-lg border border-bauraBorder bg-white px-4 py-3">
              <Search
                size={17}
                className="text-bauraMuted"
              />

              <input
                className="w-full bg-transparent text-sm outline-none"
                value={search}
                onChange={(event) =>
                  setSearch(event.target.value)
                }
                placeholder="Search Carter..."
              />
            </div>
          </div>

          <div className="baura-scrollbar max-h-[calc(100vh-500px)] min-h-[360px] overflow-auto pr-1">
            {isLoading ? (
              <EmptyState text="Loading Carters..." />
            ) : filteredCarters.length === 0 ? (
              <EmptyState text="No Carters found." />
            ) : (
              <div className="grid gap-3">
                {filteredCarters.map((carter) => {
                  const isSelected =
                    selectedCarter?.id === carter.id;

                  return (
                    <button
                      key={carter.id}
                      onClick={() =>
                        loadCarterDetail(carter.id)
                      }
                      className={`rounded-xl border p-4 text-left transition ${
                        isSelected
                          ? "border-bauraGold bg-bauraGoldSoft"
                          : "border-bauraBorder bg-white hover:border-bauraGold/40"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h4 className="font-bold">
                            {carter.carterNo}
                          </h4>

                          <p className="mt-1 flex items-center gap-2 text-sm text-bauraMuted">
                            <CalendarDays size={15} />
                            {formatDate(carter.purchasedAt)}
                          </p>
                        </div>

                        <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-bauraMuted">
                          {carter.itemCount || 0} items
                        </span>
                      </div>

                      <div className="mt-3 flex items-center justify-between gap-3 text-sm">
                        <span className="truncate text-bauraMuted">
                          {carter.supplierName || "No supplier"}
                        </span>

                        <span className="shrink-0 font-bold">
                          {formatCurrency(carter.totalCost)}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        <section className="rounded-xl border border-bauraBorder bg-white p-5 shadow-[0_1px_2px_rgba(45,33,27,0.03)]">
          {!selectedCarter ? (
            <div className="flex min-h-[420px] items-center justify-center rounded-xl bg-white p-6 text-center">
              <div>
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-xl bg-bauraBrown text-bauraGold">
                  <ShoppingBasket size={26} />
                </div>

                <h3 className="mt-4 font-bold">
                  No Carter selected
                </h3>

                <p className="mt-2 text-sm text-bauraMuted">
                  Create or select a Carter to add purchased ingredient stock.
                </p>
              </div>
            </div>
          ) : (
            <>
              <div className="mb-5 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-bauraGold">
                    Selected Carter
                  </p>

                  <h3 className="mt-1 text-2xl font-bold">
                    {selectedCarter.carterNo}
                  </h3>

                  <p className="mt-1 text-sm text-bauraMuted">
                    {formatDate(selectedCarter.purchasedAt)} ·{" "}
                    {selectedCarter.supplierName || "No supplier"}
                  </p>
                </div>

                <button
                  onClick={openItemModal}
                  className="erp-button-primary"
                >
                  <PackagePlus size={16} />
                  Add Ingredient Stock
                </button>
              </div>

              <div className="mb-5 grid gap-3 md:grid-cols-3">
                <MiniStat
                  label="Items"
                  value={String(selectedCarter.items?.length || 0)}
                />

                <MiniStat
                  label="Total Cost"
                  value={formatCurrency(selectedCarter.totalCost)}
                />

                <MiniStat
                  label="Notes"
                  value={selectedCarter.notes || "—"}
                />
              </div>

              <div className="baura-scrollbar max-h-[calc(100vh-580px)] min-h-[360px] overflow-auto pr-1">
                {isDetailLoading ? (
                  <EmptyState text="Loading Carter details..." />
                ) : !selectedCarter.items ||
                  selectedCarter.items.length === 0 ? (
                  <EmptyState text="No ingredient stock added yet." />
                ) : (
                  <div className="grid gap-3">
                    {selectedCarter.items.map((item) => {
                      const ingredientId =
                        getCarterItemIngredientId(item);

                      const imageUrl =
                        item.imageUrl ||
                        item.ingredient?.imageUrl ||
                        (ingredientId
                          ? ingredientImageMap.get(ingredientId)
                          : null) ||
                        null;

                      return (
                        <div
                          key={item.id}
                          className="rounded-xl border border-bauraBorder bg-white p-4"
                        >
                          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                            <div className="flex min-w-0 items-start gap-3">
                              <IngredientThumbnail
                                imageUrl={imageUrl}
                                name={getIngredientName(item)}
                                size="medium"
                              />

                              <div className="min-w-0">
                                <h4 className="truncate font-bold">
                                  {getIngredientName(item)}
                                </h4>

                                <p className="mt-1 text-sm text-bauraMuted">
                                  Loaded: {formatQty(item.loadedQty)} packs ·
                                  Base: {formatQty(item.totalBaseQty)}
                                </p>

                                <p className="mt-1 text-xs text-bauraMuted">
                                  Cost/base unit:{" "}
                                  {formatCurrency(item.unitCostBase)}
                                </p>
                              </div>
                            </div>

                            <div className="shrink-0 text-left md:text-right">
                              <p className="text-sm text-bauraMuted">
                                Price/package
                              </p>

                              <p className="font-bold">
                                {formatCurrency(item.pricePerPackage)}
                              </p>

                              <p className="mt-1 text-xs text-bauraMuted">
                                Total {formatCurrency(item.totalPrice)}
                              </p>
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
        open={isCarterModalOpen}
        onClose={closeCarterModal}
        title="Create Carter"
        subtitle="Create a new purchase Carter before adding bought ingredients."
      >
        <form
          onSubmit={handleCreateCarter}
          className="grid gap-4"
        >
          <Input
            label="Purchased Date"
            type="date"
            value={carterForm.purchasedAt}
            onChange={(value) =>
              setCarterForm((prev) => ({
                ...prev,
                purchasedAt: value,
              }))
            }
          />

          <Input
            label="Supplier Name"
            value={carterForm.supplierName}
            onChange={(value) =>
              setCarterForm((prev) => ({
                ...prev,
                supplierName: value,
              }))
            }
            placeholder="Supermarket"
            required={false}
          />

          <label className="block">
            <span className="mb-2 block text-sm font-semibold">
              Notes
            </span>

            <textarea
              className="min-h-24 w-full resize-none rounded-lg border border-bauraBorder bg-white px-4 py-3 text-sm outline-none transition focus:border-bauraGold"
              value={carterForm.notes}
              onChange={(event) =>
                setCarterForm((prev) => ({
                  ...prev,
                  notes: event.target.value,
                }))
              }
              placeholder="Optional notes..."
            />
          </label>

          <ModalActions
            isLoading={isSavingCarter}
            onCancel={closeCarterModal}
            submitText="Create Carter"
          />
        </form>
      </Modal>

      <Modal
        open={isItemModalOpen}
        onClose={closeItemModal}
        title="Add Ingredient Stock"
        subtitle={
          selectedCarter
            ? `Add purchased ingredient stock to ${selectedCarter.carterNo}.`
            : ""
        }
      >
        <form
          onSubmit={handleAddItem}
          className="grid gap-4"
        >
          <label className="block">
            <span className="mb-2 block text-sm font-semibold">
              Ingredient
            </span>

            <select
              className="erp-input"
              value={itemForm.ingredientId}
              onChange={(event) =>
                setItemForm((prev) => ({
                  ...prev,
                  ingredientId: event.target.value,
                }))
              }
              required
            >
              <option value="">
                Select ingredient
              </option>

              {ingredients.map((ingredient) => (
                <option
                  key={ingredient.id}
                  value={ingredient.id}
                >
                  {ingredient.displayName}
                </option>
              ))}
            </select>
          </label>

          {selectedIngredient && (
            <div className="flex items-center gap-3 rounded-xl border border-bauraBorder bg-bauraGoldSoft/30 p-3">
              <IngredientThumbnail
                imageUrl={selectedIngredient.imageUrl}
                name={selectedIngredient.displayName}
                size="large"
              />

              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-bauraBrown">
                  {selectedIngredient.displayName}
                </p>

                <p className="mt-1 text-xs text-bauraMuted">
                  Package contains{" "}
                  {formatQty(
                    selectedIngredient.baseQty,
                    selectedIngredient.baseUnit,
                  )}
                </p>
              </div>
            </div>
          )}

          <div className="grid gap-3 md:grid-cols-2">
            <Input
              label="Loaded Qty"
              type="number"
              value={itemForm.loadedQty}
              onChange={(value) =>
                setItemForm((prev) => ({
                  ...prev,
                  loadedQty: value,
                }))
              }
              placeholder="5"
            />

            <Input
              label="Price Per Package"
              type="number"
              value={itemForm.pricePerPackage}
              onChange={(value) =>
                setItemForm((prev) => ({
                  ...prev,
                  pricePerPackage: value,
                }))
              }
              placeholder="450"
            />
          </div>

          {itemPreview && selectedIngredient && (
            <div className="rounded-xl border border-bauraBorder bg-white p-4">
              <p className="text-sm font-bold">
                Stock Preview
              </p>

              <div className="mt-3 grid gap-3 text-sm md:grid-cols-3">
                <PreviewStat
                  label="Total Base Qty"
                  value={`${formatQty(itemPreview.totalBaseQty)} ${
                    selectedIngredient.baseUnit
                  }`}
                />

                <PreviewStat
                  label="Total Cost"
                  value={formatCurrency(itemPreview.totalPrice)}
                />

                <PreviewStat
                  label={`Cost / ${selectedIngredient.baseUnit}`}
                  value={formatCurrency(itemPreview.unitCost)}
                />
              </div>
            </div>
          )}

          <ModalActions
            isLoading={isSavingItem}
            onCancel={closeItemModal}
            submitText="Add Stock"
          />
        </form>
      </Modal>
    </AppLayout>
  );
}

function IngredientThumbnail({
  imageUrl,
  name,
  size = "medium",
}: {
  imageUrl?: string | null;
  name: string;
  size?: "small" | "medium" | "large";
}) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [imageUrl]);

  const sizeClass =
    size === "small"
      ? "h-9 w-9"
      : size === "large"
        ? "h-14 w-14"
        : "h-11 w-11";

  if (!imageUrl || failed) {
    return (
      <div
        className={`${sizeClass} flex shrink-0 items-center justify-center overflow-hidden rounded-lg bg-bauraBrown text-bauraGold`}
      >
        <ClipboardList
          size={size === "large" ? 22 : 19}
        />
      </div>
    );
  }

  return (
    <div
      className={`${sizeClass} shrink-0 overflow-hidden rounded-lg border border-bauraBorder bg-white`}
    >
      <img
        src={imageUrl}
        alt={name}
        loading="lazy"
        onError={() => setFailed(true)}
        className="h-full w-full object-cover"
      />
    </div>
  );
}

function LiveStockCard({
  item,
  imageUrl,
}: {
  item: InventoryItem;
  imageUrl?: string | null;
}) {
  const isOutOfStock =
    item.isOutOfStock ||
    Number(item.qtyOnHand) <= 0;

  return (
    <div
      className={`w-56 shrink-0 rounded-xl border p-4 ${
        isOutOfStock
          ? "border-red-200 bg-red-50"
          : item.isLowStock
            ? "border-amber-200 bg-amber-50"
            : "border-bauraBorder bg-white"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        {imageUrl ? (
          <IngredientThumbnail
            imageUrl={imageUrl}
            name={item.displayName}
            size="medium"
          />
        ) : (
          <div
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg ${
              isOutOfStock
                ? "bg-red-100 text-red-700"
                : item.isLowStock
                  ? "bg-amber-100 text-amber-700"
                  : "bg-bauraBrown text-bauraGold"
            }`}
          >
            {isOutOfStock || item.isLowStock ? (
              <AlertTriangle size={20} />
            ) : (
              <Boxes size={20} />
            )}
          </div>
        )}

        <span
          className={`rounded-full px-3 py-1 text-xs font-bold ${
            isOutOfStock
              ? "bg-red-100 text-red-700"
              : item.isLowStock
                ? "bg-amber-100 text-amber-700"
                : "bg-green-100 text-green-700"
          }`}
        >
          {isOutOfStock
            ? "Out"
            : item.isLowStock
              ? "Low"
              : "OK"}
        </span>
      </div>

      <h4 className="mt-4 line-clamp-2 min-h-10 text-sm font-bold text-bauraBrown">
        {item.displayName}
      </h4>

      <p className="mt-3 text-2xl font-black text-bauraBrown">
        {formatQty(item.qtyOnHand)}
      </p>

      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-bauraMuted">
        {item.baseUnit} on hand
      </p>

      <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-lg bg-white p-3">
          <p className="text-bauraMuted">
            Lots
          </p>

          <p className="mt-1 font-bold text-bauraBrown">
            {item.stockLotCount}
          </p>
        </div>

        <div className="rounded-lg bg-white p-3">
          <p className="text-bauraMuted">
            Value
          </p>

          <p className="mt-1 truncate font-bold text-bauraBrown">
            {formatCurrency(item.stockValue)}
          </p>
        </div>
      </div>

      {item.lowStockAlertQty !== null && (
        <p className="mt-3 text-xs text-bauraMuted">
          Low alert:{" "}
          {formatQty(
            item.lowStockAlertQty,
            item.baseUnit,
          )}
        </p>
      )}
    </div>
  );
}

function LiveStockMiniStat({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg bg-white px-4 py-3">
      <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-bauraMuted">
        {label}
      </p>

      <p className="mt-1 max-w-24 truncate text-sm font-black text-bauraBrown">
        {value}
      </p>
    </div>
  );
}

function EmptyState({
  text,
}: {
  text: string;
}) {
  return (
    <div className="rounded-xl bg-white p-6 text-center text-sm text-bauraMuted">
      {text}
    </div>
  );
}

function MiniStat({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl bg-white p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-bauraMuted">
        {label}
      </p>

      <p className="mt-2 truncate text-sm font-bold">
        {value}
      </p>
    </div>
  );
}

function PreviewStat({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div>
      <p className="text-xs text-bauraMuted">
        {label}
      </p>

      <p className="mt-1 font-bold text-bauraBrown">
        {value}
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
  required = true,
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
      <span className="mb-2 block text-sm font-semibold">
        {label}
      </span>

      <input
        className="erp-input"
        value={value}
        onChange={(event) =>
          onChange(event.target.value)
        }
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
  submitText,
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
        className="erp-button-secondary"
      >
        Cancel
      </button>

      <button
        disabled={isLoading}
        className="erp-button-primary"
      >
        {isLoading
          ? "Saving..."
          : submitText}
      </button>
    </div>
  );
}
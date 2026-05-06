import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Boxes, Edit3, Plus, RefreshCw, Search, Trash2 } from "lucide-react";
import { AppLayout } from "../layouts/AppLayout";
import { apiRequest } from "../lib/api";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { Modal } from "../ui/Modal";
import { useToast } from "../ui/ToastProvider";

type Ingredient = {
  id: string;
  name: string;
  brand: string | null;
  packageQty: string;
  packageUnit: "G" | "KG" | "ML" | "L" | "UNIT";
  baseQty: string;
  baseUnit: "G" | "ML" | "UNIT";
  lowStockAlertQty: string | null;
  isActive: boolean;
  displayName: string;
};

const initialForm = {
  name: "",
  brand: "",
  packageQty: "",
  packageUnit: "G",
  baseQty: "",
  baseUnit: "G",
  lowStockAlertQty: "",
};

export function IngredientsPage() {
  const toast = useToast();

  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [form, setForm] = useState(initialForm);
  const [editingIngredient, setEditingIngredient] = useState<Ingredient | null>(
    null,
  );
  const [deletingIngredient, setDeletingIngredient] =
    useState<Ingredient | null>(null);

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "ALL" | "ACTIVE" | "INACTIVE"
  >("ACTIVE");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState("");

  const isEditing = Boolean(editingIngredient);

  async function loadIngredients(showToast = false) {
    setIsLoading(true);
    setError("");

    try {
      const data = await apiRequest<{ ingredients: Ingredient[] }>(
        "/ingredients",
      );
      setIngredients(data.ingredients);

      if (showToast) {
        toast.success("Ingredients refreshed");
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to load ingredients";
      setError(message);
      toast.error("Failed to load ingredients", message);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadIngredients();
  }, []);

  const filteredIngredients = useMemo(() => {
    const keyword = search.trim().toLowerCase();

    return ingredients.filter((ingredient) => {
      const matchesSearch =
        !keyword || ingredient.displayName.toLowerCase().includes(keyword);

      const matchesStatus =
        statusFilter === "ALL" ||
        (statusFilter === "ACTIVE" && ingredient.isActive) ||
        (statusFilter === "INACTIVE" && !ingredient.isActive);

      return matchesSearch && matchesStatus;
    });
  }, [ingredients, search, statusFilter]);

  function openAddModal() {
    setForm(initialForm);
    setEditingIngredient(null);
    setError("");
    setIsFormOpen(true);
  }

  function openEditModal(ingredient: Ingredient) {
    setEditingIngredient(ingredient);
    setForm({
      name: ingredient.name,
      brand: ingredient.brand || "",
      packageQty: String(ingredient.packageQty),
      packageUnit: ingredient.packageUnit,
      baseQty: String(ingredient.baseQty),
      baseUnit: ingredient.baseUnit,
      lowStockAlertQty: ingredient.lowStockAlertQty
        ? String(ingredient.lowStockAlertQty)
        : "",
    });
    setError("");
    setIsFormOpen(true);
  }

  function closeFormModal() {
    if (isSaving) return;

    setIsFormOpen(false);
    setForm(initialForm);
    setEditingIngredient(null);
    setError("");
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setIsSaving(true);

    try {
      const payload = {
        name: form.name.trim(),
        brand: form.brand.trim() || null,
        packageQty: Number(form.packageQty),
        packageUnit: form.packageUnit,
        baseQty: Number(form.baseQty),
        baseUnit: form.baseUnit,
        lowStockAlertQty: form.lowStockAlertQty
          ? Number(form.lowStockAlertQty)
          : null,
      };

      if (editingIngredient) {
        await apiRequest(`/ingredients/${editingIngredient.id}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });

        toast.success("Ingredient updated", `${payload.name} was updated.`);
      } else {
        await apiRequest("/ingredients", {
          method: "POST",
          body: JSON.stringify(payload),
        });

        toast.success("Ingredient added", `${payload.name} was added.`);
      }

      closeFormModal();
      await loadIngredients();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to save ingredient";
      setError(message);
      toast.error("Save failed", message);
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDeactivate() {
    if (!deletingIngredient) return;

    setError("");
    setIsDeleting(true);

    try {
      await apiRequest(`/ingredients/${deletingIngredient.id}`, {
        method: "DELETE",
      });

      toast.success(
        "Ingredient deactivated",
        `${deletingIngredient.displayName} was deactivated.`,
      );

      setDeletingIngredient(null);
      await loadIngredients();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to deactivate ingredient";
      setError(message);
      toast.error("Deactivate failed", message);
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <AppLayout
      activeItem="Ingredients"
      title="Ingredients Management"
      subtitle="Create ingredients with brand, package size, base unit and low-stock alert."
      actions={
        <>
          <button
            onClick={() => loadIngredients(true)}
            className="flex items-center gap-2 rounded-2xl border border-bauraBrown/10 bg-bauraSoft px-4 py-3 text-sm font-semibold shadow-sm"
          >
            <RefreshCw size={16} />
            Refresh
          </button>

          <button
            onClick={openAddModal}
            className="flex items-center gap-2 rounded-2xl bg-bauraBrown px-5 py-3 text-sm font-bold text-bauraCream shadow-sm"
          >
            <Plus size={16} />
            Add Ingredient
          </button>
        </>
      }
    >
      <section className="rounded-[2rem] border border-bauraBrown/10 bg-bauraSoft p-5 shadow-sm">
        <div className="mb-5 flex flex-col gap-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h3 className="font-bold">Ingredient List</h3>
              <p className="text-sm text-bauraBrown/60">
                {filteredIngredients.length} shown · {ingredients.length} total
              </p>
            </div>

            <div className="flex items-center gap-3 rounded-2xl border border-bauraBrown/10 bg-white px-4 py-3">
              <Search size={17} className="text-bauraBrown/45" />
              <input
                className="w-full bg-transparent text-sm outline-none md:w-72"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search ingredient..."
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {(["ACTIVE", "ALL", "INACTIVE"] as const).map((status) => (
              <button
                key={status}
                onClick={() => setStatusFilter(status)}
                className={`rounded-full px-4 py-2 text-xs font-bold transition ${
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

        <div className="baura-scrollbar max-h-[calc(100vh-285px)] overflow-auto pr-1">
          {isLoading ? (
            <div className="rounded-3xl bg-white/50 p-6 text-sm text-bauraBrown/60">
              Loading ingredients...
            </div>
          ) : filteredIngredients.length === 0 ? (
            <div className="rounded-3xl bg-white/50 p-6 text-sm text-bauraBrown/60">
              No ingredients found.
            </div>
          ) : (
            <div className="grid gap-3">
              {filteredIngredients.map((ingredient) => (
                <div
                  key={ingredient.id}
                  className="rounded-3xl border border-bauraBrown/10 bg-white/60 p-4"
                >
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div className="flex items-start gap-3">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-bauraBrown text-bauraGold">
                        <Boxes size={20} />
                      </div>
                      <div>
                        <h4 className="font-bold">{ingredient.displayName}</h4>
                        <p className="mt-1 text-sm text-bauraBrown/60">
                          Base: {ingredient.baseQty} {ingredient.baseUnit}
                          {ingredient.lowStockAlertQty &&
                            ` · Low stock alert: ${ingredient.lowStockAlertQty} ${ingredient.baseUnit}`}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`w-fit rounded-full px-3 py-1 text-xs font-bold ${
                          ingredient.isActive
                            ? "bg-green-100 text-green-700"
                            : "bg-red-100 text-red-700"
                        }`}
                      >
                        {ingredient.isActive ? "Active" : "Inactive"}
                      </span>

                      {ingredient.isActive && (
                        <>
                          <button
                            onClick={() => openEditModal(ingredient)}
                            className="flex items-center gap-2 rounded-2xl border border-bauraBrown/10 bg-white px-3 py-2 text-xs font-bold text-bauraBrown"
                          >
                            <Edit3 size={14} />
                            Edit
                          </button>

                          <button
                            onClick={() => setDeletingIngredient(ingredient)}
                            className="flex items-center gap-2 rounded-2xl border border-red-100 bg-red-50 px-3 py-2 text-xs font-bold text-red-700"
                          >
                            <Trash2 size={14} />
                            Deactivate
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <Modal
        open={isFormOpen}
        onClose={closeFormModal}
        title={isEditing ? "Edit Ingredient" : "Add Ingredient"}
        subtitle={
          isEditing
            ? "Update ingredient details used across Carter inventory and product recipes."
            : "Create a reusable ingredient record for Carter inventory and recipes."
        }
      >
        <form onSubmit={handleSubmit} className="grid gap-4">
          <Input
            label="Ingredient Name"
            value={form.name}
            onChange={(value) => setForm((prev) => ({ ...prev, name: value }))}
            placeholder="Baking Powder"
          />

          <Input
            label="Brand"
            value={form.brand}
            onChange={(value) => setForm((prev) => ({ ...prev, brand: value }))}
            placeholder="Motha"
          />

          <div className="grid gap-3 md:grid-cols-2">
            <Input
              label="Package Qty"
              value={form.packageQty}
              onChange={(value) =>
                setForm((prev) => ({ ...prev, packageQty: value }))
              }
              placeholder="250"
              type="number"
            />

            <Select
              label="Package Unit"
              value={form.packageUnit}
              onChange={(value) =>
                setForm((prev) => ({ ...prev, packageUnit: value }))
              }
              options={["G", "KG", "ML", "L", "UNIT"]}
            />
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <Input
              label="Base Qty"
              value={form.baseQty}
              onChange={(value) =>
                setForm((prev) => ({ ...prev, baseQty: value }))
              }
              placeholder="250"
              type="number"
            />

            <Select
              label="Base Unit"
              value={form.baseUnit}
              onChange={(value) =>
                setForm((prev) => ({ ...prev, baseUnit: value }))
              }
              options={["G", "ML", "UNIT"]}
            />
          </div>

          <Input
            label="Low Stock Alert Qty"
            value={form.lowStockAlertQty}
            onChange={(value) =>
              setForm((prev) => ({ ...prev, lowStockAlertQty: value }))
            }
            placeholder="100"
            type="number"
          />

          {error && (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={closeFormModal}
              disabled={isSaving}
              className="rounded-2xl border border-bauraBrown/10 bg-white px-5 py-3 text-sm font-bold text-bauraBrown disabled:opacity-60"
            >
              Cancel
            </button>

            <button
              disabled={isSaving}
              className="rounded-2xl bg-bauraBrown px-5 py-3 text-sm font-bold text-bauraCream disabled:opacity-60"
            >
              {isSaving
                ? "Saving..."
                : isEditing
                  ? "Update Ingredient"
                  : "Save Ingredient"}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(deletingIngredient)}
        title="Deactivate ingredient?"
        message={
          deletingIngredient
            ? `${deletingIngredient.displayName} will be deactivated. It will remain in past Carter records and reports.`
            : ""
        }
        confirmText="Deactivate"
        cancelText="Cancel"
        isDanger
        isLoading={isDeleting}
        onCancel={() => {
          if (!isDeleting) setDeletingIngredient(null);
        }}
        onConfirm={handleDeactivate}
      />
    </AppLayout>
  );
}

function Input({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
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
        required={label !== "Brand" && label !== "Low Stock Alert Qty"}
      />
    </label>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-semibold">{label}</span>
      <select
        className="w-full rounded-2xl border border-bauraBrown/10 bg-white px-4 py-3 text-sm outline-none transition focus:border-bauraGold"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

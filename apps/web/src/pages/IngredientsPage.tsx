import {
  useEffect,
  useMemo,
  useState
} from "react";
import type {
  FormEvent
} from "react";
import {
  Boxes,
  Edit3,
  ImageIcon,
  Plus,
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

type PackageUnit =
  | "G"
  | "KG"
  | "ML"
  | "L"
  | "UNIT";

type BaseUnit =
  | "G"
  | "ML"
  | "UNIT";

type Ingredient = {
  id: string;
  name: string;
  brand:
    | string
    | null;
  imageUrl:
    | string
    | null;
  packageQty: string;
  packageUnit:
    PackageUnit;
  baseQty: string;
  baseUnit:
    BaseUnit;
  lowStockAlertQty:
    | string
    | null;
  isActive: boolean;
  displayName: string;
};

type IngredientForm = {
  name: string;
  brand: string;
  imageUrl: string;
  packageQty: string;
  packageUnit:
    PackageUnit;
  baseQty: string;
  baseUnit:
    BaseUnit;
  lowStockAlertQty:
    string;
};

const initialForm:
  IngredientForm = {
    name: "",
    brand: "",
    imageUrl: "",
    packageQty: "",
    packageUnit: "G",
    baseQty: "",
    baseUnit: "G",
    lowStockAlertQty: ""
  };

export function IngredientsPage() {
  const toast =
    useToast();

  const [
    ingredients,
    setIngredients
  ] =
    useState<
      Ingredient[]
    >([]);

  const [
    form,
    setForm
  ] =
    useState<IngredientForm>(
      initialForm
    );

  const [
    editingIngredient,
    setEditingIngredient
  ] =
    useState<
      Ingredient | null
    >(null);

  const [
    deletingIngredient,
    setDeletingIngredient
  ] =
    useState<
      Ingredient | null
    >(null);

  const [
    isFormOpen,
    setIsFormOpen
  ] =
    useState(false);

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
      | "ACTIVE"
      | "INACTIVE"
    >("ACTIVE");

  const [
    isLoading,
    setIsLoading
  ] =
    useState(true);

  const [
    isSaving,
    setIsSaving
  ] =
    useState(false);

  const [
    isDeleting,
    setIsDeleting
  ] =
    useState(false);

  const isEditing =
    Boolean(
      editingIngredient
    );

  async function loadIngredients(
    showToast = false
  ) {
    setIsLoading(
      true
    );

    try {
      const data =
        await apiRequest<{
          ingredients:
            Ingredient[];
        }>(
          "/ingredients"
        );

      setIngredients(
        data.ingredients
      );

      if (
        showToast
      ) {
        toast.success(
          "Ingredients refreshed"
        );
      }
    } catch (error) {
      toast.error(
        "Failed to load ingredients",
        error instanceof Error
          ? error.message
          : "Failed to load ingredients."
      );
    } finally {
      setIsLoading(
        false
      );
    }
  }

  useEffect(() => {
    loadIngredients();
  }, []);

  const filteredIngredients =
    useMemo(() => {
      const keyword =
        search
          .trim()
          .toLowerCase();

      return ingredients.filter(
        (ingredient) => {
          const matchesSearch =
            !keyword ||
            ingredient.displayName
              .toLowerCase()
              .includes(
                keyword
              ) ||
            ingredient.name
              .toLowerCase()
              .includes(
                keyword
              ) ||
            ingredient.brand
              ?.toLowerCase()
              .includes(
                keyword
              );

          const matchesStatus =
            statusFilter ===
              "ALL" ||
            (
              statusFilter ===
                "ACTIVE" &&
              ingredient.isActive
            ) ||
            (
              statusFilter ===
                "INACTIVE" &&
              !ingredient.isActive
            );

          return (
            matchesSearch &&
            matchesStatus
          );
        }
      );
    }, [
      ingredients,
      search,
      statusFilter
    ]);

  function openAddModal() {
    setEditingIngredient(
      null
    );

    setForm({
      ...initialForm
    });

    setIsFormOpen(
      true
    );
  }

  function openEditModal(
    ingredient:
      Ingredient
  ) {
    setEditingIngredient(
      ingredient
    );

    setForm({
      name:
        ingredient.name,

      brand:
        ingredient.brand ||
        "",

      imageUrl:
        ingredient.imageUrl ||
        "",

      packageQty:
        String(
          ingredient.packageQty
        ),

      packageUnit:
        ingredient.packageUnit,

      baseQty:
        String(
          ingredient.baseQty
        ),

      baseUnit:
        ingredient.baseUnit,

      lowStockAlertQty:
        ingredient.lowStockAlertQty
          ? String(
              ingredient.lowStockAlertQty
            )
          : ""
    });

    setIsFormOpen(
      true
    );
  }

  function closeFormModal() {
    if (
      isSaving
    ) {
      return;
    }

    setIsFormOpen(
      false
    );

    setEditingIngredient(
      null
    );

    setForm({
      ...initialForm
    });
  }

  async function handleSubmit(
    event:
      FormEvent
  ) {
    event.preventDefault();

    const packageQty =
      Number(
        form.packageQty
      );

    const baseQty =
      Number(
        form.baseQty
      );

    const lowStockAlertQty =
      form.lowStockAlertQty
        ? Number(
            form.lowStockAlertQty
          )
        : null;

    if (
      !form.name.trim()
    ) {
      toast.warning(
        "Ingredient name required"
      );

      return;
    }

    if (
      packageQty <= 0 ||
      baseQty <= 0
    ) {
      toast.warning(
        "Invalid quantity",
        "Package and base quantities must be greater than zero."
      );

      return;
    }

    setIsSaving(
      true
    );

    try {
      const payload = {
        name:
          form.name.trim(),

        brand:
          form.brand.trim() ||
          null,

        imageUrl:
          form.imageUrl.trim() ||
          null,

        packageQty,

        packageUnit:
          form.packageUnit,

        baseQty,

        baseUnit:
          form.baseUnit,

        lowStockAlertQty
      };

      if (
        editingIngredient
      ) {
        await apiRequest(
          `/ingredients/${editingIngredient.id}`,
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
          "Ingredient updated",
          `${payload.name} was updated.`
        );
      } else {
        await apiRequest(
          "/ingredients",
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
          "Ingredient added",
          `${payload.name} was added.`
        );
      }

      closeFormModal();

      await loadIngredients();
    } catch (error) {
      toast.error(
        "Save failed",
        error instanceof Error
          ? error.message
          : "Failed to save ingredient."
      );
    } finally {
      setIsSaving(
        false
      );
    }
  }

  async function handleDeactivate() {
    if (
      !deletingIngredient
    ) {
      return;
    }

    setIsDeleting(
      true
    );

    try {
      await apiRequest(
        `/ingredients/${deletingIngredient.id}`,
        {
          method:
            "DELETE"
        }
      );

      toast.success(
        "Ingredient deactivated",
        `${deletingIngredient.displayName} was deactivated.`
      );

      setDeletingIngredient(
        null
      );

      await loadIngredients();
    } catch (error) {
      toast.error(
        "Deactivate failed",
        error instanceof Error
          ? error.message
          : "Failed to deactivate ingredient."
      );
    } finally {
      setIsDeleting(
        false
      );
    }
  }

  return (
    <AppLayout
      activeItem="Ingredients"
      title="Ingredients Management"
      subtitle="Manage ingredient details, package conversion, images and stock alert levels."
      actions={
        <>
          <button
            type="button"
            onClick={() =>
              loadIngredients(
                true
              )
            }
            className="erp-button-secondary"
          >
            <RefreshCw
              size={15}
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
              openAddModal
            }
            className="erp-button-primary"
          >
            <Plus
              size={15}
            />

            Add Ingredient
          </button>
        </>
      }
    >
      <section className="erp-panel overflow-hidden">
        <div className="flex flex-col gap-4 border-b border-bauraBorder px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="erp-section-title">
              Ingredient List
            </h2>

            <p className="erp-section-subtitle">
              {
                filteredIngredients.length
              }{" "}
              shown ·{" "}
              {
                ingredients.length
              }{" "}
              total
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
                    event.target.value
                  )
                }
                placeholder="Search ingredients..."
                className="w-full bg-transparent text-[11px] text-bauraInk outline-none placeholder:text-bauraMuted2"
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
                  event.target.value as
                    | "ALL"
                    | "ACTIVE"
                    | "INACTIVE"
                )
              }
              className="erp-input sm:w-40"
            >
              <option value="ACTIVE">
                Active
              </option>

              <option value="ALL">
                All
              </option>

              <option value="INACTIVE">
                Inactive
              </option>
            </select>
          </div>
        </div>

        <div className="baura-scrollbar max-h-[calc(100vh-270px)] overflow-y-auto p-4">
          {isLoading ? (
            <EmptyState
              text="Loading ingredients..."
            />
          ) : filteredIngredients.length ===
            0 ? (
            <EmptyState
              text="No ingredients found."
            />
          ) : (
            <div className="grid gap-3 xl:grid-cols-2">
              {filteredIngredients.map(
                (
                  ingredient
                ) => (
                  <article
                    key={
                      ingredient.id
                    }
                    className="rounded-[16px] border border-bauraBorder bg-white p-4 transition hover:shadow-bauraCard"
                  >
                    <div className="flex items-start gap-4">
                      <IngredientImage
                        ingredient={
                          ingredient
                        }
                      />

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                          <div className="min-w-0">
                            <h3 className="truncate text-[12px] font-semibold text-bauraInk">
                              {
                                ingredient.displayName
                              }
                            </h3>

                            <p className="mt-1 text-[9px] text-bauraMuted">
                              Base conversion:{" "}
                              {
                                ingredient.baseQty
                              }{" "}
                              {
                                ingredient.baseUnit
                              }
                            </p>

                            {ingredient.lowStockAlertQty && (
                              <p className="mt-1 text-[9px] text-bauraMuted">
                                Alert below{" "}
                                {
                                  ingredient.lowStockAlertQty
                                }{" "}
                                {
                                  ingredient.baseUnit
                                }
                              </p>
                            )}
                          </div>

                          <span
                            className={`erp-badge ${
                              ingredient.isActive
                                ? "bg-bauraSuccessSoft text-bauraSuccess"
                                : "bg-bauraDangerSoft text-bauraDanger"
                            }`}
                          >
                            {ingredient.isActive
                              ? "Active"
                              : "Inactive"}
                          </span>
                        </div>

                        {ingredient.isActive && (
                          <div className="mt-4 flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() =>
                                openEditModal(
                                  ingredient
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
                                setDeletingIngredient(
                                  ingredient
                                )
                              }
                              className="erp-button-danger h-8 px-3"
                            >
                              <Trash2
                                size={12}
                              />

                              Deactivate
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </article>
                )
              )}
            </div>
          )}
        </div>
      </section>

      <Modal
        open={
          isFormOpen
        }
        onClose={
          closeFormModal
        }
        title={
          isEditing
            ? "Edit Ingredient"
            : "Add Ingredient"
        }
        subtitle={
          isEditing
            ? "Update ingredient information and its Cloudinary image."
            : "Create a reusable ingredient for inventory, recipes and production."
        }
        widthClassName="max-w-3xl"
      >
        <form
          onSubmit={
            handleSubmit
          }
          className="grid gap-5"
        >
          <div className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
            <ImageUploadField
              label="Ingredient Image"
              value={
                form.imageUrl
              }
              onChange={(
                imageUrl
              ) =>
                setForm(
                  (
                    current
                  ) => ({
                    ...current,
                    imageUrl
                  })
                )
              }
              folder="baura/ingredients"
            />

            <div className="grid content-start gap-4">
              <Input
                label="Ingredient Name"
                value={
                  form.name
                }
                onChange={(
                  value
                ) =>
                  setForm(
                    (
                      current
                    ) => ({
                      ...current,
                      name:
                        value
                    })
                  )
                }
                placeholder="Baking Powder"
              />

              <Input
                label="Brand"
                value={
                  form.brand
                }
                onChange={(
                  value
                ) =>
                  setForm(
                    (
                      current
                    ) => ({
                      ...current,
                      brand:
                        value
                    })
                  )
                }
                placeholder="Motha"
                required={
                  false
                }
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Package Quantity"
              value={
                form.packageQty
              }
              onChange={(
                value
              ) =>
                setForm(
                  (
                    current
                  ) => ({
                    ...current,
                    packageQty:
                      value
                  })
                )
              }
              placeholder="1"
              type="number"
            />

            <Select
              label="Package Unit"
              value={
                form.packageUnit
              }
              onChange={(
                value
              ) =>
                setForm(
                  (
                    current
                  ) => ({
                    ...current,
                    packageUnit:
                      value as
                        PackageUnit
                  })
                )
              }
              options={[
                "G",
                "KG",
                "ML",
                "L",
                "UNIT"
              ]}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Base Quantity"
              value={
                form.baseQty
              }
              onChange={(
                value
              ) =>
                setForm(
                  (
                    current
                  ) => ({
                    ...current,
                    baseQty:
                      value
                  })
                )
              }
              placeholder="1000"
              type="number"
            />

            <Select
              label="Base Unit"
              value={
                form.baseUnit
              }
              onChange={(
                value
              ) =>
                setForm(
                  (
                    current
                  ) => ({
                    ...current,
                    baseUnit:
                      value as
                        BaseUnit
                  })
                )
              }
              options={[
                "G",
                "ML",
                "UNIT"
              ]}
            />
          </div>

          <Input
            label="Low Stock Alert Qty"
            value={
              form.lowStockAlertQty
            }
            onChange={(
              value
            ) =>
              setForm(
                (
                  current
                ) => ({
                  ...current,
                  lowStockAlertQty:
                    value
                })
              )
            }
            placeholder="100"
            type="number"
            required={
              false
            }
          />

          <div className="flex flex-col-reverse gap-2 border-t border-bauraBorder pt-5 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={
                closeFormModal
              }
              disabled={
                isSaving
              }
              className="erp-button-secondary"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={
                isSaving
              }
              className="erp-button-primary"
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
        open={
          Boolean(
            deletingIngredient
          )
        }
        title="Deactivate ingredient?"
        message={
          deletingIngredient
            ? `${deletingIngredient.displayName} will be deactivated. Existing inventory and production history will remain available.`
            : ""
        }
        confirmText="Deactivate"
        cancelText="Cancel"
        isDanger
        isLoading={
          isDeleting
        }
        onCancel={() => {
          if (
            !isDeleting
          ) {
            setDeletingIngredient(
              null
            );
          }
        }}
        onConfirm={
          handleDeactivate
        }
      />
    </AppLayout>
  );
}

function IngredientImage({
  ingredient
}: {
  ingredient:
    Ingredient;
}) {
  if (
    ingredient.imageUrl
  ) {
    return (
      <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl border border-bauraBorder bg-bauraCanvas2">
        <img
          src={
            ingredient.imageUrl
          }
          alt={
            ingredient.displayName
          }
          className="h-full w-full object-cover"
          loading="lazy"
        />
      </div>
    );
  }

  return (
    <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-bauraGoldSoft text-bauraGoldDark">
      <Boxes
        size={21}
      />
    </div>
  );
}

function EmptyState({
  text
}: {
  text: string;
}) {
  return (
    <div className="flex min-h-[180px] flex-col items-center justify-center rounded-[16px] border border-dashed border-bauraBorder bg-bauraCanvas2 px-6 text-center">
      <ImageIcon
        size={22}
        className="text-bauraMuted2"
      />

      <p className="mt-3 text-[10px] font-medium text-bauraMuted">
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
    <label className="block">
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
            ? "0.001"
            : undefined
        }
      />
    </label>
  );
}

function Select({
  label,
  value,
  onChange,
  options
}: {
  label: string;
  value: string;
  onChange: (
    value: string
  ) => void;
  options:
    string[];
}) {
  return (
    <label className="block">
      <span className="erp-label">
        {label}
      </span>

      <select
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
      >
        {options.map(
          (
            option
          ) => (
            <option
              key={
                option
              }
              value={
                option
              }
            >
              {option}
            </option>
          )
        )}
      </select>
    </label>
  );
}
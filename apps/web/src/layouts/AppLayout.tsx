/** @format */

import { useMemo, useState } from "react";

import type { KeyboardEvent, ReactNode } from "react";

import type { LucideIcon } from "lucide-react";

import {
  BarChart3,
  Boxes,
  ChefHat,
  Home,
  LogOut,
  PackageCheck,
  Search,
  Settings,
  ShoppingCart,
  Warehouse,
  CakeSlice,
} from "lucide-react";

import { useNavigate } from "react-router-dom";

import { useAuth } from "../auth/AuthContext";

type AppLayoutProps = {
  title: string;
  subtitle?: string;
  activeItem?: string;
  actions?: ReactNode;
  children: ReactNode;
};

type NavigationItem = {
  label: string;
  path: string;
  icon: LucideIcon;

  group: "Overview" | "Operations" | "Inventory" | "Management";

  permissions: string[];
};

const BAURA_LOGO = "/images/logos/logo.webp";

const navigationItems: NavigationItem[] = [
  {
    label: "Dashboard",
    path: "/dashboard",
    icon: Home,
    group: "Overview",

    permissions: ["erp.dashboard.read", "erp.dashboard.view"],
  },

  {
    label: "Production",
    path: "/dashboard/production",
    icon: ChefHat,
    group: "Operations",

    permissions: ["erp.production.read", "erp.production.view"],
  },

  {
    label: "Bakery Stock",
    path: "/dashboard/bakery-stock",
    icon: PackageCheck,
    group: "Operations",

    permissions: ["erp.bakery-stock.read", "erp.bakery-stock.view"],
  },

  {
    label: "POS Sales",
    path: "/pos",
    icon: ShoppingCart,
    group: "Operations",

    permissions: ["erp.pos.access"],
  },

  {
    label: "Ingredients",
    path: "/dashboard/ingredients",
    icon: Boxes,
    group: "Inventory",

    permissions: ["erp.ingredients.read", "erp.ingredients.view"],
  },

  {
    label: "Carter Inventory",
    path: "/dashboard/carters",
    icon: Warehouse,
    group: "Inventory",

    permissions: ["erp.carters.read", "erp.carters.view"],
  },

  {
    label: "Products & Recipes",
    path: "/dashboard/products",
    icon: CakeSlice,
    group: "Inventory",

    permissions: ["erp.products.read", "erp.products.view", "erp.recipes.read"],
  },

  {
    label: "Analytics",
    path: "/dashboard/analytics",
    icon: BarChart3,
    group: "Management",

    permissions: ["erp.analytics.read", "erp.analytics.view"],
  },

  {
    label: "Settings",
    path: "/dashboard/settings",
    icon: Settings,
    group: "Management",

    permissions: ["erp.settings.read"],
  },
];

const groups = ["Overview", "Operations", "Inventory", "Management"] as const;

export function AppLayout({
  title,
  subtitle,
  activeItem = "Dashboard",
  actions,
  children,
}: AppLayoutProps) {
  const navigate = useNavigate();

  const { user, logout, hasAnyPermission } = useAuth();

  const visibleNavigationItems = useMemo(
    () => navigationItems.filter((item) => hasAnyPermission(item.permissions)),
    [hasAnyPermission],
  );

  const [search, setSearch] = useState("");

  const initials = `${user?.firstName?.[0] || "B"}${
    user?.lastName?.[0] || ""
  }`.toUpperCase();

  const searchResults = useMemo(() => {
    const keyword = search.trim().toLowerCase();

    if (!keyword) {
      return [];
    }

    return visibleNavigationItems.filter((item) =>
      item.label.toLowerCase().includes(keyword),
    );
  }, [search, visibleNavigationItems]);

  function handleSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter" && searchResults.length > 0) {
      navigate(searchResults[0].path);

      setSearch("");
    }
  }

  function NavigationButton({ item }: { item: NavigationItem }) {
    const Icon = item.icon;

    const active = item.label === activeItem;

    return (
      <button
        type="button"
        onClick={() => navigate(item.path)}
        className={`group relative flex h-11 w-full items-center gap-3 rounded-xl px-3.5 text-left transition-all duration-200 ${
          active
            ? "bg-bauraGoldSoft/70 text-bauraPrimary"
            : "text-bauraMuted hover:bg-bauraCanvas2 hover:text-bauraInk"
        }`}>
        {active && (
          <span className="absolute -left-4 top-2 h-7 w-[3px] rounded-r-full bg-bauraGold" />
        )}

        <Icon
          size={17}
          strokeWidth={active ? 2.1 : 1.8}
          className={
            active
              ? "text-bauraGoldDark"
              : "text-bauraMuted group-hover:text-bauraPrimary"
          }
        />

        <span className="text-[11px] font-semibold">{item.label}</span>
      </button>
    );
  }

  return (
    <main className="h-screen overflow-hidden bg-bauraCanvas text-bauraInk">
      <div className="flex h-full">
        {/* DESKTOP SIDEBAR */}
        <aside className="hidden h-full w-[255px] shrink-0 border-r border-bauraBorder bg-bauraSidebar lg:flex lg:flex-col">
          {/* BAURA BRAND */}
          <div className="flex h-[104px] shrink-0 items-center px-5">
            <button
              type="button"
              onClick={() => navigate("/dashboard")}
              className="group flex w-full items-center justify-center"
              aria-label="Baura ERP dashboard">
              <img
                src={BAURA_LOGO}
                alt="Baura"
                className="h-auto w-[132px] object-contain transition-transform duration-200 group-hover:scale-[1.015]"
              />
            </button>
          </div>

          <div className="mx-4 border-t border-bauraBorder" />

          {/* NAVIGATION */}
          <nav className="baura-scrollbar min-h-0 flex-1 overflow-y-auto px-4 pb-5 pt-5">
            {groups.map((group) => {
              const items = visibleNavigationItems.filter(
                (item) => item.group === group,
              );

              if (items.length === 0) {
                return null;
              }

              return (
                <div key={group} className="mb-5">
                  <p className="mb-2 px-3 text-[8px] font-semibold uppercase tracking-[0.16em] text-bauraMuted2">
                    {group}
                  </p>

                  <div className="space-y-1">
                    {items.map((item) => (
                      <NavigationButton key={item.label} item={item} />
                    ))}
                  </div>
                </div>
              );
            })}
          </nav>

          {/* USER */}
          <div className="shrink-0 border-t border-bauraBorder p-4">
            <div className="rounded-[16px] border border-bauraBorder bg-white p-3 shadow-[0_6px_22px_rgba(63,46,36,0.05)]">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-bauraGoldSoft text-[10px] font-bold text-bauraPrimary">
                  {initials}
                </div>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-[10px] font-semibold text-bauraInk">
                    {user?.firstName} {user?.lastName}
                  </p>

                  <p className="mt-0.5 truncate text-[8px] uppercase tracking-[0.06em] text-bauraMuted">
                    {user?.roles?.[0] || "Staff"}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={logout}
                  title="Sign out"
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-bauraMuted transition hover:bg-bauraDangerSoft hover:text-bauraDanger">
                  <LogOut size={14} />
                </button>
              </div>
            </div>
          </div>
        </aside>

        {/* MAIN */}
        <section className="flex min-w-0 flex-1 flex-col overflow-hidden">
          {/* DESKTOP HEADER */}
          <header className="hidden h-[86px] shrink-0 items-center border-b border-bauraBorder bg-white/80 px-7 backdrop-blur lg:flex">
            <div className="relative w-full max-w-[620px]">
              <div className="erp-search h-[48px] rounded-[16px]">
                <Search size={16} className="text-bauraMuted" />

                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  onKeyDown={handleSearchKeyDown}
                  placeholder="Search ERP modules..."
                  className="w-full bg-transparent text-[11px] font-medium text-bauraInk outline-none placeholder:text-bauraMuted2"
                />
              </div>

              {searchResults.length > 0 && (
                <div className="absolute left-0 right-0 top-[55px] z-50 overflow-hidden rounded-2xl border border-bauraBorder bg-white p-2 shadow-bauraCard">
                  {searchResults.slice(0, 5).map((item) => {
                    const Icon = item.icon;

                    return (
                      <button
                        key={item.label}
                        type="button"
                        onClick={() => {
                          navigate(item.path);

                          setSearch("");
                        }}
                        className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-bauraGoldSoft/50">
                        <Icon size={15} className="text-bauraGoldDark" />

                        <span className="text-[10px] font-semibold text-bauraInk">
                          {item.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="ml-auto flex items-center gap-3">
              <div className="flex h-9 items-center gap-2 rounded-full border border-bauraBorder bg-white px-4">
                <span className="h-2 w-2 rounded-full bg-bauraSuccess" />

                <span className="text-[8px] font-semibold uppercase tracking-[0.08em] text-bauraInk2">
                  System Online
                </span>
              </div>

              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-bauraGoldSoft text-[10px] font-bold text-bauraPrimary">
                {initials}
              </div>
            </div>
          </header>

          {/* MOBILE HEADER */}
          <div className="border-b border-bauraBorder bg-white lg:hidden">
            <div className="flex h-[68px] items-center px-4">
              <button
                type="button"
                onClick={() => navigate("/dashboard")}
                className="flex items-center"
                aria-label="Baura ERP dashboard">
                <img
                  src={BAURA_LOGO}
                  alt="Baura"
                  className="h-auto w-[94px] object-contain"
                />
              </button>

              <div className="ml-auto flex h-8 w-8 items-center justify-center rounded-lg bg-bauraGoldSoft text-[9px] font-bold text-bauraPrimary">
                {initials}
              </div>
            </div>

            <div className="baura-scrollbar flex gap-1 overflow-x-auto border-t border-bauraBorder px-3 py-2">
              {visibleNavigationItems.map((item) => (
                <button
                  key={item.label}
                  type="button"
                  onClick={() => navigate(item.path)}
                  className={`shrink-0 rounded-lg px-3 py-2 text-[9px] font-semibold transition ${
                    item.label === activeItem
                      ? "bg-bauraPrimary text-white"
                      : "text-bauraMuted hover:bg-bauraGoldSoft/60 hover:text-bauraPrimary"
                  }`}>
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          {/* PAGE TITLE */}
          <div className="shrink-0 px-5 pb-2 pt-5 sm:px-6 lg:px-8 lg:pt-7">
            <div className="mx-auto flex w-full max-w-[1680px] flex-col gap-3 md:flex-row md:items-end md:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-bauraGold" />

                  <p className="text-[8px] font-semibold uppercase tracking-[0.16em] text-bauraGoldDark">
                    {activeItem}
                  </p>
                </div>

                <h1 className="mt-1.5 text-[23px] font-semibold tracking-[-0.035em] text-bauraInk md:text-[26px]">
                  {title}
                </h1>

                {subtitle && (
                  <p className="mt-1 max-w-3xl text-[10px] leading-5 text-bauraMuted">
                    {subtitle}
                  </p>
                )}
              </div>

              {actions && (
                <div className="flex flex-wrap items-center gap-2">
                  {actions}
                </div>
              )}
            </div>
          </div>

          {/* PAGE CONTENT */}
          <div className="baura-scrollbar min-h-0 flex-1 overflow-y-auto px-4 pb-7 pt-4 sm:px-6 lg:px-8">
            <div className="mx-auto w-full max-w-[1680px]">{children}</div>
          </div>
        </section>
      </div>
    </main>
  );
}

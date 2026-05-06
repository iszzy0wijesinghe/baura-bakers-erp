import type { ReactNode } from "react";
import {
  BarChart3,
  Boxes,
  CakeSlice,
  ClipboardList,
  Home,
  LogOut,
  Settings,
  ShoppingCart,
  UserCircle,
  Warehouse,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

const sidebarItems = [
  { label: "Dashboard", icon: Home, path: "/dashboard" },
  { label: "Ingredients", icon: Boxes, path: "/dashboard/ingredients" },
  { label: "Carter Inventory", icon: Warehouse, path: "/dashboard/carters" },
  { label: "Products & Recipes", icon: CakeSlice, path: "/dashboard/products" },
  { label: "POS Sales", icon: ShoppingCart, path: "/pos" },
  { label: "Analytics", icon: BarChart3, path: "/dashboard/analytics" },
  // { label: "Reports", icon: ClipboardList, path: "/dashboard/reports" },
  { label: "Settings", icon: Settings, path: "/dashboard/settings" },
];

type AppLayoutProps = {
  title: string;
  subtitle?: string;
  activeItem?: string;
  children: ReactNode;
  actions?: ReactNode;
};

export function AppLayout({
  title,
  subtitle,
  activeItem = "Dashboard",
  actions,
  children,
}: AppLayoutProps) {
  const { user, logout } = useAuth();

  const navigate = useNavigate();

  return (
    <main className="h-screen overflow-hidden bg-bauraCream text-bauraBrown">
      <div className="flex h-full overflow-hidden">
        <aside className="hidden h-full w-64 shrink-0 border-r border-bauraBrown/10 bg-bauraBrown px-4 py-5 text-bauraCream lg:flex lg:flex-col">
          <div className="shrink-0 rounded-3xl bg-white/10 p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-bauraGold">
              Baura
            </p>
            <h1 className="mt-2 text-2xl font-bold">Bakery ERP</h1>
            <p className="mt-2 text-xs leading-5 text-bauraCream/60">
              inventory and profit tracking.
            </p>
          </div>

          <nav className="baura-scrollbar mt-5 min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
            {sidebarItems.map((item) => {
              const Icon = item.icon;
              const isActive = item.label === activeItem;

              return (
                <button
                  key={item.label}
                  onClick={() => navigate(item.path)}
                  className={`flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm font-semibold transition ${
                    isActive
                      ? "bg-bauraGold text-bauraBrown shadow-sm"
                      : "text-bauraCream/70 hover:bg-white/10 hover:text-bauraCream"
                  }`}
                >
                  <Icon size={18} />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>

          <div className="mt-5 shrink-0 rounded-3xl bg-white/10 p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-bauraGold text-bauraBrown">
                <UserCircle size={23} />
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-bold">
                  {user?.firstName} {user?.lastName}
                </p>
                <p className="truncate text-xs text-bauraCream/55">
                  {user?.roles.join(", ")}
                </p>
              </div>
            </div>

            <button
              onClick={logout}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-white/10 px-4 py-3 text-sm font-semibold text-bauraCream transition hover:bg-white/15"
            >
              <LogOut size={16} />
              Logout
            </button>
          </div>
        </aside>

        <section className="flex h-full min-w-0 flex-1 flex-col overflow-hidden">
          <header className="shrink-0 border-b border-bauraBrown/10 bg-bauraCream/95 px-5 py-4 backdrop-blur md:px-7">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.25em] text-bauraGold">
                  {activeItem}
                </p>
                <h2 className="mt-1 text-2xl font-bold md:text-3xl">{title}</h2>
                {subtitle && (
                  <p className="mt-1 text-sm text-bauraBrown/60">{subtitle}</p>
                )}
              </div>

              {actions && (
                <div className="flex items-center gap-3">{actions}</div>
              )}
            </div>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 md:px-7">
            {children}
          </div>
        </section>
      </div>
    </main>
  );
}

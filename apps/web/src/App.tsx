/** @format */

import {
  Navigate,
  Route,
  Routes,
} from "react-router-dom";

import {
  ProtectedRoute,
} from "./components/ProtectedRoute";

import {
  AnalyticsPage,
} from "./pages/AnalyticsPage";

import {
  BakeryStockPage,
} from "./pages/BakeryStockPage";

import {
  CartersPage,
} from "./pages/CartersPage";

import {
  DashboardPage,
} from "./pages/DashboardPage";

import {
  IngredientsPage,
} from "./pages/IngredientsPage";

import {
  LoginPage,
} from "./pages/LoginPage";

import {
  PosPage,
} from "./pages/PosPage";

import {
  ProductionPage,
} from "./pages/ProductionPage";

import {
  ProductsPage,
} from "./pages/ProductsPage";

import {
  SettingsPage,
} from "./pages/SettingsPage";

function App() {
  return (
    <Routes>
      <Route
        path="/"
        element={
          <Navigate
            to="/dashboard"
            replace
          />
        }
      />

      <Route
        path="/login"
        element={
          <LoginPage />
        }
      />

      <Route
        path="/dashboard"
        element={
          <ProtectedRoute
            anyPermissions={[
              "erp.dashboard.read",
              "erp.dashboard.view",
            ]}
          >
            <DashboardPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/dashboard/production"
        element={
          <ProtectedRoute
            anyPermissions={[
              "erp.production.read",
              "erp.production.view",
            ]}
          >
            <ProductionPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/dashboard/bakery-stock"
        element={
          <ProtectedRoute
            anyPermissions={[
              "erp.bakery-stock.read",
              "erp.bakery-stock.view",
            ]}
          >
            <BakeryStockPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/dashboard/ingredients"
        element={
          <ProtectedRoute
            anyPermissions={[
              "erp.ingredients.read",
              "erp.ingredients.view",
            ]}
          >
            <IngredientsPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/dashboard/carters"
        element={
          <ProtectedRoute
            anyPermissions={[
              "erp.carters.read",
              "erp.carters.view",
            ]}
          >
            <CartersPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/dashboard/products"
        element={
          <ProtectedRoute
            anyPermissions={[
              "erp.products.read",
              "erp.products.view",
              "erp.recipes.read",
            ]}
          >
            <ProductsPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/pos"
        element={
          <ProtectedRoute
            permission="erp.pos.access"
            requirePosAccess
          >
            <PosPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/dashboard/analytics"
        element={
          <ProtectedRoute
            anyPermissions={[
              "erp.analytics.read",
              "erp.analytics.view",
            ]}
          >
            <AnalyticsPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/dashboard/settings"
        element={
          <ProtectedRoute
            permission="erp.settings.read"
          >
            <SettingsPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="*"
        element={
          <Navigate
            to="/dashboard"
            replace
          />
        }
      />
    </Routes>
  );
}

export default App;
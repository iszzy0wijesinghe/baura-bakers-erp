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

import {
  PosLoginPage,
} from "./pages/pos/PosLoginPage";
import {
  PosRegisterPage,
} from "./pages/pos/PosRegisterPage";
import {
  StandalonePosPage,
} from "./pages/pos/StandalonePosPage";

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

      {/* ------------------------------------------------ */}
      {/* AUTH                                             */}
      {/* ------------------------------------------------ */}

      <Route
        path="/login"
        element={
          <LoginPage />
        }
      />

      <Route
        path="/pos/login"
        element={
          <PosLoginPage />
        }
      />

      {/* ------------------------------------------------ */}
      {/* STANDALONE POS                                   */}
      {/* ------------------------------------------------ */}

      <Route
        path="/pos/register"
        element={
          <ProtectedRoute
            permission="erp.pos.access"
            requirePosAccess
          >
            <PosRegisterPage />
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
            <StandalonePosPage />
          </ProtectedRoute>
        }
      />

      {/* ------------------------------------------------ */}
      {/* ERP                                              */}
      {/* ------------------------------------------------ */}

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

      {/*
       * ERP-side POS management.
       *
       * This is deliberately separate
       * from /pos, which is the actual
       * cashier interface.
       */}
      <Route
        path="/dashboard/pos"
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

      {/* ------------------------------------------------ */}
      {/* FALLBACK                                         */}
      {/* ------------------------------------------------ */}

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
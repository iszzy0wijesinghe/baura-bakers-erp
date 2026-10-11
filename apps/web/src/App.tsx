/** @format */

import { Navigate, Route, Routes } from "react-router-dom";

import { ProtectedRoute } from "./components/ProtectedRoute";

import { AnalyticsPage } from "./pages/AnalyticsPage";
import { BakeryStockPage } from "./pages/BakeryStockPage";
import { BusinessCalendarPage } from "./pages/BusinessCalendarPage";
import { CartersPage } from "./pages/CartersPage";
import { DashboardPage } from "./pages/DashboardPage";
import { IngredientsPage } from "./pages/IngredientsPage";
import { LoginPage } from "./pages/LoginPage";
import { PosDayEndApprovalsPage } from "./pages/PosDayEndApprovalsPage";
import { PosPage } from "./pages/PosPage";
import { ProductionPage } from "./pages/ProductionPage";
import { ProductsPage } from "./pages/ProductsPage";
import { SettingsPage } from "./pages/SettingsPage";

import { PosLoginPage } from "./pages/pos/PosLoginPage";
import { PosRegisterPage } from "./pages/pos/PosRegisterPage";
import { StandalonePosPage } from "./pages/pos/StandalonePosPage";

function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/dashboard" replace />} />

      <Route path="/login" element={<LoginPage />} />

      <Route path="/pos/login" element={<PosLoginPage />} />

      {/* STANDALONE POS */}

      <Route
        path="/pos/register"
        element={
          <ProtectedRoute permission="erp.pos.access" requirePosAccess>
            <PosRegisterPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/pos"
        element={
          <ProtectedRoute permission="erp.pos.access" requirePosAccess>
            <StandalonePosPage />
          </ProtectedRoute>
        }
      />

      {/* ERP DASHBOARD */}

      <Route
        path="/dashboard"
        element={
          <ProtectedRoute
            anyPermissions={["erp.dashboard.read", "erp.dashboard.view"]}>
            <DashboardPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/dashboard/production"
        element={
          <ProtectedRoute
            anyPermissions={["erp.production.read", "erp.production.view"]}>
            <ProductionPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/dashboard/bakery-stock"
        element={
          <ProtectedRoute
            anyPermissions={["erp.bakery-stock.read", "erp.bakery-stock.view"]}>
            <BakeryStockPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/dashboard/ingredients"
        element={
          <ProtectedRoute
            anyPermissions={["erp.ingredients.read", "erp.ingredients.view"]}>
            <IngredientsPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/dashboard/carters"
        element={
          <ProtectedRoute
            anyPermissions={["erp.carters.read", "erp.carters.view"]}>
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
            ]}>
            <ProductsPage />
          </ProtectedRoute>
        }
      />

      {/* EXISTING ERP POS */}

      <Route
        path="/dashboard/pos"
        element={
          <ProtectedRoute permission="erp.pos.access" requirePosAccess>
            <PosPage />
          </ProtectedRoute>
        }
      />

      {/* POS MANAGEMENT */}

      <Route
        path="/dashboard/pos-management"
        element={
          <Navigate to="/dashboard/pos-management/day-end-approvals" replace />
        }
      />

      <Route
        path="/dashboard/pos-management/day-end-approvals"
        element={
          <ProtectedRoute permission="erp.pos.day-end.read">
            <PosDayEndApprovalsPage />
          </ProtectedRoute>
        }
      />

      {/* BUSINESS CALENDAR */}

      <Route
        path="/dashboard/business-calendar"
        element={
          <ProtectedRoute permission="erp.pos.business-calendar.read">
            <BusinessCalendarPage />
          </ProtectedRoute>
        }
      />

      {/* ANALYTICS */}

      <Route
        path="/dashboard/analytics"
        element={
          <ProtectedRoute
            anyPermissions={["erp.analytics.read", "erp.analytics.view"]}>
            <AnalyticsPage />
          </ProtectedRoute>
        }
      />

      {/* SETTINGS */}

      <Route
        path="/dashboard/settings"
        element={
          <ProtectedRoute permission="erp.settings.read">
            <SettingsPage />
          </ProtectedRoute>
        }
      />

      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

export default App;

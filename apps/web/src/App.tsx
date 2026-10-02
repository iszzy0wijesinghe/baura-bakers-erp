import {
  Navigate,
  Route,
  Routes
} from "react-router-dom";

import {
  ProtectedRoute
} from "./components/ProtectedRoute";

import {
  AnalyticsPage
} from "./pages/AnalyticsPage";

import {
  BakeryStockPage
} from "./pages/BakeryStockPage";

import {
  CartersPage
} from "./pages/CartersPage";

import {
  DashboardPage
} from "./pages/DashboardPage";

import {
  IngredientsPage
} from "./pages/IngredientsPage";

import {
  LoginPage
} from "./pages/LoginPage";

import {
  PosPage
} from "./pages/PosPage";

import {
  ProductionPage
} from "./pages/ProductionPage";

import {
  ProductsPage
} from "./pages/ProductsPage";

import {
  SettingsPage
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
          <ProtectedRoute>
            <DashboardPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/dashboard/production"
        element={
          <ProtectedRoute>
            <ProductionPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/dashboard/bakery-stock"
        element={
          <ProtectedRoute>
            <BakeryStockPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/dashboard/ingredients"
        element={
          <ProtectedRoute>
            <IngredientsPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/dashboard/carters"
        element={
          <ProtectedRoute>
            <CartersPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/dashboard/products"
        element={
          <ProtectedRoute>
            <ProductsPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/pos"
        element={
          <ProtectedRoute>
            <PosPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/dashboard/analytics"
        element={
          <ProtectedRoute>
            <AnalyticsPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/dashboard/settings"
        element={
          <ProtectedRoute>
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
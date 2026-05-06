import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import authRoutes from "./modules/auth/auth.routes";
import ingredientRoutes from "./modules/ingredients/ingredients.routes";
import carterRoutes from "./modules/carters/carters.routes";
import inventoryRoutes from "./modules/inventory/inventory.routes";
import productRoutes from "./modules/products/products.routes";
import salesRoutes from "./modules/sales/sales.routes";
import analyticsRoutes from "./modules/analytics/analytics.routes";
import settingsRoutes from "./modules/settings/settings.routes";

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

app.use("/api/auth", authRoutes);

app.use("/api/ingredients", ingredientRoutes);
app.use("/api/carters", carterRoutes);
app.use("/api/inventory", inventoryRoutes);
app.use("/api/products", productRoutes);
app.use("/api/sales", salesRoutes);
app.use("/api/analytics", analyticsRoutes);
app.use("/api/settings", settingsRoutes);

app.get("/api/health", (_req, res) => {
  res.json({
    status: "OK",
    message: "Baura Bakery ERP API is running",
    timestamp: new Date().toISOString()
  });
});

const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
  console.log(`Baura Bakery ERP API running on http://localhost:${PORT}`);
});
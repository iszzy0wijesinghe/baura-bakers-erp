import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";

import authRoutes from "./modules/auth/auth.routes";
import ingredientRoutes from "./modules/ingredients/ingredients.routes";
import carterRoutes from "./modules/carters/carters.routes";
import inventoryRoutes from "./modules/inventory/inventory.routes";
import productRoutes from "./modules/products/products.routes";
import productionRoutes from "./modules/production/production.routes";
import bakeryStockRoutes from "./modules/bakery-stock/bakeryStock.routes";
import salesRoutes from "./modules/sales/sales.routes";
import analyticsRoutes from "./modules/analytics/analytics.routes";
import settingsRoutes from "./modules/settings/settings.routes";

dotenv.config();

const app = express();

const PORT = Number(process.env.PORT || 4000);

const isProduction =
  process.env.NODE_ENV === "production";

/*
|--------------------------------------------------------------------------
| Express security
|--------------------------------------------------------------------------
*/

app.disable("x-powered-by");

/*
 * Required when the API is deployed behind a trusted reverse proxy
 * such as Render, Railway, Fly.io, Nginx, etc.
 *
 * This also allows express-rate-limit to identify the real client IP
 * correctly when there is one trusted proxy hop.
 */
if (isProduction) {
  app.set("trust proxy", 1);
}

/*
|--------------------------------------------------------------------------
| Security headers
|--------------------------------------------------------------------------
*/

app.use(
  helmet({
    crossOriginResourcePolicy: {
      policy: "cross-origin",
    },
  }),
);

/*
|--------------------------------------------------------------------------
| CORS
|--------------------------------------------------------------------------
|
| FRONTEND_URL may contain one or more comma-separated origins.
|
| Development example:
|
| FRONTEND_URL=http://localhost:5173
|
| Production example:
|
| FRONTEND_URL=https://erp.example.com
|
| Multiple:
|
| FRONTEND_URL=https://erp.example.com,https://pos.example.com
|
*/

const configuredOrigins = (
  process.env.FRONTEND_URL ||
  "http://localhost:5173"
)
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      /*
       * Requests without Origin include tools/server-to-server calls.
       */
      if (!origin) {
        callback(null, true);
        return;
      }

      if (configuredOrigins.includes(origin)) {
        callback(null, true);
        return;
      }

      callback(
        new Error("Origin is not allowed by CORS"),
      );
    },

    methods: [
      "GET",
      "POST",
      "PUT",
      "PATCH",
      "DELETE",
      "OPTIONS",
    ],

    allowedHeaders: [
      "Content-Type",
      "Authorization",
    ],

    credentials: false,

    maxAge: 86400,
  }),
);

/*
|--------------------------------------------------------------------------
| Request body limits
|--------------------------------------------------------------------------
|
| Keep JSON requests intentionally small.
| Product/ingredient images should remain Cloudinary URLs rather than
| large image payloads sent through the ERP API.
|
*/

app.use(
  express.json({
    limit: "1mb",
  }),
);

app.use(
  express.urlencoded({
    extended: false,
    limit: "1mb",
  }),
);

/*
|--------------------------------------------------------------------------
| General API rate limiter
|--------------------------------------------------------------------------
|
| This protects the API against excessive request bursts while keeping
| the limit high enough for normal ERP/POS usage.
|
*/

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,

  limit: 1500,

  standardHeaders: "draft-7",

  legacyHeaders: false,

  message: {
    message:
      "Too many requests. Please try again shortly.",
  },
});

app.use(
  "/api",
  apiLimiter,
);

/*
|--------------------------------------------------------------------------
| Authentication rate limiter
|--------------------------------------------------------------------------
|
| Login endpoints need substantially tighter protection than ordinary
| ERP API endpoints.
|
*/

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,

  limit: 20,

  standardHeaders: "draft-7",

  legacyHeaders: false,

  skipSuccessfulRequests: true,

  message: {
    message:
      "Too many authentication attempts. Please try again later.",
  },
});

app.use(
  "/api/auth",
  authLimiter,
);

/*
|--------------------------------------------------------------------------
| Health endpoint
|--------------------------------------------------------------------------
|
| Keep this intentionally minimal.
| Public health checks should not reveal database type, configuration,
| environment information or other infrastructure details.
|
*/

app.get(
  "/api/health",
  (_req, res) => {
    res.status(200).json({
      status: "OK",
      timestamp:
        new Date().toISOString(),
    });
  },
);

/*
|--------------------------------------------------------------------------
| API routes
|--------------------------------------------------------------------------
*/

app.use(
  "/api/auth",
  authRoutes,
);

app.use(
  "/api/ingredients",
  ingredientRoutes,
);

app.use(
  "/api/carters",
  carterRoutes,
);

app.use(
  "/api/inventory",
  inventoryRoutes,
);

app.use(
  "/api/products",
  productRoutes,
);

app.use(
  "/api/production",
  productionRoutes,
);

app.use(
  "/api/bakery-stock",
  bakeryStockRoutes,
);

app.use(
  "/api/sales",
  salesRoutes,
);

app.use(
  "/api/analytics",
  analyticsRoutes,
);

app.use(
  "/api/settings",
  settingsRoutes,
);

/*
|--------------------------------------------------------------------------
| 404 handler
|--------------------------------------------------------------------------
*/

app.use(
  (
    req,
    res,
  ) => {
    res.status(404).json({
      message: "API route not found.",
      path: req.path,
    });
  },
);

/*
|--------------------------------------------------------------------------
| Global error handler
|--------------------------------------------------------------------------
|
| Never expose stack traces or internal exception details to production
| clients.
|
*/

app.use(
  (
    error: unknown,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    console.error(error);

    const message =
      error instanceof Error
        ? error.message
        : "";

    if (
      message ===
      "Origin is not allowed by CORS"
    ) {
      res.status(403).json({
        message: "Origin not allowed.",
      });

      return;
    }

    res.status(500).json({
      message: isProduction
        ? "Internal server error."
        : message ||
          "Internal server error.",
    });
  },
);

/*
|--------------------------------------------------------------------------
| Start server
|--------------------------------------------------------------------------
*/

const server = app.listen(
  PORT,
  () => {
    console.log(
      `Baura Bakery ERP API running on http://localhost:${PORT}`,
    );

    console.log(
      `Environment: ${
        isProduction
          ? "production"
          : "development"
      }`,
    );
  },
);

/*
|--------------------------------------------------------------------------
| Graceful shutdown
|--------------------------------------------------------------------------
|
| Allows the server to stop accepting new requests cleanly during
| deployment/restart.
|
*/

function shutdown(
  signal: string,
) {
  console.log(
    `${signal} received. Shutting down...`,
  );

  server.close((error) => {
    if (error) {
      console.error(
        "Server shutdown failed:",
        error,
      );

      process.exit(1);
    }

    process.exit(0);
  });
}

process.on(
  "SIGTERM",
  () => shutdown("SIGTERM"),
);

process.on(
  "SIGINT",
  () => shutdown("SIGINT"),
);
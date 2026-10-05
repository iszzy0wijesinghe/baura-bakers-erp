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
import posApprovalRoutes from "./modules/pos-approvals/posApprovals.routes";
import analyticsRoutes from "./modules/analytics/analytics.routes";
import settingsRoutes from "./modules/settings/settings.routes";
import posCatalogueRoutes from "./modules/pos-catalogue/posCatalogue.routes";
import posCustomerRoutes from "./modules/pos-customers/posCustomers.routes";
import businessCalendarRoutes from "./modules/business-calendar/businessCalendar.routes";
import posSessionRoutes from "./modules/pos-sessions/posSessions.routes";
import posCashMovementRoutes from "./modules/pos-cash-movements/posCashMovements.routes";

dotenv.config();

const app = express();

const PORT = Number(
  process.env.PORT || 4000,
);

const isProduction =
  process.env.NODE_ENV ===
  "production";

/*
|--------------------------------------------------------------------------
| Express security
|--------------------------------------------------------------------------
*/

app.disable(
  "x-powered-by",
);

if (isProduction) {
  app.set(
    "trust proxy",
    1,
  );
}

/*
|--------------------------------------------------------------------------
| Security headers
|--------------------------------------------------------------------------
*/

app.use(
  helmet({
    crossOriginResourcePolicy: {
      policy:
        "cross-origin",
    },
  }),
);

/*
|--------------------------------------------------------------------------
| CORS
|--------------------------------------------------------------------------
*/

const configuredOrigins = (
  process.env.FRONTEND_URL ||
  "http://localhost:5173"
)
  .split(",")
  .map(
    (origin) =>
      origin.trim(),
  )
  .filter(Boolean);

app.use(
  cors({
    origin(
      origin,
      callback,
    ) {
      if (!origin) {
        callback(
          null,
          true,
        );

        return;
      }

      if (
        configuredOrigins.includes(
          origin,
        )
      ) {
        callback(
          null,
          true,
        );

        return;
      }

      callback(
        new Error(
          "Origin is not allowed by CORS",
        ),
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

    credentials:
      false,

    maxAge:
      86400,
  }),
);

/*
|--------------------------------------------------------------------------
| Request body limits
|--------------------------------------------------------------------------
*/

app.use(
  express.json({
    limit:
      "1mb",
  }),
);

app.use(
  express.urlencoded({
    extended:
      false,

    limit:
      "1mb",
  }),
);

/*
|--------------------------------------------------------------------------
| General API rate limiter
|--------------------------------------------------------------------------
*/

const apiLimiter =
  rateLimit({
    windowMs:
      15 *
      60 *
      1000,

    limit:
      1500,

    standardHeaders:
      "draft-7",

    legacyHeaders:
      false,

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
*/

const authLimiter =
  rateLimit({
    windowMs:
      15 *
      60 *
      1000,

    limit:
      20,

    standardHeaders:
      "draft-7",

    legacyHeaders:
      false,

    skipSuccessfulRequests:
      true,

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
*/

app.get(
  "/api/health",
  (_req, res) => {
    res.status(200).json({
      status:
        "OK",

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



/*
|--------------------------------------------------------------------------
| POS
|--------------------------------------------------------------------------
|
| POS remains part of the authoritative ERP backend.
|
| The standalone POS frontend will consume these endpoints. It does not
| directly access the ERP database or official-site database.
|
*/

app.use(
  "/api/pos-approvals",
  posApprovalRoutes,
);

app.use(
  "/api/business-calendar",
  businessCalendarRoutes,
);

app.use(
  "/api/pos-sessions",
  posSessionRoutes,
);

app.use(
  "/api/pos-cash-movements",
  posCashMovementRoutes,
);

app.use(
  "/api/pos-catalogue",
  posCatalogueRoutes,
);

app.use(
  "/api/pos-customers",
  posCustomerRoutes,
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
      message:
        "API route not found.",

      path:
        req.path,
    });
  },
);

/*
|--------------------------------------------------------------------------
| Global error handler
|--------------------------------------------------------------------------
*/

app.use(
  (
    error: unknown,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    console.error(
      error,
    );

    const message =
      error instanceof Error
        ? error.message
        : "";

    if (
      message ===
      "Origin is not allowed by CORS"
    ) {
      res.status(403).json({
        message:
          "Origin not allowed.",
      });

      return;
    }

    res.status(500).json({
      message:
        isProduction
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

const server =
  app.listen(
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
*/

function shutdown(
  signal: string,
) {
  console.log(
    `${signal} received. Shutting down...`,
  );

  server.close(
    (error) => {
      if (error) {
        console.error(
          "Server shutdown failed:",
          error,
        );

        process.exit(
          1,
        );
      }

      process.exit(
        0,
      );
    },
  );
}

process.on(
  "SIGTERM",
  () =>
    shutdown(
      "SIGTERM",
    ),
);

process.on(
  "SIGINT",
  () =>
    shutdown(
      "SIGINT",
    ),
);